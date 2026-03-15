from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor


class EtaRequest(BaseModel):
    distance_remaining: float = Field(..., ge=0)
    current_speed: float = Field(..., ge=0)
    historical_speed: float = Field(..., ge=0)
    trip_distance: float = Field(..., ge=0)


class DelayRequest(BaseModel):
    planned_arrival_time: datetime
    predicted_eta: float = Field(..., ge=0)
    traffic_level: float = Field(..., ge=0, le=1)


app = FastAPI(title='phase2-ml-service', version='1.0.0')

eta_model = RandomForestRegressor(n_estimators=220, random_state=42)
delay_model = RandomForestClassifier(n_estimators=240, random_state=42)


def train_eta_model() -> None:
    rng = np.random.default_rng(42)
    samples = 2200

    distance_remaining = rng.uniform(1, 1800, samples)
    current_speed = rng.uniform(5, 95, samples)
    historical_speed = rng.uniform(10, 85, samples)
    trip_distance = distance_remaining + rng.uniform(0, 500, samples)

    effective_speed = (0.55 * current_speed) + (0.45 * historical_speed)
    effective_speed = np.maximum(effective_speed, 5)

    eta_minutes = (distance_remaining / effective_speed) * 60
    eta_minutes += (trip_distance / 1000) * 2.3
    eta_minutes += rng.normal(0, 6.5, samples)
    eta_minutes = np.maximum(eta_minutes, 1)

    features = np.column_stack([
        distance_remaining,
        current_speed,
        historical_speed,
        trip_distance,
    ])

    eta_model.fit(features, eta_minutes)


def train_delay_model() -> None:
    rng = np.random.default_rng(123)
    samples = 2600

    planned_slack_minutes = rng.uniform(10, 1200, samples)
    predicted_eta = rng.uniform(5, 1800, samples)
    traffic_level = rng.uniform(0, 1, samples)

    risk_score = (
        0.005 * (predicted_eta - planned_slack_minutes)
        + (1.5 * traffic_level)
        + rng.normal(0, 0.28, samples)
    )

    probability = 1 / (1 + np.exp(-risk_score))
    labels = (probability >= 0.5).astype(int)

    features = np.column_stack([
        planned_slack_minutes,
        predicted_eta,
        traffic_level,
    ])

    delay_model.fit(features, labels)


@app.on_event('startup')
def startup_event() -> None:
    train_eta_model()
    train_delay_model()


@app.get('/health')
def health() -> dict:
    return {
        'status': 'OK',
        'service': 'ml-service',
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


@app.post('/predict/eta')
def predict_eta(payload: EtaRequest) -> dict:
    features = np.array([
        [
            payload.distance_remaining,
            payload.current_speed,
            payload.historical_speed,
            payload.trip_distance,
        ]
    ])

    eta_minutes = float(max(1.0, eta_model.predict(features)[0]))

    return {
        'eta_minutes': round(eta_minutes, 2)
    }


@app.post('/predict/delay')
def predict_delay(payload: DelayRequest) -> dict:
    now = datetime.now(timezone.utc)
    planned = payload.planned_arrival_time

    if planned.tzinfo is None:
        planned = planned.replace(tzinfo=timezone.utc)

    planned_slack_minutes = max(0.0, (planned - now).total_seconds() / 60)

    features = np.array([
        [
            planned_slack_minutes,
            payload.predicted_eta,
            payload.traffic_level,
        ]
    ])

    probability = float(delay_model.predict_proba(features)[0][1])

    return {
        'delay_probability': round(probability, 4)
    }
