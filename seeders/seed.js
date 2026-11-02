/**
 * Seed minimal : garantit que la DB est synchronisée et qu'un admin existe.
 *
 * Utile en dev pour un premier démarrage rapide. En prod, `server.js`
 * fait exactement la même chose au boot — ce script devient facultatif.
 */

require("dotenv").config();
const { sequelize } = require("../models");
const { runStartupMigrations } = require("../config/databaseSync");

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connexion DB établie.");
    await runStartupMigrations();
    console.log("Seed terminé.");
    process.exit(0);
  } catch (err) {
    console.error("Erreur pendant le seed :", err.message);
    process.exit(1);
  }
})();