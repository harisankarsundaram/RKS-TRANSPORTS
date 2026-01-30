import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ allowedRoles }) {
    const { user, loading } = useAuth();

    if (loading) {
        return <div>Loading...</div>; // Or a proper loading spinner
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        // If user has a specific role dashboard, redirect there, otherwise home
        if (user.role === 'admin') return <Navigate to="/dashboard/admin" replace />;
        if (user.role === 'driver') return <Navigate to="/dashboard/driver" replace />;
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

export default ProtectedRoute;
