import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

const CATEGORIES = ['Fuel', 'Toll', 'Maintenance', 'Driver', 'RTO', 'Insurance', 'Misc'];

const CATEGORY_TONES = {
    Fuel: 'info',
    Toll: 'info',
    Maintenance: 'warning',
    Driver: 'success',
    RTO: 'info',
    Insurance: 'warning',
    Misc: 'neutral'
};

function ExpenseManagement() {
    const [expenses, setExpenses] = useState([]);
    const [trips, setTrips] = useState([]);
    const [trucks, setTrucks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [filterCat, setFilterCat] = useState('All');
    const [formData, setFormData] = useState({
        trip_id: '', truck_id: '', category: 'Fuel', amount: '', description: ''
    });

    useEffect(() => {
        fetchExpenses();
        fetchDropdowns();
    }, []);

    async function fetchExpenses() {
        setLoading(true);
        try {
            const res = await apiClient.get('/expenses');
            if (res.data.success) setExpenses(res.data.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function fetchDropdowns() {
        try {
            const [tripRes, truckRes] = await Promise.all([
                apiClient.get('/trips'),
                apiClient.get('/trucks')
            ]);
            if (tripRes.data.success) setTrips(tripRes.data.data);
            if (truckRes.data.success) setTrucks(truckRes.data.data);
        } catch (e) { console.error(e); }
    }

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    async function handleSubmit(e) {
        e.preventDefault();
        try {
            const payload = {
                ...formData,
                trip_id: formData.trip_id ? parseInt(formData.trip_id) : null,
                truck_id: formData.truck_id ? parseInt(formData.truck_id) : null,
                amount: parseFloat(formData.amount)
            };
            await apiClient.post('/expenses', payload);
            showMsg('Expense added!');
            setFormData({ trip_id: '', truck_id: '', category: 'Fuel', amount: '', description: '' });
            fetchExpenses();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error adding expense', 'error');
        }
    }

    async function handleDelete(id) {
        if (!window.confirm('Delete this expense?')) return;
        try {
            await apiClient.delete(`/expenses/${id}`);
            showMsg('Expense deleted');
            fetchExpenses();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error', 'error');
        }
    }

    const filtered = filterCat === 'All' ? expenses : expenses.filter(e => e.category === filterCat);
    const totalAmt = filtered.reduce((s, e) => s + parseFloat(e.amount), 0);
    const grandTotal = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

    // Category breakdown
    const catBreakdown = CATEGORIES.map(cat => ({
        name: cat,
        total: expenses.filter(e => e.category === cat).reduce((s, e) => s + parseFloat(e.amount), 0),
        count: expenses.filter(e => e.category === cat).length,
    })).filter(c => c.count > 0);

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
    const toneFor = (category) => CATEGORY_TONES[category] || 'neutral';

    return (
        <div className="management-page">
            <h1>Expense Management</h1>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* Summary KPI Cards */}
            <div className="kpi-grid">
                <div className="stat-card kpi-danger">
                    <div className="stat-value">{fmt(grandTotal)}</div>
                    <div className="stat-label">Total Expenses</div>
                </div>
                <div className="stat-card kpi-info">
                    <div className="stat-value">{expenses.length}</div>
                    <div className="stat-label">Total Entries</div>
                </div>
                {catBreakdown.slice(0, 3).map(cat => (
                    <div key={cat.name} className={`stat-card category-kpi category-kpi-${toneFor(cat.name)}`}>
                        <div className="stat-value">{fmt(cat.total)}</div>
                        <div className="stat-label">{cat.name} ({cat.count})</div>
                    </div>
                ))}
            </div>

            <div className="management-container">
                <div className="form-section">
                    <h2>Add Expense</h2>
                    <form onSubmit={handleSubmit} className="management-form">
                        <div className="form-group">
                            <label>Trip (Optional)</label>
                            <select value={formData.trip_id} onChange={e => setFormData({ ...formData, trip_id: e.target.value })}>
                                <option value="">No specific trip</option>
                                {trips.map(t => <option key={t.trip_id} value={t.trip_id}>{t.lr_number} — {t.source} → {t.destination}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Truck (Optional)</label>
                            <select value={formData.truck_id} onChange={e => setFormData({ ...formData, truck_id: e.target.value })}>
                                <option value="">No specific truck</option>
                                {trucks.map(t => <option key={t.truck_id} value={t.truck_id}>{t.truck_number}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Category</label>
                            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} required>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Amount (₹)</label>
                            <input type="number" placeholder="5000" value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} required min="1" />
                        </div>
                        <div className="form-group">
                            <label>Description</label>
                            <input type="text" placeholder="Brief note" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                        <button type="submit" className="btn-submit">Add Expense</button>
                    </form>
                </div>

                <div className="list-section">
                    <div className="section-header">
                        <h2>Expense Ledger</h2>
                        <div className="total-badge">
                            {filterCat !== 'All' ? `${filterCat}: ` : 'Total: '}{fmt(totalAmt)}
                        </div>
                    </div>

                    {/* Category Filters */}
                    <div className="filter-bar">
                        {['All', ...CATEGORIES].map(c => (
                            <button key={c} onClick={() => setFilterCat(c)} className={`btn-filter ${filterCat === c ? 'active' : ''}`}>
                                {c}
                            </button>
                        ))}
                    </div>

                    {loading ? <p>Loading...</p> : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Category</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Trip</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(exp => {
                                    return (
                                        <tr key={exp.expense_id}>
                                            <td>{new Date(exp.created_at).toLocaleDateString()}</td>
                                            <td><span className={`status-badge tone-${toneFor(exp.category)}`}>{exp.category}</span></td>
                                            <td><strong>{fmt(exp.amount)}</strong></td>
                                            <td>{exp.description || '—'}</td>
                                            <td>{exp.lr_number || exp.trip_id || '—'}</td>
                                            <td>
                                                <button onClick={() => handleDelete(exp.expense_id)} className="btn-action danger">Delete</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filtered.length === 0 && <tr><td colSpan="6" className="empty-state">No expenses found.</td></tr>}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ExpenseManagement;
