const { Member, GalleryPost, Event, ContactMessage } = require("../models");

exports.stats = async (_req, res, next) => {
  try {
    const [members, photos, events, unread] = await Promise.all([
      Member.count(),
      GalleryPost.count(),
      Event.count(),
      ContactMessage.count({ where: { is_read: false } }),
    ]);
    res.json({ members, photos, events, unread });
  } catch (err) {
    next(err);
  }
};