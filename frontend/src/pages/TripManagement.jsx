import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Dashboard.css';

function TripManagement() {
    const { user } = useAuth();
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [driverId, setDriverId] = useState(null);

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'driver' && user?.id) {
                try {
                    const res = await apiClient.get(`/drivers/user/${user.id}`);
                    const data = res.data;
                    if (data.success) {
                        setDriverId(data.data.driver_id);
                    }
                } catch (e) {
                    console.error('Error fetching driver profile:', e);
                }
            }
        };
        init();
    }, [user]);

    useEffect(() => {
        // Fetch trips once we know the role and driverId (if applicable)
        if (user?.role === 'driver' && !driverId) return;
        fetchTrips();
    }, [filter, driverId]);

    const fetchTrips = async () => {
        setLoading(true);
        try {
            let url = filter === 'All' ? '/trips' : `/trips?status=${filter}`;

            // Append driver_id if user is a driver
            if (user?.role === 'driver' && driverId) {
                const separator = url.includes('?') ? '&' : '?';
                url += `${separator}driver_id=${driverId}`;
            }

            const res = await apiClient.get(url);
            const data = res.data;
            if (data.success) {
                setTrips(data.data);
            }
        } catch (error) {
            console.error('Error fetching trips:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return '#48bb78';
            case 'Running': return '#4299e1';
            case 'Planned': return '#ed8936';
            case 'Cancelled': return '#e53e3e';
            default: return '#718096';
        }
    };

    return (
        <div className="trip-management-page">
            <header className="dashboard-header">
                <h1>Trip Management</h1>
                <p>Track and manage your lorry shipments.</p>
            </header>

            <div className="filter-bar" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
                {['All', 'Planned', 'Running', 'Completed', 'Cancelled'].map(s => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`btn-filter ${filter === s ? 'active' : ''}`}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '5px',
                            border: '1px solid #cbd5e0',
                            backgroundColor: filter === s ? '#2d3748' : 'white',
                            color: filter === s ? 'white' : '#2d3748',
                            cursor: 'pointer'
                        }}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading">Loading trips...</div>
            ) : (
                <div className="trips-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {trips.map(trip => (
                        <div key={trip.trip_id} className="trip-card" style={{
                            backgroundColor: 'white',
                            borderRadius: '10px',
                            padding: '1.5rem',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                            borderLeft: `5px solid ${getStatusColor(trip.status)}`
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <strong style={{ fontSize: '1.2rem' }}>{trip.lr_number}</strong>
                                <span style={{
                                    backgroundColor: getStatusColor(trip.status),
                                    color: 'white',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '4px',
                                    fontSize: '0.8rem'
                                }}>{trip.status}</span>
                            </div>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Route:</strong> {trip.source} &rarr; {trip.destination}
                            </div>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Lorry:</strong> {trip.truck_number}
                            </div>
                            <div style={{ marginBottom: '0.5rem' }}>
                                <strong>Driver:</strong> {trip.driver_name}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #edf2f7' }}>
                                <span>{trip.distance_km} KM</span>
                                <strong style={{ color: '#2d3748' }}>₹{Number(trip.freight_amount).toLocaleString()}</strong>
                            </div>
                        </div>
                    ))}
                    {trips.length === 0 && <p>No trips found for this status.</p>}
                </div>
            )}
        </div>
    );
}

export default TripManagement;
