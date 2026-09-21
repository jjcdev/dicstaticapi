const { Sequelize } = require("sequelize");

/* ============================================================
   Resolution des parametres de connexion
   - Local (MySQL)      : SSL desactive
   - TiDB Cloud (prod)  : SSL obligatoire
   - Render + autre     : SSL selon la variable DB_SSL
   ============================================================ */

const host = process.env.DB_HOST || "127.0.0.1";
const port = parseInt(process.env.DB_PORT, 10) || 3306;
const isLocalHost =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1";

// SSL active si :
//   1. La variable DB_SSL vaut "true" (forcer)
//   2. OU on n'est pas en local (production, TiDB, cloud)
const sslEnabled =
  process.env.DB_SSL === "true" ||
  (process.env.DB_SSL !== "false" && !isLocalHost);

const dialectOptions = sslEnabled
  ? {
      ssl: {
        require: true,
        rejectUnauthorized: true,
      },
    }
  : {};

const sequelize = new Sequelize(
  process.env.DB_NAME || "dic_db",
  process.env.DB_USER || "root",
  process.env.DB_PASSWORD || "",
  {
    host,
    port,
    dialect: "mysql",
    dialectOptions,
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
    pool: {
      max: 10,
      min: 0,
      idle: 10000,
      acquire: 30000,
    },
  }
);

module.exports = sequelize;