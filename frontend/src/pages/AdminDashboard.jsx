import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';

function AdminKpiSvg({ kind }) {
    const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

    if (kind === 'revenue') {
        return (
            <svg {...common} aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M7 10h10" />
                <path d="M7 14h7" />
                <text x="7" y="9" fontSize="4" fill="currentColor" stroke="none">Rs</text>
            </svg>
        );
    }

    if (kind === 'outstanding') {
        return (
            <svg {...common} aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4l3 2" />
            </svg>
        );
    }

    if (kind === 'expenses') {
        return (
            <svg {...common} aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M8 8h8" />
                <path d="M8 12h8" />
                <path d="M8 16h5" />
            </svg>
        );
    }

    return (
        <svg {...common} aria-hidden="true">
            <path d="M4 16V8" />
            <path d="M10 16V6" />
            <path d="M16 16v-5" />
            <path d="M20 8 15.2 3.2 11 7.4 8.2 4.6 4 8.8" />
        </svg>
    );
}

function AdminDashboard() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [fleetStats, setFleetStats] = useState({ trucks: 0, drivers: 0 });
    const [fleetMeta, setFleetMeta] = useState({
        fleet: [],
        running_count: 0,
        delayed_count: 0,
        average_eta_minutes: null,
        average_eta_text: 'No ETA data'
    });
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchAll = async (showLoader = false) => {
            try {
                if (showLoader && !cancelled) {
                    setLoading(true);
                }

                const [summaryRes, trucksRes, driversRes, notifRes, gpsRes] = await Promise.allSettled([
                    apiClient.get('/trips/analytics/summary'),
                    apiClient.get('/trucks'),
                    apiClient.get('/drivers'),
                    apiClient.get('/notifications'),
                    apiClient.get('/gps/fleet/live')
                ]);

                if (cancelled) {
                    return;
                }

                if (summaryRes.status === 'fulfilled' && summaryRes.value.data.success) {
                    setData(summaryRes.value.data.data);
                }

                const trucks = trucksRes.status === 'fulfilled' && trucksRes.value.data.success
                    ? trucksRes.value.data.data
                    : [];
                const drivers = driversRes.status === 'fulfilled' && driversRes.value.data.success
                    ? driversRes.value.data.data
                    : [];
                setFleetStats({ trucks: trucks.length, drivers: drivers.length });

                if (notifRes.status === 'fulfilled' && notifRes.value.data.success) {
                    setActivity(notifRes.value.data.data.slice(0, 6));
                }

                if (gpsRes.status === 'fulfilled' && gpsRes.value.data.success) {
                    setFleetMeta(gpsRes.value.data.data);
                } else {
                    setFleetMeta({
                        fleet: [],
                        running_count: 0,
                        delayed_count: 0,
                        average_eta_minutes: null,
                        average_eta_text: 'No ETA data'
                    });
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Error fetching dashboard:', error);
                }
            } finally {
                if (showLoader && !cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchAll(true);
        const intervalId = window.setInterval(() => fetchAll(false), 30000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    const fmt = (v) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
    const num = (v) => new Intl.NumberFormat('en-IN').format(v || 0);
    const L = loading ? '—' : null;

    const tc = data?.trip_counts || {};
    const ts = data?.truck_status || {};
    const ic = data?.invoice_counts || {};

    const dashboardDate = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    const collectionRate = data?.total_invoiced > 0
        ? ((Number(data.total_revenue) / Number(data.total_invoiced)) * 100)
        : 0;

    const completionRate = tc.total > 0 ? ((tc.completed / tc.total) * 100) : 0;
    const utilizationRate = ts.total > 0 ? (((ts.Assigned + ts.Maintenance) / ts.total) * 100) : 0;

    const expenseByMonth = (data?.monthly_expenses || []).reduce((acc, m) => {
        acc[m.month] = parseFloat(m.total) || 0;
        return acc;
    }, {});

    const liveFleet = fleetMeta.fleet || [];
    const liveMapPoints = liveFleet.flatMap((vehicle) => [
        vehicle.start_coord,
        vehicle.current_coord,
        vehicle.end_coord
    ].filter(Boolean));

    const liveMapBounds = liveMapPoints.length > 0
        ? liveMapPoints.reduce((acc, point) => ({
            minLat: Math.min(acc.minLat, point.latitude),
            maxLat: Math.max(acc.maxLat, point.latitude),
            minLng: Math.min(acc.minLng, point.longitude),
            maxLng: Math.max(acc.maxLng, point.longitude)
        }), {
            minLat: liveMapPoints[0].latitude,
            maxLat: liveMapPoints[0].latitude,
            minLng: liveMapPoints[0].longitude,
            maxLng: liveMapPoints[0].longitude
        })
        : null;

    const projectMapPoint = (point) => {
        if (!point || !liveMapBounds) {
            return null;
        }

        const latRange = Math.max(liveMapBounds.maxLat - liveMapBounds.minLat, 0.1);
        const lngRange = Math.max(liveMapBounds.maxLng - liveMapBounds.minLng, 0.1);

        const x = 8 + (((point.longitude - liveMapBounds.minLng) / lngRange) * 84);
        const y = 12 + ((1 - ((point.latitude - liveMapBounds.minLat) / latRange)) * 74);

        return {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2))
        };
    };

    const getVehicleTone = (delayRisk) => {
        if (delayRisk === 'high') return 'vehicle-danger';
        if (delayRisk === 'medium') return 'vehicle-warning';
        return 'vehicle-info';
    };

    const getDelayLabel = (delayRisk) => {
        if (delayRisk === 'high') return 'Delay Risk';
        if (delayRisk === 'medium') return 'Watch ETA';
        return 'On Track';
    };

    const monthlyCombined = (data?.monthly_trips || []).map((m) => ({
        month: m.month,
        month_label: m.month_label,
        revenue: parseFloat(m.revenue) || 0,
        completed: Number(m.completed) || 0,
        expenses: expenseByMonth[m.month] || 0
    }));

    const maxMonthRevenue = Math.max(...monthlyCombined.map(m => m.revenue), 1);
    const maxMonthExpense = Math.max(...monthlyCombined.map(m => m.expenses), 1);

    const alertItems = [
        {
            level: 'critical',
            title: 'Pending Collections',
            message: `${L || fmt(data?.total_outstanding)} is pending from customers`,
            meta: `${L || ic.pending || 0} invoices pending`
        },
        {
            level: 'warning',
            title: 'Maintenance Queue',
            message: `${L || ts.Maintenance || 0} trucks are under maintenance`,
            meta: 'Track expected service completion'
        },
        {
            level: fleetMeta.delayed_count > 0 ? 'warning' : 'info',
            title: 'Live Tracking',
            message: liveFleet.length > 0
                ? `${liveFleet.length} vehicles are reporting live mock GPS positions`
                : 'No running trips are available for live tracking',
            meta: liveFleet.length > 0
                ? `${fleetMeta.average_eta_text} average ETA`
                : 'Start a running trip to begin mock tracking'
        },
        {
            level: 'neutral',
            title: 'Route Reliability',
            message: `${L || tc.completed || 0} trips completed successfully`,
            meta: `${completionRate.toFixed(1)}% completion rate`
        }
    ];

    return (
        <>
            <header className="dashboard-header dashboard-header-premium">
                <div>
                    <h1>Dashboard Overview</h1>
                    <p>Welcome back, {user?.name}. Here is your live operations intelligence.</p>
                </div>
                <div className="dashboard-date-chip">{dashboardDate}</div>
            </header>

            <section className="analytics-kpi-row analytics-kpi-row-premium">
                <div className="analytics-kpi-card kpi-revenue premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="revenue" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_revenue)}</span>
                        <span className="kpi-label">Total Revenue</span>
                    </div>
                    <span className="kpi-trend kpi-trend-up">{collectionRate.toFixed(1)}% collected</span>
                </div>
                <div className="analytics-kpi-card kpi-outstanding premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="outstanding" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_outstanding)}</span>
                        <span className="kpi-label">Outstanding</span>
                    </div>
                    <span className="kpi-trend kpi-trend-warn">{L || ic.pending || 0} pending</span>
                </div>
                <div className="analytics-kpi-card kpi-expenses premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="expenses" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.total_expenses)}</span>
                        <span className="kpi-label">Total Expenses</span>
                    </div>
                    <span className="kpi-trend">{L || (data?.expense_categories?.length || 0)} categories</span>
                </div>
                <div className={`analytics-kpi-card premium-kpi-card ${(data?.net_profit || 0) >= 0 ? 'kpi-profit' : 'kpi-loss'}`}>
                    <div className="kpi-icon"><AdminKpiSvg kind="profit" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{L || fmt(data?.net_profit)}</span>
                        <span className="kpi-label">Net Profit</span>
                    </div>
                    <span className={`kpi-trend ${(data?.net_profit || 0) >= 0 ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
                        {(data?.total_revenue || 0) > 0 ? `${((data.net_profit / data.total_revenue) * 100).toFixed(1)}% margin` : 'No margin data'}
                    </span>
                </div>
            </section>

            <section className="premium-health-row">
                <article className="health-pill">
                    <span>Trip Completion</span>
                    <strong>{completionRate.toFixed(1)}%</strong>
                </article>
                <article className="health-pill">
                    <span>Fleet Utilization</span>
                    <strong>{utilizationRate.toFixed(1)}%</strong>
                </article>
                <article className="health-pill">
                    <span>Collection Efficiency</span>
                    <strong>{collectionRate.toFixed(1)}%</strong>
                </article>
            </section>

            <div className="premium-visual-grid">
                <section className="analytics-card premium-map-panel">
                    <div className="premium-panel-header">
                        <h3 className="analytics-card-title">Live Fleet Tracking</h3>
                        <span className="premium-badge">{liveFleet.length > 0 ? 'Mock GPS + ETA Live' : 'Awaiting running trips'}</span>
                    </div>
                    <div className="map-canvas-shell" role="img" aria-label="Live fleet tracking overview with mock GPS positions and ETA forecast">
                        <div className="map-grid-overlay" />
                        {liveFleet.length > 0 ? (
                            <>
                                <svg className="fleet-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                    {liveFleet.map((vehicle) => {
                                        const start = projectMapPoint(vehicle.start_coord);
                                        const current = projectMapPoint(vehicle.current_coord);
                                        const end = projectMapPoint(vehicle.end_coord);

                                        if (!start || !current || !end) {
                                            return null;
                                        }

                                        return (
                                            <g key={`route-${vehicle.trip_id}`}>
                                                <line className="fleet-route-base" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
                                                <line className="fleet-route-progress" x1={start.x} y1={start.y} x2={current.x} y2={current.y} />
                                            </g>
                                        );
                                    })}
                                </svg>

                                {liveFleet.map((vehicle) => {
                                    const start = projectMapPoint(vehicle.start_coord);
                                    const current = projectMapPoint(vehicle.current_coord);
                                    const end = projectMapPoint(vehicle.end_coord);

                                    if (!start || !current || !end) {
                                        return null;
                                    }

                                    return (
                                        <div key={`vehicle-${vehicle.trip_id}`}>
                                            <span
                                                className="fleet-endpoint"
                                                style={{ left: `${start.x}%`, top: `${start.y}%` }}
                                                title={vehicle.source}
                                            />
                                            <span
                                                className="fleet-endpoint fleet-endpoint--destination"
                                                style={{ left: `${end.x}%`, top: `${end.y}%` }}
                                                title={vehicle.destination}
                                            />
                                            <div
                                                className={`fleet-vehicle-pin ${getVehicleTone(vehicle.delay_risk)}`}
                                                style={{ left: `${current.x}%`, top: `${current.y}%` }}
                                                title={`${vehicle.truck_number} • ${vehicle.eta_text}`}
                                            >
                                                <span className="fleet-vehicle-dot" />
                                                <div className="fleet-vehicle-label">
                                                    <strong>{vehicle.truck_number}</strong>
                                                    <span>{vehicle.eta_text}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        ) : (
                            <div className="fleet-map-empty">
                                <div>
                                    <strong>No live fleet positions</strong>
                                    <p>Start a trip to let the mock GPS engine emit positions and ETA forecasts.</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="map-insight-row">
                        <div className="map-insight-item"><span>Running Trips</span><strong>{L || fleetMeta.running_count || 0}</strong></div>
                        <div className="map-insight-item"><span>Delay Risk</span><strong>{L || fleetMeta.delayed_count || 0}</strong></div>
                        <div className="map-insight-item"><span>Average ETA</span><strong>{loading ? '—' : fleetMeta.average_eta_text}</strong></div>
                    </div>
                    {liveFleet.length > 0 && (
                        <div className="fleet-live-list">
                            {liveFleet.slice(0, 4).map((vehicle) => (
                                <article key={`summary-${vehicle.trip_id}`} className="fleet-live-card">
                                    <div className="fleet-live-card-head">
                                        <div>
                                            <strong>{vehicle.truck_number}</strong>
                                            <div className="fleet-live-card-route">{vehicle.source} → {vehicle.destination}</div>
                                        </div>
                                        <span className={`fleet-risk-badge risk-${vehicle.delay_risk}`}>{getDelayLabel(vehicle.delay_risk)}</span>
                                    </div>
                                    <div className="fleet-live-metrics">
                                        <div className="fleet-live-metric">
                                            <span>Speed</span>
                                            <strong>{vehicle.speed_kmph} km/h</strong>
                                        </div>
                                        <div className="fleet-live-metric">
                                            <span>Progress</span>
                                            <strong>{vehicle.progress_percent}%</strong>
                                        </div>
                                        <div className="fleet-live-metric">
                                            <span>ETA</span>
                                            <strong>{vehicle.eta_text}</strong>
                                        </div>
                                    </div>
                                    <div className="fleet-live-meta">
                                        <span>{vehicle.ignition ? 'Ignition on' : 'Ignition off'}</span>
                                        <span>{new Date(vehicle.last_reported_at).toLocaleTimeString()}</span>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section className="analytics-card premium-alert-panel">
                    <h3 className="analytics-card-title">Alerts & Notifications</h3>
                    <div className="premium-alert-list">
                        {alertItems.map((item, index) => (
                            <article key={index} className={`premium-alert-item alert-${item.level}`}>
                                <div>
                                    <strong>{item.title}</strong>
                                    <p>{item.message}</p>
                                </div>
                                <small>{item.meta}</small>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            <div className="premium-bottom-grid">
                <section className="analytics-card premium-activity-table-card">
                    <div className="premium-panel-header">
                        <h3 className="analytics-card-title">Recent Activity Table</h3>
                        <span className="premium-badge muted">Last 5 completed trips</span>
                    </div>
                    <div className="premium-table-wrap">
                        <table className="data-table premium-table">
                            <thead>
                                <tr>
                                    <th>Date & Time</th>
                                    <th>Activity</th>
                                    <th>Details</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.recent_completed || []).length > 0 ? (
                                    data.recent_completed.map((trip) => (
                                        <tr key={trip.trip_id}>
                                            <td>{trip.end_time ? new Date(trip.end_time).toLocaleString() : '-'}</td>
                                            <td>Trip Completed</td>
                                            <td>{trip.lr_number} ({trip.source} → {trip.destination})</td>
                                            <td><span className="status-chip status-ok">Confirmed</span></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="empty-state">No recent completed trips</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="analytics-card premium-revenue-card">
                    <div className="premium-panel-header">
                        <h3 className="analytics-card-title">Revenue vs Expenses</h3>
                        <span className="premium-badge muted">Monthly trend</span>
                    </div>
                    {monthlyCombined.length > 0 ? (
                        <div className="premium-trend-list">
                            {monthlyCombined.map((m, idx) => (
                                <div className="premium-trend-row" key={idx}>
                                    <div className="trend-head">
                                        <span>{m.month_label}</span>
                                        <strong>{fmt(m.revenue)}</strong>
                                    </div>
                                    <div className="trend-bars">
                                        <div className="trend-bar-track">
                                            <div className="trend-bar-fill trend-revenue" style={{ width: `${(m.revenue / maxMonthRevenue) * 100}%` }} />
                                        </div>
                                        <div className="trend-bar-track">
                                            <div className="trend-bar-fill trend-expense" style={{ width: `${(m.expenses / maxMonthExpense) * 100}%` }} />
                                        </div>
                                    </div>
                                    <small>{m.completed} completed trips</small>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No monthly trend data yet</p>
                    )}
                </section>
            </div>

            <div className="analytics-two-col">
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

            <div className="analytics-three-col">
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
