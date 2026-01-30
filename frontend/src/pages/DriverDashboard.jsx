import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function DriverDashboard() {
    const { user } = useAuth();

    // Mock Data (Replace with API calls later)
    const driverProfile = {
        name: user?.name || 'Driver',
        license: 'TN-DL-2024-89012',
        phone: user?.phone || '+91 98765 43210',
        experience: '4 Years',
        rating: '4.8/5'
    };

    const assignedLorry = {
        number: 'TN 52 AV 1234',
        model: 'Tata Signa 4825.TK',
        capacity: '28 Tons',
        status: 'In Transit',
        img: 'https://via.placeholder.com/150?text=Truck' // Placeholder
    };

    const currentTrip = {
        id: 'TRIP-2025-001',
        source: 'Salem, Tamil Nadu',
        destination: 'Bangalore, Karnataka',
        cargo: 'Textile Goods (20T)',
        startTime: '30 Jan 2026, 06:00 AM',
        eta: '30 Jan 2026, 10:00 PM',
        status: 'Ongoing',
        progress: 65 // percentage
    };

    const tripHistory = [
        { id: 1, date: '25 Jan 2026', route: 'Chennai - Madurai', distance: '450 km', duration: '8h 30m', status: 'Completed' },
        { id: 2, date: '20 Jan 2026', route: 'Coimbatore - Kochi', distance: '190 km', duration: '4h 15m', status: 'Completed' },
        { id: 3, date: '15 Jan 2026', route: 'Salem - Hydra', distance: '600 km', duration: '12h 00m', status: 'Completed' },
    ];

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
                            {driverProfile.name.charAt(0)}
                        </div>
                        <div>
                            <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{driverProfile.name}</h4>
                            <p style={{ margin: '0.2rem 0', color: '#718096', fontSize: '0.9rem' }}>{driverProfile.license}</p>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <span className="status-badge" style={{ background: '#F2F5D0', color: '#2C5F2D' }}>{driverProfile.rating} ★</span>
                                <span className="status-badge" style={{ background: '#e2e8f0', color: '#4a5568' }}>{driverProfile.experience}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #eee', fontSize: '0.9rem', color: '#4a5568' }}>
                        <strong>Phone:</strong> {driverProfile.phone}
                    </div>
                </section>

                {/* Section B: Assigned Lorry */}
                <section className="stat-card">
                    <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem', color: '#2C5F2D' }}>
                        ISSUED VEHICLE
                    </h3>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <h2 style={{ fontSize: '2rem', color: '#2C5F2D', margin: '0.5rem 0' }}>{assignedLorry.number}</h2>
                        <span className="status-badge" style={{ background: '#cce5ff', color: '#004085' }}>{assignedLorry.status}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.95rem' }}>
                        <div>
                            <span style={{ color: '#718096', display: 'block' }}>Model</span>
                            <strong>{assignedLorry.model}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#718096', display: 'block' }}>Capacity</span>
                            <strong>{assignedLorry.capacity}</strong>
                        </div>
                    </div>
                </section>

                {/* Section C: Current Trip */}
                <section className="action-card" style={{ gridColumn: 'span 2', borderLeftColor: '#D97706' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div>
                            <h3 style={{ margin: 0 }}>CURRENT TRIP: {currentTrip.id}</h3>
                            <p style={{ marginTop: '0.5rem' }}><strong>Cargo:</strong> {currentTrip.cargo}</p>
                        </div>
                        <span className="status-badge" style={{ background: '#feebc8', color: '#c05621' }}>{currentTrip.status}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.5rem 0' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentTrip.source}</div>
                            <small style={{ color: '#718096' }}>{currentTrip.startTime}</small>
                        </div>
                        <div style={{ fontSize: '1.5rem', color: '#cbd5e0' }}>&rarr;</div>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{currentTrip.destination}</div>
                            <small style={{ color: '#718096' }}>ETA: {currentTrip.eta}</small>
                        </div>
                    </div>

                    {/* Progress Bar Mockup */}
                    <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${currentTrip.progress}%`, height: '100%', background: '#D97706' }}></div>
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#718096', marginTop: '0.5rem' }}>
                        {currentTrip.progress}% Completed
                    </p>
                </section>

            </div>

            {/* Section D: Trip History */}
            <h3 style={{ marginTop: '2.5rem', marginBottom: '1rem' }}>Recent Trip History</h3>
            <div className="list-section" style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Route</th>
                            <th>Distance</th>
                            <th>Duration</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tripHistory.map(trip => (
                            <tr key={trip.id}>
                                <td>{trip.date}</td>
                                <td>{trip.route}</td>
                                <td>{trip.distance}</td>
                                <td>{trip.duration}</td>
                                <td><span className="status-badge" style={{ background: '#c6f6d5', color: '#22543d' }}>{trip.status}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}

export default DriverDashboard
