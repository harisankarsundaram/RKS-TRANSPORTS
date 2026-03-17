const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', notificationController.getMyNotifications);
router.put('/read-all', notificationController.markAllRead);
router.put('/:id/read', notificationController.markRead);

module.exports = router;
