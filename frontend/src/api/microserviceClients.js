import axios from 'axios';

function createClient(baseURL) {
    return axios.create({
        baseURL,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

const gatewayBaseUrl = (import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3200/api').replace(/\/+$/, '');

// Keep all service calls gateway-routed so deployed frontends do not depend on direct service ports.
export const microserviceClients = {
    booking: createClient(gatewayBaseUrl),
    fleet: createClient(gatewayBaseUrl),
    trip: createClient(gatewayBaseUrl),
    tracking: createClient(gatewayBaseUrl),
    analytics: createClient(gatewayBaseUrl),
    alert: createClient(gatewayBaseUrl),
    ml: createClient(gatewayBaseUrl),
    mockGps: createClient(gatewayBaseUrl)
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
