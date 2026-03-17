#!/usr/bin/env node
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argSet = new Set(args);

const HELP_TEXT = [
    'RKS readiness check runner',
    '',
    'Usage:',
    '  node src/scripts/readinessCheck.js',
    '  node src/scripts/readinessCheck.js --strict',
    '  node src/scripts/readinessCheck.js --output=readiness-report.json',
    '',
    'Options:',
    '  --strict               Treat warnings as failures (non-zero exit code).',
    '  --output=<filePath>    Write JSON report to the provided file path.',
    '  --help                 Show this help message.'
].join('\n');

if (argSet.has('--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
}

const strictWarnings = argSet.has('--strict');
const outputArg = args.find((entry) => entry.startsWith('--output='));
const outputPath = outputArg ? outputArg.slice('--output='.length).trim() : '';

const DEFAULT_TIMEOUT_MS = Number(process.env.READINESS_TIMEOUT_MS || 15000);

const backendBaseUrl = normalizeBaseUrl(process.env.BACKEND_BASE_URL || 'http://localhost:3000');
const backendApiBaseUrl = normalizeBaseUrl(
    process.env.BACKEND_API_URL ||
    process.env.VITE_BACKEND_API_URL ||
    `${backendBaseUrl}/api`
);

const serviceBaseUrls = {
    backend: backendBaseUrl,
    auth: normalizeBaseUrl(process.env.AUTH_SERVICE_URL || 'http://localhost:3101'),
    fleet: normalizeBaseUrl(process.env.FLEET_SERVICE_URL || 'http://localhost:3102'),
    trip: normalizeBaseUrl(process.env.TRIP_SERVICE_URL || 'http://localhost:3103'),
    booking: normalizeBaseUrl(process.env.BOOKING_SERVICE_URL || 'http://localhost:3104'),
    tracking: normalizeBaseUrl(process.env.TRACKING_SERVICE_URL || 'http://localhost:3105'),
    mockGps: normalizeBaseUrl(process.env.MOCK_GPS_SERVICE_URL || 'http://localhost:3106'),
    analytics: normalizeBaseUrl(process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3107'),
    alert: normalizeBaseUrl(process.env.ALERT_SERVICE_URL || 'http://localhost:3108'),
    ml: normalizeBaseUrl(process.env.ML_SERVICE_URL || 'http://localhost:8000')
};

const adminCredentials = {
    emails: parseCsvList(process.env.READINESS_ADMIN_EMAILS || process.env.READINESS_ADMIN_EMAIL || 'admin@rks.com'),
    password: process.env.READINESS_ADMIN_PASSWORD || '1234'
};

const driverCredentials = {
    emails: parseCsvList(
        process.env.READINESS_DRIVER_EMAILS ||
        process.env.READINESS_DRIVER_EMAIL ||
        'driver.abi@rks.com,driver.ravi@rks.com,driver.mani@rks.com,driver.selva@rks.com,driver.yasin@rks.com,driver.arun@rks.com'
    ),
    password: process.env.READINESS_DRIVER_PASSWORD || '1234'
};

const runtimeOpenRouteServiceKey = String(process.env.OPENROUTESERVICE_API_KEY || '').trim();
const allowedOperationalAlertTypes = new Set(['overspeed', 'idle_vehicle', 'no_progress_24h']);

const results = [];
const context = {
    serviceHealth: {
        backend: false,
        auth: false,
        fleet: false,
        trip: false,
        booking: false,
        tracking: false,
        mockGps: false,
        analytics: false,
        alert: false,
        ml: false
    },
    adminAuth: null,
    driverAuth: null,
    driverProfile: null,
    activeTripId: null,
    backendLiveRows: [],
    microLiveRows: []
};

function normalizeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function parseCsvList(value) {
    return String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

function buildUrl(baseUrl, endpointPath) {
    const normalizedPath = String(endpointPath || '').startsWith('/')
        ? endpointPath
        : `/${endpointPath}`;
    return `${normalizeBaseUrl(baseUrl)}${normalizedPath}`;
}

function toNumber(value, fallback = NaN) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function asList(value) {
    return Array.isArray(value) ? value : [];
}

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function requestJson(url, options = {}) {
    const {
        method = 'GET',
        token,
        body,
        expectedStatus,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        headers = {}
    } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const requestHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };

        if (token) {
            requestHeaders.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
        });

        const responseText = await response.text();
        let json = null;
        if (responseText) {
            try {
                json = JSON.parse(responseText);
            } catch {
                json = null;
            }
        }

        if (expectedStatus !== undefined) {
            const expectedStatuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
            if (!expectedStatuses.includes(response.status)) {
                const preview = responseText ? responseText.slice(0, 220) : '';
                throw new Error(`Expected status ${expectedStatuses.join('/')}, got ${response.status}. ${preview}`.trim());
            }
        }

        return {
            status: response.status,
            ok: response.ok,
            json,
            text: responseText
        };
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw new Error(`${method} ${url} timed out after ${timeoutMs}ms`);
        }

        const causeMessage = error?.cause?.message ? ` (${error.cause.message})` : '';
        throw new Error(`${method} ${url} failed: ${error.message}${causeMessage}`);
    } finally {
        clearTimeout(timer);
    }
}

