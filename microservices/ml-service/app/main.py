from datetime import datetime, timedelta, timezone
from typing import Literal

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression


ROAD_TYPE_MAP = {
    "highway": 1.0,
    "urban": 0.6,
    "rural": 0.8,
    "mixed": 0.75,
}


class EtaRequest(BaseModel):
    distance_remaining: float = Field(..., ge=0)
    current_speed: float = Field(..., ge=0)
    historical_avg_speed: float = Field(..., ge=0)
    trip_distance: float = Field(0, ge=0)
    road_type: Literal["highway", "urban", "rural", "mixed"] = "mixed"


class DelayRequest(BaseModel):
    planned_arrival_time: datetime
    predicted_eta: float = Field(..., ge=0)
    trip_distance: float = Field(..., ge=0)
    traffic_level: float = Field(0.5, ge=0, le=1)


app = FastAPI(title="ml-service", version="1.0.0")

eta_linear_model = LinearRegression()
eta_rf_model = RandomForestRegressor(n_estimators=120, random_state=42)


delay_logistic_model = LogisticRegression(max_iter=1500, random_state=42)
delay_rf_model = RandomForestClassifier(n_estimators=200, random_state=42)


def _fit_eta_models() -> None:
    rng = np.random.default_rng(42)
    sample_size = 1400

    distance_remaining = rng.uniform(5, 1200, sample_size)
    current_speed = rng.uniform(10, 95, sample_size)
    historical_avg_speed = rng.uniform(20, 80, sample_size)
    road_type = rng.integers(0, 4, sample_size)

    road_type_scale = np.array([ROAD_TYPE_MAP["highway"], ROAD_TYPE_MAP["urban"], ROAD_TYPE_MAP["rural"], ROAD_TYPE_MAP["mixed"]])
    effective_speed = ((0.55 * current_speed) + (0.45 * historical_avg_speed)) * road_type_scale[road_type]
    effective_speed = np.maximum(effective_speed, 5)

    eta_minutes = (distance_remaining / effective_speed) * 60
    eta_minutes += rng.normal(0, 8, sample_size)
    eta_minutes = np.maximum(eta_minutes, 5)

    trip_distance = distance_remaining + rng.uniform(0, 500, sample_size)

    x = np.column_stack([
        distance_remaining,
        current_speed,
        historical_avg_speed,
        road_type,
        trip_distance,
    ])

    eta_linear_model.fit(x, eta_minutes)
    eta_rf_model.fit(x, eta_minutes)


def _fit_delay_models() -> None:
    rng = np.random.default_rng(123)
    sample_size = 1800

    planned_slack_minutes = rng.uniform(20, 900, sample_size)
    predicted_eta = rng.uniform(10, 1200, sample_size)
    trip_distance = rng.uniform(5, 1800, sample_size)
    traffic_level = rng.uniform(0, 1, sample_size)

    delay_margin = predicted_eta - planned_slack_minutes
    base_risk = (
        0.004 * delay_margin
        + 0.0015 * trip_distance
        + 1.2 * traffic_level
        + rng.normal(0, 0.25, sample_size)
    )
    delay_probability = 1 / (1 + np.exp(-base_risk))
    y = (delay_probability > 0.5).astype(int)

    x = np.column_stack([
        planned_slack_minutes,
        predicted_eta,
        trip_distance,
        traffic_level,
    ])

    delay_logistic_model.fit(x, y)
    delay_rf_model.fit(x, y)


@app.on_event("startup")
def startup_train_models() -> None:
    _fit_eta_models()
    _fit_delay_models()


@app.get("/health")
def health() -> dict:
    return {
        "status": "OK",
        "service": "ml-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/models")
def models() -> dict:
    return {
        "status": "OK",
        "service": "ml-service",
        "models": [
            {
                "domain": "ETA prediction",
                "model_name": "linear_regression",
                "endpoint": "/predict/eta",
                "description": "Baseline ETA estimator trained on distance and speed features.",
            },
            {
                "domain": "ETA prediction",
                "model_name": "random_forest_regressor",
                "endpoint": "/predict/eta",
                "description": "Tree ensemble ETA estimator blended with linear regression output.",
            },
            {
                "domain": "Delay risk",
                "model_name": "logistic_regression",
                "endpoint": "/predict/delay",
                "description": "Probabilistic delay classifier based on slack, ETA, distance, and traffic.",
            },
            {
                "domain": "Delay risk",
                "model_name": "random_forest_classifier",
                "endpoint": "/predict/delay",
                "description": "Non-linear delay classifier combined with logistic regression risk.",
            },
        ],
    }


@app.post("/predict/eta")
def predict_eta(payload: EtaRequest) -> dict:
    road_value = ROAD_TYPE_MAP.get(payload.road_type, ROAD_TYPE_MAP["mixed"])

    # The models were trained with a small integer road type bucket. We map ratio values into this bucketed range.
    road_bucket = 0 if road_value >= 0.95 else 1 if road_value <= 0.65 else 2 if road_value <= 0.8 else 3

    x = np.array([
        [
            payload.distance_remaining,
            payload.current_speed,
            payload.historical_avg_speed,
            road_bucket,
            payload.trip_distance,
        ]
    ])

    linear_eta = float(max(1.0, eta_linear_model.predict(x)[0]))
    rf_eta = float(max(1.0, eta_rf_model.predict(x)[0]))
    blended_eta = float(max(1.0, (linear_eta * 0.45) + (rf_eta * 0.55)))
    predicted_arrival = datetime.now(timezone.utc) + timedelta(minutes=float(blended_eta))

    return {
        "eta_minutes": round(blended_eta, 2),
        "predicted_arrival_time": predicted_arrival.isoformat(),
        "model_outputs": {
            "linear_regression": round(linear_eta, 2),
            "random_forest": round(rf_eta, 2),
        },
    }


@app.post("/predict/delay")
def predict_delay(payload: DelayRequest) -> dict:
    now = datetime.now(timezone.utc)
    planned = payload.planned_arrival_time

    if planned.tzinfo is None:
        planned = planned.replace(tzinfo=timezone.utc)

    slack_minutes = max(0.0, (planned - now).total_seconds() / 60)

    x = np.array([
        [
            slack_minutes,
            payload.predicted_eta,
            payload.trip_distance,
            payload.traffic_level,
        ]
    ])

    logistic_risk = float(delay_logistic_model.predict_proba(x)[0][1])
    rf_risk = float(delay_rf_model.predict_proba(x)[0][1])
    risk = float(((logistic_risk + rf_risk) / 2.0) * 100.0)
    normalized_risk = min(max(risk / 100.0, 0.0), 1.0)

    return {
        "delay_risk_percentage": round(min(max(risk, 0.0), 100.0), 2),
        "delay_risk": round(normalized_risk, 4),
        "model_outputs": {
            "logistic_regression": round(logistic_risk * 100.0, 2),
            "random_forest": round(rf_risk * 100.0, 2),
        },
    }
