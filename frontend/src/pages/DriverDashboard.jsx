import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Management.css';

function DriverDashboard() {
    const { user } = useAuth();
    const [driverData, setDriverData] = useState(null);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [plannedTrip, setPlannedTrip] = useState(null);
    const [tripHistory, setTripHistory] = useState([]);
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

                const tripsRes = await apiClient.get(`/trips?driver_id=${driver.driver_id}`);
                if (tripsRes.data.success) {
                    const allTrips = tripsRes.data.data;
                    setCurrentTrip(allTrips.find(t => t.status === 'Running') || null);
                    setPlannedTrip(allTrips.find(t => t.status === 'Planned') || null);
                    setTripHistory(allTrips.filter(t => t.status === 'Completed').slice(0, 5));
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

    const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
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

    return (
        <>
            <header className="dashboard-header">
                <h1>Driver Dashboard</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {message.text && (
                <div className={`alert-message ${message.type}`}>{message.text}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

                {/* Profile Card */}
                <section className="stat-card">
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>MY PROFILE</h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: '#97BC62', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.3rem' }}>
                            {user?.name?.charAt(0)}
                        </div>
                        <div>
                            <strong>{user?.name}</strong>
                            <p style={{ margin: '0.2rem 0', color: '#718096', fontSize: '0.85rem' }}>{driverData.license_number}</p>
                            <p style={{ margin: 0, color: '#718096', fontSize: '0.85rem' }}>{driverData.phone}</p>
                        </div>
                    </div>
                </section>

                {/* Assigned Truck Card */}
                <section className="stat-card">
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>ASSIGNED VEHICLE</h3>
                    {driverData.truck_number ? (
                        <>
                            <div style={{ textAlign: 'center' }}>
                                <h2 style={{ fontSize: '1.8rem', color: '#2C5F2D', margin: '0.5rem 0' }}>{driverData.truck_number}</h2>
                                <span style={{ color: '#718096' }}>{driverData.truck_capacity ? `${driverData.truck_capacity} Tons` : ''}</span>
                            </div>
                        </>
                    ) : (
                        <p style={{ textAlign: 'center', color: '#718096' }}>No truck assigned currently</p>
                    )}
                </section>

                {/* Current Running Trip */}
                <section className="stat-card" style={{ gridColumn: 'span 2', borderLeft: '4px solid #4299e1' }}>
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>CURRENT TRIP</h3>
                    {currentTrip ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong style={{ fontSize: '1.1rem' }}>{currentTrip.lr_number}</strong>
                                    <p style={{ margin: '0.3rem 0', color: '#718096' }}>{currentTrip.truck_number}</p>
                                </div>
                                <span className="status-badge running" style={{ background: '#bee3f8', color: '#2b6cb0' }}>Running</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                                <div style={{ flex: 1 }}>
                                    <strong>{currentTrip.source}</strong>
                                    <br /><small style={{ color: '#718096' }}>{currentTrip.start_time ? new Date(currentTrip.start_time).toLocaleDateString() : ''}</small>
                                </div>
                                <div style={{ fontSize: '1.3rem', color: '#cbd5e0' }}>&rarr;</div>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <strong>{currentTrip.destination}</strong>
                                    <br /><small style={{ color: '#718096' }}>Freight: {formatCurrency(currentTrip.base_freight)}</small>
                                </div>
                            </div>
                            <button onClick={() => handleTripAction(currentTrip.trip_id, 'end')} className="btn-complete" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
                                Complete Trip
                            </button>
                        </>
                    ) : plannedTrip ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong style={{ fontSize: '1.1rem' }}>{plannedTrip.lr_number}</strong>
                                    <p style={{ margin: '0.3rem 0', color: '#718096' }}>{plannedTrip.truck_number}</p>
                                </div>
                                <span className="status-badge planned" style={{ background: '#feebc8', color: '#c05621' }}>Planned</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0' }}>
                                <div style={{ flex: 1 }}>
                                    <strong>{plannedTrip.source}</strong>
                                </div>
                                <div style={{ fontSize: '1.3rem', color: '#cbd5e0' }}>&rarr;</div>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <strong>{plannedTrip.destination}</strong>
                                    <br /><small style={{ color: '#718096' }}>Freight: {formatCurrency(plannedTrip.base_freight)}</small>
                                </div>
                            </div>
                            <button onClick={() => handleTripAction(plannedTrip.trip_id, 'start')} className="btn-start" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
                                Start Trip
                            </button>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#718096' }}>
                            <p>No active or planned trips. Contact admin for new assignments.</p>
                        </div>
                    )}
                </section>
            </div>

            {/* Fuel Logging — only when running trip exists */}
            {currentTrip && (
                <div style={{ marginTop: '1.5rem' }}>
                    <section className="stat-card" style={{ borderLeft: '4px solid #ed8936' }}>
                        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>LOG FUEL</h3>
                        <p style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '1rem' }}>
                            Trip: <strong>{currentTrip.lr_number}</strong> — {currentTrip.source} → {currentTrip.destination}
                        </p>
                        <form onSubmit={handleFuelSubmit} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                            <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                                <label>Liters</label>
                                <input type="number" step="0.01" min="0.01" required
                                    value={fuelForm.liters}
                                    onChange={e => setFuelForm({ ...fuelForm, liters: e.target.value })}
                                    placeholder="e.g. 50" />
                            </div>
                            <div className="form-group" style={{ flex: 1, minWidth: '120px', marginBottom: 0 }}>
                                <label>Price/Liter (₹)</label>
                                <input type="number" step="0.01" min="0.01" required
                                    value={fuelForm.price_per_liter}
                                    onChange={e => setFuelForm({ ...fuelForm, price_per_liter: e.target.value })}
                                    placeholder="e.g. 95" />
                            </div>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                                <div style={{ color: '#718096', fontSize: '0.85rem', marginBottom: '0.3rem' }}>
                                    Total: <strong>{formatCurrency((parseFloat(fuelForm.liters) || 0) * (parseFloat(fuelForm.price_per_liter) || 0))}</strong>
                                </div>
                                <button type="submit" className="btn-action primary" style={{ width: '100%' }}>Add Fuel</button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {/* Notifications */}
            <div style={{ marginTop: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3>Notifications {unreadCount > 0 && <span className="total-badge">{unreadCount} new</span>}</h3>
                    {unreadCount > 0 && (
                        <button onClick={markAllRead} className="btn-action primary">Mark all read</button>
                    )}
                </div>
                {notifications.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {notifications.map(n => (
                            <div key={n.notification_id} className="stat-card" style={{ padding: '0.75rem 1rem', opacity: n.is_read ? 0.7 : 1, borderLeft: n.is_read ? '3px solid #e2e8f0' : '3px solid #4299e1' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.9rem' }}>{n.message}</span>
                                    <small style={{ color: '#718096', whiteSpace: 'nowrap', marginLeft: '1rem' }}>{new Date(n.created_at).toLocaleString()}</small>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ color: '#718096' }}>No notifications yet.</p>
                )}
            </div>

            {/* Trip History */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Recent Trip History</h3>
            <div className="list-section" style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>LR Number</th>
                            <th>Route</th>
                            <th>Freight</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tripHistory.length > 0 ? tripHistory.map(trip => (
                            <tr key={trip.trip_id}>
                                <td>{trip.start_time ? new Date(trip.start_time).toLocaleDateString() : 'N/A'}</td>
                                <td><strong>{trip.lr_number}</strong></td>
                                <td>{trip.source} &rarr; {trip.destination}</td>
                                <td>{formatCurrency(trip.base_freight)}</td>
                                <td><span className="status-badge completed">Completed</span></td>
                            </tr>
                        )) : (
                            <tr><td colSpan="5" className="empty-state">No completed trips yet.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default DriverDashboard;