function pushResult({ name, status, details }) {
    const item = {
        name,
        status,
        details,
        timestamp: new Date().toISOString()
    };
    results.push(item);

    const symbol = status === 'PASS'
        ? '[PASS]'
        : status === 'FAIL'
            ? '[FAIL]'
            : status === 'WARN'
                ? '[WARN]'
                : '[SKIP]';
    console.log(`${symbol} ${name}: ${details}`);
}

async function runCheck(name, fn) {
    try {
        const details = await fn();
        pushResult({ name, status: 'PASS', details: details || 'OK' });
        return true;
    } catch (error) {
        pushResult({ name, status: 'FAIL', details: error.message || String(error) });
        return false;
    }
}

function runWarning(name, details) {
    pushResult({ name, status: 'WARN', details });
}

function runSkip(name, details) {
    pushResult({ name, status: 'SKIP', details });
}

async function loginWithCandidates(candidates, password) {
    let lastError = null;

    for (const email of candidates) {
        try {
            const response = await requestJson(buildUrl(backendApiBaseUrl, '/auth/login'), {
                method: 'POST',
                expectedStatus: 200,
                body: { email, password }
            });

            const token = response.json?.token;
            const user = response.json?.user;

            assertCondition(Boolean(token), `Missing token for ${email}`);
            assertCondition(Boolean(user?.role), `Missing user role for ${email}`);

            return {
                email,
                token,
                user
            };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('No credential candidates were provided.');
}

function getResultCount(status) {
    return results.filter((item) => item.status === status).length;
}

async function checkServiceHealth(serviceKey, endpointPath = '/health') {
    const serviceUrl = serviceBaseUrls[serviceKey];
    return runCheck(`Health ${serviceKey}`, async () => {
        const response = await requestJson(buildUrl(serviceUrl, endpointPath), {
            expectedStatus: 200
        });

        context.serviceHealth[serviceKey] = true;
        return `Reachable at ${serviceUrl} (status ${response.status})`;
    });
}

function parseOutputPath(filePath) {
    if (!filePath) {
        return null;
    }

    return path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);
}

function summarizeAndExit() {
    const passCount = getResultCount('PASS');
    const failCount = getResultCount('FAIL');
    const warnCount = getResultCount('WARN');
    const skipCount = getResultCount('SKIP');

    console.log('\nReadiness summary');
    console.log(`  Pass: ${passCount}`);
    console.log(`  Fail: ${failCount}`);
    console.log(`  Warn: ${warnCount}`);
    console.log(`  Skip: ${skipCount}`);

    const report = {
        generated_at: new Date().toISOString(),
        strict_mode: strictWarnings,
        config: {
            backend_base_url: backendBaseUrl,
            backend_api_base_url: backendApiBaseUrl,
            service_base_urls: serviceBaseUrls,
            admin_email_candidates: adminCredentials.emails,
            driver_email_candidates: driverCredentials.emails,
            has_runtime_openrouteservice_key: Boolean(runtimeOpenRouteServiceKey)
        },
        summary: {
            pass: passCount,
            fail: failCount,
            warn: warnCount,
            skip: skipCount
        },
        results
    };

    const finalOutputPath = parseOutputPath(outputPath);
    if (finalOutputPath) {
        fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
        fs.writeFileSync(finalOutputPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`Report written to ${finalOutputPath}`);
    }

    if (failCount > 0 || (strictWarnings && warnCount > 0)) {
        process.exitCode = 1;
        return;
    }

    process.exitCode = 0;
}

async function checkEnvExamples() {
    const backendEnvExamplePath = path.resolve(__dirname, '../../.env.example');
    const microEnvExamplePath = path.resolve(__dirname, '../../../microservices/.env.example');

    await runCheck('Backend env example has routing keys', async () => {
        const raw = fs.readFileSync(backendEnvExamplePath, 'utf8');
        const requiredKeys = [
            'GPS_ROUTE_ENGINE',
            'OPENROUTESERVICE_API_KEY',
            'BACKEND_TRACKING_HISTORY_ROUTE_MAX_WAYPOINTS'
        ];

        for (const key of requiredKeys) {
            assertCondition(raw.includes(`${key}=`), `Missing ${key} in backend/.env.example`);
        }

        return 'Required backend routing env keys found.';
    });

    await runCheck('Microservices env example has routing keys', async () => {
        const raw = fs.readFileSync(microEnvExamplePath, 'utf8');
        const requiredKeys = [
            'GPS_ROUTE_PROVIDER',
            'GPS_ROUTE_ENGINE',
            'OPENROUTESERVICE_API_KEY',
            'TRACKING_HISTORY_ROUTE_MAX_WAYPOINTS'
        ];

        for (const key of requiredKeys) {
            assertCondition(raw.includes(`${key}=`), `Missing ${key} in microservices/.env.example`);
        }

        return 'Required microservice routing env keys found.';
    });

    if (!runtimeOpenRouteServiceKey) {
        runWarning(
            'Runtime OpenRouteService key',
            'OPENROUTESERVICE_API_KEY is not set in this shell, so roadway provider checks rely on fallback behavior only.'
        );
    } else {
        pushResult({
            name: 'Runtime OpenRouteService key',
            status: 'PASS',
            details: 'OPENROUTESERVICE_API_KEY detected in environment.'
        });
    }
}

async function checkAuthenticationAndRoles() {
    if (!context.serviceHealth.backend) {
        runSkip('Backend admin login', 'Skipped because backend health check failed.');
        runSkip('Backend driver login', 'Skipped because backend health check failed.');
        runSkip('Protected route requires auth', 'Skipped because backend login is unavailable.');
        runSkip('Driver blocked from admin expenses', 'Skipped because backend login is unavailable.');
        runSkip('Admin can access expenses', 'Skipped because backend login is unavailable.');
        return;
    }

    await runCheck('Backend admin login', async () => {
        context.adminAuth = await loginWithCandidates(adminCredentials.emails, adminCredentials.password);
        assertCondition(context.adminAuth.user.role === 'admin', `Expected admin role, got ${context.adminAuth.user.role}`);
        return `Logged in as ${context.adminAuth.email}`;
    });

    await runCheck('Backend driver login', async () => {
        context.driverAuth = await loginWithCandidates(driverCredentials.emails, driverCredentials.password);
        assertCondition(context.driverAuth.user.role === 'driver', `Expected driver role, got ${context.driverAuth.user.role}`);
        return `Logged in as ${context.driverAuth.email}`;
    });

    await runCheck('Protected route requires auth', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/trips'), {
            expectedStatus: [401, 403]
        });
        return `Unauthenticated status ${response.status}`;
    });

    if (!context.driverAuth?.token) {
        runSkip('Driver blocked from admin expenses', 'Skipped because driver login failed.');
    } else {
        await runCheck('Driver blocked from admin expenses', async () => {
            const response = await requestJson(buildUrl(backendApiBaseUrl, '/expenses'), {
                token: context.driverAuth.token,
                expectedStatus: 403
            });
            return `Driver correctly blocked with status ${response.status}`;
        });
    }

    if (!context.adminAuth?.token) {
        runSkip('Admin can access expenses', 'Skipped because admin login failed.');
    } else {
        await runCheck('Admin can access expenses', async () => {
            const response = await requestJson(buildUrl(backendApiBaseUrl, '/expenses'), {
                token: context.adminAuth.token,
                expectedStatus: 200
            });
            assertCondition(Array.isArray(response.json?.data), 'Expenses response must include array data');
            return `Expenses rows: ${response.json.data.length}`;
        });
    }
}

