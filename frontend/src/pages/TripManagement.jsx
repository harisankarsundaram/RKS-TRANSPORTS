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

    const fetchDropdowns = async () => {
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

    useEffect(() => {
        const init = async () => {
            if (user?.role === 'driver' && user?.id) {
                try {
                    const res = await apiClient.get(`/drivers/user/${user.id}`);
                    if (res.data.success) setDriverId(res.data.data.driver_id);
                } catch (e) { console.error(e); }
            }
            await fetchDropdowns();
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
            fetchDropdowns();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error creating trip', 'error');
        }
    };

    const handleAction = async (tripId, action) => {
        try {
            await apiClient.post(`/trips/${tripId}/${action}`);
            showMsg(`Trip ${action === 'start' ? 'started' : action === 'end' ? 'completed' : 'cancelled'} successfully!`);
            fetchTrips();
            fetchDropdowns();
        } catch (err) {
            showMsg(err.response?.data?.message || `Error: ${action} failed`, 'error');
        }
    };

    const getStatusClass = (status) => {
        switch (status) {
            case 'Completed': return 'completed';
            case 'Running': return 'running';
            case 'Planned': return 'planned';
            case 'Cancelled': return 'cancelled';
            default: return 'neutral';
        }
    };

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

    // For trip creation: show Available trucks and Available drivers
    const availableTrucks = trucks.filter(t => t.status === 'Available');
    const availableDrivers = drivers.filter(d => d.status === 'Available');

    return (
        <div className="management-page">
            <header className="dashboard-header">
                <div className="section-header">
                    <div>
                        <h1>Trip Management</h1>
                        <p>Track and manage your lorry shipments.</p>
                    </div>
                    {user?.role === 'admin' && (
                        <button onClick={() => setShowForm(!showForm)} className="btn-submit" style={{ width: 'auto', padding: '0.7rem 1.5rem', marginTop: 0 }}>
                            {showForm ? 'Close' : '+ New Trip'}
                        </button>
                    )}
                </div>
            </header>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Create Trip Form */}
            {showForm && user?.role === 'admin' && (
                <div className="form-section" style={{ marginBottom: '2rem' }}>
                    <h2>Plan New Trip</h2>
                    <form onSubmit={handleCreate} className="management-form">
                        <div className="grid-3">
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
                                    {availableDrivers.map(d => <option key={d.driver_id} value={d.driver_id}>{d.name} ({d.phone})</option>)}
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
                        <h3 className="sub-title">Charges & Financials</h3>
                        <div className="grid-3">
                            <div className="form-group">
                                <label>Toll Amount (₹)</label>
                                <input type="number" value={formData.toll_amount} onChange={e => setFormData({ ...formData, toll_amount: e.target.value })} min="0" />
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={formData.toll_billable} onChange={e => setFormData({ ...formData, toll_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Loading Cost (₹)</label>
                                <input type="number" value={formData.loading_cost} onChange={e => setFormData({ ...formData, loading_cost: e.target.value })} min="0" />
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={formData.loading_billable} onChange={e => setFormData({ ...formData, loading_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Unloading Cost (₹)</label>
                                <input type="number" value={formData.unloading_cost} onChange={e => setFormData({ ...formData, unloading_cost: e.target.value })} min="0" />
                                <label className="checkbox-label">
                                    <input type="checkbox" checked={formData.unloading_billable} onChange={e => setFormData({ ...formData, unloading_billable: e.target.checked })} /> Billable to client
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Other Charges (₹)</label>
                                <input type="number" value={formData.other_charges} onChange={e => setFormData({ ...formData, other_charges: e.target.value })} min="0" />
                                <label className="checkbox-label">
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
                        <h3 className="sub-title">Mileage</h3>
                        <div className="grid-2">
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
            <div className="filter-bar">
                {['All', 'Planned', 'Running', 'Completed', 'Cancelled'].map(s => (
                    <button key={s} onClick={() => setFilter(s)} className={`btn-filter ${filter === s ? 'active' : ''}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Trip Cards */}
            {loading ? <div>Loading trips...</div> : (
                <div className="trip-grid">
                    {trips.map(trip => (
                        <div key={trip.trip_id} className="trip-card">
                            <div className="trip-card-header">
                                <strong style={{ fontSize: '1.15rem' }}>{trip.lr_number}</strong>
                                <span className={`status-badge ${getStatusClass(trip.status)}`}>{trip.status}</span>
                            </div>
                            <div className="trip-card-body">
                                <div><strong>Route:</strong> {trip.source} &rarr; {trip.destination}</div>
                                <div><strong>Lorry:</strong> {trip.truck_number}</div>
                                <div><strong>Driver:</strong> {trip.driver_name}</div>
                            </div>

                            {user?.role === 'admin' && (
                                <div className="trip-card-financials">
                                    <div><strong>Freight:</strong> {fmt(trip.base_freight)}</div>
                                    <div><strong>Toll:</strong> {fmt(trip.toll_amount)} {trip.toll_billable ? '(B)' : ''}</div>
                                    <div><strong>Bata:</strong> {fmt(trip.driver_bata)}</div>
                                    <div><strong>GST:</strong> {trip.gst_percentage || 0}%</div>
                                </div>
                            )}

                            <div className="trip-card-footer">
                                <span className="trip-card-distance">{(parseFloat(trip.empty_km || 0) + parseFloat(trip.loaded_km || 0)) || trip.distance_km || 0} KM</span>
                                {user?.role === 'admin' ? (
                                    <strong className="trip-card-amount">{fmt(trip.base_freight || trip.freight_amount)}</strong>
                                ) : (
                                    <strong className="trip-card-meta">{trip.status}</strong>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="trip-card-actions">
                                {/* Admin can cancel planned trips */}
                                {user?.role === 'admin' && trip.status === 'Planned' && (
                                    <button onClick={() => handleAction(trip.trip_id, 'cancel')} className="btn-cancel">Cancel</button>
                                )}
                                {/* Driver can start their planned trips */}
                                {user?.role === 'driver' && trip.status === 'Planned' && (
                                    <button onClick={() => handleAction(trip.trip_id, 'start')} className="btn-start">Start Trip</button>
                                )}
                                {/* Driver can complete their running trips */}
                                {user?.role === 'driver' && trip.status === 'Running' && (
                                    <button onClick={() => handleAction(trip.trip_id, 'end')} className="btn-complete">Complete Trip</button>
                                )}
                            </div>
                        </div>
                    ))}
                    {trips.length === 0 && <p className="empty-state">No trips found for this filter.</p>}
                </div>
            )}
        </div>
    );
}

export default TripManagement;
