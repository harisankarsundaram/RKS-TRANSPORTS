const pool = require('../config/db');

const NotificationModel = {
    async create({ user_id, message, type, related_trip_id }) {
        const result = await pool.query(
            `INSERT INTO notifications (user_id, message, type, related_trip_id)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [user_id, message, type, related_trip_id || null]
        );
        return result.rows[0];
    },

    // Create notification for all users of a given role
    async createForRole(role, { message, type, related_trip_id }) {
        const users = await pool.query(
            `SELECT user_id FROM users WHERE role = $1`,
            [role]
        );
        const notifications = [];
        for (const u of users.rows) {
            const n = await this.create({ user_id: u.user_id, message, type, related_trip_id });
            notifications.push(n);
        }
        return notifications;
    },

    async getByUser(userId, limit = 20) {
        const result = await pool.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    async getUnreadCount(userId) {
        const result = await pool.query(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    },

    async markAsRead(notificationId) {
        const result = await pool.query(
            `UPDATE notifications SET is_read = true WHERE notification_id = $1 RETURNING *`,
            [notificationId]
        );
        return result.rows[0];
    },

    async markAllRead(userId) {
        await pool.query(
            `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
            [userId]
        );
        return true;
    }
};

module.exports = NotificationModel;
