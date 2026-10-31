const crypto = require("crypto");

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
  const status = err.status || err.statusCode;

  // 1. Validation maison
  if (err.name === "ValidationError" && err.fields) {
    return res
      .status(400)
      .json({ message: err.message, errors: err.fields, requestId });
  }

  // 2. Multer
  if (err.name === "MulterError") {
    return res.status(400).json({ message: err.message, requestId });
  }

  // 3. Messages contrôlés
  const safeMessages = [
    "Format d'image non supporte.",
    "Origine CORS non autorisée.",
  ];
  if (safeMessages.includes(err.message)) {
    const code = err.message.includes("CORS") ? 403 : 400;
    return res.status(status || code).json({ message: err.message, requestId });
  }

  // 4. JSON malformé
  if (err instanceof SyntaxError && status === 400) {
    return res
      .status(400)
      .json({ message: "Corps de requête invalide (JSON attendu).", requestId });
  }

  // 5. ID invalide (ex. /program/abc)
  if (isInvalidIdError(err)) {
    return res
      .status(404)
      .json({ message: "Ressource introuvable.", requestId });
  }

  // 6. Contrainte d'unicité
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

  // 7. FK invalide (ex. academic_year_id inexistant)
  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res
      .status(400)
      .json({ message: "Référence invalide.", requestId });
  }

  // 8. Validation Sequelize (NOT NULL, enum…)
  if (err.name === "SequelizeValidationError") {
    const message = PROD
      ? "Certaines valeurs sont invalides."
      : `Validation échouée : ${(err.errors || [])
          .map((e) => e.path || "champ")
          .join(", ")}`;
    return res.status(400).json({ message, requestId });
  }

  // 9. 4xx explicites posés par un middleware
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      message: err.expose ? err.message : "Requête invalide.",
      requestId,
    });
  }

  // 10. 500 générique — logs serveur uniquement
  console.error(
    `[errorHandler ${requestId}] ${safeLog(req.method)} ` +
      `${safeLog(req.originalUrl)} → ` +
      `${safeLog(err.name || "Error")}: ${safeLog(err.message)}`
  );
  if (!PROD && err.stack) console.error(err.stack);
  if (!PROD && err.sql) console.error("[SQL]", err.sql);

  return res.status(500).json({ message: GENERIC_500, requestId });
};