import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/client';
import { microserviceClients } from '../api/microserviceClients';
import {
    buildTripInsightsFromVehicles,
    ensureTrackingSimulation,
    fetchLiveVehiclesWithFallback
} from '../services/liveTrackingService';

const DASHBOARD_CACHE_KEYS = {
    bookings: 'rks.dashboard.bookings.v1',
    fuelAnomalies: 'rks.dashboard.fuel-anomalies.v1',
    backhaulSuggestions: 'rks.dashboard.backhaul-suggestions.v1',
    operationalAlerts: 'rks.dashboard.operational-alerts.v1'
};

const SEEN_BOOKINGS_STORAGE_KEY = 'rks.dashboard.seen-bookings.v1';

const SERVICE_STATUS_LABELS = {
    checking: 'Checking',
    live: 'Live',
    cached: 'Cached',
    partial: 'Partial',
    fallback: 'Fallback',
    offline: 'Fallback'
};

const OPERATIONAL_ALERT_TYPES = new Set(['overspeed', 'idle_vehicle', 'no_progress_24h']);

function isOperationalAlertType(alertType) {
    return OPERATIONAL_ALERT_TYPES.has(String(alertType || '').toLowerCase());
}

function filterOperationalAlerts(alertRows) {
    if (!Array.isArray(alertRows)) {
        return [];
    }

    return alertRows.filter((alert) => isOperationalAlertType(alert?.alert_type));
}

function isStorageAvailable() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readDashboardCache(cacheKey, fallbackData = []) {
    if (!isStorageAvailable()) {
        return { data: fallbackData, updatedAt: null };
    }

    try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) {
            return { data: fallbackData, updatedAt: null };
        }

        const parsed = JSON.parse(raw);
        const data = Array.isArray(fallbackData)
            ? (Array.isArray(parsed.data) ? parsed.data : fallbackData)
            : (parsed.data ?? fallbackData);

        return {
            data,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null
        };
    } catch {
        return { data: fallbackData, updatedAt: null };
    }
}

function writeDashboardCache(cacheKey, data) {
    const updatedAt = new Date().toISOString();

    if (!isStorageAvailable()) {
        return updatedAt;
    }

    try {
        window.localStorage.setItem(cacheKey, JSON.stringify({ data, updatedAt }));
    } catch {
        // Ignore localStorage write failures and continue with live state.
    }

    return updatedAt;
}

function readSeenBookingIds() {
    if (!isStorageAvailable()) {
        return new Set();
    }

    try {
        const raw = window.localStorage.getItem(SEEN_BOOKINGS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) {
            return new Set();
        }

        return new Set(parsed.map((id) => String(id)));
    } catch {
        return new Set();
    }
}

