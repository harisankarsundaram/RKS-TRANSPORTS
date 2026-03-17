const { getExternalRoute } = require('./externalRouteProvider');

const MIN_ROUTE_POINTS_FOR_DB_ONLY = Number(process.env.GPS_ROUTE_MIN_POINTS || 24);

const CITY_COORDINATES = {
    Chennai: { latitude: 13.0827, longitude: 80.2707 },
    Bangalore: { latitude: 12.9716, longitude: 77.5946 },
    Hyderabad: { latitude: 17.385, longitude: 78.4867 },
    Coimbatore: { latitude: 11.0168, longitude: 76.9558 },
    Salem: { latitude: 11.6643, longitude: 78.146 },
    Mumbai: { latitude: 19.076, longitude: 72.8777 },
    Pune: { latitude: 18.5204, longitude: 73.8567 },
    Delhi: { latitude: 28.7041, longitude: 77.1025 },
    Kochi: { latitude: 9.9312, longitude: 76.2673 },
    Madurai: { latitude: 9.9252, longitude: 78.1198 },
    Vizag: { latitude: 17.6868, longitude: 83.2185 },
    Erode: { latitude: 11.341, longitude: 77.7172 },
    Trichy: { latitude: 10.7905, longitude: 78.7047 },
    Mysore: { latitude: 12.2958, longitude: 76.6394 },
    Mangalore: { latitude: 12.9141, longitude: 74.856 },
    Nagpur: { latitude: 21.1458, longitude: 79.0882 }
};

function parseRoutePolyline(rawPolyline) {
    if (!rawPolyline) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawPolyline);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((point) => {
                if (Array.isArray(point) && point.length >= 2) {
                    return { longitude: Number(point[0]), latitude: Number(point[1]) };
                }

                if (point && point.latitude !== undefined && point.longitude !== undefined) {
                    return { latitude: Number(point.latitude), longitude: Number(point.longitude) };
                }

                return null;
            })
            .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
    } catch {
        return [];
    }
}

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

function distanceKm(start, end) {
    const dLat = toRadians(end.latitude - start.latitude);
    const dLon = toRadians(end.longitude - start.longitude);

    const lat1 = toRadians(start.latitude);
    const lat2 = toRadians(end.latitude);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function routeDistanceKm(route) {
    if (!Array.isArray(route) || route.length < 2) {
        return 0;
    }

    let total = 0;
    for (let index = 1; index < route.length; index += 1) {
        total += distanceKm(route[index - 1], route[index]);
    }
    return total;
}

function resolveCityCoordinate(cityName) {
    const known = CITY_COORDINATES[cityName];
    if (known) {
        return known;
    }

    // Deterministic fallback if city is unknown.
    const seed = String(cityName || 'unknown').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const latitude = 9 + ((seed % 1500) / 100);
    const longitude = 73 + ((seed % 1400) / 100);
    return { latitude, longitude };
}

function buildSyntheticRoute(source, destination, points = 8) {
    const start = resolveCityCoordinate(source);
    const end = resolveCityCoordinate(destination);
    const route = [];

    for (let index = 0; index < points; index += 1) {
        const t = points === 1 ? 1 : index / (points - 1);
        const bend = Math.sin(Math.PI * t) * 0.2;

        const latitude = start.latitude + ((end.latitude - start.latitude) * t) + (bend * ((end.longitude - start.longitude) / 6));
        const longitude = start.longitude + ((end.longitude - start.longitude) * t) - (bend * ((end.latitude - start.latitude) / 6));

        route.push({
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6))
        });
    }

    return route;
}

function buildCoordinateHints(source, destination, parsedRoute) {
    if (Array.isArray(parsedRoute) && parsedRoute.length > 1) {
        return {
            startHint: parsedRoute[0],
            endHint: parsedRoute[parsedRoute.length - 1]
        };
    }

    return {
        startHint: resolveCityCoordinate(source),
        endHint: resolveCityCoordinate(destination)
    };
}

async function resolveRoutePoints({ rawPolyline, source, destination, distanceHintKm = 0 }) {
    const parsed = parseRoutePolyline(rawPolyline);
    const providerMode = String(process.env.GPS_ROUTE_PROVIDER || 'auto').toLowerCase();

    const shouldTryExternal =
        providerMode === 'external' ||
        (providerMode === 'auto' && parsed.length < MIN_ROUTE_POINTS_FOR_DB_ONLY);

    if (shouldTryExternal) {
        const { startHint, endHint } = buildCoordinateHints(source, destination, parsed);
        const externalRoute = await getExternalRoute({
            source,
            destination,
            apiKey: process.env.OPENROUTESERVICE_API_KEY || process.env.REAL_GPS_API_KEY,
            startHint,
            endHint
        });
        if (Array.isArray(externalRoute) && externalRoute.length > 1) {
            return { route: externalRoute, strategy: 'external' };
        }
    }

    if (parsed.length > 1) {
        return { route: parsed, strategy: 'db' };
    }

    const syntheticPoints = distanceHintKm > 1000 ? 12 : 8;
    const syntheticRoute = buildSyntheticRoute(source, destination, syntheticPoints);
    if (syntheticRoute.length > 1) {
        return { route: syntheticRoute, strategy: 'synthetic' };
    }

    return { route: [], strategy: 'none' };
}

function routeToPolyline(route) {
    return JSON.stringify(route.map((point) => [point.longitude, point.latitude]));
}

module.exports = {
    resolveRoutePoints,
    routeDistanceKm,
    routeToPolyline
};
