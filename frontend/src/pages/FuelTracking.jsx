import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Management.css';

function FuelTracking() {
    const { user } = useAuth();
    const [fuelLogs, setFuelLogs] = useState([]);
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [driverId, setDriverId] = useState(null);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [formData, setFormData] = useState({
        trip_id: '',
        liters: '',
        price_per_liter: ''
    });

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'driver' && user?.id) {
                try {
                    const driverRes = await apiClient.get(`/drivers/user/${user.id}`);
                    if (driverRes.data.success) {
                        const dId = driverRes.data.data.driver_id;
                        setDriverId(dId);
                        // Fetch driver's running trips for the fuel form
                        const tripRes = await apiClient.get(`/trips?status=Running&driver_id=${dId}`);
                        if (tripRes.data.success) setTrips(tripRes.data.data);
                    }
                } catch (e) { console.error(e); }
            }
        };
        init();
    }, [user]);

    useEffect(() => {
        if (user?.role === 'driver' && !driverId) return;
        fetchFuelLogs();
    }, [driverId]);

    const fetchFuelLogs = async () => {
        setLoading(true);
        try {
            let url = '/fuel';
            if (user?.role === 'driver' && driverId) url = `/fuel?driver_id=${driverId}`;
            const res = await apiClient.get(url);
            if (res.data.success) setFuelLogs(res.data.data);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                trip_id: parseInt(formData.trip_id),
                liters: parseFloat(formData.liters),
                price_per_liter: parseFloat(formData.price_per_liter),
                total_cost: parseFloat(formData.liters) * parseFloat(formData.price_per_liter)
            };
            await apiClient.post('/fuel', payload);
            showMsg('Fuel log added successfully!');
            setFormData({ trip_id: '', liters: '', price_per_liter: '' });
            fetchFuelLogs();
            // Refresh driver's running trips
            if (driverId) {
                const tripRes = await apiClient.get(`/trips?status=Running&driver_id=${driverId}`);
                if (tripRes.data.success) setTrips(tripRes.data.data);
            }
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error adding fuel log', 'error');
        }
    };

    const handleDelete = async (fuelId) => {
        if (!window.confirm('Delete this fuel log?')) return;
        try {
            await apiClient.delete(`/fuel/${fuelId}`);
            showMsg('Fuel log deleted');
            fetchFuelLogs();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error deleting', 'error');
        }
    };

    const totalCost = parseFloat(formData.liters || 0) * parseFloat(formData.price_per_liter || 0);

    return (
        <div className="management-page">
            <header className="dashboard-header">
                <h1>Fuel Tracking</h1>
                <p>Monitor fuel consumption and log entries.</p>
            </header>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="management-container">
                {/* Add Fuel Form — Driver Only */}
                {user?.role === 'driver' && (
                    <div className="form-section">
                        <h2>Log Fuel Entry</h2>
                        <form onSubmit={handleSubmit} className="management-form">
                            <div className="form-group">
                                <label>Running Trip</label>
                                <select value={formData.trip_id} onChange={e => setFormData({ ...formData, trip_id: e.target.value })} required>
                                    <option value="">Select Trip</option>
                                    {trips.map(t => (
                                        <option key={t.trip_id} value={t.trip_id}>
                                            {t.lr_number} — {t.truck_number} ({t.source} → {t.destination})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Liters</label>
                                <input type="number" step="0.01" placeholder="e.g. 150" value={formData.liters} onChange={e => setFormData({ ...formData, liters: e.target.value })} required min="0.1" />
                            </div>
                            <div className="form-group">
                                <label>Price Per Liter (₹)</label>
                                <input type="number" step="0.01" placeholder="e.g. 92.50" value={formData.price_per_liter} onChange={e => setFormData({ ...formData, price_per_liter: e.target.value })} required min="0.1" />
                            </div>
                            {totalCost > 0 && (
                                <div className="alert-message success">
                                    Total: ₹{totalCost.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </div>
                            )}
                            <button type="submit" className="btn-submit">Add Fuel Log</button>
                        </form>
                    </div>
                )}

                {/* Fuel Log Table */}
                <div className="list-section" style={user?.role === 'admin' ? { gridColumn: 'span 2' } : {}}>
                    <h2>Fuel Logs</h2>
                    {loading ? <p>Loading fuel data...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Lorry</th>
                                    <th>LR Number</th>
                                    <th>Liters</th>
                                    <th>Price/L</th>
                                    <th>Total Cost</th>
                                    {user?.role === 'admin' && <th>Action</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {fuelLogs.map(log => (
                                    <tr key={log.fuel_id}>
                                        <td>{new Date(log.created_at).toLocaleDateString()}</td>
                                        <td>{log.truck_number}</td>
                                        <td>{log.lr_number}</td>
                                        <td>{log.liters} L</td>
                                        <td>₹{log.price_per_liter}</td>
                                        <td>₹{Number(log.total_cost).toLocaleString()}</td>
                                        {user?.role === 'admin' && (
                                            <td>
                                        <button onClick={() => handleDelete(log.fuel_id)} className="btn-action danger">Delete</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {fuelLogs.length === 0 && <tr><td colSpan={user?.role === 'admin' ? 7 : 6} className="empty-state">No fuel logs found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default FuelTracking;