function writeSeenBookingIds(ids) {
    if (!isStorageAvailable()) {
        return;
    }

    try {
        window.localStorage.setItem(SEEN_BOOKINGS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {
        // Ignore localStorage write failures and continue.
    }
}

function resolveTruckLabel({ truckId, truckNumber, truckLookup }) {
    if (truckNumber) {
        return truckNumber;
    }

    if (truckId !== undefined && truckId !== null) {
        const lookupValue = truckLookup.get(String(truckId));
        if (lookupValue) {
            return lookupValue;
        }

        return `#${truckId}`;
    }

    return 'System';
}

function latestTimestamp(values) {
    const timestamps = values
        .map((value) => Date.parse(value))
        .filter((value) => Number.isFinite(value));

    if (timestamps.length === 0) {
        return null;
    }

    return new Date(Math.max(...timestamps)).toISOString();
}

function createServiceStatus(state, detail = '', updatedAt = null) {
    return {
        state,
        label: SERVICE_STATUS_LABELS[state] || 'Unknown',
        detail,
        updatedAt
    };
}

function formatServiceStatusTitle(label, status) {
    const parts = [`${label}: ${status.label}`];

    if (status.detail) {
        parts.push(status.detail);
    }

    if (status.updatedAt) {
        parts.push(`Updated ${new Date(status.updatedAt).toLocaleString()}`);
    }

    return parts.join(' | ');
}

function ServiceStatusBadge({ label, status, compact = false }) {
    return (
        <span
            className={`service-status-badge ${status.state} ${compact ? 'compact' : ''}`}
            title={formatServiceStatusTitle(label, status)}
        >
            <span className="service-status-name">{label}</span>
            <span className="service-status-label">{status.label}</span>
        </span>
    );
}

function roundTo(value, digits = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Number(parsed.toFixed(digits));
}

function average(values) {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }

    const sum = values.reduce((acc, item) => acc + Number(item || 0), 0);
    return sum / values.length;
}

function formatEtaMinutes(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) {
        return 'N/A';
    }

    if (minutes <= 1) {
        return 'Arrived';
    }

    if (minutes < 60) {
        return `${Math.max(1, Math.round(minutes))} min`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function AdminKpiSvg({ kind }) {
    const common = {
        width: 20,
        height: 20,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
    };

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

    const [cacheSnapshot] = useState(() => ({
        bookings: readDashboardCache(DASHBOARD_CACHE_KEYS.bookings, []),
        fuelAnomalies: readDashboardCache(DASHBOARD_CACHE_KEYS.fuelAnomalies, []),
        backhaulSuggestions: readDashboardCache(DASHBOARD_CACHE_KEYS.backhaulSuggestions, []),
        operationalAlerts: readDashboardCache(DASHBOARD_CACHE_KEYS.operationalAlerts, [])
    }));

    const [data, setData] = useState(null);
    const [fleetStats, setFleetStats] = useState({ trucks: 0, drivers: 0 });
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(true);

    const [intelLoading, setIntelLoading] = useState(true);
    const [intelRefreshing, setIntelRefreshing] = useState(false);
    const [intelError, setIntelError] = useState('');
    const [intelNotice, setIntelNotice] = useState({ type: '', text: '' });
    const [serviceStatus, setServiceStatus] = useState(() => ({
        booking: cacheSnapshot.bookings.updatedAt
            ? createServiceStatus('cached', 'Using last known booking data', cacheSnapshot.bookings.updatedAt)
            : createServiceStatus('checking', 'Waiting for booking-service'),
        analytics: latestTimestamp([cacheSnapshot.fuelAnomalies.updatedAt, cacheSnapshot.backhaulSuggestions.updatedAt])
            ? createServiceStatus(
                'cached',
                'Using last known analytics data',
                latestTimestamp([cacheSnapshot.fuelAnomalies.updatedAt, cacheSnapshot.backhaulSuggestions.updatedAt])
            )
            : createServiceStatus('checking', 'Waiting for analytics-service'),
        alerts: cacheSnapshot.operationalAlerts.updatedAt
            ? createServiceStatus('cached', 'Using last known alert data', cacheSnapshot.operationalAlerts.updatedAt)
            : createServiceStatus('checking', 'Waiting for alert-service')
    }));

    const [liveVehicles, setLiveVehicles] = useState([]);
    const [tripInsights, setTripInsights] = useState([]);
    const [bookings, setBookings] = useState(cacheSnapshot.bookings.data);
    const [fuelAnomalies, setFuelAnomalies] = useState(cacheSnapshot.fuelAnomalies.data);
    const [backhaulSuggestions, setBackhaulSuggestions] = useState(cacheSnapshot.backhaulSuggestions.data);
    const [operationalAlerts, setOperationalAlerts] = useState(() => filterOperationalAlerts(cacheSnapshot.operationalAlerts.data));
    const [seenBookingIds, setSeenBookingIds] = useState(() => readSeenBookingIds());
    const [showSeenBookings, setShowSeenBookings] = useState(false);

    const visibleBookings = useMemo(() => {
        if (showSeenBookings) {
            return bookings;
        }

        return bookings.filter((booking) => !seenBookingIds.has(String(booking.id)));
    }, [bookings, showSeenBookings, seenBookingIds]);

    const unseenBookingsCount = useMemo(
        () => bookings.filter((booking) => !seenBookingIds.has(String(booking.id))).length,
        [bookings, seenBookingIds]
    );

    const overallKpis = useMemo(() => {
        const progressValues = tripInsights.map((trip) => Number(trip.progress_percent || 0));
        const etaValues = tripInsights
            .map((trip) => Number(trip.eta_minutes || 0))
            .filter((value) => Number.isFinite(value) && value > 0);

        return {
            runningTrips: tripInsights.length,
            avgProgress: roundTo(average(progressValues), 1),
            avgEta: etaValues.length > 0 ? roundTo(average(etaValues), 1) : null,
            operationalAlertCount: operationalAlerts.length,
            pendingBookings: bookings.filter((booking) => !seenBookingIds.has(String(booking.id))).length,
            reportingTrucks: liveVehicles.length
        };
    }, [tripInsights, bookings, liveVehicles, seenBookingIds, operationalAlerts]);

    const loadIntelligence = useCallback(async (withLoader = false) => {
        if (withLoader) {
            setIntelLoading(true);
        } else {
            setIntelRefreshing(true);
        }

        try {
            await ensureTrackingSimulation().catch(() => null);

            let alertsEvaluatorMode = 'microservices';
            const microAlertEvalWorked = await microserviceClients.alert.post('/alerts/evaluate')
                .then(() => true)
                .catch(() => false);

            if (!microAlertEvalWorked) {
                alertsEvaluatorMode = 'backend-fallback';
                await apiClient.post('/intelligence/alerts/evaluate').catch(() => null);
            }

            const [
                liveRes,
                bookingsRes,
                trucksRes,
                fuelRes,
                backhaulRes,
                alertsRes
            ] = await Promise.allSettled([
                fetchLiveVehiclesWithFallback(),
                microserviceClients.booking.get('/bookings?status=pending'),
                apiClient.get('/trucks'),
                microserviceClients.analytics.get('/analytics/fuel/anomalies'),
                microserviceClients.analytics.get('/analytics/backhaul/suggestions'),
                microserviceClients.alert.get('/alerts?limit=40')
            ]);

            const liveData = liveRes.status === 'fulfilled' ? (liveRes.value.liveVehicles || []) : [];
            const liveSource = liveRes.status === 'fulfilled' ? liveRes.value.source : 'unknown';
            const truckData = trucksRes.status === 'fulfilled' ? (trucksRes.value.data?.data || []) : [];
            const truckLabelLookup = new Map(
                truckData
                    .filter((truck) => truck?.truck_id !== undefined && truck?.truck_id !== null)
                    .map((truck) => [String(truck.truck_id), truck.truck_number])
            );

            const bookingsCache = readDashboardCache(DASHBOARD_CACHE_KEYS.bookings, []);
            const fuelCache = readDashboardCache(DASHBOARD_CACHE_KEYS.fuelAnomalies, []);
            const backhaulCache = readDashboardCache(DASHBOARD_CACHE_KEYS.backhaulSuggestions, []);
            const alertsCache = readDashboardCache(DASHBOARD_CACHE_KEYS.operationalAlerts, []);

            let pendingBookings = [];
            let bookingStatus = createServiceStatus('fallback', 'Using backend fallback for bookings');

            if (bookingsRes.status === 'fulfilled') {
                pendingBookings = bookingsRes.value.data?.data || [];
                const updatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.bookings, pendingBookings);
                bookingStatus = createServiceStatus('live', `${pendingBookings.length} requests available`, updatedAt);
            } else {
                const fallbackBookings = await apiClient.get('/intelligence/bookings?status=pending').catch(() => null);
                if (fallbackBookings?.data?.success) {
                    pendingBookings = fallbackBookings.data.data || [];
                    const updatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.bookings, pendingBookings);
                    bookingStatus = createServiceStatus('fallback', `${pendingBookings.length} requests via backend intelligence`, updatedAt);
                } else if (bookingsCache.updatedAt) {
                    pendingBookings = bookingsCache.data;
                    bookingStatus = createServiceStatus('cached', 'Using last known booking data', bookingsCache.updatedAt);
                } else {
                    bookingStatus = createServiceStatus('fallback', 'No pending booking data yet');
                }
            }

            let fuelData = [];
            let fuelSource = 'fallback';
            let fuelUpdatedAt = null;

            if (fuelRes.status === 'fulfilled') {
                fuelData = fuelRes.value.data?.data || [];
                fuelUpdatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.fuelAnomalies, fuelData);
                fuelSource = 'live';
            } else {
                const fallbackFuel = await apiClient.get('/intelligence/fuel/anomalies').catch(() => null);
                if (fallbackFuel?.data?.success) {
                    fuelData = fallbackFuel.data.data || [];
                    fuelUpdatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.fuelAnomalies, fuelData);
                    fuelSource = 'fallback';
                } else if (fuelCache.updatedAt) {
                    fuelData = fuelCache.data;
                    fuelUpdatedAt = fuelCache.updatedAt;
                    fuelSource = 'cached';
                } else {
                    fuelSource = 'fallback';
                }
            }

            let backhaulData = [];
            let backhaulSource = 'fallback';
            let backhaulUpdatedAt = null;

            if (backhaulRes.status === 'fulfilled') {
                backhaulData = backhaulRes.value.data?.data || [];
                backhaulUpdatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.backhaulSuggestions, backhaulData);
                backhaulSource = 'live';
            } else {
                const fallbackBackhaul = await apiClient.get('/intelligence/backhaul/suggestions').catch(() => null);
                if (fallbackBackhaul?.data?.success) {
                    backhaulData = fallbackBackhaul.data.data || [];
                    backhaulUpdatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.backhaulSuggestions, backhaulData);
                    backhaulSource = 'fallback';
                } else if (backhaulCache.updatedAt) {
                    backhaulData = backhaulCache.data;
                    backhaulUpdatedAt = backhaulCache.updatedAt;
                    backhaulSource = 'cached';
                } else {
                    backhaulSource = 'fallback';
                }
            }

            let analyticsStatus;
            const analyticsUpdatedAt = latestTimestamp([fuelUpdatedAt, backhaulUpdatedAt]);
            if (fuelSource === 'live' && backhaulSource === 'live') {
                analyticsStatus = createServiceStatus('live', 'Fuel and backhaul analytics are live', analyticsUpdatedAt);
            } else if (fuelSource === 'fallback' && backhaulSource === 'fallback') {
                analyticsStatus = createServiceStatus('fallback', 'Using backend analytics fallback', analyticsUpdatedAt);
            } else if (fuelSource === 'live' || backhaulSource === 'live') {
                analyticsStatus = createServiceStatus('partial', `Fuel ${fuelSource} · Backhaul ${backhaulSource}`, analyticsUpdatedAt);
            } else if (fuelSource === 'cached' && backhaulSource === 'cached') {
                analyticsStatus = createServiceStatus('cached', 'Using cached analytics data', analyticsUpdatedAt);
            } else if (fuelSource === 'cached' || backhaulSource === 'cached' || fuelSource === 'fallback' || backhaulSource === 'fallback') {
                analyticsStatus = createServiceStatus('partial', `Fuel ${fuelSource} · Backhaul ${backhaulSource}`, analyticsUpdatedAt);
            } else {
                analyticsStatus = createServiceStatus('fallback', 'Analytics data is currently limited', analyticsUpdatedAt);
            }

            let alertData = [];
            let alertStatus = createServiceStatus('fallback', 'Using backend fallback for alerts');

            if (alertsRes.status === 'fulfilled') {
                alertData = filterOperationalAlerts(alertsRes.value.data?.data || []);
                const updatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.operationalAlerts, alertData);
                alertStatus = createServiceStatus('live', `${alertData.length} alerts available`, updatedAt);
            } else {
                const fallbackAlerts = await apiClient.get('/intelligence/alerts?limit=40').catch(() => null);
                if (fallbackAlerts?.data?.success) {
                    alertData = filterOperationalAlerts(fallbackAlerts.data.data || []);
                    const updatedAt = writeDashboardCache(DASHBOARD_CACHE_KEYS.operationalAlerts, alertData);
                    alertStatus = createServiceStatus('fallback', `${alertData.length} alerts via backend intelligence`, updatedAt);
                } else if (alertsCache.updatedAt) {
                    alertData = filterOperationalAlerts(alertsCache.data);
                    alertStatus = createServiceStatus('cached', 'Using last known alert data', alertsCache.updatedAt);
                } else {
                    alertStatus = createServiceStatus('fallback', 'No alert data yet');
                }
            }

            const normalizedAlertData = alertData
                .map((alert) => ({
                    ...alert,
                    truck_number: resolveTruckLabel({
                        truckId: alert.truck_id,
                        truckNumber: alert.truck_number,
                        truckLookup: truckLabelLookup
                    })
                }));

            setLiveVehicles(liveData);
            setBookings(pendingBookings);
            setFuelAnomalies(fuelData);
            setBackhaulSuggestions(backhaulData);

            const insights = await buildTripInsightsFromVehicles(liveData);
            setTripInsights(insights);

            const derivedOperationalAlerts = normalizedAlertData;

            setOperationalAlerts(derivedOperationalAlerts);
            setServiceStatus({
                booking: bookingStatus,
                analytics: analyticsStatus,
                alerts: alertStatus
            });

            if (withLoader) {
                const fallbackServices = [bookingStatus, analyticsStatus, alertStatus]
                    .filter((status) => status.state === 'fallback')
                    .length;

                if (fallbackServices > 0 || liveSource === 'backend-mock') {
                    setIntelNotice({
                        type: 'success',
                        text: `Intelligence is active with resilient fallback mode (${fallbackServices} support services on backend fallback, alert evaluator: ${alertsEvaluatorMode}).`
                    });
                } else {
                    setIntelNotice({ type: '', text: '' });
                }
            }

            const hasAnyIntelligenceData =
                liveData.length > 0 ||
                pendingBookings.length > 0 ||
                fuelData.length > 0 ||
                backhaulData.length > 0 ||
                derivedOperationalAlerts.length > 0;

            if (!hasAnyIntelligenceData) {
                setIntelError('No intelligence data is available yet. Run the unified seed script and refresh.');
            } else {
                setIntelError('');
            }
        } catch (error) {
            setIntelError(error.message || 'Failed to load intelligence widgets');
        } finally {
            setIntelLoading(false);
            setIntelRefreshing(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchSummary = async (showLoader = false) => {
            try {
                if (showLoader && !cancelled) {
                    setLoading(true);
                }

                const [summaryRes, trucksRes, driversRes, notifRes] = await Promise.allSettled([
                    apiClient.get('/trips/analytics/summary'),
                    apiClient.get('/trucks'),
                    apiClient.get('/drivers'),
                    apiClient.get('/notifications')
                ]);

                if (cancelled) {
                    return;
                }

                if (summaryRes.status === 'fulfilled' && summaryRes.value.data.success) {
                    setData(summaryRes.value.data.data);
                }

                const trucksData = trucksRes.status === 'fulfilled' && trucksRes.value.data.success
                    ? trucksRes.value.data.data
                    : [];
                const driversData = driversRes.status === 'fulfilled' && driversRes.value.data.success
                    ? driversRes.value.data.data
                    : [];

                setFleetStats({ trucks: trucksData.length, drivers: driversData.length });

                if (notifRes.status === 'fulfilled' && notifRes.value.data.success) {
                    setActivity(notifRes.value.data.data.slice(0, 6));
                }
            } catch (error) {
                if (!cancelled) {
                    console.error('Error fetching dashboard summary:', error);
                }
            } finally {
                if (showLoader && !cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchSummary(true);
        const intervalId = window.setInterval(() => fetchSummary(false), 30000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, []);

    useEffect(() => {
        loadIntelligence(true);
        const intervalId = window.setInterval(() => loadIntelligence(false), 30000);

        return () => window.clearInterval(intervalId);
    }, [loadIntelligence]);

    const markBookingSeen = (bookingId) => {
        const next = new Set(seenBookingIds);
        next.add(String(bookingId));
        writeSeenBookingIds(next);
        setSeenBookingIds(next);
    };

    const markBookingUnseen = (bookingId) => {
        const next = new Set(seenBookingIds);
        next.delete(String(bookingId));
        writeSeenBookingIds(next);
        setSeenBookingIds(next);
    };

    const clearSeenBookings = () => {
        writeSeenBookingIds(new Set());
        setSeenBookingIds(new Set());
    };

    const fmt = (value) => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(value || 0);

    const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(value || 0);
    const loadingValue = loading ? '-' : null;

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

    const monthlyExpensesByMonth = (data?.monthly_expenses || []).reduce((acc, month) => {
        acc[month.month] = parseFloat(month.total) || 0;
        return acc;
    }, {});

    const monthlyCombined = (data?.monthly_trips || []).map((month) => ({
        month: month.month,
        month_label: month.month_label,
        revenue: parseFloat(month.revenue) || 0,
        completed: Number(month.completed) || 0,
        expenses: monthlyExpensesByMonth[month.month] || 0
    }));

    const maxTrendValue = Math.max(...monthlyCombined.flatMap((month) => [month.revenue, month.expenses]), 1);
    const fleetAvailableCount = Number(ts.Available || 0);
    const fleetAssignedCount = Number(ts.Assigned || 0);
    const fleetMaintenanceCount = Number(ts.Maintenance || 0);
    const fleetTrackedTotal = Math.max(
        Number(ts.total || 0),
        Number(fleetStats.trucks || 0),
        fleetAvailableCount + fleetAssignedCount + fleetMaintenanceCount
    );

    const assignedSharePercent = Math.round((fleetAssignedCount / Math.max(fleetTrackedTotal, 1)) * 100);
    const maintenanceSharePercent = Math.round((fleetMaintenanceCount / Math.max(fleetTrackedTotal, 1)) * 100);
    const availableSharePercent = Math.max(0, 100 - assignedSharePercent - maintenanceSharePercent);

    const fleetUtilizationPercent = Math.min(
        100,
        Math.round(
            ((fleetAssignedCount + fleetMaintenanceCount) /
                Math.max(fleetTrackedTotal || 1, 1)) * 100
        )
    );

    return (
        <>
            <header className="dashboard-header dashboard-header-premium">
                <div>
                    <h1>Dashboard Overview</h1>
                    <p>Welcome back, {user?.name}. Important operations and intelligence are prioritized below.</p>
                </div>
                <div className="dashboard-header-actions">
                    <Link to="/dashboard/admin/live-tracking" className="dashboard-inline-link">Live Fleet Tracking</Link>
                    <div className="dashboard-date-chip">{dashboardDate}</div>
                </div>
            </header>

            <section className="analytics-kpi-row analytics-kpi-row-premium">
                <div className="analytics-kpi-card kpi-revenue premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="revenue" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{loadingValue || fmt(data?.total_revenue)}</span>
                        <span className="kpi-label">Total Revenue</span>
                    </div>
                    <span className="kpi-trend kpi-trend-up">{collectionRate.toFixed(1)}% collected</span>
                </div>

                <div className="analytics-kpi-card kpi-outstanding premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="outstanding" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{loadingValue || fmt(data?.total_outstanding)}</span>
                        <span className="kpi-label">Outstanding</span>
                    </div>
                    <span className="kpi-trend kpi-trend-warn">{loadingValue || ic.pending || 0} pending</span>
                </div>

                <div className="analytics-kpi-card kpi-expenses premium-kpi-card">
                    <div className="kpi-icon"><AdminKpiSvg kind="expenses" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{loadingValue || fmt(data?.total_expenses)}</span>
                        <span className="kpi-label">Total Expenses</span>
                    </div>
                </div>

                <div className={`analytics-kpi-card premium-kpi-card ${(data?.net_profit || 0) >= 0 ? 'kpi-profit' : 'kpi-loss'}`}>
                    <div className="kpi-icon"><AdminKpiSvg kind="profit" /></div>
                    <div className="kpi-content">
                        <span className="kpi-value">{loadingValue || fmt(data?.net_profit)}</span>
                        <span className="kpi-label">Net Profit</span>
                    </div>
                    <span className={`kpi-trend ${(data?.net_profit || 0) >= 0 ? 'kpi-trend-up' : 'kpi-trend-down'}`}>
                        {(data?.total_revenue || 0) > 0 ? `${((data.net_profit / data.total_revenue) * 100).toFixed(1)}% margin` : 'No margin data'}
                    </span>
                </div>
            </section>

            <section className="analytics-card">
                <div className="analytics-card-header-row">
                    <h3 className="analytics-card-title">Operational Intelligence</h3>
                    <button
                        type="button"
                        className="intel-refresh-btn"
                        onClick={() => loadIntelligence(false)}
                        disabled={intelRefreshing || intelLoading}
                    >
                        {intelRefreshing ? 'Refreshing...' : 'Refresh Intelligence'}
                    </button>
                </div>

                {intelNotice.text && (
                    <div className={`intel-notice ${intelNotice.type}`}>
                        {intelNotice.text}
                    </div>
                )}

                {intelError && (
                    <p className="analytics-empty">{intelError}</p>
                )}

                <div className="dashboard-service-status-row">
                    <ServiceStatusBadge label="Booking Service" status={serviceStatus.booking} />
                    <ServiceStatusBadge label="Analytics Service" status={serviceStatus.analytics} />
                    <ServiceStatusBadge label="Alert Service" status={serviceStatus.alerts} />
                </div>

                <div className="intel-kpi-mini-grid">
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Live Running Trips</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.runningTrips}</strong>
                    </article>
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Pending Bookings</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.pendingBookings}</strong>
                    </article>
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Operational Alerts</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.operationalAlertCount}</strong>
                    </article>
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Average ETA</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.avgEta ? formatEtaMinutes(overallKpis.avgEta) : 'N/A'}</strong>
                    </article>
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Average Progress</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.avgProgress}%</strong>
                    </article>
                    <article className="intel-kpi-mini-card">
                        <span className="intel-kpi-mini-label">Trucks Reporting</span>
                        <strong className="intel-kpi-mini-value">{overallKpis.reportingTrucks}</strong>
                    </article>
                </div>
            </section>

            <p className="analytics-section-title">Action Queue</p>
            <section className="analytics-card" style={{ marginTop: '1.25rem' }}>
                <div className="analytics-card-header-row">
                    <h3 className="analytics-card-title">Pending Booking Requests</h3>
                    <div className="dashboard-card-meta">
                        <ServiceStatusBadge label="Booking" status={serviceStatus.booking} compact />
                        <span className="premium-badge muted">{unseenBookingsCount} unseen / {bookings.length} total</span>
                        <button
                            type="button"
                            className="intel-action-btn clear"
                            onClick={clearSeenBookings}
                            disabled={seenBookingIds.size === 0}
                        >
                            Clear Seen
                        </button>
                        <button
                            type="button"
                            className="intel-action-btn toggle"
                            onClick={() => setShowSeenBookings((current) => !current)}
                        >
                            {showSeenBookings ? 'Hide Seen' : 'Show Seen'}
                        </button>
                    </div>
                </div>
                {serviceStatus.booking.state !== 'live' && bookings.length > 0 && (
                    <p className="service-status-note">
                        Booking service is not fully live; showing last synchronized request queue.
                    </p>
                )}
                <div className="dashboard-table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Request</th>
                                <th>Booking</th>
                                <th>Seen</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleBookings.map((booking) => {
                                const isSeen = seenBookingIds.has(String(booking.id));

                                return (
                                <tr key={booking.id}>
                                    <td>
                                        <strong>{booking.customer_name}</strong>
                                        <br />
                                        {booking.contact_number}
                                    </td>
                                    <td>
                                        #{booking.id} • {booking.pickup_location} - {booking.destination}
                                        <br />
                                        {booking.load_type}, {booking.weight} tons
                                    </td>
                                    <td>
                                        INR {Number(booking.offered_price || 0).toLocaleString('en-IN')}
                                        <br />
                                        Pickup {booking.pickup_date ? new Date(booking.pickup_date).toLocaleDateString('en-IN') : 'N/A'}
                                    </td>
                                    <td>
                                        <button
                                            type="button"
                                            className={`intel-action-btn ${isSeen ? 'toggle' : 'clear'}`}
                                            onClick={() => (isSeen ? markBookingUnseen(booking.id) : markBookingSeen(booking.id))}
                                        >
                                            {isSeen ? 'Mark Unseen' : 'Mark Seen'}
                                        </button>
                                    </td>
                                </tr>
                                );
                            })}
                            {visibleBookings.length === 0 && (
                                <tr>
                                    <td colSpan="4">No booking requests to display.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="analytics-section-title">Operations Snapshot</p>
            <div className="analytics-two-col" style={{ marginTop: '1.25rem' }}>
                <section className="analytics-card">
                    <div className="analytics-card-header-row">
                        <h3 className="analytics-card-title">Fleet Status</h3>
                        <span className="premium-badge muted">{loadingValue || fleetTrackedTotal} trucks</span>
                    </div>
                    <div className="fleet-status-expanded">
                        <div className="fleet-management-counts">
                            <Link to="/lorries" className="fleet-management-link">
                                <span>Lorry Management</span>
                                <strong>{loadingValue || fleetTrackedTotal}</strong>
                                <small>Total trucks registered</small>
                            </Link>
                            <Link to="/drivers" className="fleet-management-link">
                                <span>Driver Management</span>
                                <strong>{loadingValue || fleetStats.drivers || 0}</strong>
                                <small>Total drivers available</small>
                            </Link>
                        </div>

                        <div className="fleet-status-concise-grid fill-space">
                            <article className="fleet-status-concise-item">
                                <span>Available</span>
                                <strong className="fleet-available">{loadingValue || fleetAvailableCount}</strong>
                            </article>
                            <article className="fleet-status-concise-item">
                                <span>Assigned</span>
                                <strong className="fleet-assigned">{loadingValue || fleetAssignedCount}</strong>
                            </article>
                            <article className="fleet-status-concise-item">
                                <span>Maintenance</span>
                                <strong className="fleet-maintenance">{loadingValue || fleetMaintenanceCount}</strong>
                            </article>
                            <article className="fleet-status-concise-item emphasis">
                                <span>Utilization</span>
                                <strong>{loadingValue || `${fleetUtilizationPercent}%`}</strong>
                            </article>
                        </div>

                        <div className="utilization-bar-wrap">
                            <div className="utilization-label">Fleet occupancy split</div>
                            <div className="utilization-bar">
                                <span className="utilization-segment seg-assigned" style={{ width: `${assignedSharePercent}%` }} />
                                <span className="utilization-segment seg-maintenance" style={{ width: `${maintenanceSharePercent}%` }} />
                                <span className="utilization-segment seg-available" style={{ width: `${availableSharePercent}%` }} />
                            </div>
                            <div className="utilization-legend">
                                <span><i className="dot dot-assigned" />Assigned {fleetAssignedCount}</span>
                                <span><i className="dot dot-maintenance" />Maintenance {fleetMaintenanceCount}</span>
                                <span><i className="dot dot-available" />Available {fleetAvailableCount}</span>
                            </div>
                        </div>
                    </div>
                    <p className="fleet-status-concise-note">
                        Truck and driver counts are synced from Lorry Management and Driver Management pages.
                    </p>
                </section>

                <section className="analytics-card">
                    <h3 className="analytics-card-title">Trip Overview</h3>
                    <div className="trip-breakdown-grid">
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value">{loadingValue || tc.total}</span>
                            <span className="trip-breakdown-label">Total</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-running">{loadingValue || tc.running}</span>
                            <span className="trip-breakdown-label">Running</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-planned">{loadingValue || tc.planned}</span>
                            <span className="trip-breakdown-label">Planned</span>
                        </div>
                        <div className="trip-breakdown-item">
                            <span className="trip-breakdown-value tb-cancelled">{loadingValue || tc.cancelled}</span>
                            <span className="trip-breakdown-label">Cancelled</span>
                        </div>
                    </div>
                    <div className="trip-extra-stats">
                        <div><span className="extra-label">Total Distance</span><span className="extra-value">{loadingValue || `${formatNumber(data?.total_distance)} km`}</span></div>
                        <div><span className="extra-label">Avg Freight</span><span className="extra-value">{loadingValue || fmt(data?.avg_freight)}</span></div>
                        <div><span className="extra-label">Avg Dead Mileage</span><span className="extra-value">{loadingValue || `${Number(data?.average_dead_mileage_percent || 0).toFixed(1)}%`}</span></div>
                    </div>
                </section>
            </div>

            <p className="analytics-section-title">Live Monitoring</p>
            <section className="analytics-card" style={{ marginTop: '1.25rem' }}>
                <div className="analytics-card-header-row">
                    <h3 className="analytics-card-title">Trip Progress and ETA</h3>
                    <span className="premium-badge muted">{liveVehicles.length} live vehicles / {tripInsights.length} trip rows</span>
                </div>
                <div className="dashboard-table-wrap">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Trip</th>
                                <th>Route</th>
                                <th>Progress</th>
                                <th>ETA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tripInsights.map((trip) => (
                                <tr key={trip.trip_id}>
                                    <td>#{trip.trip_id} / Truck {trip.truck_id}</td>
                                    <td>{trip.source} - {trip.destination}</td>
                                    <td>{roundTo(trip.progress_percent, 1)}%</td>
                                    <td>{formatEtaMinutes(trip.eta_minutes)}</td>
                                </tr>
                            ))}
                            {tripInsights.length === 0 && (
                                <tr>
                                    <td colSpan="4">No running trips are currently streaming GPS logs.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="analytics-section-title">Exceptions</p>
            <div className="analytics-two-col" style={{ marginTop: '1.25rem' }}>
                <section className="analytics-card">
                    <div className="analytics-card-header-row">
                        <h3 className="analytics-card-title">Fuel Anomalies</h3>
                        <ServiceStatusBadge label="Analytics" status={serviceStatus.analytics} compact />
                    </div>
                    <ul className="intel-list-compact">
                        {fuelAnomalies.map((item) => (
                            <li key={item.trip_id}>
                                Trip #{item.trip_id}: actual {item.actual_fuel}L vs expected {item.expected_fuel}L
                            </li>
                        ))}
                        {fuelAnomalies.length === 0 && <li>No fuel anomalies detected.</li>}
                    </ul>
                </section>

                <section className="analytics-card">
                    <div className="analytics-card-header-row">
                        <h3 className="analytics-card-title">Operational Alerts</h3>
                        <ServiceStatusBadge label="Alerts" status={serviceStatus.alerts} compact />
                    </div>
                    <ul className="intel-list-compact">
                        {operationalAlerts.slice(0, 18).map((alert, index) => (
                            <li key={alert.id || `${alert.alert_type}-${index}`}>
                                <strong>{alert.truck_number ? `Truck ${alert.truck_number}` : 'System'}</strong>
                                {' • '}
                                <span>{alert.alert_type}</span>
                                {': '}
                                {alert.description}
                            </li>
                        ))}
                        {operationalAlerts.length === 0 && <li>No operational alerts available.</li>}
                    </ul>
                </section>
            </div>

            <section className="analytics-card" style={{ marginTop: '1.25rem' }}>
                <div className="analytics-card-header-row">
                    <h3 className="analytics-card-title">Backhaul Opportunities</h3>
                    <ServiceStatusBadge label="Analytics" status={serviceStatus.analytics} compact />
                </div>
                <ul className="intel-list-compact">
                    {backhaulSuggestions.map((item) => (
                        <li key={`${item.trip_id}-${item.booking_id}`}>
                            Truck {item.truck_id}: pickup within {item.distance_to_pickup_km} km for booking #{item.booking_id}
                        </li>
                    ))}
                    {backhaulSuggestions.length === 0 && <li>No backhaul opportunities found right now.</li>}
                </ul>
            </section>

            <p className="analytics-section-title">Performance Insights</p>
            <div className="premium-bottom-grid" style={{ marginTop: '1.25rem' }}>
                <section className="analytics-card premium-activity-table-card">
                    <div className="premium-panel-header">
                        <h3 className="analytics-card-title">Recent Activity Table</h3>
                        <span className="premium-badge muted">Latest updates</span>
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
                                {activity.length > 0 ? (
                                    activity.map((item) => (
                                        <tr key={item.notification_id}>
                                            <td>{item.created_at ? new Date(item.created_at).toLocaleString() : '-'}</td>
                                            <td>{item.type || 'Notification'}</td>
                                            <td>{item.message}</td>
                                            <td><span className="status-chip status-ok">Visible</span></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="empty-state">No recent activity</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="analytics-card premium-revenue-card">
                    <div className="premium-panel-header">
                        <h3 className="analytics-card-title">Revenue vs Expenses</h3>
                        <span className="premium-badge muted">Last 6 months from records</span>
                    </div>
                    {monthlyCombined.length > 0 ? (
                        <div className="revexp-trend-alt">
                            {monthlyCombined.map((month, index) => (
                                <article className="revexp-alt-row" key={index}>
                                    <div className="revexp-alt-head">
                                        <strong>{month.month_label}</strong>
                                        <span className={`revexp-net-chip ${(month.revenue - month.expenses) >= 0 ? 'positive' : 'negative'}`}>
                                            {(month.revenue - month.expenses) >= 0 ? '+' : ''}{fmt(month.revenue - month.expenses)}
                                        </span>
                                    </div>
                                    <div className="revexp-alt-lane">
                                        <span>Revenue</span>
                                        <div className="revexp-alt-track">
                                            <div className="revexp-alt-fill revenue" style={{ width: `${(month.revenue / maxTrendValue) * 100}%` }} />
                                        </div>
                                        <strong>{fmt(month.revenue)}</strong>
                                    </div>
                                    <div className="revexp-alt-lane">
                                        <span>Expense</span>
                                        <div className="revexp-alt-track">
                                            <div className="revexp-alt-fill expense" style={{ width: `${(month.expenses / maxTrendValue) * 100}%` }} />
                                        </div>
                                        <strong>{fmt(month.expenses)}</strong>
                                    </div>
                                    <small>{month.completed} completed trips</small>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="analytics-empty">No monthly trend data yet</p>
                    )}
                </section>
            </div>

            <section className="analytics-card" style={{ marginTop: '1.25rem' }}>
                <h3 className="analytics-card-title">Top Routes</h3>
                {data?.top_routes?.length > 0 ? (
                    <div className="top-routes-list">
                        {data.top_routes.map((route, index) => (
                            <div key={index} className="route-row">
                                <span className="route-rank">#{index + 1}</span>
                                <div className="route-info">
                                    <span className="route-path">{route.source} - {route.destination}</span>
                                    <span className="route-meta">{route.trip_count} trips - {fmt(route.total_revenue)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="analytics-empty">No route data yet</p>
                )}
            </section>
        </>
    );
}

export default AdminDashboard;