async function checkAdminFeatureCoverage() {
    if (!context.adminAuth?.token) {
        const reason = 'Skipped because admin login failed.';
        runSkip('Admin trip analytics summary', reason);
        runSkip('Admin invoices dashboard KPIs', reason);
        runSkip('Admin trucks listing', reason);
        runSkip('Admin drivers listing', reason);
        runSkip('Admin notifications feed', reason);
        runSkip('Intelligence bookings endpoint', reason);
        runSkip('Intelligence fuel anomalies endpoint', reason);
        runSkip('Intelligence backhaul suggestions endpoint', reason);
        runSkip('Intelligence alerts endpoint policy', reason);
        runSkip('Intelligence alerts evaluation trigger', reason);
        runSkip('Intelligence ML model catalog', reason);
        return;
    }

    await runCheck('Admin trip analytics summary', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/trips/analytics/summary'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const data = response.json?.data;
        assertCondition(data && typeof data === 'object', 'Missing analytics data payload');

        const revenue = toNumber(data.total_revenue, NaN);
        const expenses = toNumber(data.total_expenses, NaN);
        const netProfit = toNumber(data.net_profit, NaN);
        const computed = revenue - expenses;

        assertCondition(Number.isFinite(revenue), 'total_revenue is not numeric');
        assertCondition(Number.isFinite(expenses), 'total_expenses is not numeric');
        assertCondition(Number.isFinite(netProfit), 'net_profit is not numeric');
        assertCondition(Math.abs(netProfit - computed) <= 1, `net_profit mismatch: expected ${computed}, got ${netProfit}`);

        const runningCount = toNumber(data.running_trips_count, NaN);
        const runningBreakdown = toNumber(data.trip_counts?.running, NaN);
        assertCondition(Number.isFinite(runningCount), 'running_trips_count is not numeric');
        assertCondition(Number.isFinite(runningBreakdown), 'trip_counts.running is not numeric');

        return `Revenue ${revenue.toFixed(2)}, expenses ${expenses.toFixed(2)}, net profit validated.`;
    });

    await runCheck('Admin invoices dashboard KPIs', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/invoices/dashboard'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const data = response.json?.data;
        assertCondition(data && typeof data === 'object', 'Missing invoice dashboard data');

        const requiredNumericKeys = ['total_invoiced', 'total_revenue', 'total_outstanding', 'total_expenses', 'net_profit'];
        for (const key of requiredNumericKeys) {
            const value = toNumber(data[key], NaN);
            assertCondition(Number.isFinite(value), `${key} is not numeric`);
        }

        assertCondition(data.invoice_counts && typeof data.invoice_counts === 'object', 'Missing invoice_counts object');

        return 'Invoice KPI payload includes computed financial aggregates.';
    });

    await runCheck('Admin trucks listing', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/trucks'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const rows = asList(response.json?.data);
        assertCondition(rows.length > 0, 'No trucks returned');
        return `Trucks returned: ${rows.length}`;
    });

    await runCheck('Admin drivers listing', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/drivers'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const rows = asList(response.json?.data);
        assertCondition(rows.length > 0, 'No drivers returned');
        return `Drivers returned: ${rows.length}`;
    });

    await runCheck('Admin notifications feed', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/notifications'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        assertCondition(Array.isArray(response.json?.data), 'Notifications data must be an array');
        assertCondition(Number.isFinite(toNumber(response.json?.unread_count, NaN)), 'unread_count must be numeric');
        return `Notifications fetched: ${response.json.data.length}`;
    });

    await runCheck('Intelligence bookings endpoint', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/bookings?status=pending'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        assertCondition(Array.isArray(response.json?.data), 'Bookings data must be an array');
        return `Pending bookings returned: ${response.json.data.length}`;
    });

    await runCheck('Intelligence fuel anomalies endpoint', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/fuel/anomalies'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const rows = asList(response.json?.data);
        for (const row of rows) {
            assertCondition(Number.isFinite(toNumber(row.expected_fuel, NaN)), 'expected_fuel must be numeric');
            assertCondition(Number.isFinite(toNumber(row.actual_fuel, NaN)), 'actual_fuel must be numeric');
            assertCondition(row.is_anomaly === true, 'An anomaly row must have is_anomaly=true');
        }

        return `Fuel anomalies checked: ${rows.length}`;
    });

    await runCheck('Intelligence backhaul suggestions endpoint', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/backhaul/suggestions'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        assertCondition(Array.isArray(response.json?.data), 'Backhaul suggestions data must be an array');
        return `Backhaul suggestions returned: ${response.json.data.length}`;
    });

    await runCheck('Intelligence alerts endpoint policy', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/alerts?limit=40'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const rows = asList(response.json?.data);
        const invalid = rows.find((row) => !allowedOperationalAlertTypes.has(String(row.alert_type || '')));
        assertCondition(!invalid, `Found alert type outside operational policy: ${invalid?.alert_type}`);

        return `Alerts validated against operational policy. Rows: ${rows.length}`;
    });

    await runCheck('Intelligence alerts evaluation trigger', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/alerts/evaluate'), {
            method: 'POST',
            token: context.adminAuth.token,
            body: {},
            expectedStatus: 200
        });

        const created = toNumber(response.json?.alerts_created, NaN);
        assertCondition(Number.isFinite(created), 'alerts_created must be numeric');

        return `Alert evaluation executed. Alerts created: ${created}`;
    });

    await runCheck('Intelligence ML model catalog', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/intelligence/ml/models'), {
            token: context.adminAuth.token,
            expectedStatus: 200
        });

        const rows = asList(response.json?.data);
        assertCondition(rows.length >= 4, 'Expected at least 4 model catalog entries');

        const endpoints = new Set(rows.map((row) => row.endpoint));
        assertCondition(endpoints.has('/predict/eta'), 'Missing /predict/eta model entry');
        assertCondition(endpoints.has('/predict/delay'), 'Missing /predict/delay model entry');

        return `Model catalog entries: ${rows.length}`;
    });
}

