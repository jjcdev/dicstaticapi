module.exports = (err, _req, res, _next) => {
  console.error(err);

  if (err.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }
  if (err.message === "Format d'image non supporte.") {
    return res.status(400).json({ message: err.message });
  }
  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      message: "Valeur unique en conflit.",
      fields: err.fields,
    });
  }
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      message: "Validation echouee.",
      errors: err.errors.map((e) => e.message),
    });
  }

  return res.status(500).json({ message: "Erreur serveur." });
};