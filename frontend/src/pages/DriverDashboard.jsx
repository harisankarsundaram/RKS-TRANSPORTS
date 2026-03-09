import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Management.css';

function KpiSvg({ kind }) {
    const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

    if (kind === 'trips') {
        return (
            <svg {...common} aria-hidden="true">
                <rect x="3" y="7" width="13" height="10" rx="2" />
                <path d="M16 10h2.8l2.2 2.4V17h-5" />
                <circle cx="7" cy="17" r="1.6" />
                <circle cx="17" cy="17" r="1.6" />
            </svg>
        );
    }

    if (kind === 'completed') {
        return (
            <svg {...common} aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="m8.5 12.3 2.2 2.2 4.8-4.8" />
            </svg>
        );
    }

    if (kind === 'distance') {
        return (
            <svg {...common} aria-hidden="true">
                <path d="M4 6h16" />
                <path d="M4 12h10" />
                <path d="M4 18h16" />
                <path d="M8 4v4" />
                <path d="M14 10v4" />
                <path d="M18 16v4" />
            </svg>
        );
    }

    if (kind === 'average') {
        return (
            <svg {...common} aria-hidden="true">
                <path d="M4 17h16" />
                <path d="M6 14 10 10l3 3 5-6" />
                <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
                <circle cx="13" cy="13" r="1" fill="currentColor" stroke="none" />
            </svg>
        );
    }

    return (
        <svg {...common} aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7.5 10.5h9" />
            <path d="M7.5 14h5" />
            <text x="7" y="9" fontSize="4" fill="currentColor" stroke="none">Rs</text>
        </svg>
    );
}

