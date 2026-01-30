import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import './App.css';

// --- SHARED COMPONENTS ---

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return <div className={`toast toast-${type}`}>{message}</div>;
}

function StatusBadge({ status }) {
  const statusClass = status.toLowerCase().replace(' ', '-');
  return <span className={`badge badge-${statusClass}`}>{status}</span>;
}

function Modal({ title, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Navbar({ activeTab, onTabChange }) {
  return (
    <nav className="navbar">
      <div className="nav-brand">🚚 Fleet Manager</div>
      <div className="nav-links">
        <button className={`nav-item ${activeTab === 'trips' ? 'active' : ''}`} onClick={() => onTabChange('trips')}>🛣️ Trips</button>
        <button className={`nav-item ${activeTab === 'trucks' ? 'active' : ''}`} onClick={() => onTabChange('trucks')}>🚛 Trucks</button>
        <button className={`nav-item ${activeTab === 'drivers' ? 'active' : ''}`} onClick={() => onTabChange('drivers')}>👤 Drivers</button>
        <button className={`nav-item ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => onTabChange('maintenance')}>🔧 Maint</button>
        <button className={`nav-item ${activeTab === 'billing' ? 'active' : ''}`} onClick={() => onTabChange('billing')}>💰 Billing</button>
      </div>
    </nav>
  );
}

// --- FORMS ---

function TruckForm({ onSubmit, initialData, onCancel }) {
  const [formData, setFormData] = useState(initialData || { truck_number: '', capacity: '', status: 'Available', insurance_expiry: '', fitness_expiry: '' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ ...formData, truck_number: formData.truck_number.toUpperCase() }); }}>
      <div className="form-grid">
        <div className="form-group"><label>Number</label><input type="text" required value={formData.truck_number} onChange={e => setFormData({ ...formData, truck_number: e.target.value })} /></div>
        <div className="form-group"><label>Capacity (T)</label><input type="number" step="0.1" required value={formData.capacity} onChange={e => setFormData({ ...formData, capacity: e.target.value })} /></div>
        <div className="form-group"><label>Status</label><select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}><option>Available</option><option>Maintenance</option></select></div>
        <div className="form-group"><label>Insurance</label><input type="date" required value={formData.insurance_expiry} onChange={e => setFormData({ ...formData, insurance_expiry: e.target.value })} /></div>
        <div className="form-group"><label>Fitness</label><input type="date" required value={formData.fitness_expiry} onChange={e => setFormData({ ...formData, fitness_expiry: e.target.value })} /></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary">Save</button></div>
    </form>
  );
}

function DriverForm({ onSubmit, initialData, onCancel }) {
  const [formData, setFormData] = useState(initialData || { name: '', phone: '', license_number: '', license_expiry: '', status: 'Available' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }}>
      <div className="form-grid">
        <div className="form-group"><label>Name</label><input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
        <div className="form-group"><label>Phone</label><input type="tel" maxLength="10" required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} /></div>
        <div className="form-group"><label>License</label><input type="text" required value={formData.license_number} onChange={e => setFormData({ ...formData, license_number: e.target.value.toUpperCase() })} /></div>
        <div className="form-group"><label>Expiry</label><input type="date" required value={formData.license_expiry} onChange={e => setFormData({ ...formData, license_expiry: e.target.value })} /></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary">Save</button></div>
    </form>
  );
}

function MaintenanceForm({ trucks, onSubmit, onCancel }) {
  const [formData, setFormData] = useState({ truck_id: '', service_date: '', description: '', cost: '' });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }}>
      <div className="form-grid">
        <div className="form-group">
          <label>Truck</label>
          <select required value={formData.truck_id} onChange={e => setFormData({ ...formData, truck_id: e.target.value })}>
            <option value="">Select Truck</option>
            {trucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_number}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Date</label><input type="date" required value={formData.service_date} onChange={e => setFormData({ ...formData, service_date: e.target.value })} /></div>
        <div className="form-group"><label>Description</label><input type="text" required value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>
        <div className="form-group"><label>Cost (₹)</label><input type="number" required value={formData.cost} onChange={e => setFormData({ ...formData, cost: e.target.value })} /></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary">Log Service</button></div>
    </form>
  );
}

function TripForm({ trucks, drivers, onSubmit, onCancel }) {
  const assignedTrucks = trucks.filter(t => t.status === 'Assigned');
  const [formData, setFormData] = useState({ truck_id: '', driver_id: '', lr_number: '', source: '', destination: '', freight_amount: '' });

  const handleTruckChange = (truckId) => {
    const driver = drivers.find(d => d.assigned_truck_id === parseInt(truckId));
    setFormData({ ...formData, truck_id: truckId, driver_id: driver ? driver.driver_id : '' });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }}>
      <div className="form-grid">
        <div className="form-group">
          <label>Truck (Assigned Only)</label>
          <select required value={formData.truck_id} onChange={(e) => handleTruckChange(e.target.value)}>
            <option value="">-- Select --</option>
            {assignedTrucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_number}</option>)}
          </select>
        </div>
        <div className="form-group"><label>LR Number</label><input type="text" required value={formData.lr_number} onChange={e => setFormData({ ...formData, lr_number: e.target.value })} /></div>
        <div className="form-group"><label>Freight (₹)</label><input type="number" required value={formData.freight_amount} onChange={e => setFormData({ ...formData, freight_amount: e.target.value })} /></div>
        <div className="form-group"><label>Source</label><input type="text" required value={formData.source} onChange={e => setFormData({ ...formData, source: e.target.value })} /></div>
        <div className="form-group"><label>Destination</label><input type="text" required value={formData.destination} onChange={e => setFormData({ ...formData, destination: e.target.value })} /></div>
      </div>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary">Plan Trip</button></div>
    </form>
  );
}

// --- PANELS ---

function TrucksPanel({ trucks, onAdd, onEdit, onDelete }) {
  return (
    <div className="card full-width">
      <div className="card-header"><h2 className="card-title">🚛 Fleet</h2><button className="btn btn-primary" onClick={onAdd}>+ Add</button></div>
      <div className="table-container">
        <table>
          <thead><tr><th>Number</th><th>Capacity</th><th>Status</th><th>Insurance</th><th>Action</th></tr></thead>
          <tbody>
            {trucks.map(t => (
              <tr key={t.truck_id}>
                <td><strong>{t.truck_number}</strong></td><td>{t.capacity} T</td><td><StatusBadge status={t.status} /></td>
                <td>{new Date(t.insurance_expiry).toLocaleDateString()}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={() => onEdit(t)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => onDelete(t.truck_id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriversPanel({ drivers, trucks, onAdd, onEdit, onDelete, onAssign, onUnassign }) {
  const [selD, setSelD] = useState(''); const [selT, setSelT] = useState('');
  return (
    <div className="drivers-layout">
      <div className="card">
        <h2 className="card-title">🔗 Quick Assign</h2>
        <div className="form-group"><select value={selD} onChange={e => setSelD(e.target.value)}><option value="">Driver</option>{drivers.filter(d => d.status === 'Available').map(d => <option key={d.driver_id} value={d.driver_id}>{d.name}</option>)}</select></div>
        <div className="form-group"><select value={selT} onChange={e => setSelT(e.target.value)}><option value="">Truck</option>{trucks.filter(t => t.status === 'Available').map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_number}</option>)}</select></div>
        <button className="btn btn-success full-width-btn" onClick={() => { onAssign(selD, selT); setSelD(''); setSelT(''); }} disabled={!selD || !selT}>Assign</button>
      </div>
      <div className="card full-width">
        <div className="card-header"><h2 className="card-title">👤 Drivers</h2><button className="btn btn-primary" onClick={onAdd}>+ Add</button></div>
        <div className="table-container">
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Truck</th><th>Action</th></tr></thead>
            <tbody>
              {drivers.map(d => (<tr key={d.driver_id}><td><strong>{d.name}</strong></td><td>{d.phone}</td><td><StatusBadge status={d.status} /></td><td>{d.truck_number || '-'}</td>
                <td><button className="btn btn-sm btn-secondary" onClick={() => onEdit(d)}>Edit</button>{d.assigned_truck_id ? <button className="btn btn-sm btn-warning" onClick={() => onUnassign(d.driver_id)}>Unlink</button> : <button className="btn btn-sm btn-danger" onClick={() => onDelete(d.driver_id)}>Delete</button>}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TripsPanel({ trips, onCreate, onStart, onEnd, onLogGps, onLogFuel, onGenerateInvoice }) {
  const [gps, setGps] = useState({ lat: '', lng: '' });
  const log = (id) => { onLogGps(id, { latitude: gps.lat, longitude: gps.lng }); setGps({ lat: '', lng: '' }); };
  return (
    <div className="card full-width">
      <div className="card-header"><h2 className="card-title">🛣️ Trips</h2><button className="btn btn-primary" onClick={onCreate}>+ Include Trip</button></div>
      <div className="table-container">
        <table>
          <thead><tr><th>Status</th><th>LR</th><th>Route</th><th>Truck</th><th>Dist</th><th>Ops</th></tr></thead>
          <tbody>
            {trips.map(t => (
              <tr key={t.trip_id}>
                <td><StatusBadge status={t.status} /></td><td>{t.lr_number}</td><td>{t.source}→{t.destination}</td>
                <td>{t.truck_number}</td><td>{t.distance_km?.toFixed(1) || 0} km</td>
                <td>
                  {t.status === 'Planned' && <button className="btn btn-sm btn-success" onClick={() => onStart(t.trip_id)}>Start</button>}
                  {t.status === 'Running' && <div className="ops-buttons">
                    <div className="form-row"><input placeholder="Lat" value={gps.lat} onChange={e => setGps({ ...gps, lat: e.target.value })} style={{ width: '60px' }} />
                      <input placeholder="Lng" value={gps.lng} onChange={e => setGps({ ...gps, lng: e.target.value })} style={{ width: '60px' }} />
                      <button className="btn btn-sm btn-primary" onClick={() => log(t.trip_id)}>GPS</button></div>
                    <button className="btn btn-sm btn-warning" onClick={() => onLogFuel(t.trip_id)}>Fuel</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onEnd(t.trip_id)}>End</button>
                  </div>}
                  {t.status === 'Completed' && <button className="btn btn-sm btn-secondary" onClick={() => onGenerateInvoice(t)}>Bill</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MaintenancePanel({ logs, trucks, onAdd }) {
  return (
    <div className="card full-width">
      <div className="card-header"><h2 className="card-title">🔧 Maintenance Log</h2><button className="btn btn-primary" onClick={onAdd}>+ Log Service</button></div>
      <div className="table-container">
        <table>
          <thead><tr><th>Date</th><th>Truck</th><th>Description</th><th>Cost</th></tr></thead>
          <tbody>
            {logs.map(m => (
              <tr key={m.maintenance_id}>
                <td>{new Date(m.service_date).toLocaleDateString()}</td>
                <td><strong>{m.truck_number}</strong></td>
                <td>{m.description}</td>
                <td>₹{m.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingPanel({ invoices }) {
  return (
    <div className="card full-width">
      <div className="card-header"><h2 className="card-title">💰 Invoices</h2></div>
      <div className="table-container">
        <table>
          <thead><tr><th>Date</th><th>LR No</th><th>Truck</th><th>Total</th><th>Adv</th><th>Bal</th><th>Status</th></tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.invoice_id}>
                <td>{new Date(i.invoice_date).toLocaleDateString()}</td>
                <td>{i.lr_number}</td>
                <td>{i.truck_number}</td>
                <td>₹{i.total_amount}</td>
                <td>₹{i.advance_amount}</td>
                <td><strong>₹{i.balance_amount}</strong></td>
                <td><StatusBadge status={i.payment_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- MAIN APP ---

function App() {
  const [activeTab, setActiveTab] = useState('trips');
  const [data, setData] = useState({ trucks: [], drivers: [], trips: [], maintenance: [], invoices: [] });
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const [t, d, tr, m, i] = await Promise.all([
        api.getTrucks(), api.getDrivers(), api.getTrips(), api.getMaintenanceLogs(), api.getInvoices()
      ]);
      setData({
        trucks: t.success ? t.data : [],
        drivers: d.success ? d.data : [],
        trips: tr.success ? tr.data : [],
        maintenance: m.success ? m.data : [],
        invoices: i.success ? i.data : []
      });
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const toast = (msg, type = 'success') => { const id = Date.now(); setToasts(p => [...p, { id, message: msg, type }]); };

  // Handlers
  const handleAddTruck = async (d) => { if ((await api.createTruck(d)).success) { toast('Truck Added'); refresh(); setModal(null); } };
  const handleEditTruck = async (d) => { if ((await api.updateTruck(modal.data.truck_id, d)).success) { toast('Updated'); refresh(); setModal(null); } };
  const handleDeleteTruck = async (id) => { if (confirm('Delete?') && (await api.deleteTruck(id)).success) { toast('Deleted'); refresh(); } };

  const handleAddDriver = async (d) => { if ((await api.createDriver(d)).success) { toast('Added'); refresh(); setModal(null); } };
  const handleEditDriver = async (d) => { if ((await api.updateDriver(modal.data.driver_id, d)).success) { toast('Updated'); refresh(); setModal(null); } };
  const handleDeleteDriver = async (id) => { if (confirm('Delete?') && (await api.deleteDriver(id)).success) { toast('Deleted'); refresh(); } };
  const handleAssign = async (d, t) => { if ((await api.assignDriver(d, t)).success) { toast('Assigned'); refresh(); } };
  const handleUnassign = async (d) => { if ((await api.unassignDriver(d)).success) { toast('Unassigned'); refresh(); } };

  const handleCreateTrip = async (d) => { if ((await api.createTrip(d)).success) { toast('Trip Planned'); refresh(); setModal(null); } else toast('Error', 'error'); };
  const handleStartTrip = async (id) => { if ((await api.startTrip(id)).success) { toast('Started'); refresh(); } };
  const handleEndTrip = async (id) => { if (confirm('End?') && (await api.endTrip(id)).success) { toast('Ended'); refresh(); } };
  const handleLogGps = async (id, d) => { const trip = data.trips.find(t => t.trip_id === id); if ((await api.logGps({ trip_id: id, truck_id: trip.truck_id, ...d })).success) { toast('GPS Logged'); refresh(); } };
  const handleLogFuel = async (id, l, p) => { if ((await api.logFuel({ trip_id: id, liters: l, price_per_liter: p })).success) { toast('Fuel Logged'); setModal(null); } };

  const handleLogMaint = async (d) => { if ((await api.logMaintenance(d)).success) { toast('Maint Logged'); refresh(); setModal(null); } };
  const handleInvoice = async (d) => { if ((await api.createInvoice(d)).success) { toast('Invoice Created'); refresh(); setModal(null); } };

  return (
    <div className="app">
      <header className="header"><h1>🚚 Fleet Manager Pro</h1></header>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="content">
        {activeTab === 'trips' && <TripsPanel trips={data.trips} onCreate={() => setModal({ type: 'trip' })} onStart={handleStartTrip} onEnd={handleEndTrip} onLogGps={handleLogGps} onLogFuel={(id) => setModal({ type: 'fuel', id })} onGenerateInvoice={(t) => setModal({ type: 'inv', data: t })} />}
        {activeTab === 'trucks' && <TrucksPanel trucks={data.trucks} onAdd={() => setModal({ type: 'addTruck' })} onEdit={(d) => setModal({ type: 'editTruck', data: { ...d, insurance_expiry: d.insurance_expiry.split('T')[0], fitness_expiry: d.fitness_expiry.split('T')[0] } })} onDelete={handleDeleteTruck} />}
        {activeTab === 'drivers' && <DriversPanel drivers={data.drivers} trucks={data.trucks} onAdd={() => setModal({ type: 'addDriver' })} onEdit={(d) => setModal({ type: 'editDriver', data: { ...d, license_expiry: d.license_expiry.split('T')[0] } })} onDelete={handleDeleteDriver} onAssign={handleAssign} onUnassign={handleUnassign} />}
        {activeTab === 'maintenance' && <MaintenancePanel logs={data.maintenance} trucks={data.trucks} onAdd={() => setModal({ type: 'addMaint' })} />}
        {activeTab === 'billing' && <BillingPanel invoices={data.invoices} />}
      </main>

      {modal?.type === 'addTruck' && <Modal title="New Truck" onClose={() => setModal(null)}><TruckForm onSubmit={handleAddTruck} onCancel={() => setModal(null)} /></Modal>}
      {modal?.type === 'editTruck' && <Modal title="Edit Truck" onClose={() => setModal(null)}><TruckForm initialData={modal.data} onSubmit={handleEditTruck} onCancel={() => setModal(null)} /></Modal>}
      {modal?.type === 'addDriver' && <Modal title="New Driver" onClose={() => setModal(null)}><DriverForm onSubmit={handleAddDriver} onCancel={() => setModal(null)} /></Modal>}
      {modal?.type === 'editDriver' && <Modal title="Edit Driver" onClose={() => setModal(null)}><DriverForm initialData={modal.data} onSubmit={handleEditDriver} onCancel={() => setModal(null)} /></Modal>}
      {modal?.type === 'trip' && <Modal title="Plan Trip" onClose={() => setModal(null)}><TripForm trucks={data.trucks} drivers={data.drivers} onSubmit={handleCreateTrip} onCancel={() => setModal(null)} /></Modal>}

      {modal?.type === 'fuel' && <Modal title="Log Fuel" onClose={() => setModal(null)}>
        <form onSubmit={(e) => { e.preventDefault(); handleLogFuel(modal.id, e.target.liters.value, e.target.price.value) }}>
          <div className="form-group"><label>Liters</label><input name="liters" required type="number" step="0.1" /></div>
          <div className="form-group"><label>Rate/L</label><input name="price" required type="number" step="0.01" /></div><button className="btn btn-primary">Save</button>
        </form>
      </Modal>}

      {modal?.type === 'addMaint' && <Modal title="Log Maintenance" onClose={() => setModal(null)}>
        <MaintenanceForm trucks={data.trucks} onSubmit={handleLogMaint} onCancel={() => setModal(null)} />
      </Modal>}

      {modal?.type === 'inv' && <Modal title="Invoice" onClose={() => setModal(null)}>
        <form onSubmit={(e) => { e.preventDefault(); handleInvoice({ trip_id: modal.data.trip_id, total_amount: e.target.total.value, advance_amount: e.target.adv.value, payment_status: e.target.status.value, invoice_date: e.target.date.value }) }}>
          <div className="form-group"><label>Total</label><input name="total" defaultValue={modal.data.freight_amount} required type="number" /></div>
          <div className="form-group"><label>Advance</label><input name="adv" defaultValue="0" required type="number" /></div>
          <div className="form-group"><label>Status</label><select name="status"><option>Pending</option><option>Paid</option></select></div>
          <div className="form-group"><label>Date</label><input name="date" required type="date" defaultValue={new Date().toISOString().split('T')[0]} /></div>
          <button className="btn btn-primary">Generate</button>
        </form>
      </Modal>}

      <div className="toast-container">{toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />)}</div>
    </div>
  );
}

export default App;
