require("dotenv").config();

const ALLOWED_DIALECTS = ["mysql", "postgres"];

const dialect = (process.env.DB_DIALECT || "mysql").toLowerCase();
if (!ALLOWED_DIALECTS.includes(dialect)) {
  console.error(
    `DB_DIALECT invalide : "${dialect}". Valeurs acceptées : ${ALLOWED_DIALECTS.join(", ")}.`
  );
  process.exit(1);
}

const required = ["JWT_SECRET", "DB_NAME", "DB_USER"];

if (process.env.NODE_ENV === "production") {
  required.push(
    "CORS_ORIGIN",
    "DB_HOST",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
  );
}

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Configuration invalide. Variables manquantes :", missing.join(", "));
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET doit contenir au moins 32 caractères.");
  process.exit(1);
}

// Refus de démarrer en production avec le mot de passe admin par défaut
if (
  process.env.NODE_ENV === "production" &&
  (process.env.ADMIN_PASSWORD || "AdminDIC2026") === "AdminDIC2026"
) {
  console.error(
    "ADMIN_PASSWORD par défaut interdit en production. Changez-le dans .env."
  );
  process.exit(1);
}

const frontendOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = { frontendOrigins, dialect };