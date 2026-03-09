const NotificationModel = require('../models/notificationModel');

const NotificationController = {
    // GET /api/notifications
    async getMyNotifications(req, res, next) {
        try {
            const notifications = await NotificationModel.getByUser(req.user.id, 30);
            const unreadCount = await NotificationModel.getUnreadCount(req.user.id);
            res.json({ success: true, data: notifications, unread_count: unreadCount });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/notifications/:id/read
    async markRead(req, res, next) {
        try {
            const updated = await NotificationModel.markAsRead(req.params.id);
            if (!updated) return res.status(404).json({ success: false, message: 'Notification not found' });
            res.json({ success: true, data: updated });
        } catch (error) {
            next(error);
        }
    },

    // PUT /api/notifications/read-all
    async markAllRead(req, res, next) {
        try {
            await NotificationModel.markAllRead(req.user.id);
            res.json({ success: true, message: 'All notifications marked as read' });
        } catch (error) {
            next(error);
        }
    }
};

module.exports = NotificationController;
