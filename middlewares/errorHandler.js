const crypto = require("crypto");
const AppError = require("../utils/AppError");

const PROD = process.env.NODE_ENV === "production";

const GENERIC_500 =
  "Une erreur interne est survenue. Veuillez réessayer plus tard.";

const SAFE_UNIQUE_MESSAGES = {
  email: "Cette adresse email est déjà enregistrée.",
  slug: "Ce slug est déjà utilisé.",
};

// Neutralise les caractères de contrôle → empêche le log injection
const safeLog = (s) =>
  String(s ?? "").replace(/[\r\n\t]/g, " ").slice(0, 500);

const isInvalidIdError = (err) =>
  err.name === "SequelizeDatabaseError" &&
  /invalid input syntax|conversion failed|incorrect integer value|data truncated/i.test(
    err.message || ""
  );

module.exports = (err, req, res, _next) => {
  const requestId = crypto.randomUUID();

  // ─── 1. ValidationError (hérite de AppError, possède `fields`) ───
  if (err.name === "ValidationError" && err.fields) {
    return res.status(400).json({
      message: err.message || "Validation échouée.",
      errors: err.fields,
      requestId,
    });
  }

  // ─── 2. AppError générique (opérationnel, message sûr) ───
  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      message: err.message,
      requestId,
    });
  }

  // ─── 3. Multer ───
  if (err.name === "MulterError") {
    return res.status(400).json({ message: err.message, requestId });
  }

  // ─── 4. JSON malformé ───
  if (err instanceof SyntaxError && err.status === 400) {
    return res
      .status(400)
      .json({ message: "Corps de requête invalide (JSON attendu).", requestId });
  }

  // ─── 5. ID invalide dans l'URL ───
  if (isInvalidIdError(err)) {
    return res
      .status(404)
      .json({ message: "Ressource introuvable.", requestId });
  }

  // ─── 6. Contrainte d'unicité Sequelize ───
  if (err.name === "SequelizeUniqueConstraintError") {
    const fields = err.fields || {};
    const safe = Object.keys(fields)
      .map((k) => SAFE_UNIQUE_MESSAGES[k])
      .filter(Boolean);

    const detail = !PROD
      ? `Champ(s) en conflit : ${Object.keys(fields).join(", ")}.`
      : undefined;

    return res.status(409).json({
      message: safe[0] || "Cette valeur est déjà enregistrée.",
      ...(detail ? { debug: detail } : {}),
      requestId,
    });
  }

  // ─── 7. FK Sequelize ───
  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res
      .status(400)
      .json({ message: "Référence invalide.", requestId });
  }

  // ─── 8. Validation Sequelize ───
  if (err.name === "SequelizeValidationError") {
    const message = PROD
      ? "Certaines valeurs sont invalides."
      : `Validation échouée : ${(err.errors || [])
          .map((e) => e.path || "champ")
          .join(", ")}`;
    return res.status(400).json({ message, requestId });
  }

  // ─── 9. Erreurs avec status numérique explicite (ex. body-parser) ───
  const explicitStatus =
    typeof err.status === "number" && err.status >= 400 && err.status < 500
      ? err.status
      : null;
  if (explicitStatus) {
    return res.status(explicitStatus).json({
      message: err.expose ? err.message : "Requête invalide.",
      requestId,
    });
  }

  // ─── 10. 500 générique — logs serveur uniquement ───
  console.error(
    `[errorHandler ${requestId}] ${safeLog(req.method)} ` +
      `${safeLog(req.originalUrl)} → ` +
      `${safeLog(err.name || "Error")}: ${safeLog(err.message)}`
  );
  if (!PROD && err.stack) console.error(err.stack);
  if (!PROD && err.sql) console.error("[SQL]", err.sql);

  return res.status(500).json({ message: GENERIC_500, requestId });
};