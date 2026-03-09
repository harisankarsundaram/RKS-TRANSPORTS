import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function LorryManagement() {
    const [trucks, setTrucks] = useState([]);
    const [trips, setTrips] = useState([]);
    const [formData, setFormData] = useState({
        truck_number: '', capacity: '', status: 'Available', insurance_expiry: '', fitness_expiry: ''
    });
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    useEffect(() => {
        fetchTrucks();
        fetchActiveTrips();
    }, []);

    async function fetchTrucks() {
        try {
            const response = await apiClient.get('/trucks');
            if (response.data.success) setTrucks(response.data.data);
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
            await apiClient.post('/trucks', formData);
            fetchTrucks();
            setFormData({ truck_number: '', capacity: '', status: 'Available', insurance_expiry: '', fitness_expiry: '' });
            showMsg('Truck added successfully!');
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error adding truck', 'error');
        }
    }

    async function handleDelete(truckId) {
        if (!window.confirm('Delete this truck?')) return;
        try {
            await apiClient.delete(`/trucks/${truckId}`);
            showMsg('Truck deleted');
            fetchTrucks();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error deleting', 'error');
        }
    }

    // Determine effective truck status considering active trips
    const getTruckStatus = (truck) => {
        if (truck.status === 'Assigned') {
            const activeTrip = trips.find(t => t.truck_id === truck.truck_id);
            if (activeTrip) {
                return { label: activeTrip.status === 'Running' ? 'On Trip' : 'Trip Planned', className: 'on-trip' };
            }
            return { label: 'Assigned', className: 'assigned' };
        }
        if (truck.status === 'Maintenance') {
            return { label: 'Maintenance', className: 'maintenance' };
        }
        return { label: 'Available', className: 'available' };
    };

    return (
        <div className="management-page">
            <h1>Lorry Management</h1>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            <div className="management-container">
                <div className="form-section">
                    <h2>Add New Lorry</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Truck Number</label>
                            <input type="text" placeholder="e.g. KA-01-AB-1234" value={formData.truck_number} onChange={e => setFormData({ ...formData, truck_number: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Capacity (Tons)</label>
                            <input type="number" placeholder="e.g. 10" value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                <option value="Available">Available</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Insurance Expiry</label>
                            <input type="date" value={formData.insurance_expiry} onChange={e => setFormData({ ...formData, insurance_expiry: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Fitness Expiry</label>
                            <input type="date" value={formData.fitness_expiry} onChange={e => setFormData({ ...formData, fitness_expiry: e.target.value })} required />
                        </div>
                        <button type="submit" className="btn-submit">Add Truck</button>
                    </form>
                </div>

                <div className="list-section">
                    <h2>Fleet Overview</h2>
                    {loading ? <p>Loading...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Number</th>
                                    <th>Capacity</th>
                                    <th>Status</th>
                                    <th>Insurance</th>
                                    <th>Fitness</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trucks.map(truck => {
                                    const status = getTruckStatus(truck);
                                    return (
                                        <tr key={truck.truck_id}>
                                            <td>{truck.truck_number}</td>
                                            <td>{truck.capacity} T</td>
                                            <td><span className={`status-badge ${status.className}`}>{status.label}</span></td>
                                            <td>{new Date(truck.insurance_expiry).toLocaleDateString()}</td>
                                            <td>{new Date(truck.fitness_expiry).toLocaleDateString()}</td>
                                            <td>
                                                <button onClick={() => handleDelete(truck.truck_id)} className="btn-action danger">Delete</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {trucks.length === 0 && <tr><td colSpan="6" className="empty-state">No trucks found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LorryManagement;
