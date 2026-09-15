const fs = require("fs");
const path = require("path");
const { GalleryPost, AcademicYear } = require("../models");

const fileToUrl = (file) => (file ? `/uploads/${file.filename}` : null);

const removeFileIfAny = (url) => {
  if (!url) return;
  const filename = url.replace(/^\/uploads\//, "");
  const full = path.join(__dirname, "..", "uploads", filename);
  if (fs.existsSync(full)) fs.unlinkSync(full);
};

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.yearId) where.academic_year_id = req.query.yearId;
    if (req.query.category) where.category = req.query.category;

    const options = {
      where,
      include: [{ model: AcademicYear, as: "academic_year" }],
      order: [["created_at", "DESC"]],
    };

    if (req.query.limit) options.limit = parseInt(req.query.limit, 10);

    const posts = await GalleryPost.findAll(options);
    res.json(posts);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const payload = { ...req.body };
    if (req.file) payload.image_url = fileToUrl(req.file);
    if (!payload.academic_year_id) payload.academic_year_id = null;
    if (!payload.event_date) payload.event_date = null;

    const post = await GalleryPost.create(payload);
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const post = await GalleryPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Photo introuvable." });

    const payload = { ...req.body };
    if (req.file) {
      removeFileIfAny(post.image_url);
      payload.image_url = fileToUrl(req.file);
    }
    if (!payload.academic_year_id) payload.academic_year_id = null;
    if (!payload.event_date) payload.event_date = null;

    await post.update(payload);
    res.json(post);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const post = await GalleryPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: "Photo introuvable." });
    removeFileIfAny(post.image_url);
    await post.destroy();
    res.json({ message: "Photo supprimee." });
  } catch (err) {
    next(err);
  }
};