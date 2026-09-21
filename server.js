require("dotenv").config();
const bcrypt = require("bcryptjs");
const app = require("./app");
const { sequelize, Admin } = require("./models");

const PORT = process.env.PORT || 5000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dic.org";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDIC2026";

/**
 * Cree l'admin par defaut au premier demarrage.
 * Ne fait rien si un admin existe deja avec cet email.
 */
async function ensureDefaultAdmin() {
  const existing = await Admin.findOne({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    console.log("Admin deja present :", existing.email);
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await Admin.create({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: "admin",
  });

  console.log("");
  console.log("=================================================");
  console.log("  COMPTE ADMIN CREE (premier demarrage)");
  console.log("=================================================");
  console.log("  Email    :", ADMIN_EMAIL);
  console.log("  Password :", ADMIN_PASSWORD);
  console.log("=================================================");
  console.log("");
  console.log("Pensez a changer ce mot de passe apres la mise en ligne.");
  console.log("");
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connexion MySQL etablie.");

    // Sync sans alter : cree les tables si elles n'existent pas, ne touche a rien sinon.
    await sequelize.sync();
    console.log("Modeles synchronises.");

    // Cree l'admin s'il n'existe pas encore.
    await ensureDefaultAdmin();

    app.listen(PORT, () =>
      console.log(`Serveur DIC en ecoute sur le port ${PORT}`)
    );
  } catch (err) {
    console.error("Impossible de demarrer le serveur :", err);
    process.exit(1);
  }
})();