async function checkDriverFeatureCoverage() {
    if (!context.driverAuth?.token) {
        const reason = 'Skipped because driver login failed.';
        runSkip('Driver profile by user id', reason);
        runSkip('Driver trips listing', reason);
        runSkip('Driver trip history statistics', reason);
        runSkip('Driver notifications listing', reason);
        runSkip('Driver mark notifications read', reason);
        return;
    }

    await runCheck('Driver profile by user id', async () => {
        const userId = context.driverAuth.user.id;
        const response = await requestJson(buildUrl(backendApiBaseUrl, `/drivers/user/${encodeURIComponent(String(userId))}`), {
            token: context.driverAuth.token,
            expectedStatus: 200
        });

        const profile = response.json?.data;
        assertCondition(profile && typeof profile === 'object', 'Missing driver profile payload');
        assertCondition(Number.isFinite(toNumber(profile.driver_id, NaN)), 'driver_id must be numeric');

        context.driverProfile = profile;
        return `Driver profile loaded (driver_id=${profile.driver_id})`;
    });

    if (!context.driverProfile?.driver_id) {
        runSkip('Driver trips listing', 'Skipped because driver profile lookup failed.');
        runSkip('Driver trip history statistics', 'Skipped because driver profile lookup failed.');
    } else {
        await runCheck('Driver trips listing', async () => {
            const response = await requestJson(
                buildUrl(backendApiBaseUrl, `/trips?driver_id=${encodeURIComponent(String(context.driverProfile.driver_id))}`),
                {
                    token: context.driverAuth.token,
                    expectedStatus: 200
                }
            );

            const rows = asList(response.json?.data);
            const active = rows.find((row) => String(row.status || '').toLowerCase() === 'running');
            const planned = rows.find((row) => String(row.status || '').toLowerCase() === 'planned');

            context.activeTripId = active?.trip_id || planned?.trip_id || context.activeTripId;
            return `Driver trips returned: ${rows.length}${context.activeTripId ? ` (trip candidate ${context.activeTripId})` : ''}`;
        });

        await runCheck('Driver trip history statistics', async () => {
            const response = await requestJson(
                buildUrl(backendApiBaseUrl, `/trips/driver/${encodeURIComponent(String(context.driverProfile.driver_id))}/history`),
                {
                    token: context.driverAuth.token,
                    expectedStatus: 200
                }
            );

            const statistics = response.json?.data?.statistics;
            assertCondition(statistics && typeof statistics === 'object', 'Missing trip history statistics object');

            const keys = ['total_trips', 'completed_trips', 'total_distance', 'total_revenue'];
            for (const key of keys) {
                assertCondition(Number.isFinite(toNumber(statistics[key], NaN)), `${key} is not numeric`);
            }

            return `Driver history stats validated for driver_id=${context.driverProfile.driver_id}`;
        });
    }

    await runCheck('Driver notifications listing', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/notifications'), {
            token: context.driverAuth.token,
            expectedStatus: 200
        });

        assertCondition(Array.isArray(response.json?.data), 'Driver notifications data must be array');
        return `Driver notifications returned: ${response.json.data.length}`;
    });

    await runCheck('Driver mark notifications read', async () => {
        const response = await requestJson(buildUrl(backendApiBaseUrl, '/notifications/read-all'), {
            method: 'PUT',
            token: context.driverAuth.token,
            body: {},
            expectedStatus: 200
        });

        assertCondition(response.json?.success === true, 'Expected success=true from mark read-all');
        return 'Driver notifications mark-all-read endpoint works.';
    });
}

