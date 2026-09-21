/**
 * Script d'initialisation de l'admin.
 *
 * Usage :
 *   node scripts/create-admin.js
 *
 * Comportement :
 *   - Se connecte a la base (TiDB Cloud en prod, MySQL local en dev).
 *   - Verifie si un admin existe deja (par email).
 *   - Si non : hash le mot de passe et cree l'admin.
 *   - Si oui : n'ecrase rien, affiche un message d'information.
 *
 * Le mot de passe est actuellement fixe pour faciliter le demarrage.
 * TODO : remplacer par une generation aleatoire plus tard.
 */

require("dotenv").config();

const bcrypt = require("bcryptjs");
const { sequelize, Admin } = require("../models");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dic.org";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";

// Mot de passe en clair (a changer plus tard)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDIC2026";

async function createAdmin() {
  try {
    await sequelize.authenticate();
    console.log("Connexion base etablie.");

    await sequelize.sync();
    console.log("Tables verifiees.");

    const existing = await Admin.findOne({
      where: { email: ADMIN_EMAIL },
    });

    if (existing) {
      console.log("");
      console.log("Un admin existe deja avec cet email :");
      console.log("   Email    :", existing.email);
      console.log("   Username :", existing.username);
      console.log("");
      console.log("Aucune action effectuee.");
      console.log(
        "Pour recreer un admin, supprimez-le d'abord :"
      );
      console.log(
        `   DELETE FROM admins WHERE email = '${ADMIN_EMAIL}';`
      );
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = await Admin.create({
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "admin",
    });

    console.log("");
    console.log("=================================================");
    console.log("  COMPTE ADMIN CREE AVEC SUCCES");
    console.log("=================================================");
    console.log("");
    console.log("  Email    :", ADMIN_EMAIL);
    console.log("  Username :", ADMIN_USERNAME);
    console.log("  Password :", ADMIN_PASSWORD);
    console.log("");
    console.log("=================================================");
    console.log("");
    console.log("Connectez-vous sur /admin/login avec ces identifiants.");
    console.log("Pensez a changer le mot de passe avant la mise en ligne.");
    console.log("");

    process.exit(0);
  } catch (err) {
    console.error("");
    console.error("Erreur lors de la creation de l'admin :");
    console.error(err);
    process.exit(1);
  }
}

createAdmin();