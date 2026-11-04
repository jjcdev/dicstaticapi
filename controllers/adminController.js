const {
  Member, GalleryPost, Event, ContactMessage,
  Application, RuleSection, ProgramItem,
} = require("../models");

exports.stats = async (_req, res, next) => {
  try {
    const [members, photos, events, unread, applications, rules, program] =
      await Promise.all([
        Member.count(),
        GalleryPost.count(),
        Event.count(),
        ContactMessage.count({ where: { is_read: false } }),
        Application.count(),
        RuleSection.count(),
        ProgramItem.count(),
      ]);
    res.json({ members, photos, events, unread, applications, rules, program });
  } catch (err) { next(err); }
};