async function checkTrackingCoverage() {
    if (context.serviceHealth.mockGps) {
        await runCheck('Mock GPS simulation start', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.mockGps, '/mock-gps/start'), {
                method: 'POST',
                body: {},
                expectedStatus: 200
            });

            assertCondition(response.json?.success === true, 'Mock GPS start did not return success=true');
            return 'Mock GPS service accepted start.';
        });

        await runCheck('Mock GPS simulation tick', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.mockGps, '/mock-gps/tick'), {
                method: 'POST',
                body: {},
                expectedStatus: 200
            });

            assertCondition(response.json?.success === true, 'Mock GPS tick did not return success=true');
            return 'Mock GPS service advanced one tick.';
        });
    } else {
        runSkip('Mock GPS simulation start', 'Skipped because mock-gps health failed.');
        runSkip('Mock GPS simulation tick', 'Skipped because mock-gps health failed.');
    }

    if (context.serviceHealth.backend) {
        await runCheck('Backend tracking bootstrap endpoint', async () => {
            const response = await requestJson(buildUrl(backendApiBaseUrl, '/tracking/bootstrap'), {
                method: 'POST',
                body: {},
                expectedStatus: 200
            });

            assertCondition(response.json?.success === true, 'Backend tracking bootstrap did not return success=true');
            return `Started trips count: ${toNumber(response.json?.count, 0)}`;
        });

        await runCheck('Backend live tracking feed', async () => {
            const response = await requestJson(buildUrl(backendApiBaseUrl, '/tracking/live'), {
                expectedStatus: 200
            });

            const rows = asList(response.json?.data);
            for (const row of rows) {
                const progress = toNumber(row.trip_progress, NaN);
                assertCondition(progress >= 0 && progress <= 1, 'trip_progress must be between 0 and 1');
            }

            context.backendLiveRows = rows;

            if (!context.activeTripId && rows[0]?.trip_id) {
                context.activeTripId = rows[0].trip_id;
            }

            return `Backend live rows: ${rows.length}${context.activeTripId ? ` (trip candidate ${context.activeTripId})` : ''}`;
        });
    } else {
        runSkip('Backend tracking bootstrap endpoint', 'Skipped because backend health failed.');
        runSkip('Backend live tracking feed', 'Skipped because backend health failed.');
    }

    if (context.serviceHealth.tracking) {
        await runCheck('Microservice live tracking feed', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.tracking, '/tracking/live'), {
                expectedStatus: 200
            });

            const rows = asList(response.json?.data);
            for (const row of rows) {
                const progress = toNumber(row.trip_progress, NaN);
                assertCondition(progress >= 0 && progress <= 1, 'trip_progress must be between 0 and 1');
            }

            context.microLiveRows = rows;

            if (!context.activeTripId && rows[0]?.trip_id) {
                context.activeTripId = rows[0].trip_id;
            }

            return `Microservice live rows: ${rows.length}${context.activeTripId ? ` (trip candidate ${context.activeTripId})` : ''}`;
        });
    } else {
        runSkip('Microservice live tracking feed', 'Skipped because tracking-service health failed.');
    }

    if (!context.activeTripId) {
        runWarning(
            'Active trip candidate for detail checks',
            'No running/planned trip id found from driver trips or live tracking feeds; detail-level ETA checks skipped.'
        );
        runSkip('Backend trip tracking detail contract', 'No trip id available.');
        runSkip('Microservice trip tracking detail contract', 'No trip id available.');
        return;
    }

    if (context.serviceHealth.backend) {
        await runCheck('Backend trip tracking detail contract', async () => {
            const response = await requestJson(
                buildUrl(backendApiBaseUrl, `/tracking/trip/${encodeURIComponent(String(context.activeTripId))}`),
                {
                    expectedStatus: 200
                }
            );

            const trip = response.json?.data;
            assertCondition(trip && typeof trip === 'object', 'Missing tracking trip data');

            const progress = toNumber(trip.progress, NaN);
            const progressPercent = toNumber(trip.progress_percent, NaN);
            const etaMinutes = toNumber(trip.eta_minutes, NaN);
            const delayRisk = toNumber(trip.delay_risk_percentage, NaN);

            assertCondition(progress >= 0 && progress <= 1, 'progress must be between 0 and 1');
            assertCondition(progressPercent >= 0 && progressPercent <= 100, 'progress_percent must be between 0 and 100');
            assertCondition(etaMinutes >= 0, 'eta_minutes must be non-negative');
            assertCondition(delayRisk >= 0 && delayRisk <= 100, 'delay_risk_percentage must be between 0 and 100');
            assertCondition(Array.isArray(trip.route), 'route must be an array');

            return `Backend trip detail validated for trip ${context.activeTripId}`;
        });
    } else {
        runSkip('Backend trip tracking detail contract', 'Skipped because backend health failed.');
    }

    if (context.serviceHealth.tracking) {
        await runCheck('Microservice trip tracking detail contract', async () => {
            const response = await requestJson(
                buildUrl(serviceBaseUrls.tracking, `/tracking/trip/${encodeURIComponent(String(context.activeTripId))}`),
                {
                    expectedStatus: 200
                }
            );

            const trip = response.json?.data;
            assertCondition(trip && typeof trip === 'object', 'Missing tracking trip data');

            const progress = toNumber(trip.progress, NaN);
            const progressPercent = toNumber(trip.progress_percent, NaN);
            const etaMinutes = toNumber(trip.eta_minutes, NaN);
            const delayRisk = toNumber(trip.delay_risk_percentage, NaN);
            const routeSource = String(trip.route_source || '').trim();
            const etaSource = String(trip.eta_source || '').trim();

            assertCondition(progress >= 0 && progress <= 1, 'progress must be between 0 and 1');
            assertCondition(progressPercent >= 0 && progressPercent <= 100, 'progress_percent must be between 0 and 100');
            assertCondition(etaMinutes >= 0, 'eta_minutes must be non-negative');
            assertCondition(delayRisk >= 0 && delayRisk <= 100, 'delay_risk_percentage must be between 0 and 100');
            assertCondition(Array.isArray(trip.route), 'route must be an array');
            assertCondition(routeSource.length > 0, 'route_source is required');
            assertCondition(etaSource.length > 0, 'eta_source is required');

            if (runtimeOpenRouteServiceKey && etaSource !== 'roadway') {
                runWarning(
                    'Roadway ETA source with runtime key',
                    `Trip ${context.activeTripId} returned eta_source=${etaSource}. Expected roadway when external routing key is active.`
                );
            }

            return `Microservice trip detail validated for trip ${context.activeTripId} (route_source=${routeSource}, eta_source=${etaSource})`;
        });
    } else {
        runSkip('Microservice trip tracking detail contract', 'Skipped because tracking-service health failed.');
    }
}

