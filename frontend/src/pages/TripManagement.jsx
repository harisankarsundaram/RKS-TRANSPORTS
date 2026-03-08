import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import './Management.css';

function TripManagement() {
    const { user } = useAuth();
    const [trips, setTrips] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('All');
    const [driverId, setDriverId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [formData, setFormData] = useState({
        truck_id: '', driver_id: '', lr_number: '', source: '', destination: '',
        base_freight: '', toll_amount: '0', toll_billable: false,
        loading_cost: '0', loading_billable: false,
        unloading_cost: '0', unloading_billable: false,
        other_charges: '0', other_billable: false,
        gst_percentage: '5', driver_bata: '0',
        empty_km: '0', loaded_km: '0'
    });

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'driver' && user?.id) {
                try {
                    const res = await apiClient.get(`/drivers/user/${user.id}`);
                    if (res.data.success) setDriverId(res.data.data.driver_id);
                } catch (e) { console.error(e); }
            }
            if (user?.role === 'admin') {
                try {
                    const [truckRes, driverRes] = await Promise.all([
                        apiClient.get('/trucks'),
                        apiClient.get('/drivers')
                    ]);
                    if (truckRes.data.success) setTrucks(truckRes.data.data);
                    if (driverRes.data.success) setDrivers(driverRes.data.data);
                } catch (e) { console.error(e); }
            }
        };
        init();
    }, [user]);

    useEffect(() => {
        if (user?.role === 'driver' && !driverId) return;
        fetchTrips();
    }, [filter, driverId]);

    const fetchTrips = async () => {
        setLoading(true);
        try {
            let url = filter === 'All' ? '/trips' : `/trips?status=${filter}`;
            if (user?.role === 'driver' && driverId) {
                url += `${url.includes('?') ? '&' : '?'}driver_id=${driverId}`;
            }
            const res = await apiClient.get(url);
            if (res.data.success) setTrips(res.data.data);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                base_freight: parseFloat(formData.base_freight),
                toll_amount: parseFloat(formData.toll_amount) || 0,
                loading_cost: parseFloat(formData.loading_cost) || 0,
                unloading_cost: parseFloat(formData.unloading_cost) || 0,
                other_charges: parseFloat(formData.other_charges) || 0,
                gst_percentage: parseFloat(formData.gst_percentage) || 0,
                driver_bata: parseFloat(formData.driver_bata) || 0,
                empty_km: parseFloat(formData.empty_km) || 0,
                loaded_km: parseFloat(formData.loaded_km) || 0,
            };
            await apiClient.post('/trips', payload);
            showMsg('Trip created successfully!');
            setShowForm(false);
            setFormData({ truck_id: '', driver_id: '', lr_number: '', source: '', destination: '', base_freight: '', toll_amount: '0', toll_billable: false, loading_cost: '0', loading_billable: false, unloading_cost: '0', unloading_billable: false, other_charges: '0', other_billable: false, gst_percentage: '5', driver_bata: '0', empty_km: '0', loaded_km: '0' });
            fetchTrips();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error creating trip', 'error');
        }
    };

    const handleAction = async (tripId, action) => {
        try {
            await apiClient.post(`/trips/${tripId}/${action}`);
            showMsg(`Trip ${action === 'start' ? 'started' : action === 'end' ? 'completed' : 'cancelled'} successfully!`);
            fetchTrips();
        } catch (err) {
            showMsg(err.response?.data?.message || `Error: ${action} failed`, 'error');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Completed': return '#48bb78';
            case 'Running': return '#4299e1';
            case 'Planned': return '#ed8936';
            case 'Cancelled': return '#e53e3e';
            default: return '#718096';
        }
    };

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

    // Get available trucks/drivers for the form
    const availableTrucks = trucks.filter(t => t.status === 'Assigned');
    const assignedDrivers = drivers.filter(d => d.status === 'Assigned');

    return (
        <div className="management-page">
            <header className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1>Trip Management</h1>
                        <p>Track and manage your lorry shipments.</p>
                    </div>
                    {user?.role === 'admin' && (
                        <button onClick={() => setShowForm(!showForm)} className="btn-submit" style={{ width: 'auto', padding: '0.7rem 1.5rem', marginTop: 0 }}>
                            {showForm ? '✕ Close' : '+ New Trip'}
                        </button>
                    )}
                </div>
            </header>

            {message.text && (
                <div style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', background: message.type === 'error' ? '#FFF5F5' : '#F0FFF4', color: message.type === 'error' ? '#C53030' : '#2C5F2D', border: `1px solid ${message.type === 'error' ? '#FED7D7' : '#C6F6D5'}`, fontWeight: 600 }}>
                    {message.text}
                </div>
            )}

            {/* Create Trip Form */}
            {showForm && user?.role === 'admin' && (
                <div className="form-section" style={{ marginBottom: '2rem' }}>
                    <h2>Plan New Trip</h2>
                    <form onSubmit={handleCreate} className="management-form">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>LR Number</label>
                                <input type="text" placeholder="e.g. LR-1005" value={formData.lr_number} onChange={e => setFormData({ ...formData, lr_number: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Truck</label>
                                <select value={formData.truck_id} onChange={e => setFormData({ ...formData, truck_id: e.target.value })} required>
                                    <option value="">Select Truck</option>
                                    {availableTrucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_number} ({t.capacity}T)</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Driver</label>
                                <select value={formData.driver_id} onChange={e => setFormData({ ...formData, driver_id: e.target.value })} required>
                                    <option value="">Select Driver</option>
                                    {assignedDrivers.map(d => <option key={d.driver_id} value={d.driver_id}>{d.name} ({d.phone})</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Source</label>
                                <input type="text" placeholder="Bangalore" value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Destination</label>
                                <input type="text" placeholder="Chennai" value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} required />
                            </div>
                            <div className="form-group">
                                <label>Base Freight (₹)</label>
                                <input type="number" placeholder="50000" value={formData.base_freight} onChange={e => setFormData({ ...formData, base_freight: e.target.value })} required min="1" />
                            </div>
                        </div>

                        {/* Financial Fields */}
                        <h3 style={{ margin: '1.5rem 0 1rem', color: '#4a5568', fontSize: '1rem' }}>Charges & Financials</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Toll Amount (₹)</label>
                                <input type="number" value={formData.toll_amount} onChange={e => setFormData({ ...formData, toll_amount: e.target.value })} min="0" />
                                <label style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                                    <input type="checkbox" checked={formData.toll_billable} onChange={e => setFormData({ ...formData, toll_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Loading Cost (₹)</label>
                                <input type="number" value={formData.loading_cost} onChange={e => setFormData({ ...formData, loading_cost: e.target.value })} min="0" />
                                <label style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                                    <input type="checkbox" checked={formData.loading_billable} onChange={e => setFormData({ ...formData, loading_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Unloading Cost (₹)</label>
                                <input type="number" value={formData.unloading_cost} onChange={e => setFormData({ ...formData, unloading_cost: e.target.value })} min="0" />
                                <label style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                                    <input type="checkbox" checked={formData.unloading_billable} onChange={e => setFormData({ ...formData, unloading_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Other Charges (₹)</label>
                                <input type="number" value={formData.other_charges} onChange={e => setFormData({ ...formData, other_charges: e.target.value })} min="0" />
                                <label style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>
                                    <input type="checkbox" checked={formData.other_billable} onChange={e => setFormData({ ...formData, other_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>GST %</label>
                                <input type="number" value={formData.gst_percentage} onChange={e => setFormData({ ...formData, gst_percentage: e.target.value })} min="0" max="28" />
                            </div>
                            <div className="form-group">
                                <label>Driver Bata (₹)</label>
                                <input type="number" value={formData.driver_bata} onChange={e => setFormData({ ...formData, driver_bata: e.target.value })} min="0" />
                            </div>
                        </div>

                        {/* Mileage */}
                        <h3 style={{ margin: '1.5rem 0 1rem', color: '#4a5568', fontSize: '1rem' }}>Mileage</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="form-group">
                                <label>Empty KM</label>
                                <input type="number" value={formData.empty_km} onChange={e => setFormData({ ...formData, empty_km: e.target.value })} min="0" />
                            </div>
                            <div className="form-group">
                                <label>Loaded KM</label>
                                <input type="number" value={formData.loaded_km} onChange={e => setFormData({ ...formData, loaded_km: e.target.value })} min="0" />
                            </div>
                        </div>

                        <button type="submit" className="btn-submit">Plan Trip</button>
                    </form>
                </div>
            )}

            {/* Filter Bar */}
            <div style={{ marginBottom: '2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['All', 'Planned', 'Running', 'Completed', 'Cancelled'].map(s => (
                    <button key={s} onClick={() => setFilter(s)} className={`btn-filter ${filter === s ? 'active' : ''}`}
                        style={{ padding: '0.5rem 1rem', borderRadius: '5px', border: '1px solid #cbd5e0', backgroundColor: filter === s ? '#2C5F2D' : 'white', color: filter === s ? 'white' : '#2d3748', cursor: 'pointer', fontWeight: 600 }}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Trip Cards */}
            {loading ? <div>Loading trips...</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
                    {trips.map(trip => (
                        <div key={trip.trip_id} className="trip-card" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '1.5rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', borderLeft: `5px solid ${getStatusColor(trip.status)}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <strong style={{ fontSize: '1.15rem' }}>{trip.lr_number}</strong>
                                <span style={{ backgroundColor: getStatusColor(trip.status), color: 'white', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem' }}>{trip.status}</span>
                            </div>
                            <div style={{ marginBottom: '0.4rem' }}><strong>Route:</strong> {trip.source} → {trip.destination}</div>
                            <div style={{ marginBottom: '0.4rem' }}><strong>Lorry:</strong> {trip.truck_number}</div>
                            <div style={{ marginBottom: '0.4rem' }}><strong>Driver:</strong> {trip.driver_name}</div>

                            {user?.role === 'admin' && (
                                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem', fontSize: '0.85rem', color: '#4a5568' }}>
                                    <div><strong>Freight:</strong> {fmt(trip.base_freight)}</div>
                                    <div><strong>Toll:</strong> {fmt(trip.toll_amount)} {trip.toll_billable ? '(B)' : ''}</div>
                                    <div><strong>Bata:</strong> {fmt(trip.driver_bata)}</div>
                                    <div><strong>GST:</strong> {trip.gst_percentage || 0}%</div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
                                <span style={{ color: '#718096' }}>{trip.distance_km || 0} KM</span>
                                <strong style={{ color: '#2C5F2D' }}>{fmt(trip.base_freight || trip.freight_amount)}</strong>
                            </div>

                            {/* Action Buttons */}
                            {user?.role === 'admin' && (
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                                    {trip.status === 'Planned' && (
                                        <>
                                            <button onClick={() => handleAction(trip.trip_id, 'start')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', backgroundColor: '#4299e1', color: 'white', fontWeight: 600, cursor: 'pointer' }}>▶ Start</button>
                                            <button onClick={() => handleAction(trip.trip_id, 'cancel')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', backgroundColor: '#e53e3e', color: 'white', fontWeight: 600, cursor: 'pointer' }}>✕ Cancel</button>
                                        </>
                                    )}
                                    {trip.status === 'Running' && (
                                        <button onClick={() => handleAction(trip.trip_id, 'end')} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: 'none', backgroundColor: '#48bb78', color: 'white', fontWeight: 600, cursor: 'pointer' }}>✓ Complete Trip</button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    {trips.length === 0 && <p style={{ color: '#718096' }}>No trips found for this filter.</p>}
                </div>
            )}
        </div>
    );
}

export default TripManagement;
