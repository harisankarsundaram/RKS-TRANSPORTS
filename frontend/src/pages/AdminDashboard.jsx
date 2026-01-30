import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function AdminDashboard() {
    const { user } = useAuth();

    return (
        <>
            <header className="dashboard-header">
                <h1>Overview</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {/* Stats Grid */}
            <section className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">60+</div>
                    <div className="stat-label">Active Trucks</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">40+</div>
                    <div className="stat-label">Drivers On Duty</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">12</div>
                    <div className="stat-label">Pending Maintenance</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">₹4.2L</div>
                    <div className="stat-label">Monthly Revolution</div>
                </div>
            </section>

            {/* Quick Actions */}
            <h3 style={{ marginBottom: '1.5rem', color: '#2d3748' }}>Quick Actions</h3>
            <section className="action-grid">
                <Link to="/lorries" className="action-card">
                    <h3>Manage Lorries &rarr;</h3>
                    <p>Add new trucks, update status, and track fitness expiry.</p>
                </Link>
                <Link to="/drivers" className="action-card">
                    <h3>Manage Drivers &rarr;</h3>
                    <p>Register new drivers, view details, and assign trips.</p>
                </Link>
            </section>
        </>
    )
}

export default AdminDashboard