async function checkMicroserviceFeatureCoverage() {
    if (context.serviceHealth.fleet) {
        await runCheck('Fleet service trucks contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.fleet, '/fleet/trucks'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'fleet trucks payload must include data array');
            return `Fleet trucks rows: ${response.json.data.length}`;
        });

        await runCheck('Fleet service drivers contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.fleet, '/fleet/drivers'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'fleet drivers payload must include data array');
            return `Fleet drivers rows: ${response.json.data.length}`;
        });
    } else {
        runSkip('Fleet service trucks contract', 'Skipped because fleet-service health failed.');
        runSkip('Fleet service drivers contract', 'Skipped because fleet-service health failed.');
    }

    if (context.serviceHealth.trip) {
        await runCheck('Trip service listing contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.trip, '/trips?status=Running'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'trip listing payload must include data array');
            return `Trip-service running rows: ${response.json.data.length}`;
        });
    } else {
        runSkip('Trip service listing contract', 'Skipped because trip-service health failed.');
    }

    if (context.serviceHealth.booking) {
        await runCheck('Booking service listing contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.booking, '/bookings?status=pending'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'booking listing payload must include data array');
            return `Booking pending rows: ${response.json.data.length}`;
        });
    } else {
        runSkip('Booking service listing contract', 'Skipped because booking-service health failed.');
    }

    if (context.serviceHealth.analytics) {
        await runCheck('Analytics fuel anomalies contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.analytics, '/analytics/fuel/anomalies'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'analytics fuel anomalies payload must include data array');
            return `Analytics anomalies rows: ${response.json.data.length}`;
        });

        await runCheck('Analytics backhaul suggestions contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.analytics, '/analytics/backhaul/suggestions'), {
                expectedStatus: 200
            });

            assertCondition(Array.isArray(response.json?.data), 'analytics backhaul payload must include data array');
            return `Analytics backhaul rows: ${response.json.data.length}`;
        });

        await runCheck('Analytics overview computed KPIs', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.analytics, '/analytics/overview'), {
                expectedStatus: 200
            });

            const data = response.json?.data;
            assertCondition(data && typeof data === 'object', 'Missing analytics overview payload');

            const anomalyCount = toNumber(data.fuel_anomaly_count, NaN);
            const pendingCount = toNumber(data.pending_booking_count, NaN);

            assertCondition(Number.isFinite(anomalyCount), 'fuel_anomaly_count must be numeric');
            assertCondition(Number.isFinite(pendingCount), 'pending_booking_count must be numeric');

            return `Overview counts validated (anomalies=${anomalyCount}, pending=${pendingCount})`;
        });
    } else {
        runSkip('Analytics fuel anomalies contract', 'Skipped because analytics-service health failed.');
        runSkip('Analytics backhaul suggestions contract', 'Skipped because analytics-service health failed.');
        runSkip('Analytics overview computed KPIs', 'Skipped because analytics-service health failed.');
    }

    if (context.serviceHealth.alert) {
        await runCheck('Alert listing policy contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.alert, '/alerts?limit=40'), {
                expectedStatus: 200
            });

            const rows = asList(response.json?.data);
            const invalid = rows.find((row) => !allowedOperationalAlertTypes.has(String(row.alert_type || '')));
            assertCondition(!invalid, `Found out-of-policy alert type: ${invalid?.alert_type}`);

            return `Alert rows validated: ${rows.length}`;
        });

        await runCheck('Alert service evaluate contract', async () => {
            const response = await requestJson(buildUrl(serviceBaseUrls.alert, '/alerts/evaluate'), {
                method: 'POST',
                body: {},
                expectedStatus: 200
            });

            assertCondition(Number.isFinite(toNumber(response.json?.alerts_created, NaN)), 'alerts_created must be numeric');
            return `Alerts created: ${toNumber(response.json?.alerts_created, 0)}`;
        });
    } else {
        runSkip('Alert listing policy contract', 'Skipped because alert-service health failed.');
        runSkip('Alert service evaluate contract', 'Skipped because alert-service health failed.');
    }
}

