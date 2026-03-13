const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const EtaService = {
    getTrafficMultiplier(currentTime = new Date()) {
        const hour = currentTime.getHours();

        if ((hour >= 7 && hour < 10) || (hour >= 17 && hour < 21)) {
            return 1.35;
        }

        if (hour >= 11 && hour < 16) {
            return 1.1;
        }

        if (hour >= 22 || hour < 5) {
            return 0.92;
        }

        return 1;
    },

    formatEtaMinutes(minutes) {
        if (!Number.isFinite(minutes) || minutes === null) {
            return 'No ETA data';
        }

        if (minutes <= 1) {
            return 'Arrived';
        }

        const rounded = Math.max(1, Math.round(minutes));
        if (rounded < 60) {
            return `${rounded} min`;
        }

        const hours = Math.floor(rounded / 60);
        const mins = rounded % 60;
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    },

    calculateEta({
        remainingDistanceKm,
        currentSpeedKmph,
        historicalAvgSpeedKmph,
        currentTime = new Date()
    }) {
        const remaining = Math.max(parseFloat(remainingDistanceKm) || 0, 0);

        if (remaining <= 0.2) {
            return {
                eta_minutes: 0,
                eta_text: 'Arrived',
                estimated_arrival: currentTime.toISOString(),
                traffic_multiplier: this.getTrafficMultiplier(currentTime),
                effective_speed_kmph: 0,
                delay_risk: 'low',
                confidence: 'high'
            };
        }

        const currentSpeed = parseFloat(currentSpeedKmph) || 0;
        const historicalSpeed = parseFloat(historicalAvgSpeedKmph) || 0;

        let blendedSpeed = 42;
        let confidence = 'low';

        if (currentSpeed > 0 && historicalSpeed > 0) {
            blendedSpeed = (currentSpeed * 0.65) + (historicalSpeed * 0.35);
            confidence = 'high';
        } else if (currentSpeed > 0) {
            blendedSpeed = currentSpeed;
            confidence = 'medium';
        } else if (historicalSpeed > 0) {
            blendedSpeed = historicalSpeed;
            confidence = 'medium';
        }

        const trafficMultiplier = this.getTrafficMultiplier(currentTime);
        const effectiveSpeed = clamp(blendedSpeed / trafficMultiplier, 18, 72);
        const etaHours = remaining / effectiveSpeed;
        const etaMinutes = etaHours * 60;
        const estimatedArrival = new Date(currentTime.getTime() + (etaHours * 60 * 60 * 1000));

        let delayRisk = 'low';
        if (trafficMultiplier >= 1.3 || effectiveSpeed < 28) {
            delayRisk = 'high';
        } else if (trafficMultiplier > 1.05 || effectiveSpeed < 38) {
            delayRisk = 'medium';
        }

        return {
            eta_minutes: Number(etaMinutes.toFixed(1)),
            eta_text: this.formatEtaMinutes(etaMinutes),
            estimated_arrival: estimatedArrival.toISOString(),
            traffic_multiplier: Number(trafficMultiplier.toFixed(2)),
            effective_speed_kmph: Number(effectiveSpeed.toFixed(1)),
            delay_risk: delayRisk,
            confidence
        };
    }
};

module.exports = EtaService;