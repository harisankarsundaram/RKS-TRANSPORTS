import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../pages/Dashboard.css';

function DashboardLayout({ role }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/owner');
    };

    return (
        <div className="dashboard-container">
            <aside className="dashboard-sidebar">
                <div className="sidebar-header">
                    <h2>{role === 'admin' ? 'RKS Admin' : 'RKS Pilot'}</h2>
                </div>
                <nav className="sidebar-nav">
                    <div style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <NavLink to="/" className="nav-item">
                            <span>&larr; Back to Home</span>
                        </NavLink>
                    </div>

                    {role === 'admin' ? (
                        <>
                            <NavLink to="/dashboard/admin" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Overview</span>
                            </NavLink>
                            <NavLink to="/lorries" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Lorry Management</span>
                            </NavLink>
                            <NavLink to="/drivers" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>Driver Management</span>
                            </NavLink>
                            <div className="nav-item disabled" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                                <span>Fuel Tracking (Soon)</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <NavLink to="/dashboard/driver" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                                <span>My Dashboard</span>
                            </NavLink>
                            <div className="nav-item disabled" style={{ opacity: 0.5 }}>
                                <span>Fuel Tracking (Soon)</span>
                            </div>
                            <div className="nav-item disabled" style={{ opacity: 0.5 }}>
                                <span>Trip History (Soon)</span>
                            </div>
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
