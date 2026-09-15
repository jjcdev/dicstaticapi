require("dotenv").config();
const app = require("./app");
const { sequelize } = require("./models");

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connexion MySQL etablie.");

    await sequelize.sync({ alter: true });
    console.log("Modeles synchronises.");

    app.listen(PORT, () =>
      console.log(`Serveur DIC en ecoute sur http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error("Impossible de demarrer le serveur :", err);
    process.exit(1);
  }
})();