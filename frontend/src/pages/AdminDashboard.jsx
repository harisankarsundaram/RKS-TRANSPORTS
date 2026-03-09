import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function AdminDashboard() {
    const { user } = useAuth();
    const [financials, setFinancials] = useState({
        total_revenue: 0, total_outstanding: 0, total_expenses: 0, net_profit: 0,
        average_dead_mileage_percent: 0, running_trips_count: 0, available_trucks_count: 0
    });
    const [fleetStats, setFleetStats] = useState({ trucks: 0, drivers: 0, totalTrips: 0, completedTrips: 0, plannedTrips: 0 });
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [summaryRes, trucksRes, driversRes, tripsRes, notifRes] = await Promise.all([
                    apiClient.get('/trips/analytics/summary'),
                    apiClient.get('/trucks'),
                    apiClient.get('/drivers'),
                    apiClient.get('/trips'),
                    apiClient.get('/notifications')
                ]);

                if (summaryRes.data.success) setFinancials(summaryRes.data.data);

                const trucks = trucksRes.data.success ? trucksRes.data.data : [];
                const drivers = driversRes.data.success ? driversRes.data.data : [];
                const trips = tripsRes.data.success ? tripsRes.data.data : [];

                setFleetStats({
                    trucks: trucks.length,
                    drivers: drivers.length,
                    totalTrips: trips.length,
                    completedTrips: trips.filter(t => t.status === 'Completed').length,
                    plannedTrips: trips.filter(t => t.status === 'Planned').length
                });

                if (notifRes.data.success) setActivity(notifRes.data.data.slice(0, 8));
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

    const L = loading ? '...' : null;

    return (
        <>
            <header className="dashboard-header">
                <h1>Overview</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {/* Fleet Overview */}
            <section className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{L || fleetStats.trucks}</div>
                    <div className="stat-label">Total Trucks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || fleetStats.drivers}</div>
                    <div className="stat-label">Total Drivers</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || financials.available_trucks_count}</div>
                    <div className="stat-label">Available Trucks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || financials.running_trips_count}</div>
                    <div className="stat-label">Running Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || fleetStats.plannedTrips}</div>
                    <div className="stat-label">Planned Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || fleetStats.completedTrips}</div>
                    <div className="stat-label">Completed Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || fleetStats.totalTrips}</div>
                    <div className="stat-label">Total Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{L || `${Number(financials.average_dead_mileage_percent).toFixed(1)}%`}</div>
                    <div className="stat-label">Avg Dead Mileage</div>
                </div>
            </section>

            {/* Financial KPIs */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem', color: '#2d3748' }}>Intelligence Dashboard</h3>
            <section className="stats-grid">
                <div className="stat-card" style={{ borderLeft: '4px solid #48bb78' }}>
                    <div className="stat-value" style={{ color: '#2f855a' }}>{L || formatCurrency(financials.total_revenue)}</div>
                    <div className="stat-label">Total Revenue</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #ed8936' }}>
                    <div className="stat-value" style={{ color: '#c05621' }}>{L || formatCurrency(financials.total_outstanding)}</div>
                    <div className="stat-label">Total Outstanding</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #e53e3e' }}>
                    <div className="stat-value" style={{ color: '#c53030' }}>{L || formatCurrency(financials.total_expenses)}</div>
                    <div className="stat-label">Total Expenses Ledger</div>
                </div>
                <div className="stat-card" style={{ borderLeft: `4px solid ${financials.net_profit >= 0 ? '#48bb78' : '#e53e3e'}` }}>
                    <div className="stat-value" style={{ color: financials.net_profit >= 0 ? '#2f855a' : '#c53030' }}>{L || formatCurrency(financials.net_profit)}</div>
                    <div className="stat-label">Net Profit (Loss)</div>
                </div>
            </section>

            {/* Recent Activity Feed */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem', color: '#2d3748' }}>Recent Activity</h3>
            <div style={{ background: 'white', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
                {activity.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activity.map(a => (
                            <div key={a.notification_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', borderLeft: `3px solid ${a.type === 'trip_started' ? '#4299e1' : a.type === 'trip_completed' ? '#48bb78' : a.type === 'trip_cancelled' ? '#e53e3e' : '#ed8936'}`, background: '#fafafa' }}>
                                <span style={{ fontSize: '0.9rem' }}>{a.message}</span>
                                <small style={{ color: '#718096', whiteSpace: 'nowrap', marginLeft: '1rem' }}>{new Date(a.created_at).toLocaleString()}</small>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: '#718096', padding: '1rem' }}>No recent activity yet. Activity will appear here when drivers start and complete trips.</p>
                )}
            </div>

            {/* Quick Actions */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem', color: '#2d3748' }}>Operation Centers</h3>
            <section className="action-grid">
                <Link to="/lorries" className="action-card">
                    <h3>Manage Lorries &rarr;</h3>
                    <p>Add new trucks, update status, and track fitness expiry.</p>
                </Link>
                <Link to="/drivers" className="action-card">
                    <h3>Manage Drivers &rarr;</h3>
                    <p>Register new drivers and view driver details.</p>
                </Link>
                <Link to="/trips" className="action-card">
                    <h3>Trip Operations &rarr;</h3>
                    <p>Create new trips, track running lorries, and manage history.</p>
                </Link>
                <Link to="/fuel" className="action-card">
                    <h3>Fuel Tracking &rarr;</h3>
                    <p>View fuel entries, efficiency analytics, and cost management.</p>
                </Link>
                <Link to="/maintenance" className="action-card">
                    <h3>Maintenance &rarr;</h3>
                    <p>Track vehicle servicing, manage fleet health and service history.</p>
                </Link>
                <Link to="/expenses" className="action-card">
                    <h3>Expense Ledger &rarr;</h3>
                    <p>Record and categorize all operational expenses.</p>
                </Link>
                <Link to="/invoices" className="action-card">
                    <h3>Invoice Management &rarr;</h3>
                    <p>Generate invoices, track payments, and manage outstanding dues.</p>
                </Link>
            </section>
        </>
    );
}

export default AdminDashboard;
