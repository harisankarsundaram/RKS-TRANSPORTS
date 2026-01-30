import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function DriverManagement() {
    const [drivers, setDrivers] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        license_number: '',
        license_expiry: '',
        status: 'Available'
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchDrivers();
    }, []);

    async function fetchDrivers() {
        try {
            const response = await apiClient.get('/drivers');
            if (response.data.success) {
                setDrivers(response.data.data);
            }
        } catch (err) {
            setError('Failed to fetch drivers');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await apiClient.post('/drivers', formData);
            fetchDrivers();
            setFormData({
                name: '',
                phone: '',
                license_number: '',
                license_expiry: '',
                status: 'Available'
            });
            alert('Driver added successfully');
        } catch (err) {
            alert(err.response?.data?.message || 'Error adding driver');
        }
    }

    return (
        <div className="management-page">
            <h1>Driver Management</h1>

            <div className="management-container">
                <div className="form-section">
                    <h2>Register New Driver</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                placeholder="John Doe"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input
                                type="text"
                                placeholder="10-digit mobile number"
                                value={formData.phone}
                                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>License Number</label>
                            <input
                                type="text"
                                placeholder="LICENSE123"
                                value={formData.license_number}
                                onChange={e => setFormData({ ...formData, license_number: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>License Expiry</label>
                            <input
                                type="date"
                                value={formData.license_expiry}
                                onChange={e => setFormData({ ...formData, license_expiry: e.target.value })}
                                required
                            />
                        </div>
                        <button type="submit" className="btn-submit">Register Driver</button>
                    </form>
                </div>

                <div className="list-section">
                    <h2>Driver Roster</h2>
                    {error && <p className="error">{error}</p>}
                    {loading ? <p>Loading...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>License</th>
                                    <th>Status</th>
                                    <th>Expiry</th>
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
                                        <td>{new Date(driver.license_expiry).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                                {drivers.length === 0 && <tr><td colSpan="5">No drivers found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default DriverManagement;
