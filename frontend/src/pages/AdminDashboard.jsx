import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function AdminDashboard() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [fleetStats, setFleetStats] = useState({ trucks: 0, drivers: 0 });
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [summaryRes, trucksRes, driversRes, notifRes] = await Promise.all([
                    apiClient.get('/trips/analytics/summary'),
                    apiClient.get('/trucks'),
                    apiClient.get('/drivers'),
                    apiClient.get('/notifications')
                ]);

                if (summaryRes.data.success) setData(summaryRes.data.data);

                const trucks = trucksRes.data.success ? trucksRes.data.data : [];
                const drivers = driversRes.data.success ? driversRes.data.data : [];
                setFleetStats({ trucks: trucks.length, drivers: drivers.length });

                if (notifRes.data.success) setActivity(notifRes.data.data.slice(0, 6));
            } catch (error) {
                console.error('Error fetching dashboard:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
    const num = (v) => new Intl.NumberFormat('en-IN').format(v || 0);
    const L = loading ? '—' : null;

    const tc = data?.trip_counts || {};
    const ts = data?.truck_status || {};
    const ic = data?.invoice_counts || {};

    // Compute bar chart max for monthly trends
    const maxMonthlyRevenue = Math.max(...(data?.monthly_trips || []).map(m => parseFloat(m.revenue) || 0), 1);
    const maxExpenseMonth = Math.max(...(data?.monthly_expenses || []).map(m => parseFloat(m.total) || 0), 1);

    return (
        <>
            <header className="dashboard-header">
                <h1>Dashboard</h1>
                <p>Welcome back, {user?.name}</p>
            </header>

            {/* Financial KPIs — Top row */}
            <section className="analytics-kpi-row">
                <div className="analytics-kpi-card kpi-revenue">
                    <div className="kpi-icon">&#8377;</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_revenue)}</span>
                        <span className="kpi-label">Total Revenue</span>
                    </div>
                </div>
                <div className="analytics-kpi-card kpi-outstanding">
                    <div className="kpi-icon">&#9201;</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_outstanding)}</span>
                        <span className="kpi-label">Outstanding</span>
                    </div>
                </div>
                <div className="analytics-kpi-card kpi-expenses">
                    <div className="kpi-icon">&#9660;</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_expenses)}</span>
                        <span className="kpi-label">Total Expenses</span>
                    </div>
                </div>
                <div className={`analytics-kpi-card ${(data?.net_profit || 0) >= 0 ? 'kpi-profit' : 'kpi-loss'}`}>
                    <div className="kpi-icon">{(data?.net_profit || 0) >= 0 ? '&#9650;' : '&#9660;'}</div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.net_profit)}</span>
                        <span className="kpi-label">Net Profit</span>
                    </div>
                </div>
            </section>

            {/* Two-column grid: Fleet + Trip stats */}
            <div className="analytics-two-col">
                {/* Fleet Status */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Fleet Status</h3>
                    <div className="fleet-status-grid">
                        <div className="fleet-stat">
                            <span className="fleet-stat-value">{L || fleetStats.trucks}</span>
                            <span className="fleet-stat-label">Total Trucks</span>
                        </div>
                        <div className="fleet-stat">
                            <span className="fleet-stat-value">{L || fleetStats.drivers}</span>
                            <span className="fleet-stat-label">Total Drivers</span>
                        </div>
                        <div className="fleet-stat">
                            <span className="fleet-stat-value fleet-available">{L || ts.Available}</span>
                            <span className="fleet-stat-label">Available</span>
                        </div>
                        <div className="fleet-stat">
                            <span className="fleet-stat-value fleet-assigned">{L || ts.Assigned}</span>
                            <span className="fleet-stat-label">Assigned</span>
                        </div>
                        <div className="fleet-stat">
                            <span className="fleet-stat-value fleet-maintenance">{L || ts.Maintenance}</span>
                            <span className="fleet-stat-label">Maintenance</span>
                        </div>
                    </div>
                    {/* Truck utilization bar */}
                    {!loading && ts.total > 0 && (
                        <div className="utilization-bar-wrap">
                            <div className="utilization-label">Utilization</div>
                            <div className="utilization-bar">
                                <div className="utilization-segment seg-assigned" style={{ width: `${(ts.Assigned / ts.total) * 100}%` }} title={`Assigned: ${ts.Assigned}`} />
                                <div className="utilization-segment seg-maintenance" style={{ width: `${(ts.Maintenance / ts.total) * 100}%` }} title={`Maintenance: ${ts.Maintenance}`} />
                                <div className="utilization-segment seg-available" style={{ width: `${(ts.Available / ts.total) * 100}%` }} title={`Available: ${ts.Available}`} />
                            </div>
                            <div className="utilization-legend">
                                <span><i className="dot dot-assigned" /> Assigned</span>
                                <span><i className="dot dot-maintenance" /> Maintenance</span>
                                <span><i className="dot dot-available" /> Available</span>
                            </div>
                        </div>
                    )}
                </section>

                {/* Trip breakdown */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Trip Overview</h3>
                    <div className="trip-breakdown-grid">
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value">{L || tc.total}</span>
                            <span className="trip-breakdown-label">Total</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-running">{L || tc.running}</span>
                            <span className="trip-breakdown-label">Running</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-planned">{L || tc.planned}</span>
                            <span className="trip-breakdown-label">Planned</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-completed">{L || tc.completed}</span>
                            <span className="trip-breakdown-label">Completed</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-cancelled">{L || tc.cancelled}</span>
                            <span className="trip-breakdown-label">Cancelled</span>
                        </div>
                    </div>
                    <div className="trip-extra-stats">
                        <div><span className="extra-label">Total Distance</span><span className="extra-value">{L || `${num(data?.total_distance)} km`}</span></div>
                        <div><span className="extra-label">Avg Freight</span><span className="extra-value">{L || fmt(data?.avg_freight)}</span></div>
                        <div><span className="extra-label">Avg Dead Mileage</span><span className="extra-value">{L || `${Number(data?.average_dead_mileage_percent || 0).toFixed(1)}%`}</span></div>
                    </div>
                </section>
            </div>

            {/* Monthly Revenue Trend — simple bar chart */}
            <div className="analytics-two-col">
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Monthly Revenue</h3>
                    {data?.monthly_trips?.length > 0 ? (
                        <div className="bar-chart">
                            {data.monthly_trips.map((m, i) => (
                                <div key={i} className="bar-col">
                                    <div className="bar-value">{fmt(m.revenue)}</div>
                                    <div className="bar-track">
                                        <div className="bar-fill bar-fill-green" style={{ height: `${(parseFloat(m.revenue) / maxMonthlyRevenue) * 100}%` }} />
                                    </div>
                                    <div className="bar-label">{m.month_label}</div>
                                    <div className="bar-sub">{m.completed} trips</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No monthly data yet</p>
                    )}
                </section>

                <section className="analytics-card">
                    <h3 className="analytics-card-title">Monthly Expenses</h3>
                    {data?.monthly_expenses?.length > 0 ? (
                        <div className="bar-chart">
                            {data.monthly_expenses.map((m, i) => (
                                <div key={i} className="bar-col">
                                    <div className="bar-value">{fmt(m.total)}</div>
                                    <div className="bar-track">
                                        <div className="bar-fill bar-fill-red" style={{ height: `${(parseFloat(m.total) / maxExpenseMonth) * 100}%` }} />
                                    </div>
                                    <div className="bar-label">{m.month_label}</div>
                                    <div className="bar-sub">{m.entries} entries</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No expense data yet</p>
                    )}
                </section>
            </div>

            {/* Expense breakdown + Invoice status + Top Routes */}
            <div className="analytics-three-col">
                {/* Expense Categories */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Expense Breakdown</h3>
                    {data?.expense_categories?.length > 0 ? (
                        <div className="category-list">
                            {data.expense_categories.map((cat, i) => {
                                const totalExp = parseFloat(data.total_expenses) || 1;
                                const pct = ((parseFloat(cat.total) / totalExp) * 100).toFixed(1);
                                return (
                                    <div key={i} className="category-row">
                                        <div className="category-info">
                                            <span className="category-name">{cat.category}</span>
                                            <span className="category-amount">{fmt(cat.total)}</span>
                                        </div>
                                        <div className="category-bar-track">
                                            <div className="category-bar-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="category-pct">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="analytics-empty">No expenses recorded</p>
                    )}
                </section>

                {/* Invoice Status */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Invoice Status</h3>
                    <div className="invoice-status-grid">
                        <div className="invoice-stat">
                            <span className="invoice-stat-value">{L || ic.total}</span>
                            <span className="invoice-stat-label">Total</span>
                        </div>
                        <div className="invoice-stat inv-paid">
                            <span className="invoice-stat-value">{L || ic.paid}</span>
                            <span className="invoice-stat-label">Paid</span>
                        </div>
                        <div className="invoice-stat inv-partial">
                            <span className="invoice-stat-value">{L || ic.partial}</span>
                            <span className="invoice-stat-label">Partial</span>
                        </div>
                        <div className="invoice-stat inv-pending">
                            <span className="invoice-stat-value">{L || ic.pending}</span>
                            <span className="invoice-stat-label">Pending</span>
                        </div>
                    </div>
                    <div className="invoice-total-row">
                        <span>Total Invoiced</span>
                        <strong>{L || fmt(data?.total_invoiced)}</strong>
                    </div>
                </section>

                {/* Top Routes */}
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Top Routes</h3>
                    {data?.top_routes?.length > 0 ? (
                        <div className="top-routes-list">
                            {data.top_routes.map((r, i) => (
                                <div key={i} className="route-row">
                                    <span className="route-rank">#{i + 1}</span>
                                    <div className="route-info">
                                        <span className="route-path">{r.source} → {r.destination}</span>
                                        <span className="route-meta">{r.trip_count} trips &middot; {fmt(r.total_revenue)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No route data yet</p>
                    )}
                </section>
            </div>

            {/* Recent Activity + Recent Completed */}
            <div className="analytics-two-col">
                <section className="analytics-card">
                    <h3 className="analytics-card-title">Recent Activity</h3>
                    {activity.length > 0 ? (
                        <div className="activity-feed">
                            {activity.map(a => (
                                <div key={a.notification_id} className={`activity-item activity-${a.type}`}>
                                    <span className="activity-msg">{a.message}</span>
                                    <small className="activity-time">{new Date(a.created_at).toLocaleString()}</small>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No recent activity</p>
                    )}
                </section>

                <section className="analytics-card">
                    <h3 className="analytics-card-title">Recent Completed Trips</h3>
                    {data?.recent_completed?.length > 0 ? (
                        <div className="recent-trips-list">
                            {data.recent_completed.map(t => (
                                <div key={t.trip_id} className="recent-trip-row">
                                    <div className="recent-trip-info">
                                        <strong>{t.lr_number}</strong>
                                        <span>{t.source} → {t.destination}</span>
                                    </div>
                                    <div className="recent-trip-meta">
                                        <span className="recent-trip-amount">{fmt(t.base_freight)}</span>
                                        <small>{t.truck_number} &middot; {t.driver_name}</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No completed trips yet</p>
                    )}
                </section>
            </div>

            {/* Quick Actions */}
            <h3 className="analytics-section-title">Quick Actions</h3>
            <section className="action-grid">
                <Link to="/lorries" className="action-card"><h3>Lorries &rarr;</h3><p>Manage trucks, status & fitness expiry</p></Link>
                <Link to="/drivers" className="action-card"><h3>Drivers &rarr;</h3><p>Register drivers and view details</p></Link>
                <Link to="/trips" className="action-card"><h3>Trips &rarr;</h3><p>Create trips, track running lorries</p></Link>
                <Link to="/fuel" className="action-card"><h3>Fuel &rarr;</h3><p>Fuel entries & efficiency analytics</p></Link>
                <Link to="/maintenance" className="action-card"><h3>Maintenance &rarr;</h3><p>Vehicle servicing & fleet health</p></Link>
                <Link to="/expenses" className="action-card"><h3>Expenses &rarr;</h3><p>Operational expense ledger</p></Link>
                <Link to="/invoices" className="action-card"><h3>Invoices &rarr;</h3><p>Generate & track invoice payments</p></Link>
            </section>
        </>
    );
}

export default AdminDashboard;
