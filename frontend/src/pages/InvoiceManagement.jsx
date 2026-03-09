import { useState, useEffect } from 'react';
import apiClient from '../api/client';
import './Management.css';

function InvoiceManagement() {
    const [invoices, setInvoices] = useState([]);
    const [completedTrips, setCompletedTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [filterStatus, setFilterStatus] = useState('All');
    const [showGenerate, setShowGenerate] = useState(false);
    const [showPayment, setShowPayment] = useState(null);
    const [generateForm, setGenerateForm] = useState({ trip_id: '', due_date: '' });
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        fetchInvoices();
        fetchCompletedTrips();
    }, []);

    async function fetchInvoices() {
        setLoading(true);
        try {
            const filters = filterStatus !== 'All' ? `?status=${filterStatus}` : '';
            const res = await apiClient.get(`/invoices${filters}`);
            if (res.data.success) setInvoices(res.data.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }

    async function fetchCompletedTrips() {
        try {
            const res = await apiClient.get('/trips?status=Completed');
            if (res.data.success) setCompletedTrips(res.data.data);
        } catch (e) { console.error(e); }
    }

    useEffect(() => { fetchInvoices(); }, [filterStatus]);

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    };

    async function handleGenerate(e) {
        e.preventDefault();
        try {
            const res = await apiClient.post('/invoices', {
                trip_id: parseInt(generateForm.trip_id),
                due_date: generateForm.due_date
            });
            showMsg(`Invoice ${res.data.data.invoice_number} generated!`);
            setShowGenerate(false);
            setGenerateForm({ trip_id: '', due_date: '' });
            fetchInvoices();
            fetchCompletedTrips();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error generating invoice', 'error');
        }
    }

    async function handlePayment(invoiceId) {
        try {
            await apiClient.post(`/invoices/${invoiceId}/payment`, { amount: parseFloat(paymentAmount) });
            showMsg(`Payment of ₹${paymentAmount} recorded!`);
            setShowPayment(null);
            setPaymentAmount('');
            fetchInvoices();
        } catch (err) {
            showMsg(err.response?.data?.message || 'Error recording payment', 'error');
        }
    }

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

    // KPIs
    const totalInvoiced = invoices.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0);
    const totalOutstanding = totalInvoiced - totalPaid;

    return (
        <div className="management-page">
            <div className="section-header">
                <h1>Invoice Management</h1>
                <button onClick={() => setShowGenerate(!showGenerate)} className="btn-submit" style={{ width: 'auto', padding: '0.7rem 1.5rem', marginTop: 0 }}>
                    {showGenerate ? 'Close' : '+ Generate Invoice'}
                </button>
            </div>

            {message.text && (
                <div className={`alert-message ${message.type}`}>
                    {message.text}
                </div>
            )}

            {/* KPI Cards */}
            <div className="kpi-grid">
                <div className="stat-card kpi-success">
                    <div className="stat-value">{fmt(totalInvoiced)}</div>
                    <div className="stat-label">Total Invoiced</div>
                </div>
                <div className="stat-card kpi-info">
                    <div className="stat-value">{fmt(totalPaid)}</div>
                    <div className="stat-label">Amount Received</div>
                </div>
                <div className="stat-card kpi-warning">
                    <div className="stat-value">{fmt(totalOutstanding)}</div>
                    <div className="stat-label">Outstanding</div>
                </div>
            </div>

            {/* Generate Invoice Form */}
            {showGenerate && (
                <div className="form-section">
                    <h2>Generate Invoice for Completed Trip</h2>
                    <form onSubmit={handleGenerate} className="management-form">
                        <div className="grid-2">
                            <div className="form-group">
                                <label>Completed Trip</label>
                                <select value={generateForm.trip_id} onChange={e => setGenerateForm({ ...generateForm, trip_id: e.target.value })} required>
                                    <option value="">Select Trip</option>
                                    {completedTrips.map(t => (
                                        <option key={t.trip_id} value={t.trip_id}>
                                            {t.lr_number} — {t.source} → {t.destination} ({fmt(t.base_freight)})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Due Date</label>
                                <input type="date" value={generateForm.due_date} onChange={e => setGenerateForm({ ...generateForm, due_date: e.target.value })} required />
                            </div>
                        </div>
                        <button type="submit" className="btn-submit">Generate Invoice</button>
                    </form>
                </div>
            )}

            {/* Filter */}
            <div className="filter-bar">
                {['All', 'Pending', 'Partial', 'Paid'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)} className={`btn-filter ${filterStatus === s ? 'active' : ''}`}>
                        {s}
                    </button>
                ))}
            </div>

            {/* Invoice Table */}
            <div className="list-section">
                {loading ? <p>Loading...</p> : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Invoice #</th>
                                <th>Trip</th>
                                <th>Route</th>
                                <th>Subtotal</th>
                                <th>GST</th>
                                <th>Total</th>
                                <th>Paid</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.map(inv => {
                                return (
                                    <tr key={inv.invoice_id}>
                                        <td><strong>{inv.invoice_number}</strong></td>
                                        <td>{inv.lr_number}</td>
                                        <td>{inv.source} → {inv.destination}</td>
                                        <td>{fmt(inv.subtotal)}</td>
                                        <td>{fmt(inv.gst_amount)}</td>
                                        <td><strong>{fmt(inv.total_amount)}</strong></td>
                                        <td className="text-success"><strong>{fmt(inv.amount_paid)}</strong></td>
                                        <td>
                                            <span className={`status-badge ${inv.payment_status.toLowerCase()}`}>
                                                {inv.payment_status}
                                            </span>
                                        </td>
                                        <td>
                                            {inv.payment_status !== 'Paid' && (
                                                showPayment === inv.invoice_id ? (
                                                    <div className="payment-form">
                                                        <input type="number" placeholder="₹" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} min="1" />
                                                        <button onClick={() => handlePayment(inv.invoice_id)} className="btn-action success">Pay</button>
                                                        <button onClick={() => { setShowPayment(null); setPaymentAmount(''); }} className="btn-action danger">X</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setShowPayment(inv.invoice_id)} className="btn-action primary">
                                                        Record Payment
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {invoices.length === 0 && <tr><td colSpan="9" className="empty-state">No invoices found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default InvoiceManagement;
