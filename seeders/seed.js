require("dotenv").config();
const bcrypt = require("bcryptjs");
const { sequelize, Admin } = require("../models");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dic.org";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDIC2026";

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connexion MySQL établie.");

    await sequelize.sync();
    console.log("Tables vérifiées.");

    const existing = await Admin.findOne({ where: { email: ADMIN_EMAIL } });
    if (existing) {
      console.log("Admin déjà présent :", existing.email, "— aucune action.");
      process.exit(0);
    }

    await Admin.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(ADMIN_PASSWORD, 10),
      role: "admin",
    });

    console.log("Compte admin créé :", ADMIN_EMAIL);
    console.log(
      "⚠️  Modifiez ADMIN_PASSWORD dans .env avant la mise en ligne."
    );
    process.exit(0);
  } catch (err) {
    console.error("Erreur pendant le seed :", err);
    process.exit(1);
  }
}

run();