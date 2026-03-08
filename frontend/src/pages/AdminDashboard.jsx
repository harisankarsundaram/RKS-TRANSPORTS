import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function AdminDashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState({
        total_trips: 0,
        running_trips: 0,
        total_revenue: 0,
        active_trucks: 0,
        active_drivers: 0,
        total_trucks: 0,
        total_drivers: 0
    });
    const [financials, setFinancials] = useState({
        total_revenue: 0,
        total_outstanding: 0,
        total_expenses: 0,
        net_profit: 0,
        average_dead_mileage_percent: 0,
        running_trips_count: 0,
        available_trucks_count: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await apiClient.get('/trips/analytics/summary');
                if (res.data.success) {
                    setFinancials(res.data.data);
                }
            } catch (error) {
                console.error('Error fetching dashboard stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(value);
    };

    return (
        <>
            <header className="dashboard-header">
                <h1>Overview</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {/* Fleet Stats Grid */}
            <section className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : financials.available_trucks_count}</div>
                    <div className="stat-label">Available Trucks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : financials.running_trips_count}</div>
                    <div className="stat-label">Running Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">
                        {loading ? '...' : `${Number(financials.average_dead_mileage_percent).toFixed(1)}%`}
                    </div>
                    <div className="stat-label">Avg Dead Mileage</div>
                </div>
            </section>

            {/* Financial KPIs */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem', color: '#2d3748' }}>Intelligence Dashboard</h3>
            <section className="stats-grid">
                <div className="stat-card" style={{ borderLeft: '4px solid #48bb78' }}>
                    <div className="stat-value" style={{ color: '#2f855a' }}>
                        {loading ? '...' : formatCurrency(financials.total_revenue)}
                    </div>
                    <div className="stat-label">Total Revenue</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #ed8936' }}>
                    <div className="stat-value" style={{ color: '#c05621' }}>
                        {loading ? '...' : formatCurrency(financials.total_outstanding)}
                    </div>
                    <div className="stat-label">Total Outstanding</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #e53e3e' }}>
                    <div className="stat-value" style={{ color: '#c53030' }}>
                        {loading ? '...' : formatCurrency(financials.total_expenses)}
                    </div>
                    <div className="stat-label">Total Expenses Ledger</div>
                </div>
                <div className="stat-card" style={{ borderLeft: `4px solid ${financials.net_profit >= 0 ? '#48bb78' : '#e53e3e'}` }}>
                    <div className="stat-value" style={{ color: financials.net_profit >= 0 ? '#2f855a' : '#c53030' }}>
                        {loading ? '...' : formatCurrency(financials.net_profit)}
                    </div>
                    <div className="stat-label">Net Profit (Loss)</div>
                </div>
            </section>

            {/* Quick Actions */}
            <h3 style={{ marginTop: '2rem', marginBottom: '1.5rem', color: '#2d3748' }}>Operation Centers</h3>
            <section className="action-grid">
                <Link to="/lorries" className="action-card">
                    <h3>Manage Lorries &rarr;</h3>
                    <p>Add new trucks, update status, and track fitness expiry.</p>
                </Link>
                <Link to="/drivers" className="action-card">
                    <h3>Manage Drivers &rarr;</h3>
                    <p>Register new drivers, view details, and assign trips.</p>
                </Link>
                <Link to="/trips" className="action-card">
                    <h3>Trip Operations &rarr;</h3>
                    <p>Create new trips, track running lorries, and manage history.</p>
                </Link>
                <Link to="/fuel" className="action-card">
                    <h3>Fuel Tracking &rarr;</h3>
                    <p>Log fuel entries, efficiency analytics, and cost management.</p>
                </Link>
            </section>
        </>
    )
}

export default AdminDashboard
