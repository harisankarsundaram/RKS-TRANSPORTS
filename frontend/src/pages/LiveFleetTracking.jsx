import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useAuth } from '../context/AuthContext';
import {
    buildTripInsightsFromVehicles,
    ensureTrackingSimulation,
    fetchLiveVehiclesWithFallback,
    formatTrackingSourceLabel
} from '../services/liveTrackingService';
import './LiveFleetTracking.css';

const DEFAULT_CENTER = [13.0827, 80.2707];
const REFRESH_INTERVAL_MS = 30000;
const CLUSTER_MIN_VEHICLES = 14;
const MAX_ROUTE_POINTS_FOR_MAP = 1600;

function roundTo(value, digits = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Number(parsed.toFixed(digits));
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    const sum = values.reduce((acc, item) => acc + Number(item || 0), 0);
    return sum / values.length;
}

function formatEtaMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) {
        return 'N/A';
    }

    if (minutes < 60) {
        return `${Math.max(1, Math.round(minutes))} min`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function routePointsForMap(route) {
    if (!Array.isArray(route)) {
        return [];
    }

    const normalizedPoints = route
        .map((point) => {
            if (point?.latitude !== undefined && point?.longitude !== undefined) {
                const lat = Number(point.latitude);
                const lng = Number(point.longitude);

                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    return [lat, lng];
                }
            }

            return null;
        })
        .filter(Boolean);

    if (normalizedPoints.length <= MAX_ROUTE_POINTS_FOR_MAP) {
        return normalizedPoints;
    }

    const stride = Math.ceil(normalizedPoints.length / MAX_ROUTE_POINTS_FOR_MAP);
    return normalizedPoints.filter((_, index) => {
        return index === 0 || index === normalizedPoints.length - 1 || index % stride === 0;
    });
}

function getMarkerTier(speedValue) {
    const speed = Number(speedValue || 0);

    if (speed > 80) {
        return 'high';
    }

    return 'low';
}

function getSourceTone(source) {
    if (source === 'backend-mock') {
        return 'fallback';
    }

    if (source === 'unknown') {
        return 'offline';
    }

    return 'live';
}

