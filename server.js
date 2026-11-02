require("./config/env");
const app = require("./app");
const { sequelize } = require("./models");
const { runStartupMigrations } = require("./config/databaseSync");

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connexion DB établie.");

    await runStartupMigrations();

    app.listen(PORT, () =>
      console.log(`Serveur DIC en écoute sur le port ${PORT}`)
    );
  } catch (err) {
    console.error("Impossible de démarrer le serveur :", err.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(err.stack);
    }
    process.exit(1);
  }
})();