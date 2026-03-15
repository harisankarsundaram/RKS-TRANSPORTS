import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../pages/Dashboard.css';

function DashboardLayout({ role }) {
    const { logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    const isImmersiveTracking = role === 'admin' && location.pathname.startsWith('/dashboard/admin/live-tracking');

    const handleLogout = () => {
        logout();
        navigate('/owner');
    };

    return (
        <div className={`dashboard-container ${isImmersiveTracking ? 'dashboard-container-immersive' : ''}`}>
            <aside className="dashboard-sidebar">
                <div className="sidebar-header">
                    <h2>{role === 'admin' ? 'RKS Admin' : 'RKS Pilot'}</h2>
                </div>
                <nav className="sidebar-nav">
                    <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
                        <NavLink to="/" className="nav-item">
                            <span>&larr; Back to Home</span>
                        </NavLink>
                    </div>

                    {role === 'admin' ? (
                        <>
                            <NavLink to="/dashboard/admin" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Dashboard</span>
                            </NavLink>
                            <NavLink to="/lorries" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Lorry Management</span>
                            </NavLink>
                            <NavLink to="/drivers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Driver Management</span>
                            </NavLink>
                            <NavLink to="/trips" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Trip Management</span>
                            </NavLink>
                            <NavLink to="/fuel" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Fuel Tracking</span>
                            </NavLink>
                            <NavLink to="/maintenance" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Maintenance</span>
                            </NavLink>

                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
                                <NavLink to="/expenses" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                    <span>Expenses</span>
                                </NavLink>
                                <NavLink to="/invoices" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                    <span>Invoices</span>
                                </NavLink>
                            </div>
                        </>
                    ) : (
                        <>
                            <NavLink to="/dashboard/driver" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>My Dashboard</span>
                            </NavLink>
                            <NavLink to="/driver/fuel" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Fuel Tracking</span>
                            </NavLink>
                            <NavLink to="/trips/history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Trip History</span>
                            </NavLink>
                        </>
                    )}
                </nav>
                <div className="sidebar-footer">
                    <button onClick={handleLogout} className="btn-logout-sidebar">Log Out</button>
                </div>
            </aside>

            <main className="dashboard-main">
                <Outlet />
            </main>
        </div>
    );
}

export default DashboardLayout;