async function checkMlCalculations() {
    if (!context.serviceHealth.ml) {
        runSkip('ML model catalog endpoint', 'Skipped because ml-service health failed.');
        runSkip('ML ETA monotonic calculations', 'Skipped because ml-service health failed.');
        runSkip('ML delay risk sensitivity', 'Skipped because ml-service health failed.');
        return;
    }

    await runCheck('ML model catalog endpoint', async () => {
        const response = await requestJson(buildUrl(serviceBaseUrls.ml, '/models'), {
            expectedStatus: 200
        });

        const models = asList(response.json?.models);
        assertCondition(models.length >= 4, 'Expected at least 4 ML model descriptors');
        return `ML models listed: ${models.length}`;
    });

    await runCheck('ML ETA monotonic calculations', async () => {
        const common = {
            historical_avg_speed: 55,
            trip_distance: 300,
            road_type: 'mixed'
        };

        const [shortDistance, longDistance, fastSpeed, slowSpeed] = await Promise.all([
            requestJson(buildUrl(serviceBaseUrls.ml, '/predict/eta'), {
                method: 'POST',
                expectedStatus: 200,
                body: {
                    ...common,
                    distance_remaining: 120,
                    current_speed: 50
                }
            }),
            requestJson(buildUrl(serviceBaseUrls.ml, '/predict/eta'), {
                method: 'POST',
                expectedStatus: 200,
                body: {
                    ...common,
                    distance_remaining: 360,
                    current_speed: 50
                }
            }),
            requestJson(buildUrl(serviceBaseUrls.ml, '/predict/eta'), {
                method: 'POST',
                expectedStatus: 200,
                body: {
                    ...common,
                    distance_remaining: 180,
                    current_speed: 80
                }
            }),
            requestJson(buildUrl(serviceBaseUrls.ml, '/predict/eta'), {
                method: 'POST',
                expectedStatus: 200,
                body: {
                    ...common,
                    distance_remaining: 180,
                    current_speed: 20
                }
            })
        ]);

        const etaShort = toNumber(shortDistance.json?.eta_minutes, NaN);
        const etaLong = toNumber(longDistance.json?.eta_minutes, NaN);
        const etaFast = toNumber(fastSpeed.json?.eta_minutes, NaN);
        const etaSlow = toNumber(slowSpeed.json?.eta_minutes, NaN);

        assertCondition(Number.isFinite(etaShort), 'Short-distance ETA is not numeric');
        assertCondition(Number.isFinite(etaLong), 'Long-distance ETA is not numeric');
        assertCondition(Number.isFinite(etaFast), 'Fast-speed ETA is not numeric');
        assertCondition(Number.isFinite(etaSlow), 'Slow-speed ETA is not numeric');

        assertCondition(etaLong > etaShort, `Expected etaLong (${etaLong}) > etaShort (${etaShort})`);
        assertCondition(etaSlow > etaFast, `Expected etaSlow (${etaSlow}) > etaFast (${etaFast})`);

        return `ETA monotonicity validated (short=${etaShort}, long=${etaLong}, fast=${etaFast}, slow=${etaSlow})`;
    });

    await runCheck('ML delay risk sensitivity', async () => {
        const now = Date.now();
        const highRiskResponse = await requestJson(buildUrl(serviceBaseUrls.ml, '/predict/delay'), {
            method: 'POST',
            expectedStatus: 200,
            body: {
                planned_arrival_time: new Date(now + (20 * 60 * 1000)).toISOString(),
                predicted_eta: 180,
                trip_distance: 500,
                traffic_level: 0.95
            }
        });

        const lowRiskResponse = await requestJson(buildUrl(serviceBaseUrls.ml, '/predict/delay'), {
            method: 'POST',
            expectedStatus: 200,
            body: {
                planned_arrival_time: new Date(now + (12 * 60 * 60 * 1000)).toISOString(),
                predicted_eta: 60,
                trip_distance: 120,
                traffic_level: 0.1
            }
        });

        const highRisk = toNumber(highRiskResponse.json?.delay_risk_percentage, NaN);
        const lowRisk = toNumber(lowRiskResponse.json?.delay_risk_percentage, NaN);

        assertCondition(Number.isFinite(highRisk), 'High-risk delay response is not numeric');
        assertCondition(Number.isFinite(lowRisk), 'Low-risk delay response is not numeric');
        assertCondition(highRisk > lowRisk, `Expected high-risk score (${highRisk}) > low-risk score (${lowRisk})`);

        const highLogistic = toNumber(highRiskResponse.json?.model_outputs?.logistic_regression, NaN);
        const highForest = toNumber(highRiskResponse.json?.model_outputs?.random_forest, NaN);
        assertCondition(Number.isFinite(highLogistic), 'Missing logistic regression model output');
        assertCondition(Number.isFinite(highForest), 'Missing random forest model output');

        return `Delay risk sensitivity validated (high=${highRisk}, low=${lowRisk})`;
    });
}

