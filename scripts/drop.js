/**
 * DROP les tables dépréciées (Session/SessionEnrollment/Attendance).
 *
 * ⚠️  DESTRUCTIF — perte de données définitive.
 * À lancer une seule fois, après validation que ces tables ne sont plus utilisées.
 *
 * Usage :
 *   node scripts/drop-deprecated-tables.js
 *   Puis taper "DROP" pour confirmer.
 */

require("dotenv").config();
const readline = require("readline");
const sequelize = require("../config/database");

const TABLES = ["attendances", "session_enrollments", "sessions"];

(async () => {
  await sequelize.authenticate();
  console.log("Connexion DB établie.\n");

  console.log("Tables à supprimer :", TABLES.join(", "));
  console.log("⚠️  CETTE ACTION EST IRRÉVERSIBLE.\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question('Tapez "DROP" pour confirmer : ', resolve)
  );
  rl.close();

  if (answer !== "DROP") {
    console.log("Annulé.");
    process.exit(0);
  }

  const qi = sequelize.getQueryInterface();
  for (const t of TABLES) {
    if (await qi.tableExists(t)) {
      await qi.dropTable(t);
      console.log(`  [✓] table supprimée : ${t}`);
    } else {
      console.log(`  [=] table absente : ${t}`);
    }
  }

  console.log("\nTerminé.");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});