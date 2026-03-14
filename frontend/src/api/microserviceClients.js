import axios from 'axios';

function createClient(baseURL) {
    return axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export const microserviceClients = {
    booking: createClient(import.meta.env.VITE_BOOKING_SERVICE_URL || 'http://localhost:3104'),
    fleet: createClient(import.meta.env.VITE_FLEET_SERVICE_URL || 'http://localhost:3102'),
    trip: createClient(import.meta.env.VITE_TRIP_SERVICE_URL || 'http://localhost:3103'),
    tracking: createClient(import.meta.env.VITE_TRACKING_SERVICE_URL || 'http://localhost:3105'),
    analytics: createClient(import.meta.env.VITE_ANALYTICS_SERVICE_URL || 'http://localhost:3107'),
    alert: createClient(import.meta.env.VITE_ALERT_SERVICE_URL || 'http://localhost:3108'),
    ml: createClient(import.meta.env.VITE_ML_SERVICE_URL || 'http://localhost:8000'),
    mockGps: createClient(import.meta.env.VITE_MOCK_GPS_SERVICE_URL || 'http://localhost:3106')
};

export function setMicroserviceAuthToken(token) {
    const headerValue = token ? `Bearer ${token}` : undefined;

    Object.values(microserviceClients).forEach((client) => {
        if (headerValue) {
            client.defaults.headers.common.Authorization = headerValue;
        } else {
            delete client.defaults.headers.common.Authorization;
        }
    });
}
