import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css'; // Shared CSS

function LorryManagement() {
    const [trucks, setTrucks] = useState([]);
    const [formData, setFormData] = useState({
        truck_number: '',
        capacity: '',
        status: 'Available',
        insurance_expiry: '',
        fitness_expiry: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTrucks();
    }, []);

    async function fetchTrucks() {
        try {
            const response = await apiClient.get('/trucks');
            if (response.data.success) {
                setTrucks(response.data.data);
            }
        } catch (err) {
            setError('Failed to fetch trucks');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await apiClient.post('/trucks', formData);
            fetchTrucks();
            setFormData({
                truck_number: '',
                capacity: '',
                status: 'Available',
                insurance_expiry: '',
                fitness_expiry: ''
            });
            alert('Truck added successfully');
        } catch (err) {
            alert(err.response?.data?.message || 'Error adding truck');
        }
    }

    return (
        <div className="management-page">
            <h1>Lorry Management</h1>

            <div className="management-container">
                <div className="form-section">
                    <h2>Add New Lorry</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Truck Number</label>
                            <input
                                type="text"
                                placeholder="e.g. KA-01-AB-1234"
                                value={formData.truck_number}
                                onChange={e => setFormData({ ...formData, truck_number: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Capacity (Tons)</label>
                            <input
                                type="number"
                                placeholder="e.g. 10"
                                value={formData.capacity}
                                onChange={e => setFormData({ ...formData, capacity: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select
                                value={formData.status}
                                onChange={e => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="Available">Available</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Insurance Expiry</label>
                            <input
                                type="date"
                                value={formData.insurance_expiry}
                                onChange={e => setFormData({ ...formData, insurance_expiry: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Fitness Expiry</label>
                            <input
                                type="date"
                                value={formData.fitness_expiry}
                                onChange={e => setFormData({ ...formData, fitness_expiry: e.target.value })}
                                required
                            />
                        </div>
                        <button type="submit" className="btn-submit">Add Truck</button>
                    </form>
                </div>

                <div className="list-section">
                    <h2>Fleet Overview</h2>
                    {error && <p className="error">{error}</p>}
                    {loading ? <p>Loading...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Number</th>
                                    <th>Capacity</th>
                                    <th>Status</th>
                                    <th>Insurance Expiry</th>
                                    <th>Fitness Expiry</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trucks.map(truck => (
                                    <tr key={truck.truck_id}>
                                        <td>{truck.truck_number}</td>
                                        <td>{truck.capacity} T</td>
                                        <td>
                                            <span className={`status-badge ${truck.status.toLowerCase()}`}>
                                                {truck.status}
                                            </span>
                                        </td>
                                        <td>{new Date(truck.insurance_expiry).toLocaleDateString()}</td>
                                        <td>{new Date(truck.fitness_expiry).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                                {trucks.length === 0 && <tr><td colSpan="5">No trucks found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default LorryManagement;
