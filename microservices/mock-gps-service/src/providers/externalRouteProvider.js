const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OPENROUTESERVICE_ENDPOINT = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = Number(process.env.GPS_ROUTE_TIMEOUT_MS || 12000);

const geocodeCache = new Map();
const routeCache = new Map();

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Route request failed (${response.status})`);
        }

        return response.json();
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function normalizePoint(point) {
    if (!point) {
        return null;
    }

    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6))
    };
}

async function geocodeLocation(locationText) {
    const normalized = String(locationText || '').trim();
    if (!normalized) {
        return null;
    }

    const cacheKey = normalized.toLowerCase();
    if (geocodeCache.has(cacheKey)) {
        return geocodeCache.get(cacheKey);
    }

    try {
        const query = new URLSearchParams({
            q: normalized,
            format: 'json',
            limit: '1'
        });

        const payload = await fetchJsonWithTimeout(
            `${NOMINATIM_ENDPOINT}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-mock-gps-service/1.0'
                }
            }
        );

        const hit = Array.isArray(payload) ? payload[0] : null;
        const point = hit
            ? normalizePoint({ latitude: hit.lat, longitude: hit.lon })
            : null;

        geocodeCache.set(cacheKey, point);
        return point;
    } catch {
        geocodeCache.set(cacheKey, null);
        return null;
    }
}

function normalizeRouteCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
        return [];
    }

    return coordinates
        .map((entry) => {
            if (!Array.isArray(entry) || entry.length < 2) {
                return null;
            }

            return normalizePoint({ longitude: entry[0], latitude: entry[1] });
        })
        .filter((point) => point !== null);
}

async function fetchOpenRouteServiceRoute(start, end, apiKey) {
    const normalizedKey = String(apiKey || '').trim();
    if (!normalizedKey) {
        return null;
    }

    try {
        const query = new URLSearchParams({
            api_key: normalizedKey,
            start: `${start.longitude},${start.latitude}`,
            end: `${end.longitude},${end.latitude}`,
            geometry_format: 'geojson'
        });

        const payload = await fetchJsonWithTimeout(
            `${OPENROUTESERVICE_ENDPOINT}?${query.toString()}`,
            {
                headers: {
                    Accept: 'application/json, application/geo+json',
                    'Content-Type': 'application/json; charset=utf-8',
                    'User-Agent': 'rks-mock-gps-service/1.0'
                }
            }
        );

        const geoJsonCoords = payload?.features?.[0]?.geometry?.coordinates;
        const legacyCoords = payload?.routes?.[0]?.geometry?.coordinates;
        const coordinates = Array.isArray(geoJsonCoords) ? geoJsonCoords : legacyCoords;
        const normalizedRoute = normalizeRouteCoordinates(coordinates);

        return normalizedRoute.length > 1 ? normalizedRoute : null;
    } catch {
        return null;
    }
}

async function fetchOsrmRoute(start, end) {
    try {
        const query = new URLSearchParams({
            alternatives: 'false',
            overview: 'full',
            geometries: 'geojson',
            steps: 'false'
        });

        const payload = await fetchJsonWithTimeout(
            `${OSRM_ENDPOINT}/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?${query.toString()}`,
            {
                headers: {
                    'User-Agent': 'rks-mock-gps-service/1.0'
                }
            }
        );

        const routes = Array.isArray(payload?.routes) ? payload.routes : [];
        const firstRoute = routes[0] || null;
        const coordinates = firstRoute?.geometry?.coordinates;
        const normalizedRoute = normalizeRouteCoordinates(coordinates);

        return normalizedRoute.length > 1 ? normalizedRoute : null;
    } catch {
        return null;
    }
}

async function getExternalRoute({ source, destination, apiKey }) {
    const sourceKey = String(source || '').trim();
    const destinationKey = String(destination || '').trim();
    if (!sourceKey || !destinationKey) {
        return null;
    }

    const routeCacheKey = `${sourceKey}::${destinationKey}`.toLowerCase();
    if (routeCache.has(routeCacheKey)) {
        return routeCache.get(routeCacheKey);
    }

    const [start, end] = await Promise.all([
        geocodeLocation(sourceKey),
        geocodeLocation(destinationKey)
    ]);

    if (!start || !end) {
        return null;
    }

    const routeEngine = String(process.env.GPS_ROUTE_ENGINE || 'auto').toLowerCase();

    let normalizedRoute = null;

    if (routeEngine === 'auto' || routeEngine === 'ors' || routeEngine === 'openrouteservice') {
        normalizedRoute = await fetchOpenRouteServiceRoute(start, end, apiKey);
    }

    if (!normalizedRoute && (routeEngine === 'auto' || routeEngine === 'osrm' || routeEngine === 'ors' || routeEngine === 'openrouteservice')) {
        normalizedRoute = await fetchOsrmRoute(start, end);
    }

    if (!normalizedRoute || normalizedRoute.length < 2) {
        return null;
    }

    routeCache.set(routeCacheKey, normalizedRoute);
    routeCache.set(
        `${destinationKey}::${sourceKey}`.toLowerCase(),
        [...normalizedRoute].reverse()
    );

    return normalizedRoute;
}

module.exports = {
    getExternalRoute
};