function DriverDashboard() {
    const { user } = useAuth();
    const [driverData, setDriverData] = useState(null);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [plannedTrip, setPlannedTrip] = useState(null);
    const [tripHistory, setTripHistory] = useState([]);
    const [driverStats, setDriverStats] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [fuelForm, setFuelForm] = useState({ liters: '', price_per_liter: '' });

    const fetchDashboard = async () => {
        const effectiveUserId = user?.id || user?.user_id;
        if (!effectiveUserId) { setLoading(false); return; }

        try {
            const profileRes = await apiClient.get(`/drivers/user/${effectiveUserId}`);
            if (profileRes.data.success) {
                const driver = profileRes.data.data;
                setDriverData(driver);

                const [tripsRes, historyRes] = await Promise.all([
                    apiClient.get(`/trips?driver_id=${driver.driver_id}`),
                    apiClient.get(`/trips/driver/${driver.driver_id}/history`)
                ]);

                if (tripsRes.data.success) {
                    const allTrips = tripsRes.data.data;
                    setCurrentTrip(allTrips.find(t => t.status === 'Running') || null);
                    setPlannedTrip(allTrips.find(t => t.status === 'Planned') || null);
                    setTripHistory(allTrips.filter(t => t.status === 'Completed').slice(0, 5));
                }

                if (historyRes.data.success) {
                    setDriverStats(historyRes.data.data.statistics || null);
                }
            }

            const notifRes = await apiClient.get('/notifications');
            if (notifRes.data.success) setNotifications(notifRes.data.data.slice(0, 10));
        } catch (error) {
            console.error('Error fetching driver dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDashboard(); }, [user]);

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
    const num = (v) => new Intl.NumberFormat('en-IN').format(v || 0);

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    const getTripDistance = (trip) => {
        const explicit = parseFloat(trip?.distance_km || 0);
        const computed = parseFloat(trip?.empty_km || 0) + parseFloat(trip?.loaded_km || 0);
        return explicit || computed || 0;
    };

    const handleTripAction = async (tripId, action) => {
        try {
            await apiClient.post(`/trips/${tripId}/${action}`);
            showMsg(`Trip ${action === 'start' ? 'started' : 'completed'} successfully!`);
            setLoading(true);
            await fetchDashboard();
        } catch (err) {
            showMsg(err.response?.data?.message || `Error: ${action} failed`, 'error');
        }
    };

    const markAllRead = async () => {
        try {
            await apiClient.put('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        } catch (e) { console.error(e); }
    };

    const handleFuelSubmit = async (e) => {
        e.preventDefault();
        if (!currentTrip) return;
        try {
            const liters = parseFloat(fuelForm.liters);
            const ppl = parseFloat(fuelForm.price_per_liter);
            await apiClient.post('/fuel', {
                trip_id: currentTrip.trip_id,
                liters, price_per_liter: ppl, total_cost: liters * ppl
            });
            showMsg('Fuel entry logged successfully!');
            setFuelForm({ liters: '', price_per_liter: '' });
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error adding fuel log', 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your dashboard...</div>;
    if (!driverData) return <div style={{ padding: '2rem', textAlign: 'center' }}>Driver profile not found. Please contact admin.</div>;

    const unreadCount = notifications.filter(n => !n.is_read).length;
    const averageDistance = driverStats?.completed_trips
        ? Math.round((driverStats.total_distance || 0) / driverStats.completed_trips)
        : 0;

    return (
        <>
            <header className="dashboard-header">
                <h1>Driver Dashboard</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {message.text && (
                <div className={`alert-message ${message.type}`}>{message.text}</div>
            )}

            {/* Performance KPIs */}
            <section className="analytics-kpi-row">
                <div className="analytics-kpi-card kpi-revenue">
                    <div className="kpi-icon"><KpiSvg kind="trips" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{driverStats ? driverStats.total_trips : 0}</span>
                        <span className="kpi-label">Total Trips</span>
                    </div>
                </div>
                <div className="analytics-kpi-card kpi-profit">
                    <div className="kpi-icon"><KpiSvg kind="completed" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{driverStats ? driverStats.completed_trips : 0}</span>
                        <span className="kpi-label">Completed</span>
                    </div>
                </div>
                <div className="analytics-kpi-card kpi-outstanding">
                    <div className="kpi-icon"><KpiSvg kind="distance" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{driverStats ? `${num(driverStats.total_distance)} km` : '0 km'}</span>
                        <span className="kpi-label">Total Distance</span>
                    </div>
                </div>
                <div className="analytics-kpi-card kpi-expenses">
                    <div className="kpi-icon"><KpiSvg kind="average" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{num(averageDistance)} km</span>
                        <span className="kpi-label">Avg Trip Distance</span>
                    </div>
                </div>
            </section>

            <div className="analytics-two-col">
                {/* Profile Card */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">My Profile</h3>
                    <div className="driver-profile-row">
                        <div className="driver-avatar">{user?.name?.charAt(0)}</div>
                        <div className="driver-profile-info">
                            <strong>{user?.name}</strong>
                            <span>{driverData.license_number}</span>
                            <span>{driverData.phone}</span>
                        </div>
                    </div>
                    {driverData.truck_number && (
                        <div className="driver-vehicle-badge">
                            <span className="vehicle-label">Assigned Vehicle</span>
                            <span className="vehicle-number">{driverData.truck_number}</span>
                            {driverData.truck_capacity && <span className="vehicle-cap">{driverData.truck_capacity} Tons</span>}
                        </div>
                    )}
                    {!driverData.truck_number && (
                        <div className="driver-vehicle-badge" style={{ opacity: 0.5 }}>
                            <span className="vehicle-label">No truck assigned</span>
                        </div>
                    )}
                </section>

                {/* Current / Planned Trip */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">{currentTrip ? 'Current Trip' : plannedTrip ? 'Planned Trip' : 'Trip Status'}</h3>
                    {currentTrip ? (
                        <div className="driver-trip-active">
                            <div className="trip-active-header">
                                <strong>{currentTrip.lr_number}</strong>
                                <span className="status-badge running">Running</span>
                            </div>
                            <div className="trip-active-route">
                                <div className="route-point">
                                    <span className="route-dot route-dot-start" />
                                    <div>
                                        <strong>{currentTrip.source}</strong>
                                        <small>{currentTrip.start_time ? new Date(currentTrip.start_time).toLocaleDateString() : ''}</small>
                                    </div>
                                </div>
                                <div className="route-line" />
                                <div className="route-point">
                                    <span className="route-dot route-dot-end" />
                                    <div>
                                        <strong>{currentTrip.destination}</strong>
                                        <small>{num(getTripDistance(currentTrip))} km route</small>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleTripAction(currentTrip.trip_id, 'end')} className="btn-complete" style={{ width: '100%', marginTop: '1rem' }}>
                                Complete Trip
                            </button>
                        </div>
                    ) : plannedTrip ? (
                        <div className="driver-trip-active">
                            <div className="trip-active-header">
                                <strong>{plannedTrip.lr_number}</strong>
                                <span className="status-badge planned">Planned</span>
                            </div>
                            <div className="trip-active-route">
                                <div className="route-point">
                                    <span className="route-dot route-dot-start" />
                                    <div><strong>{plannedTrip.source}</strong></div>
                                </div>
                                <div className="route-line" />
                                <div className="route-point">
                                    <span className="route-dot route-dot-end" />
                                    <div>
                                        <strong>{plannedTrip.destination}</strong>
                                        <small>{num(getTripDistance(plannedTrip))} km route</small>
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => handleTripAction(plannedTrip.trip_id, 'start')} className="btn-start" style={{ width: '100%', marginTop: '1rem' }}>
                                Start Trip
                            </button>
                        </div>
                    ) : (
                        <div className="analytics-empty" style={{ padding: '2rem' }}>
                            No active or planned trips. Contact admin for new assignments.
                        </div>
                    )}
                </section>
            </div>

            {/* Fuel Logging */}
            {currentTrip && (
                <section className="analytics-card" style={{ marginTop: '1.25rem' }}>
                    <h3 className="analytics-card-title">Log Fuel for {currentTrip.lr_number}</h3>
                    <form onSubmit={handleFuelSubmit} className="driver-fuel-form">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Liters</label>
                            <input type="number" step="0.01" min="0.01" required value={fuelForm.liters}
                                onChange={e => setFuelForm({ ...fuelForm, liters: e.target.value })} placeholder="e.g. 50" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Price/Liter (&#8377;)</label>
                            <input type="number" step="0.01" min="0.01" required value={fuelForm.price_per_liter}
                                onChange={e => setFuelForm({ ...fuelForm, price_per_liter: e.target.value })} placeholder="e.g. 95" />
                        </div>
                        <div className="fuel-total-submit">
                            <span className="fuel-total-display">Total: <strong>{fmt((parseFloat(fuelForm.liters) || 0) * (parseFloat(fuelForm.price_per_liter) || 0))}</strong></span>
                            <button type="submit" className="btn-submit" style={{ marginTop: 0 }}>Add Fuel</button>
                        </div>
                    </form>
                </section>
            )}

            {/* Notifications + Trip History */}
            <div className="analytics-two-col" style={{ marginTop: '1.25rem' }}>
                <section className="analytics-card">
                    <div className="analytics-card-header-row">
                        <h3 className="analytics-card-title">Notifications</h3>
                        {unreadCount > 0 && (
                            <button onClick={markAllRead} className="btn-action primary">Mark all read</button>
                        )}
                    </div>
                    {notifications.length > 0 ? (
                        <div className="activity-feed">
                            {notifications.map(n => (
                                <div key={n.notification_id} className={`activity-item ${n.is_read ? 'activity-read' : ''}`}>
                                    <span className="activity-msg">{n.message}</span>
                                    <small className="activity-time">{new Date(n.created_at).toLocaleString()}</small>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No notifications yet.</p>
                    )}
                </section>

                <section className="analytics-card">
                    <h3 className="analytics-card-title">Recent Trip History</h3>
                    {tripHistory.length > 0 ? (
                        <div className="recent-trips-list">
                            {tripHistory.map(trip => (
                                <div key={trip.trip_id} className="recent-trip-row">
                                    <div className="recent-trip-info">
                                        <strong>{trip.lr_number}</strong>
                                        <span>{trip.source} → {trip.destination}</span>
                                    </div>
                                    <div className="recent-trip-meta">
                                        <small>{trip.start_time ? new Date(trip.start_time).toLocaleDateString() : ''}</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No completed trips yet.</p>
                    )}
                </section>
            </div>
        </>
    );
}

export default DriverDashboard;
