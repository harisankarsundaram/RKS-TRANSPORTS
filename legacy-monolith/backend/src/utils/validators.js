/**
 * Indian Format Validators for Transport Management System
 */

const validators = {
    /**
     * Validate Indian Vehicle Registration Number
     * Format: SS-DD-XX-DDDD or SS-DD-X-DDDD
     * Examples: MH12AB1234, DL01C1234, KA05MF5678
     * SS = State Code (2 letters)
     * DD = District Code (2 digits)
     * XX = Series (1-2 letters)
     * DDDD = Number (1-4 digits)
     */
    isValidTruckNumber(truckNumber) {
        if (!truckNumber) return { valid: false, message: 'Truck number is required' };

        // Remove spaces and convert to uppercase
        const normalized = truckNumber.replace(/\s+/g, '').toUpperCase();

        // Indian vehicle registration pattern
        // Format: 2 letters (state) + 2 digits (district) + 1-2 letters (series) + 1-4 digits
        const pattern = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{1,4}$/;

        if (!pattern.test(normalized)) {
            return {
                valid: false,
                message: 'Invalid truck number. Use format: MH12AB1234 (State + District + Series + Number)'
            };
        }

        // Valid Indian state codes
        const validStateCodes = [
            'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DD', 'DL', 'GA',
            'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH',
            'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK',
            'TN', 'TS', 'TR', 'UK', 'UP', 'WB'
        ];

        const stateCode = normalized.substring(0, 2);
        if (!validStateCodes.includes(stateCode)) {
            return {
                valid: false,
                message: `Invalid state code: ${stateCode}. Must be a valid Indian state code.`
            };
        }

        return { valid: true, normalized };
    },

    /**
     * Validate Indian Mobile Number
     * Format: 10 digits starting with 6, 7, 8, or 9
     * Can optionally have +91 or 0 prefix
     */
    isValidPhoneNumber(phone) {
        if (!phone) return { valid: false, message: 'Phone number is required' };

        // Remove spaces, dashes, and common prefixes
        let normalized = phone.replace(/[\s\-]/g, '');

        // Remove +91 or 91 prefix
        if (normalized.startsWith('+91')) {
            normalized = normalized.substring(3);
        } else if (normalized.startsWith('91') && normalized.length === 12) {
            normalized = normalized.substring(2);
        } else if (normalized.startsWith('0')) {
            normalized = normalized.substring(1);
        }

        // Check if it's exactly 10 digits starting with 6-9
        const pattern = /^[6-9][0-9]{9}$/;

        if (!pattern.test(normalized)) {
            return {
                valid: false,
                message: 'Invalid phone number. Must be 10 digits starting with 6, 7, 8, or 9'
            };
        }

        return { valid: true, normalized };
    },

    /**
     * Validate Indian Driving License Number
     * Format: SS-DDYYYYDDDDDDD
     * SS = State Code (2 letters)
     * DD = RTO Code (2 digits)  
     * YYYY = Year of issue (4 digits)
     * DDDDDDD = Unique number (7 digits)
     * Examples: MH0120190001234, DL0520180054321
     */
    isValidLicenseNumber(license) {
        if (!license) return { valid: false, message: 'License number is required' };

        // Remove spaces and convert to uppercase
        const normalized = license.replace(/[\s\-]/g, '').toUpperCase();

        // Indian DL pattern: 2 letters + 13 digits OR 2 letters + 2 digits + 4 digits + 7 digits
        // Some states have different formats, so we'll be flexible
        const patterns = [
            /^[A-Z]{2}[0-9]{13}$/, // Standard format: MH0120190001234
            /^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$/, // Same as above, just explicit
            /^[A-Z]{2}[0-9]{2} ?[0-9]{4} ?[0-9]{7}$/, // With optional spaces
            /^[A-Z]{2}-?[0-9]{2}-?[0-9]{4}-?[0-9]{7}$/, // With optional dashes
        ];

        const isValidFormat = patterns.some(pattern => pattern.test(normalized));

        if (!isValidFormat) {
            return {
                valid: false,
                message: 'Invalid license number. Use format: MH0120190001234 (State + RTO + Year + Number)'
            };
        }

        // Valid Indian state codes
        const validStateCodes = [
            'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CG', 'DD', 'DL', 'GA',
            'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD', 'MH',
            'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK',
            'TN', 'TS', 'TR', 'UK', 'UP', 'WB'
        ];

        const stateCode = normalized.substring(0, 2);
        if (!validStateCodes.includes(stateCode)) {
            return {
                valid: false,
                message: `Invalid state code: ${stateCode}. Must be a valid Indian state code.`
            };
        }

        return { valid: true, normalized };
    },

    /**
     * Validate Capacity (in tons)
     * Must be positive number between 1 and 100
     */
    isValidCapacity(capacity) {
        const num = parseFloat(capacity);
        if (isNaN(num) || num <= 0) {
            return { valid: false, message: 'Capacity must be a positive number' };
        }
        if (num > 100) {
            return { valid: false, message: 'Capacity cannot exceed 100 tons' };
        }
        return { valid: true, value: num };
    },

    /**
     * Validate Future Date (for expiry dates)
     */
    isFutureDate(dateString) {
        if (!dateString) return { valid: false, message: 'Date is required' };

        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return { valid: false, message: 'Invalid date format' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (date < today) {
            return { valid: false, message: 'Date must be a future date' };
        }

        return { valid: true };
    },

    /**
     * Validate Driver Name
     */
    isValidName(name) {
        if (!name || name.trim().length < 2) {
            return { valid: false, message: 'Name must be at least 2 characters' };
        }
        if (name.trim().length > 100) {
            return { valid: false, message: 'Name cannot exceed 100 characters' };
        }
        // Only allow letters, spaces, and dots (for initials)
        const pattern = /^[A-Za-z\s.]+$/;
        if (!pattern.test(name.trim())) {
            return { valid: false, message: 'Name can only contain letters, spaces, and dots' };
        }
        return { valid: true, normalized: name.trim() };
    }
};

module.exports = validators;
