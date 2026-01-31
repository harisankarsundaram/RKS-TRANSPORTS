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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Fetch trip analytics
                const tripRes = await apiClient.get('/trips/analytics/summary');
                const tripData = tripRes.data;
                console.log('Dashboard Analytics:', tripData);

                // Fetch truck counts
                const truckRes = await apiClient.get('/trucks');
                const truckData = truckRes.data;
                console.log('Dashboard Trucks:', truckData);

                // Fetch driver counts
                const driverRes = await apiClient.get('/drivers');
                const driverData = driverRes.data;
                console.log('Dashboard Drivers:', driverData);

                if (tripData.success && truckData.success && driverData.success) {
                    const newStats = {
                        total_trips: Number(tripData.data.total_trips),
                        running_trips: Number(tripData.data.running_trips),
                        total_revenue: Number(tripData.data.total_revenue),
                        active_trucks: truckData.data.filter(t => t.status === 'Assigned').length,
                        total_trucks: truckData.data.length,
                        active_drivers: driverData.data.filter(d => d.status === 'Assigned').length,
                        total_drivers: driverData.data.length
                    };
                    console.log('Setting Stats:', newStats);
                    setStats(newStats);
                } else {
                    console.warn('One or more API calls failed:', { trip: tripData.success, truck: truckData.success, driver: driverData.success });
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

            {/* Stats Grid */}
            <section className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : stats.total_trucks}</div>
                    <div className="stat-label">Total Trucks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : stats.active_drivers}</div>
                    <div className="stat-label">Drivers On Trip</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : stats.running_trips}</div>
                    <div className="stat-label">Running Trips</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{loading ? '...' : formatCurrency(stats.total_revenue)}</div>
                    <div className="stat-label">Total Revenue</div>
                </div>
            </section>

            {/* Quick Actions */}
            <h3 style={{ marginBottom: '1.5rem', color: '#2d3748' }}>Operation Centers</h3>
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
