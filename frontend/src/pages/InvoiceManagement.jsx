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

    const statusColor = (s) => {
        switch (s) {
            case 'Paid': return { bg: '#F0FFF4', color: '#2C5F2D', border: '#C6F6D5' };
            case 'Partial': return { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' };
            default: return { bg: '#FFF5F5', color: '#C53030', border: '#FED7D7' };
        }
    };

    // KPIs
    const totalInvoiced = invoices.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + parseFloat(i.amount_paid || 0), 0);
    const totalOutstanding = totalInvoiced - totalPaid;

    return (
        <div className="management-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Invoice Management</h1>
                <button onClick={() => setShowGenerate(!showGenerate)} className="btn-submit" style={{ width: 'auto', padding: '0.7rem 1.5rem', marginTop: 0 }}>
                    {showGenerate ? '✕ Close' : '+ Generate Invoice'}
                </button>
            </div>

            {message.text && (
                <div style={{ padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', background: message.type === 'error' ? '#FFF5F5' : '#F0FFF4', color: message.type === 'error' ? '#C53030' : '#2C5F2D', border: `1px solid ${message.type === 'error' ? '#FED7D7' : '#C6F6D5'}`, fontWeight: 600 }}>
                    {message.text}
                </div>
            )}

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', margin: '1.5rem 0' }}>
                <div className="stat-card" style={{ borderLeft: '4px solid #48bb78' }}>
                    <div className="stat-value" style={{ color: '#2f855a', fontSize: '1.8rem' }}>{fmt(totalInvoiced)}</div>
                    <div className="stat-label">Total Invoiced</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #4299e1' }}>
                    <div className="stat-value" style={{ color: '#2b6cb0', fontSize: '1.8rem' }}>{fmt(totalPaid)}</div>
                    <div className="stat-label">Amount Received</div>
                </div>
                <div className="stat-card" style={{ borderLeft: '4px solid #ed8936' }}>
                    <div className="stat-value" style={{ color: '#c05621', fontSize: '1.8rem' }}>{fmt(totalOutstanding)}</div>
                    <div className="stat-label">Outstanding</div>
                </div>
            </div>

            {/* Generate Invoice Form */}
            {showGenerate && (
                <div className="form-section" style={{ marginBottom: '2rem' }}>
                    <h2>Generate Invoice for Completed Trip</h2>
                    <form onSubmit={handleGenerate} className="management-form">
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {['All', 'Pending', 'Partial', 'Paid'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                        style={{ padding: '0.4rem 0.8rem', borderRadius: '5px', border: '1px solid #e2e8f0', backgroundColor: filterStatus === s ? '#2C5F2D' : 'white', color: filterStatus === s ? 'white' : '#2d3748', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
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
                                const sc = statusColor(inv.payment_status);
                                return (
                                    <tr key={inv.invoice_id}>
                                        <td style={{ fontWeight: 600 }}>{inv.invoice_number}</td>
                                        <td>{inv.lr_number}</td>
                                        <td>{inv.source} → {inv.destination}</td>
                                        <td>{fmt(inv.subtotal)}</td>
                                        <td>{fmt(inv.gst_amount)}</td>
                                        <td style={{ fontWeight: 700 }}>{fmt(inv.total_amount)}</td>
                                        <td style={{ color: '#2f855a', fontWeight: 600 }}>{fmt(inv.amount_paid)}</td>
                                        <td>
                                            <span style={{ padding: '0.3rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                                                {inv.payment_status}
                                            </span>
                                        </td>
                                        <td>
                                            {inv.payment_status !== 'Paid' && (
                                                showPayment === inv.invoice_id ? (
                                                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                                                        <input type="number" placeholder="₹" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                                                            style={{ width: '80px', padding: '0.3rem', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }} min="1" />
                                                        <button onClick={() => handlePayment(inv.invoice_id)}
                                                            style={{ background: '#48bb78', color: 'white', border: 'none', borderRadius: '4px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>Pay</button>
                                                        <button onClick={() => { setShowPayment(null); setPaymentAmount(''); }}
                                                            style={{ background: '#e2e8f0', color: '#4a5568', border: 'none', borderRadius: '4px', padding: '0.3rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setShowPayment(inv.invoice_id)}
                                                        style={{ background: '#EBF8FF', color: '#2B6CB0', border: '1px solid #BEE3F8', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>
                                                        Record Payment
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {invoices.length === 0 && <tr><td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#718096' }}>No invoices found.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default InvoiceManagement;
