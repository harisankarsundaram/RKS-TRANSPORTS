import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { microserviceClients } from '../api/microserviceClients';
import './AdminDashboard.css';

L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow
});

function num(value, digits = 1) {
    const v = Number(value);
    if (!Number.isFinite(v)) {
        return 0;
    }
    return Number(v.toFixed(digits));
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

    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h}h ${m}m` : `${h}h`;
}

function routePointsForMap(route) {
    if (!Array.isArray(route)) {
        return [];
    }

    return route
        .map((point) => {
            if (point?.latitude !== undefined && point?.longitude !== undefined) {
                return [Number(point.latitude), Number(point.longitude)];
            }
            return null;
        })
        .filter(Boolean);
}

function IntelligenceDashboard() {
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    const [liveVehicles, setLiveVehicles] = useState([]);
    const [tripInsights, setTripInsights] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [fuelAnomalies, setFuelAnomalies] = useState([]);
    const [backhaulSuggestions, setBackhaulSuggestions] = useState([]);

    const [bookings, setBookings] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [bookingAssignments, setBookingAssignments] = useState({});

    const [assistantCommand, setAssistantCommand] = useState('Add truck TN10AB1000 capacity 12 tons driver Ravi');
    const [assistantResult, setAssistantResult] = useState(null);
    const [assistantBusy, setAssistantBusy] = useState(false);

    const availableTrucks = useMemo(
        () => trucks.filter((truck) => truck.status === 'Available'),
        [trucks]
    );

    const availableDrivers = useMemo(
        () => drivers.filter((driver) => driver.status === 'Available'),
        [drivers]
    );

    const mapCenter = useMemo(() => {
        if (liveVehicles.length === 0) {
            return [13.0827, 80.2707];
        }

        return [Number(liveVehicles[0].latitude), Number(liveVehicles[0].longitude)];
    }, [liveVehicles]);

    const overallKpis = useMemo(() => {
        const progressValues = tripInsights.map((trip) => Number(trip.progress_percent || 0));
        const etaValues = tripInsights
            .map((trip) => Number(trip.eta_minutes || 0))
            .filter((value) => Number.isFinite(value) && value > 0);

        const highDelay = tripInsights.filter((trip) => Number(trip.delay_risk_percentage || 0) >= 60).length;

        return {
            runningTrips: tripInsights.length,
            avgProgress: num(average(progressValues), 1),
            avgEta: etaValues.length ? num(average(etaValues), 1) : null,
            highDelayWarnings: highDelay,
            pendingBookings: bookings.length
        };
    }, [tripInsights, bookings]);

    const syncAssignments = (pendingBookings, truckList, driverList) => {
        const defaultTruck = truckList.find((truck) => truck.status === 'Available')?.truck_id || '';
        const defaultDriver = driverList.find((driver) => driver.status === 'Available')?.driver_id || '';

        setBookingAssignments((previous) => {
            const updated = { ...previous };
            for (const booking of pendingBookings) {
                if (!updated[booking.id]) {
                    updated[booking.id] = {
                        truck_id: defaultTruck,
                        driver_id: defaultDriver
                    };
                }
            }
            return updated;
        });
    };

    const buildTripInsights = useCallback(async (vehicles) => {
        const activeTrips = vehicles.filter((vehicle) => vehicle.trip_id);
        const results = [];

        for (const vehicle of activeTrips) {
            try {
                const trackingResponse = await microserviceClients.tracking.get(`/tracking/trip/${vehicle.trip_id}`);
                const trip = trackingResponse.data?.data;
                if (!trip) {
                    continue;
                }

                const currentSpeed = Number(vehicle.speed || 0);
                const speedSamples = (trip.gps_logs || [])
                    .map((point) => Number(point.speed || 0))
                    .filter((speed) => speed > 0);

                const historicalAvgSpeed = speedSamples.length
                    ? average(speedSamples)
                    : Math.max(currentSpeed, 35);

                const distanceRemaining = Math.max(
                    Number(trip.total_route_distance_km || 0) - Number(trip.distance_travelled_km || 0),
                    0
                );

                let etaMinutes = null;
                let delayRisk = 0;

                try {
                    const etaResponse = await microserviceClients.ml.post('/predict/eta', {
                        distance_remaining: distanceRemaining,
                        current_speed: currentSpeed,
                        historical_avg_speed: historicalAvgSpeed,
                        road_type: 'highway'
                    });

                    etaMinutes = Number(etaResponse.data?.eta_minutes || 0);

                    const plannedArrival = new Date(Date.now() + (Math.max(etaMinutes, 60) * 1.1 * 60000)).toISOString();
                    const delayResponse = await microserviceClients.ml.post('/predict/delay', {
                        planned_arrival_time: plannedArrival,
                        predicted_eta: etaMinutes,
                        trip_distance: Number(trip.total_route_distance_km || 0)
                    });

                    delayRisk = Number(delayResponse.data?.delay_risk_percentage || 0);
                } catch {
                    etaMinutes = null;
                    delayRisk = 0;
                }

                results.push({
                    trip_id: trip.trip_id,
                    truck_id: trip.truck_id,
                    source: trip.source,
                    destination: trip.destination,
                    status: trip.status,
                    progress_percent: Number(trip.progress_percent || 0),
                    distance_travelled_km: Number(trip.distance_travelled_km || 0),
                    total_route_distance_km: Number(trip.total_route_distance_km || 0),
                    eta_minutes: etaMinutes,
                    delay_risk_percentage: delayRisk,
                    route: trip.route || []
                });
            } catch {
                // Ignore per-trip API failures and continue remaining trips.
            }
        }

        return results;
    }, []);

    const loadDashboard = useCallback(async (withLoader = false) => {
        if (withLoader) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }

        try {
            await microserviceClients.alert.post('/alerts/evaluate').catch(() => null);

            const [
                liveRes,
                bookingsRes,
                trucksRes,
                driversRes,
                fuelRes,
                backhaulRes,
                alertRes
            ] = await Promise.allSettled([
                microserviceClients.tracking.get('/tracking/live'),
                microserviceClients.booking.get('/bookings?status=pending'),
                apiClient.get('/trucks'),
                apiClient.get('/drivers'),
                microserviceClients.analytics.get('/analytics/fuel/anomalies'),
                microserviceClients.analytics.get('/analytics/backhaul/suggestions'),
                microserviceClients.alert.get('/alerts?limit=40')
            ]);

            const live = liveRes.status === 'fulfilled' ? liveRes.value.data?.data || [] : [];
            const pendingBookings = bookingsRes.status === 'fulfilled' ? bookingsRes.value.data?.data || [] : [];
            const truckData = trucksRes.status === 'fulfilled' ? trucksRes.value.data?.data || [] : [];
            const driverData = driversRes.status === 'fulfilled' ? driversRes.value.data?.data || [] : [];
            const fuelData = fuelRes.status === 'fulfilled' ? fuelRes.value.data?.data || [] : [];
            const backhaulData = backhaulRes.status === 'fulfilled' ? backhaulRes.value.data?.data || [] : [];
            const alertData = alertRes.status === 'fulfilled' ? alertRes.value.data?.data || [] : [];

            setLiveVehicles(live);
            setBookings(pendingBookings);
            setTrucks(truckData);
            setDrivers(driverData);
            setFuelAnomalies(fuelData);
            setBackhaulSuggestions(backhaulData);
            setAlerts(alertData);

            syncAssignments(pendingBookings, truckData, driverData);

            const insights = await buildTripInsights(live);
            setTripInsights(insights);
        } catch (error) {
            setMessage({ type: 'error', text: error.message || 'Failed to load dashboard intelligence' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [buildTripInsights]);

    useEffect(() => {
        loadDashboard(true);
        const timer = window.setInterval(() => {
            loadDashboard(false);
        }, 30000);

        return () => window.clearInterval(timer);
    }, [loadDashboard]);

    const updateAssignment = (bookingId, field, value) => {
        setBookingAssignments((previous) => ({
            ...previous,
            [bookingId]: {
                ...previous[bookingId],
                [field]: Number(value)
            }
        }));
    };

    const handleBookingAction = async (booking, action) => {
        try {
            if (action === 'approve') {
                const assignment = bookingAssignments[booking.id] || {};

                if (!assignment.truck_id || !assignment.driver_id) {
                    setMessage({ type: 'error', text: 'Select truck and driver before approving a booking.' });
                    return;
                }

                await microserviceClients.booking.post(`/bookings/${booking.id}/approve`, {
                    truck_id: Number(assignment.truck_id),
                    driver_id: Number(assignment.driver_id)
                });

                setMessage({ type: 'success', text: `Booking #${booking.id} approved and converted into a trip.` });
            } else {
                await microserviceClients.booking.post(`/bookings/${booking.id}/reject`);
                setMessage({ type: 'success', text: `Booking #${booking.id} rejected.` });
            }

            await loadDashboard(false);
        } catch (error) {
            setMessage({ type: 'error', text: error.response?.data?.message || 'Booking action failed' });
        }
    };

    const runSmartAssistant = async () => {
        if (!assistantCommand.trim()) {
            return;
        }

        setAssistantBusy(true);
        setAssistantResult(null);

        try {
            const response = await microserviceClients.fleet.post('/fleet/smart-entry', {
                command: assistantCommand
            });

            setAssistantResult(response.data);
            setMessage({ type: 'success', text: 'Smart entry command executed successfully.' });
            await loadDashboard(false);
        } catch (error) {
            setAssistantResult({
                success: false,
                message: error.response?.data?.message || 'Smart command could not be processed'
            });
            setMessage({ type: 'error', text: 'Smart command failed.' });
        } finally {
            setAssistantBusy(false);
        }
    };

    return (
        <div className="intel-dashboard">
            <header className="intel-header">
                <div>
                    <h1>Intelligent Logistics Command Center</h1>
                    <p>
                        Welcome, {user?.name || 'Admin'}. Monitor live GPS, ETA intelligence, operational alerts,
                        booking approvals, fuel anomalies, and backhaul opportunities in one place.
                    </p>
                </div>
                <button className="intel-refresh" onClick={() => loadDashboard(false)} disabled={refreshing || loading}>
                    {refreshing ? 'Refreshing...' : 'Refresh Intelligence'}
                </button>
            </header>

            {message.text && (
                <div className={`intel-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            <section className="intel-kpi-grid">
                <article className="intel-kpi-card">
                    <h3>Live Running Trips</h3>
                    <p>{overallKpis.runningTrips}</p>
                </article>
                <article className="intel-kpi-card">
                    <h3>Average Progress</h3>
                    <p>{overallKpis.avgProgress}%</p>
                </article>
                <article className="intel-kpi-card">
                    <h3>Average ETA</h3>
                    <p>{overallKpis.avgEta ? formatEtaMinutes(overallKpis.avgEta) : 'N/A'}</p>
                </article>
                <article className="intel-kpi-card">
                    <h3>Delay Warnings</h3>
                    <p>{overallKpis.highDelayWarnings}</p>
                </article>
                <article className="intel-kpi-card">
                    <h3>Pending Bookings</h3>
                    <p>{overallKpis.pendingBookings}</p>
                </article>
            </section>

            <section className="intel-panel">
                <div className="intel-panel-header">
                    <h2>Live Truck Map (Leaflet)</h2>
                    <span>{liveVehicles.length} trucks reporting</span>
                </div>
                <div className="intel-map-wrap">
                    <MapContainer center={mapCenter} zoom={6} scrollWheelZoom className="intel-map">
                        <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        />

                        {tripInsights.map((trip) => (
                            <Polyline
                                key={`route-${trip.trip_id}`}
                                positions={routePointsForMap(trip.route)}
                                pathOptions={{ color: trip.delay_risk_percentage >= 60 ? '#b91c1c' : '#1d4ed8', weight: 4, opacity: 0.65 }}
                            />
                        ))}

                        {liveVehicles.map((vehicle) => (
                            <Marker
                                key={`${vehicle.truck_id}-${vehicle.trip_id || 'idle'}`}
                                position={[Number(vehicle.latitude), Number(vehicle.longitude)]}
                            >
                                <Popup>
                                    <strong>{vehicle.truck_number || `Truck ${vehicle.truck_id}`}</strong>
                                    <br />
                                    Trip: {vehicle.trip_id || 'N/A'}
                                    <br />
                                    Speed: {num(vehicle.speed, 1)} km/h
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            </section>

            <section className="intel-panel">
                <div className="intel-panel-header">
                    <h2>Trip Progress, ETA, Delay Prediction</h2>
                    <span>{tripInsights.length} active intelligence rows</span>
                </div>
                <div className="intel-table-wrap">
                    <table className="intel-table">
                        <thead>
                            <tr>
                                <th>Trip</th>
                                <th>Route</th>
                                <th>Progress</th>
                                <th>ETA</th>
                                <th>Delay Risk</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tripInsights.map((trip) => (
                                <tr key={trip.trip_id}>
                                    <td>#{trip.trip_id} / Truck {trip.truck_id}</td>
                                    <td>{trip.source} → {trip.destination}</td>
                                    <td>{num(trip.progress_percent, 1)}%</td>
                                    <td>{formatEtaMinutes(trip.eta_minutes)}</td>
                                    <td>
                                        <span className={`risk-chip ${trip.delay_risk_percentage >= 60 ? 'high' : trip.delay_risk_percentage >= 35 ? 'medium' : 'low'}`}>
                                            {num(trip.delay_risk_percentage, 1)}%
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {tripInsights.length === 0 && (
                                <tr>
                                    <td colSpan="5">No running trips are currently streaming GPS logs.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="intel-panel">
                <div className="intel-panel-header">
                    <h2>Pending Booking Requests (Approve / Reject)</h2>
                    <span>{bookings.length} pending</span>
                </div>
                <div className="intel-table-wrap">
                    <table className="intel-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Route</th>
                                <th>Load</th>
                                <th>Price</th>
                                <th>Assign</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bookings.map((booking) => (
                                <tr key={booking.id}>
                                    <td>
                                        <strong>{booking.customer_name}</strong>
                                        <br />
                                        {booking.contact_number}
                                    </td>
                                    <td>{booking.pickup_location} → {booking.destination}</td>
                                    <td>{booking.load_type}, {booking.weight} tons</td>
                                    <td>INR {Number(booking.offered_price || 0).toLocaleString('en-IN')}</td>
                                    <td>
                                        <div className="assign-grid">
                                            <select
                                                value={bookingAssignments[booking.id]?.truck_id || ''}
                                                onChange={(event) => updateAssignment(booking.id, 'truck_id', event.target.value)}
                                            >
                                                <option value="">Truck</option>
                                                {availableTrucks.map((truck) => (
                                                    <option key={truck.truck_id} value={truck.truck_id}>{truck.truck_number}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={bookingAssignments[booking.id]?.driver_id || ''}
                                                onChange={(event) => updateAssignment(booking.id, 'driver_id', event.target.value)}
                                            >
                                                <option value="">Driver</option>
                                                {availableDrivers.map((driver) => (
                                                    <option key={driver.driver_id} value={driver.driver_id}>{driver.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="action-row">
                                            <button className="action-btn approve" onClick={() => handleBookingAction(booking, 'approve')}>Approve</button>
                                            <button className="action-btn reject" onClick={() => handleBookingAction(booking, 'reject')}>Reject</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {bookings.length === 0 && (
                                <tr>
                                    <td colSpan="6">No pending booking requests.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="intel-two-col">
                <article className="intel-panel">
                    <div className="intel-panel-header">
                        <h2>Fuel Analytics</h2>
                        <span>{fuelAnomalies.length} anomalies</span>
                    </div>
                    <ul className="intel-list">
                        {fuelAnomalies.map((item) => (
                            <li key={item.trip_id}>
                                Trip #{item.trip_id}: actual {item.actual_fuel}L vs expected {item.expected_fuel}L
                            </li>
                        ))}
                        {fuelAnomalies.length === 0 && <li>No fuel anomalies detected.</li>}
                    </ul>
                </article>

                <article className="intel-panel">
                    <div className="intel-panel-header">
                        <h2>Backhaul Suggestions</h2>
                        <span>{backhaulSuggestions.length} opportunities</span>
                    </div>
                    <ul className="intel-list">
                        {backhaulSuggestions.map((item) => (
                            <li key={`${item.trip_id}-${item.booking_id}`}>
                                Truck {item.truck_id}: pickup within {item.distance_to_pickup_km} km for booking #{item.booking_id}
                            </li>
                        ))}
                        {backhaulSuggestions.length === 0 && <li>No backhaul opportunities found right now.</li>}
                    </ul>
                </article>
            </section>

            <section className="intel-two-col">
                <article className="intel-panel">
                    <div className="intel-panel-header">
                        <h2>Operational Alerts</h2>
                        <span>{alerts.length} records</span>
                    </div>
                    <ul className="intel-list">
                        {alerts.slice(0, 18).map((alert) => (
                            <li key={alert.id}>
                                <strong>{alert.alert_type}</strong>: {alert.description}
                            </li>
                        ))}
                        {alerts.length === 0 && <li>No operational alerts available.</li>}
                    </ul>
                </article>

                <article className="intel-panel">
                    <div className="intel-panel-header">
                        <h2>Smart Data Entry Assistant</h2>
                        <span>Fleet command parser</span>
                    </div>
                    <div className="assistant-form">
                        <input
                            value={assistantCommand}
                            onChange={(event) => setAssistantCommand(event.target.value)}
                            placeholder="Add truck TN10AB1000 capacity 12 tons driver Ravi"
                        />
                        <button className="action-btn approve" onClick={runSmartAssistant} disabled={assistantBusy}>
                            {assistantBusy ? 'Processing...' : 'Run Command'}
                        </button>
                    </div>
                    {assistantResult && (
                        <pre className="assistant-result">
                            {JSON.stringify(assistantResult, null, 2)}
                        </pre>
                    )}
                </article>
            </section>

            {loading && <div className="intel-loading">Loading intelligent dashboard...</div>}
        </div>
    );
}

export default IntelligenceDashboard;
