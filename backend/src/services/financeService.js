/**
 * Finance Service — Pure calculation engine for financial operations
 * No direct DB access. All functions are reusable and testable.
 */

const FinanceService = {
    /**
     * Calculate the billable total from trip financial fields.
     * All charges are included in the invoice total.
     */
    calculateBillableTotal(trip) {
        const base = parseFloat(trip.base_freight) || 0;
        const toll = parseFloat(trip.toll_amount) || 0;
        const loading = parseFloat(trip.loading_cost) || 0;
        const unloading = parseFloat(trip.unloading_cost) || 0;
        const fastTag = parseFloat(trip.fast_tag) || 0;

        return parseFloat((base + toll + loading + unloading + fastTag).toFixed(2));
    },

    /**
     * Calculate GST amount from a subtotal and GST percentage.
     */
    calculateGST(subtotal, gstPercentage) {
        const pct = parseFloat(gstPercentage) || 0;
        return parseFloat((subtotal * (pct / 100)).toFixed(2));
    },

    /**
     * Calculate full invoice amounts from trip data.
     * Returns { subtotal, gst_amount, total_amount }
     */
    calculateInvoiceAmounts(trip) {
        const subtotal = this.calculateBillableTotal(trip);
        const gst_amount = this.calculateGST(subtotal, trip.gst_percentage);
        const total_amount = parseFloat((subtotal + gst_amount).toFixed(2));

        return { subtotal, gst_amount, total_amount };
    },

    /**
     * Calculate internal cost for a trip.
     * Combines trip-level fields + aggregated expense amounts.
     * @param {object} trip - trip record with financial columns
     * @param {number} expenseTotal - sum of amounts from expenses table for this trip
     */
    calculateInternalCost(trip, expenseTotal = 0) {
        const toll = parseFloat(trip.toll_amount) || 0;
        const loading = parseFloat(trip.loading_cost) || 0;
        const unloading = parseFloat(trip.unloading_cost) || 0;
        const driverBata = parseFloat(trip.driver_bata) || 0;
        const otherCharges = parseFloat(trip.other_charges) || 0;
        const expenses = parseFloat(expenseTotal) || 0;

        return parseFloat((toll + loading + unloading + driverBata + otherCharges + expenses).toFixed(2));
    },

    /**
     * Calculate profit = invoice total - internal cost
     */
    calculateProfit(invoiceTotal, internalCost) {
        return parseFloat(((parseFloat(invoiceTotal) || 0) - (parseFloat(internalCost) || 0)).toFixed(2));
    },

    /**
     * Calculate dead mileage percentage
     * dead_mileage_percent = (empty_km / (empty_km + loaded_km)) * 100
     */
    calculateDeadMileage(emptyKm, loadedKm) {
        const empty = parseFloat(emptyKm) || 0;
        const loaded = parseFloat(loadedKm) || 0;
        const total = empty + loaded;

        if (total === 0) return 0;
        return parseFloat(((empty / total) * 100).toFixed(2));
    },

    /**
     * Generate a unique invoice number based on trip ID and date.
     * Format: RKS-INV-YYYYMMDD-{tripId}
     */
    generateInvoiceNumber(tripId) {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        return `RKS-INV-${yyyy}${mm}${dd}-${tripId}`;
    },

    /**
     * Determine payment status based on amount_paid vs total_amount
     */
    determinePaymentStatus(amountPaid, totalAmount) {
        const paid = parseFloat(amountPaid) || 0;
        const total = parseFloat(totalAmount) || 0;

        if (paid <= 0) return 'Pending';
        if (paid >= total) return 'Paid';
        return 'Partial';
    }
};

module.exports = FinanceService;
