const { getAll, markAllRead, unreadCount } = require("../utils/notifications");

exports.list = async (req, res, next) => {
  try {
    res.json({
      notifications: getAll(req.user.id),
      unread: unreadCount(req.user.id),
    });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const notifications = markAllRead(req.user.id);
    res.json({ message: "Toutes les notifications sont marquées comme lues.", notifications });
  } catch (err) {
    next(err);
  }
};