import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function MaintenanceManagement() {
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [formData, setFormData] = useState({
        truck_id: '', service_date: new Date().toISOString().split('T')[0], description: '', cost: ''
    });

    useEffect(() => {
        fetchMaintenanceLogs();
        fetchTrucks();
    }, []);

    async function fetchMaintenanceLogs() {
        try {
            const res = await apiClient.get('/maintenance');
            if (res.data.success) setMaintenanceLogs(res.data.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function fetchTrucks() {
        try {
            const res = await apiClient.get('/trucks');
            if (res.data.success) setTrucks(res.data.data);
        } catch (e) { console.error(e); }
    }

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            await apiClient.post('/maintenance', {
                ...formData,
                truck_id: parseInt(formData.truck_id),
                cost: parseFloat(formData.cost)
            });
            showMsg('Maintenance logged! Truck status updated to Maintenance.');
            setFormData({ truck_id: '', service_date: new Date().toISOString().split('T')[0], description: '', cost: '' });
            fetchMaintenanceLogs();
            fetchTrucks();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error logging maintenance', 'error');
        }
    }

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

    const totalCost = maintenanceLogs.reduce((s, l) => s + parseFloat(l.cost || 0), 0);
    const thisMonth = maintenanceLogs.filter(l => {
        const d = new Date(l.service_date);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const thisMonthCost = thisMonth.reduce((s, l) => s + parseFloat(l.cost || 0), 0);

    return (
        <div className="management-page">
            <header className="dashboard-header">
                <h1>Maintenance Management</h1>
                <p>Track vehicle service history and manage fleet health.</p>
            </header>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Summary KPIs */}
            <div className="kpi-grid">
                <div className="stat-card kpi-danger">
                    <div className="stat-value">{fmt(totalCost)}</div>
                    <div className="stat-label">Total Maintenance Cost</div>
                </div>
                <div className="stat-card kpi-info">
                    <div className="stat-value">{maintenanceLogs.length}</div>
                    <div className="stat-label">Total Records</div>
                </div>
                <div className="stat-card kpi-warning">
                    <div className="stat-value">{fmt(thisMonthCost)}</div>
                    <div className="stat-label">This Month</div>
                </div>
            </div>

            <div className="management-container">
                <div className="form-section">
                    <h2>Log Maintenance Entry</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Truck</label>
                            <select value={formData.truck_id} onChange={e => setFormData({ ...formData, truck_id: e.target.value })} required>
                                <option value="">Select Truck</option>
                                {trucks.map(t => (
                                    <option key={t.truck_id} value={t.truck_id}>
                                        {t.truck_number} ({t.status})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Service Date</label>
                            <input type="date" value={formData.service_date} onChange={e => setFormData({ ...formData, service_date: e.target.value })} required />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <textarea placeholder="Oil change, tire rotation, etc." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} required className="form-textarea" />
                        </div>
                        <div className="form-group">
                            <label>Cost (₹)</label>
                            <input type="number" placeholder="5000" value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} required min="0" />
                        </div>
                        <button type="submit" className="btn-submit">Log Maintenance</button>
                    </form>
                </div>

                <div className="list-section">
                    <h2>Maintenance Logs</h2>
                    {loading ? <p>Loading history...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Truck</th>
                                    <th>Description</th>
                                    <th>Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {maintenanceLogs.map(log => (
                                    <tr key={log.maintenance_id}>
                                        <td>{new Date(log.service_date).toLocaleDateString()}</td>
                                        <td><strong>{log.truck_number}</strong></td>
                                        <td>{log.description}</td>
                                        <td><strong>{fmt(log.cost)}</strong></td>
                                    </tr>
                                ))}
                                {maintenanceLogs.length === 0 && <tr><td colSpan="4" className="empty-state">No maintenance records found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default MaintenanceManagement;
