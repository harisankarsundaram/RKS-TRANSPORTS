import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function DriverManagement() {
    const [drivers, setDrivers] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [formData, setFormData] = useState({
        name: '', phone: '', license_number: '', license_expiry: '', status: 'Available'
    });
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    useEffect(() => {
        fetchDrivers();
        fetchTrucks();
    }, []);

    async function fetchDrivers() {
        try {
            const response = await apiClient.get('/drivers');
            if (response.data.success) setDrivers(response.data.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function fetchTrucks() {
        try {
            const response = await apiClient.get('/trucks');
            if (response.data.success) setTrucks(response.data.data);
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

    async function handleAssign(driverId, truckId) {
        try {
            await apiClient.post('/assign-truck', { driver_id: driverId, truck_id: truckId });
            showMsg('Truck assigned successfully!');
            fetchDrivers();
            fetchTrucks();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error assigning truck', 'error');
        }
    }

    async function handleUnassign(driverId) {
        try {
            await apiClient.post('/unassign-truck', { driver_id: driverId });
            showMsg('Truck unassigned successfully!');
            fetchDrivers();
            fetchTrucks();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error unassigning truck', 'error');
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

    const availableTrucks = trucks.filter(t => t.status === 'Available');

    return (
        <div className="management-page">
            <h1>Driver Management</h1>

            {message.text && (
                <div style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', background: message.type === 'error' ? '#FFF5F5' : '#F0FFF4', color: message.type === 'error' ? '#C53030' : '#2C5F2D', border: `1px solid ${message.type === 'error' ? '#FED7D7' : '#C6F6D5'}`, fontWeight: 600 }}>
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
                                    <th>Status</th>
                                    <th>Assigned Truck</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drivers.map(driver => (
                                    <tr key={driver.driver_id}>
                                        <td>{driver.name}</td>
                                        <td>{driver.phone}</td>
                                        <td>{driver.license_number}</td>
                                        <td>
                                            <span className={`status-badge ${driver.status.toLowerCase()}`}>
                                                {driver.status}
                                            </span>
                                        </td>
                                        <td>
                                            {driver.assigned_truck_id ? (
                                                <span style={{ fontWeight: 600, color: '#2C5F2D' }}>
                                                    {driver.truck_number || `Truck #${driver.assigned_truck_id}`}
                                                </span>
                                            ) : (
                                                <select
                                                    defaultValue=""
                                                    onChange={e => {
                                                        if (e.target.value) handleAssign(driver.driver_id, e.target.value);
                                                    }}
                                                    style={{ padding: '0.4rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                                                >
                                                    <option value="">Assign Truck...</option>
                                                    {availableTrucks.map(t => (
                                                        <option key={t.truck_id} value={t.truck_id}>{t.truck_number} ({t.capacity}T)</option>
                                                    ))}
                                                </select>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                {driver.assigned_truck_id && (
                                                    <button onClick={() => handleUnassign(driver.driver_id)} style={{ background: '#FFF5F5', color: '#C53030', border: '1px solid #FED7D7', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>Unassign</button>
                                                )}
                                                <button onClick={() => handleDelete(driver.driver_id)} style={{ background: '#FFF5F5', color: '#C53030', border: '1px solid #FED7D7', borderRadius: '6px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>Delete</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {drivers.length === 0 && <tr><td colSpan="6">No drivers found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DriverManagement;
