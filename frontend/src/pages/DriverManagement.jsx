import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function DriverManagement() {
    const [drivers, setDrivers] = useState([]);
    const [trips, setTrips] = useState([]);
    const [formData, setFormData] = useState({
        name: '', phone: '', license_number: '', license_expiry: '', status: 'Available'
    });
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    useEffect(() => {
        fetchDrivers();
        fetchActiveTrips();
    }, []);

    async function fetchDrivers() {
        try {
            const response = await apiClient.get('/drivers');
            if (response.data.success) setDrivers(response.data.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function fetchActiveTrips() {
        try {
            const [planned, running] = await Promise.all([
                apiClient.get('/trips?status=Planned'),
                apiClient.get('/trips?status=Running')
            ]);
            const allActive = [
                ...(planned.data.success ? planned.data.data : []),
                ...(running.data.success ? running.data.data : [])
            ];
            setTrips(allActive);
        } catch (err) { console.error(err); }
    }

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await apiClient.post('/drivers', formData);
            fetchDrivers();
            setFormData({ name: '', phone: '', license_number: '', license_expiry: '', status: 'Available' });
            showMsg('Driver registered successfully!');
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error adding driver', 'error');
        }
    }

    async function handleDelete(driverId) {
        if (!window.confirm('Delete this driver?')) return;
        try {
            await apiClient.delete(`/drivers/${driverId}`);
            showMsg('Driver deleted');
            fetchDrivers();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error deleting', 'error');
        }
    }

    // Determine effective status: if driver has active trip, show "On Trip"
    const getDriverStatus = (driver) => {
        if (driver.status === 'Assigned') {
            const activeTrip = trips.find(t => t.driver_id === driver.driver_id);
            if (activeTrip) {
                return { label: activeTrip.status === 'Running' ? 'On Trip' : 'Trip Planned', className: 'on-trip' };
            }
            return { label: 'Assigned', className: 'assigned' };
        }
        return { label: 'Available', className: 'available' };
    };

    return (
        <div className="management-page">
            <h1>Driver Management</h1>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="management-container">
                <div className="form-section">
                    <h2>Register New Driver</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" placeholder="John Doe" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input type="text" placeholder="10-digit mobile" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>License Number</label>
                            <input type="text" placeholder="DL-XXXXXXXX" value={formData.license_number} onChange={e => setFormData({ ...formData, license_number: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>License Expiry</label>
                            <input type="date" value={formData.license_expiry} onChange={e => setFormData({ ...formData, license_expiry: e.target.value })} required />
                        </div>
                        <button type="submit" className="btn-submit">Register Driver</button>
                    </form>
                </div>

                <div className="list-section">
                    <h2>Driver Roster</h2>
                    {loading ? <p>Loading...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>License</th>
                                    <th>Expiry</th>
                                    <th>Status</th>
                                    <th>Current Truck</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drivers.map(driver => {
                                    const status = getDriverStatus(driver);
                                    return (
                                        <tr key={driver.driver_id}>
                                            <td>{driver.name}</td>
                                            <td>{driver.phone}</td>
                                            <td>{driver.license_number}</td>
                                            <td>{new Date(driver.license_expiry).toLocaleDateString()}</td>
                                            <td>
                                                <span className={`status-badge ${status.className}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td>
                                                {driver.assigned_truck_id ? (
                                                    <span className="assigned-truck">
                                                        {driver.truck_number || `Truck #${driver.assigned_truck_id}`}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: '#718096' }}>Not assigned</span>
                                                )}
                                            </td>
                                            <td>
                                                <button onClick={() => handleDelete(driver.driver_id)} className="btn-action danger">Delete</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {drivers.length === 0 && <tr><td colSpan="7" className="empty-state">No drivers found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DriverManagement;
