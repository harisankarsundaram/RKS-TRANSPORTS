const API_BASE = 'http://localhost:3000/api';

export const api = {
    // Truck APIs
    async getTrucks() {
        const res = await fetch(`${API_BASE}/trucks`);
        return res.json();
    },

    async createTruck(data) {
        const res = await fetch(`${API_BASE}/trucks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async updateTruck(id, data) {
        const res = await fetch(`${API_BASE}/trucks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async deleteTruck(id) {
        const res = await fetch(`${API_BASE}/trucks/${id}`, {
            method: 'DELETE',
        });
        return res.json();
    },

    // Driver APIs
    async getDrivers() {
        const res = await fetch(`${API_BASE}/drivers`);
        return res.json();
    },

    async createDriver(data) {
        const res = await fetch(`${API_BASE}/drivers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async updateDriver(id, data) {
        const res = await fetch(`${API_BASE}/drivers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async deleteDriver(id) {
        const res = await fetch(`${API_BASE}/drivers/${id}`, {
            method: 'DELETE',
        });
        return res.json();
    },

    // Assignment APIs
    async assignDriver(driver_id, truck_id) {
        const res = await fetch(`${API_BASE}/assign-driver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_id, truck_id }),
        });
        return res.json();
    },

    async unassignDriver(driver_id) {
        const res = await fetch(`${API_BASE}/unassign-driver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driver_id }),
        });
        return res.json();
    },

    // MODULE 4: TRIP APIs
    async getTrips() {
        const res = await fetch(`${API_BASE}/trips`);
        return res.json();
    },

    async createTrip(data) {
        const res = await fetch(`${API_BASE}/trips`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async startTrip(tripId) {
        const res = await fetch(`${API_BASE}/trips/${tripId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        return res.json();
    },

    async endTrip(tripId) {
        const res = await fetch(`${API_BASE}/trips/${tripId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        return res.json();
    },

    // MODULE 5: GPS APIs
    async logGps(data) {
        const res = await fetch(`${API_BASE}/gps-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    // MODULE 6: FUEL APIs
    async logFuel(data) {
        const res = await fetch(`${API_BASE}/fuel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    // MODULE 7: MAINTENANCE APIs
    async getMaintenanceLogs() {
        const res = await fetch(`${API_BASE}/maintenance`);
        return res.json();
    },

    async logMaintenance(data) {
        const res = await fetch(`${API_BASE}/maintenance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    // MODULE 8: INVOICE APIs
    async getInvoices() {
        const res = await fetch(`${API_BASE}/invoice`);
        return res.json();
    },

    async createInvoice(data) {
        const res = await fetch(`${API_BASE}/invoice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },
};
