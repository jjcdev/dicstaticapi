const { RuleSection } = require("../models");
const { validateRuleSection } = require("../utils/validators");

const PUBLIC_ATTRS = ["id", "title", "content", "slug", "display_order"];

exports.publicList = async (_req, res, next) => {
  try {
    const sections = await RuleSection.findAll({
      where: { is_published: true },
      attributes: PUBLIC_ATTRS,
      order: [
        ["display_order", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(sections);
  } catch (err) {
    next(err);
  }
};

exports.adminList = async (_req, res, next) => {
  try {
    const sections = await RuleSection.findAll({
      order: [
        ["display_order", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(sections);
  } catch (err) {
    next(err);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const section = await RuleSection.findByPk(req.params.id);
    if (!section) {
      return res.status(404).json({ message: "Section introuvable." });
    }
    res.json(section);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = validateRuleSection(req.body);
    if (data.slug) {
      const clash = await RuleSection.findOne({ where: { slug: data.slug } });
      if (clash) {
        return res.status(409).json({ message: "Ce slug est déjà utilisé." });
      }
    }
    const section = await RuleSection.create(data);
    res.status(201).json(section);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const section = await RuleSection.findByPk(req.params.id);
    if (!section) {
      return res.status(404).json({ message: "Section introuvable." });
    }

    const data = validateRuleSection(req.body, { partial: true });

    if (data.slug && data.slug !== section.slug) {
      const clash = await RuleSection.findOne({ where: { slug: data.slug } });
      if (clash && clash.id !== section.id) {
        return res.status(409).json({ message: "Ce slug est déjà utilisé." });
      }
    }

    await section.update(data);
    res.json(section);
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const section = await RuleSection.findByPk(req.params.id);
    if (!section) {
      return res.status(404).json({ message: "Section introuvable." });
    }
    await section.destroy();
    res.json({ message: "Section supprimée." });
  } catch (err) {
    next(err);
  }
};

exports.reorder = async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res
        .status(400)
        .json({ message: "Tableau 'order' requis : [{ id, display_order }]." });
    }

    for (const item of order) {
      const id = parseInt(item.id, 10);
      const pos = parseInt(item.display_order, 10);
      if (!Number.isInteger(id) || !Number.isInteger(pos)) continue;
      await RuleSection.update(
        { display_order: pos },
        { where: { id } }
      );
    }

    const sections = await RuleSection.findAll({
      order: [
        ["display_order", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(sections);
  } catch (err) {
    next(err);
  }
};