require("dotenv").config();
const bcrypt = require("bcryptjs");
const {
  sequelize,
  Admin,
  AcademicYear,
  Member,
} = require("../models");

async function run() {
  try {
    await sequelize.authenticate();
    console.log("Connexion MySQL etablie.");

    // 1. Sync pour garantir que les tables existent
    await sequelize.sync({ alter: true });
    console.log("Tables synchronisees.");

    // 2. Compte administrateur
    const email = "admin@dic.org";
    const password = "AdminDIC2025";

    let admin = await Admin.findOne({ where: { email } });
    if (!admin) {
      admin = await Admin.create({
        username: "admin",
        email,
        password: await bcrypt.hash(password, 10),
        role: "admin",
      });
      console.log("Admin cree.");
      console.log("   Email    :", email);
      console.log("   Password :", password);
    } else {
      console.log("Admin deja existant :", email);
    }

    // 3. Annee academique courante
    let year = await AcademicYear.findOne({ where: { label: "2025-2026" } });
    if (!year) {
      year = await AcademicYear.create({
        label: "2025-2026",
        start_date: "2025-09-01",
        end_date: "2026-07-31",
        is_current: true,
      });
      console.log("Annee 2025-2026 creee (courante).");
    } else {
      console.log("Annee 2025-2026 deja existante.");
    }

    // 4. Membres de demonstration (uniquement si aucun)
    const count = await Member.count({
      where: { academic_year_id: year.id },
    });

    if (count === 0) {
      await Member.bulkCreate([
        {
          first_name: "Awa",
          last_name: "Diallo",
          role: "Presidente",
          bio: "Etudiante en L3 informatique, passionnee par le dev web.",
          academic_year_id: year.id,
          display_order: 1,
        },
        {
          first_name: "Karim",
          last_name: "Traore",
          role: "Vice-president",
          bio: "Specialise en reseaux et cybersecurite.",
          academic_year_id: year.id,
          display_order: 2,
        },
        {
          first_name: "Fatou",
          last_name: "Ndiaye",
          role: "Secretaire generale",
          bio: "Organise les ateliers et gere la communication.",
          academic_year_id: year.id,
          display_order: 3,
        },
        {
          first_name: "Yann",
          last_name: "Kouassi",
          role: "Tresorier",
          academic_year_id: year.id,
          display_order: 4,
        },
      ]);
      console.log("Membres de demonstration crees.");
    } else {
      console.log("Membres deja presents, aucun ajout.");
    }

    console.log("\nSeed termine avec succes.");
    process.exit(0);
  } catch (err) {
    console.error("\nErreur pendant le seed :");
    console.error(err);
    process.exit(1);
  }
}

run();