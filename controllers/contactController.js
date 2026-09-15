const { ContactMessage } = require("../models");

exports.create = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ message: "Tous les champs sont requis." });
    }
    const msg = await ContactMessage.create({ name, email, subject, message });
    res.status(201).json({ id: msg.id, message: "Message envoye." });
  } catch (err) {
    next(err);
  }
};

exports.list = async (_req, res, next) => {
  try {
    const messages = await ContactMessage.findAll({
      order: [["created_at", "DESC"]],
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const msg = await ContactMessage.findByPk(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message introuvable." });

    const value =
      typeof req.body?.is_read === "boolean" ? req.body.is_read : true;
    await msg.update({ is_read: value });
    res.json(msg);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const msg = await ContactMessage.findByPk(req.params.id);
    if (!msg) return res.status(404).json({ message: "Message introuvable." });
    await msg.destroy();
    res.json({ message: "Message supprime." });
  } catch (err) {
    next(err);
  }
};