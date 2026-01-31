import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/DashboardLayout'
import Home from './pages/Home'
import OwnerAuth from './pages/OwnerAuth'
import Contact from './pages/Contact'
import AdminDashboard from './pages/AdminDashboard'
import DriverDashboard from './pages/DriverDashboard'
import LorryManagement from './pages/LorryManagement'
import DriverManagement from './pages/DriverManagement'
import TripManagement from './pages/TripManagement'
import FuelTracking from './pages/FuelTracking'
import './App.css'

function DashboardRedirect() {
  const { user, loading } = useAuth();
  console.log('DashboardRedirect User:', user);
  if (loading) return null;
  if (user?.role === 'admin') return <Navigate to="/dashboard/admin" replace />;
  if (user?.role === 'driver') return <Navigate to="/dashboard/driver" replace />;
  return <Navigate to="/owner" replace />;
}

function App() {
  return (
    <Routes>
      {/* Public Pages Layout */}
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="owner" element={<OwnerAuth />} />
        <Route path="contact" element={<Contact />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
      </Route>

      {/* Admin Dashboard Layout */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<DashboardLayout role="admin" />}>
          <Route path="dashboard/admin" element={<AdminDashboard />} />
          <Route path="lorries" element={<LorryManagement />} />
          <Route path="drivers" element={<DriverManagement />} />
          <Route path="trips" element={<TripManagement />} />
          <Route path="fuel" element={<FuelTracking />} />
        </Route>
      </Route>

      {/* Driver Dashboard Layout */}
      <Route element={<ProtectedRoute allowedRoles={['driver']} />}>
        <Route element={<DashboardLayout role="driver" />}>
          <Route path="dashboard/driver" element={<DriverDashboard />} />
          <Route path="trips/history" element={<TripManagement />} />
          <Route path="fuel" element={<FuelTracking />} />
        </Route>
      </Route>

    </Routes>
  )
}

export default App