function createTruckMarkerIcon(riskTier, headingValue = 0) {
    const heading = Number.isFinite(Number(headingValue)) ? Number(headingValue) : 0;

    return L.divIcon({
        className: 'tracking-truck-icon-wrap',
        html: `
            <div class="tracking-truck-pin ${riskTier}">
                <span class="tracking-truck-pulse"></span>
                <span class="tracking-truck-core"></span>
                <span class="tracking-truck-arrow" style="transform: translate(-50%, -50%) rotate(${heading}deg);"></span>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createClusterIcon(cluster) {
    const count = Number(cluster.getChildCount() || 0);
    let tier = 'small';

    if (count >= 40) {
        tier = 'large';
    } else if (count >= 20) {
        tier = 'medium';
    }

    return L.divIcon({
        className: 'tracking-cluster-wrap',
        html: `<div class="tracking-cluster-icon ${tier}"><span>${count}</span></div>`,
        iconSize: [46, 46],
        iconAnchor: [23, 23]
    });
}

function buildClusterPopupMarkup(vehicle, trip) {
    return `
        <div class="tracking-popup">
            <strong>${escapeHtml(vehicle.truck_number || `Truck ${vehicle.truck_id}`)}</strong>
            <div>Trip: ${escapeHtml(vehicle.trip_id || 'N/A')}</div>
            <div>Speed: ${roundTo(vehicle.speed, 1)} km/h</div>
            <div>ETA: ${escapeHtml(formatEtaMinutes(Number(trip?.eta_minutes)))}</div>
        </div>
    `;
}

function toVehicleMapPoint(vehicle) {
    const lat = Number(vehicle?.latitude);
    const lng = Number(vehicle?.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return [lat, lng];
}

function FleetMapController({ points, focusPoint, fitVersion }) {
    const map = useMap();

    useEffect(() => {
        if (Array.isArray(focusPoint) && focusPoint.length === 2) {
            map.flyTo(focusPoint, Math.max(map.getZoom(), 11), {
                animate: true,
                duration: 0.9
            });

            return;
        }

        if (fitVersion === 0 || points.length === 0) {
            return;
        }

        if (points.length === 1) {
            map.flyTo(points[0], 10, {
                animate: true,
                duration: 0.9
            });

            return;
        }

        map.flyToBounds(L.latLngBounds(points).pad(0.25), {
            animate: true,
            duration: 0.9
        });
    }, [fitVersion, focusPoint, map, points]);

    return null;
}

function VehicleClusterLayer({ liveVehicles, tripLookup, onFocusTruck }) {
    const map = useMap();
    const clusterGroupRef = useRef(null);

    useEffect(() => {
        if (typeof L.markerClusterGroup !== 'function') {
            return undefined;
        }

        const clusterGroup = L.markerClusterGroup({
            maxClusterRadius: 54,
            disableClusteringAtZoom: 12,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            iconCreateFunction: createClusterIcon
        });

        clusterGroupRef.current = clusterGroup;
        map.addLayer(clusterGroup);

        return () => {
            map.removeLayer(clusterGroup);
            clusterGroupRef.current = null;
        };
    }, [map]);

    useEffect(() => {
        const clusterGroup = clusterGroupRef.current;
        if (!clusterGroup) {
            return;
        }

        clusterGroup.clearLayers();

        for (const vehicle of liveVehicles) {
            const markerPoint = toVehicleMapPoint(vehicle);
            if (!markerPoint) {
                continue;
            }

            const trip = vehicle.trip_id !== undefined && vehicle.trip_id !== null
                ? tripLookup.get(String(vehicle.trip_id))
                : null;
            const markerTier = getMarkerTier(vehicle.speed);

            const marker = L.marker(markerPoint, {
                icon: createTruckMarkerIcon(markerTier, Number(vehicle.heading ?? vehicle.bearing ?? 0))
            });

            const label = vehicle.truck_number || `Truck ${vehicle.truck_id}`;
            marker.bindTooltip(escapeHtml(label), {
                direction: 'top',
                offset: [0, -16],
                className: 'tracking-truck-tooltip'
            });

            marker.bindPopup(buildClusterPopupMarkup(vehicle, trip));
            marker.on('click', () => onFocusTruck(vehicle.truck_id));

            clusterGroup.addLayer(marker);
        }
    }, [liveVehicles, onFocusTruck, tripLookup]);

    return null;
}

function LiveFleetTracking() {
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [liveVehicles, setLiveVehicles] = useState([]);
    const [tripInsights, setTripInsights] = useState([]);
    const [trackingSource, setTrackingSource] = useState('unknown');
    const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
    const [focusedTruckId, setFocusedTruckId] = useState(null);
    const [fitVersion, setFitVersion] = useState(0);

    const initialFitDoneRef = useRef(false);

    const tripLookup = useMemo(() => {
        const lookup = new Map();

        for (const trip of tripInsights) {
            lookup.set(String(trip.trip_id), trip);
        }

        return lookup;
    }, [tripInsights]);

    const trucksByTrip = useMemo(() => {
        const lookup = new Map();

        for (const vehicle of liveVehicles) {
            if (vehicle.trip_id !== undefined && vehicle.trip_id !== null && !lookup.has(String(vehicle.trip_id))) {
                lookup.set(String(vehicle.trip_id), vehicle);
            }
        }

        return lookup;
    }, [liveVehicles]);

    const mapPoints = useMemo(
        () => liveVehicles.map(toVehicleMapPoint).filter(Boolean),
        [liveVehicles]
    );

    const focusPoint = useMemo(() => {
        if (!focusedTruckId) {
            return null;
        }

        const focusedVehicle = liveVehicles.find((vehicle) => String(vehicle.truck_id) === String(focusedTruckId));
        return toVehicleMapPoint(focusedVehicle);
    }, [focusedTruckId, liveVehicles]);

    const focusedVehicle = useMemo(
        () => liveVehicles.find((vehicle) => String(vehicle.truck_id) === String(focusedTruckId)) || null,
        [liveVehicles, focusedTruckId]
    );

    const focusedTrip = useMemo(() => {
        if (!focusedVehicle || focusedVehicle.trip_id === undefined || focusedVehicle.trip_id === null) {
            return null;
        }

        return tripLookup.get(String(focusedVehicle.trip_id)) || null;
    }, [focusedVehicle, tripLookup]);

    const openDrawerAndFocusTruck = useCallback((truckId) => {
        setFocusedTruckId(String(truckId));
        setDrawerOpen(true);
    }, []);

    const overallKpis = useMemo(() => {
        const progressValues = tripInsights.map((trip) => Number(trip.progress_percent || 0));
        const etaValues = tripInsights
            .map((trip) => Number(trip.eta_minutes || 0))
            .filter((value) => Number.isFinite(value) && value > 0);

        return {
            runningTrips: Math.max(tripInsights.length, liveVehicles.length),
            avgProgress: roundTo(average(progressValues), 1),
            avgEta: etaValues.length ? roundTo(average(etaValues), 1) : null,
            reportingTrucks: liveVehicles.length
        };
    }, [tripInsights, liveVehicles]);

    const consistencyNote = useMemo(() => {
        if (liveVehicles.length === 0) {
            return 'No running trips in the current live feed';
        }

        if (tripInsights.length === liveVehicles.length) {
            return 'Live feed and trip insights are synchronized';
        }

        return `Live feed ${liveVehicles.length} / detailed trip rows ${tripInsights.length}`;
    }, [liveVehicles.length, tripInsights.length]);

    const loadLiveTracking = useCallback(async (withLoader = false) => {
        if (withLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            await ensureTrackingSimulation();

            const { liveVehicles: liveData, source } = await fetchLiveVehiclesWithFallback();
            const insights = await buildTripInsightsFromVehicles(liveData);

            setLiveVehicles(liveData);
            setTripInsights(insights);
            setTrackingSource(source);
            setLastUpdatedAt(new Date().toISOString());

            if (!initialFitDoneRef.current && liveData.length > 0) {
                initialFitDoneRef.current = true;
                setFitVersion((previous) => previous + 1);
            }

            setFocusedTruckId((currentFocusedTruckId) => {
                if (!currentFocusedTruckId) {
                    return currentFocusedTruckId;
                }

                const stillExists = liveData.some((vehicle) => String(vehicle.truck_id) === String(currentFocusedTruckId));
                return stillExists ? currentFocusedTruckId : null;
            });

            if (liveData.length === 0) {
                setMessage({
                    type: 'error',
                    text: 'No active vehicle feed detected yet. Simulation bootstrap has been triggered; refresh in a few seconds.'
                });
            } else {
                setMessage({ type: '', text: '' });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: error.response?.data?.message || 'Live tracking services are currently unavailable.'
            });
            setTrackingSource('unknown');
            setLiveVehicles([]);
            setTripInsights([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadLiveTracking(true);
        const timer = window.setInterval(() => {
            loadLiveTracking(false);
        }, REFRESH_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [loadLiveTracking]);

    const recenterFleet = () => {
        setFitVersion((previous) => previous + 1);
    };

    const clusteringEnabled = typeof L.markerClusterGroup === 'function' && liveVehicles.length >= CLUSTER_MIN_VEHICLES;

    return (
        <div className="tracking-fullscreen-shell">
            <div className="tracking-map-layer">
                <MapContainer center={DEFAULT_CENTER} zoom={6} minZoom={4} scrollWheelZoom className="tracking-map-canvas">
                    <TileLayer
                        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    <FleetMapController points={mapPoints} focusPoint={focusPoint} fitVersion={fitVersion} />

                    {tripInsights.map((trip) => {
                        const routePoints = routePointsForMap(trip.route);

                        if (routePoints.length < 2) {
                            return null;
                        }

                        return [
                            <Polyline
                                key={`route-base-${trip.trip_id}`}
                                positions={routePoints}
                                pathOptions={{
                                    color: '#ffffff',
                                    weight: 7,
                                    opacity: 0.75,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                }}
                            />,
                            <Polyline
                                key={`route-${trip.trip_id}`}
                                positions={routePoints}
                                pathOptions={{
                                    color: '#0ea5e9',
                                    weight: 4,
                                    opacity: 0.9,
                                    lineCap: 'round',
                                    lineJoin: 'round'
                                }}
                            />
                        ];
                    })}

                    {clusteringEnabled ? (
                        <VehicleClusterLayer
                            liveVehicles={liveVehicles}
                            tripLookup={tripLookup}
                            onFocusTruck={openDrawerAndFocusTruck}
                        />
                    ) : (
                        liveVehicles.map((vehicle) => {
                            const markerPoint = toVehicleMapPoint(vehicle);

                            if (!markerPoint) {
                                return null;
                            }

                            const trip = vehicle.trip_id !== undefined && vehicle.trip_id !== null
                                ? tripLookup.get(String(vehicle.trip_id))
                                : null;
                            const markerTier = getMarkerTier(vehicle.speed);

                            return (
                                <Marker
                                    key={`${vehicle.truck_id}-${vehicle.trip_id || 'idle'}`}
                                    icon={createTruckMarkerIcon(markerTier, Number(vehicle.heading ?? vehicle.bearing ?? 0))}
                                    position={markerPoint}
                                    eventHandlers={{
                                        click: () => openDrawerAndFocusTruck(vehicle.truck_id)
                                    }}
                                >
                                    <Tooltip
                                        className="tracking-truck-tooltip"
                                        direction="top"
                                        offset={[0, -16]}
                                        permanent
                                    >
                                        {vehicle.truck_number || `Truck ${vehicle.truck_id}`}
                                    </Tooltip>
                                    <Popup>
                                        <div className="tracking-popup">
                                            <strong>{vehicle.truck_number || `Truck ${vehicle.truck_id}`}</strong>
                                            <div>Trip: {vehicle.trip_id || 'N/A'}</div>
                                            <div>Speed: {roundTo(vehicle.speed, 1)} km/h</div>
                                            <div>ETA: {formatEtaMinutes(Number(trip?.eta_minutes))}</div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })
                    )}
                </MapContainer>
            </div>

            <header className="tracking-topbar">
                <div className="tracking-topbar-row">
                    <div className="tracking-title-wrap">
                        <Link to="/dashboard/admin" className="tracking-back-link">Back to Dashboard</Link>
                        <div className="tracking-title-copy">
                            <h1>Live Fleet Tracking</h1>
                            <p>
                                {user?.name || 'Admin'} | {overallKpis.runningTrips} running trips | {liveVehicles.length} trucks reporting | {formatTrackingSourceLabel(trackingSource)}
                                {clusteringEnabled ? ' | Cluster view active' : ''}
                                {lastUpdatedAt ? ` | Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}` : ''}
                            </p>
                            <p className="tracking-title-subline">{consistencyNote}</p>
                        </div>
                    </div>
                    <div className="tracking-toolbar">
                        <button type="button" className="tracking-tool-btn" onClick={recenterFleet} disabled={mapPoints.length === 0}>
                            Recenter Fleet
                        </button>
                        <button
                            type="button"
                            className="tracking-tool-btn"
                            onClick={() => loadLiveTracking(false)}
                            disabled={refreshing || loading}
                        >
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button
                            type="button"
                            className={`tracking-hamburger ${drawerOpen ? 'open' : ''}`}
                            onClick={() => setDrawerOpen((open) => !open)}
                            aria-label="Toggle details panel"
                            aria-expanded={drawerOpen}
                        >
                            <span />
                            <span />
                            <span />
                            <strong>Details</strong>
                        </button>
                    </div>
                </div>
                {message.text && (
                    <div className={`tracking-message ${message.type}`}>
                        {message.text}
                    </div>
                )}
            </header>

            <section className="tracking-legend">
                <h3>Annotation Legend</h3>
                <div className="tracking-legend-row">
                    <span className="tracking-dot low" /> Trip history route
                </div>
                <div className="tracking-legend-row">
                    <span className="tracking-dot truck" /> Truck marker with heading arrow
                </div>
                <div className="tracking-legend-row">
                    <span className="tracking-dot high" /> Overspeed marker (speed above 80 km/h)
                </div>
                {clusteringEnabled && (
                    <div className="tracking-legend-row">
                        <span className="tracking-dot cluster" /> Cluster marker = grouped trucks
                    </div>
                )}
            </section>

            <button
                type="button"
                className={`tracking-drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
                onClick={() => setDrawerOpen(false)}
                aria-label="Close details panel"
            />

            <aside className={`tracking-drawer ${drawerOpen ? 'open' : ''}`}>
                <div className="tracking-drawer-header">
                    <h2>Fleet Details</h2>
                    <button type="button" className="tracking-close-btn" onClick={() => setDrawerOpen(false)}>
                        Close
                    </button>
                </div>

                <div className="tracking-drawer-body">
                    <section className="tracking-status-strip">
                        <span className={`tracking-source-pill ${getSourceTone(trackingSource)}`}>
                            {formatTrackingSourceLabel(trackingSource)}
                        </span>
                        <span className="tracking-source-meta">
                            {lastUpdatedAt ? `Updated ${new Date(lastUpdatedAt).toLocaleString()}` : 'No recent update'}
                        </span>
                    </section>

                    <section className="tracking-kpi-grid">
                        <article className="tracking-kpi-card">
                            <span>Running Trips</span>
                            <strong>{overallKpis.runningTrips}</strong>
                        </article>
                        <article className="tracking-kpi-card">
                            <span>Average Progress</span>
                            <strong>{overallKpis.avgProgress}%</strong>
                        </article>
                        <article className="tracking-kpi-card">
                            <span>Average ETA</span>
                            <strong>{overallKpis.avgEta ? formatEtaMinutes(overallKpis.avgEta) : 'N/A'}</strong>
                        </article>
                        <article className="tracking-kpi-card">
                            <span>Trucks Reporting</span>
                            <strong>{overallKpis.reportingTrucks}</strong>
                        </article>
                    </section>

                    {focusedVehicle && (
                        <section className="tracking-focus-card">
                            <h3>Focused Truck</h3>
                            <p>{focusedVehicle.truck_number || `Truck ${focusedVehicle.truck_id}`}</p>
                            <div className="tracking-focus-meta">
                                <span>Trip: {focusedVehicle.trip_id || 'N/A'}</span>
                                <span>Speed: {roundTo(focusedVehicle.speed, 1)} km/h</span>
                                <span>ETA: {formatEtaMinutes(Number(focusedTrip?.eta_minutes))}</span>
                            </div>
                        </section>
                    )}

                    <section className="tracking-trip-section">
                        <div className="tracking-trip-section-head">
                            <h3>Active Trips</h3>
                            <span>{tripInsights.length} rows</span>
                        </div>

                        {tripInsights.length > 0 ? (
                            <ul className="tracking-trip-list">
                                {tripInsights.map((trip) => {
                                    const mappedTruck = trucksByTrip.get(String(trip.trip_id));
                                    const isFocused = mappedTruck && String(mappedTruck.truck_id) === String(focusedTruckId);

                                    return (
                                        <li key={trip.trip_id} className={`tracking-trip-item ${isFocused ? 'active' : ''}`}>
                                            <div className="tracking-trip-top">
                                                <strong>Trip #{trip.trip_id}</strong>
                                            </div>

                                            <p>{trip.source} to {trip.destination}</p>

                                            <div className="tracking-trip-meta">
                                                <span>Progress {roundTo(trip.progress_percent, 1)}%</span>
                                                <span>ETA {formatEtaMinutes(trip.eta_minutes)}</span>
                                            </div>

                                            <button
                                                type="button"
                                                className="tracking-focus-btn"
                                                onClick={() => mappedTruck && openDrawerAndFocusTruck(mappedTruck.truck_id)}
                                                disabled={!mappedTruck}
                                            >
                                                {mappedTruck ? 'Focus on Map' : 'No Truck Signal'}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="tracking-empty">No running trips are currently streaming GPS logs.</p>
                        )}
                    </section>
                </div>
            </aside>

            {loading && <div className="tracking-loading">Loading live fleet tracking...</div>}
        </div>
    );
}

export default LiveFleetTracking;
