import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function DriverDashboard() {
    const { user } = useAuth();
    const [driverData, setDriverData] = useState(null);
    const [currentTrip, setCurrentTrip] = useState(null);
    const [tripHistory, setTripHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDriverDashboard = async () => {
            const effectiveUserId = user?.id || user?.user_id;
            console.log('Driver Dashboard User:', user, 'Effective ID:', effectiveUserId);

            if (!effectiveUserId) {
                console.warn('No effective user ID found');
                setLoading(false);
                return;
            }

            try {
                // 1. Fetch Driver Profile
                console.log(`Fetching driver profile for user: ${effectiveUserId}`);
                const profileRes = await apiClient.get(`/drivers/user/${effectiveUserId}`);
                const profileJson = profileRes.data;
                console.log('Profile Response:', profileJson);

                if (profileJson.success) {
                    const driver = profileJson.data;
                    setDriverData(driver);

                    // 2. Fetch Trips for this driver
                    console.log(`Fetching trips for driver: ${driver.driver_id}`);
                    const tripsRes = await apiClient.get(`/trips?driver_id=${driver.driver_id}`);
                    const tripsJson = tripsRes.data;
                    console.log('Trips Response:', tripsJson);

                    if (tripsJson.success) {
                        const allTrips = tripsJson.data;
                        // Running trip
                        const active = allTrips.find(t => t.status === 'Running');
                        setCurrentTrip(active || null);

                        // Recent history (Completed)
                        const history = allTrips
                            .filter(t => t.status === 'Completed')
                            .slice(0, 5);
                        setTripHistory(history);
                    }
                }
            } catch (error) {
                console.error('Error fetching driver dashboard:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDriverDashboard();
    }, [user]);

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your dashboard...</div>;

    if (!driverData) return <div style={{ padding: '2rem', textAlign: 'center' }}>Driver profile not found. Please contact admin.</div>;

    return (
        <>
            <header className="dashboard-header">
                <h1>Driver Dashboard</h1>
                <p>Welcome back, Pilot {user?.name}</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

                {/* Section A: Driver Profile */}
                <section className="stat-card" style={{ gridColumn: 'span 1' }}>
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>
                        MY PROFILE
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#97BC62', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '1.5rem' }}>
                            {user?.name?.charAt(0)}
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{user?.name}</h4>
                            <p style={{ margin: '0.2rem 0', color: '#718096', fontSize: '0.9rem' }}>{driverData.license_number}</p>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <span className="status-badge" style={{ background: '#F2F5D0', color: '#2C5F2D' }}>Active</span>
                                <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>Verified</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #eee', fontSize: '0.9rem', color: '#4a5568' }}>
                        <strong>Phone:</strong> {driverData.phone}
                    </div>
                </section>

                {/* Section B: Assigned Lorry */}
                <section className="stat-card">
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>
                        ISSUED VEHICLE
                    </h3>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '2rem', color: '#2C5F2D', margin: '0.5rem 0' }}>{driverData.truck_number || 'No Truck Assigned'}</h2>
                        <span className="status-badge" style={{ background: '#cce5ff', color: '#004085' }}>{driverData.status}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.95rem' }}>
                        <div>
                            <span style={{ color: '#718096', display: 'block' }}>Capacity</span>
                            <strong>{driverData.truck_capacity ? `${driverData.truck_capacity} Tons` : 'N/A'}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#718096', display: 'block' }}>Status</span>
                            <strong>Ready</strong>
                        </div>
                    </div>
                </section>

                {/* Section C: Current Trip */}
                <section className="action-card" style={{ gridColumn: 'span 2', borderLeftColor: '#D97706' }}>
                    {currentTrip ? (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>CURRENT TRIP: {currentTrip.lr_number}</h3>
                                    <p style={{ marginTop: '0.5rem' }}><strong>Freight:</strong> {formatCurrency(currentTrip.freight_amount)}</p>
                                </div>
                                <span className="status-badge" style={{ background: '#feebc8', color: '#c05621' }}>{currentTrip.status}</span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentTrip.source}</div>
                                    <small style={{ color: '#718096' }}>{new Date(currentTrip.start_time).toLocaleDateString()}</small>
                                </div>
                                <div style={{ fontSize: '1.5rem', color: '#cbd5e0' }}>&rarr;</div>
                                <div style={{ flex: 1, textAlign: 'right' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentTrip.destination}</div>
                                    <small style={{ color: '#718096' }}>{currentTrip.distance_km} km</small>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: '45%', height: '100%', background: '#D97706' }}></div>
                            </div>
                            <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#718096', marginTop: '0.5rem' }}>
                                In Transit
                            </p>
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            <h3 style={{ color: '#718096' }}>No active trip at the moment.</h3>
                            <p>Check "Upcoming" or contact manager for assignments.</p>
                        </div>
                    )}
                </section>

            </div>

            {/* Section D: Trip History */}
            <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem' }}>Recent Trip History</h3>
            <div className="list-section" style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', overflowX: 'auto' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>LR Number</th>
                            <th>Route</th>
                            <th>Distance</th>
                            <th>Freight</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tripHistory.length > 0 ? tripHistory.map(trip => (
                            <tr key={trip.trip_id}>
                                <td>{new Date(trip.start_time).toLocaleDateString()}</td>
                                <td>{trip.lr_number}</td>
                                <td>{trip.source} &rarr; {trip.destination}</td>
                                <td>{trip.distance_km} km</td>
                                <td>{formatCurrency(trip.freight_amount)}</td>
                                <td><span className="status-badge" style={{ background: '#c6f6d5', color: '#22543d' }}>{trip.status}</span></td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No completed trips yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </>
    )
}

export default DriverDashboard;