async function checkAuthServiceLoginCompatibility() {
    if (!context.serviceHealth.auth) {
        runSkip('Auth-service login compatibility', 'Skipped because auth-service health failed.');
        return;
    }

    await runCheck('Auth-service login compatibility', async () => {
        const response = await requestJson(buildUrl(serviceBaseUrls.auth, '/auth/login'), {
            method: 'POST',
            expectedStatus: [200, 401],
            body: {
                email: adminCredentials.emails[0] || 'admin@rks.com',
                password: adminCredentials.password
            }
        });

        if (response.status === 200) {
            assertCondition(Boolean(response.json?.token), 'Auth service returned 200 without token');
            return 'Auth service login succeeded with seeded credentials.';
        }

        runWarning(
            'Auth-service login compatibility',
            'Auth service is healthy but seeded backend credentials were rejected. Ensure auth-service users table is synced with shared database seeding.'
        );

        return 'Auth service responded but login credentials did not match.';
    });
}

async function main() {
    console.log('Starting RKS readiness checks...');

    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available. Use Node.js 18+ to run readiness checks.');
    }

    await checkEnvExamples();

    await checkServiceHealth('backend');
    await checkServiceHealth('auth');
    await checkServiceHealth('fleet');
    await checkServiceHealth('trip');
    await checkServiceHealth('booking');
    await checkServiceHealth('tracking');
    await checkServiceHealth('mockGps');
    await checkServiceHealth('analytics');
    await checkServiceHealth('alert');
    await checkServiceHealth('ml');

    await checkAuthenticationAndRoles();
    await checkAdminFeatureCoverage();
    await checkDriverFeatureCoverage();
    await checkTrackingCoverage();
    await checkMicroserviceFeatureCoverage();
    await checkMlCalculations();
    await checkAuthServiceLoginCompatibility();
}

main()
    .catch((error) => {
        pushResult({
            name: 'Readiness script execution',
            status: 'FAIL',
            details: error.message || String(error)
        });
    })
    .finally(() => {
        summarizeAndExit();
    });
