require("./config/env");
const bcrypt = require("bcryptjs");
const app = require("./app");
const { sequelize, Admin } = require("./models");

const PORT = process.env.PORT || 5000;

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dic.org";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDIC2026";

/*
 * Stratégie de synchronisation du schéma au démarrage :
 *   "safe"  (défaut) : crée les tables manquantes + ajoute les colonnes manquantes.
 *                      Ne SUPPRIME JAMAIS rien. Ne modifie JAMAIS un type existant.
 *   "none"           : ne touche pas au schéma (la BDD doit être à jour).
 *   "alter"          : alter complet Sequelize (⚠️ peut supprimer/réécrire — dev uniquement).
 */
const SYNC_MODE = (process.env.DB_SYNC_MODE || "safe").toLowerCase();

/**
 * Calcule le nom réel de la colonne en base à partir d'un attribut modèle.
 * Gère underscored: true (camelCase → snake_case) sans se fier à attr.field.
 */
function expectedColumnName(attrName, attr, underscored) {
  if (attr.field) return attr.field;
  if (underscored) {
    return attrName.replace(/([A-Z])/g, "_$1").toLowerCase();
  }
  return attrName;
}

async function syncSchemaSafe() {
  const qi = sequelize.getQueryInterface();
  const underscored = sequelize.options.define?.underscored === true;

  let createdTables = 0;
  let addedCols = 0;
  let warnings = 0;

  for (const [modelName, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName =
      typeof rawTable === "string" ? rawTable : rawTable.tableName;

    // ── 1. La table existe-t-elle ?
    const exists = await qi.tableExists(tableName);
    if (!exists) {
      await model.sync(); // crée la table + index
      console.log(`  [+] table créée : ${tableName}`);
      createdTables++;
      continue;
    }

    const dbCols = await qi.describeTable(tableName);
    const modelAttrs = model.rawAttributes;

    // ── 2. Ajouter les colonnes manquantes
    for (const [attrName, attr] of Object.entries(modelAttrs)) {
      if (attr.type && attr.type.key === "VIRTUAL") continue; // colonnes calculées

      const colName = expectedColumnName(attrName, attr, underscored);
      if (dbCols[colName]) continue; // déjà présente → on ne touche pas

      const safeAttr = { ...attr };

      // Sécurité : ajouter en NULLABLE si NOT NULL sans default, pour ne pas casser
      // les lignes existantes. L'admin devra remplir puis repasser en NOT NULL.
      if (
        safeAttr.allowNull === false &&
        safeAttr.defaultValue === undefined &&
        safeAttr.autoIncrement !== true
      ) {
        safeAttr.allowNull = true;
        console.warn(
          `  [!] ${tableName}.${colName} ajoutée NULLABLE ` +
            `(NOT NULL sans default — remplir puis passer en NOT NULL manuellement)`
        );
        warnings++;
      }

      try {
        await qi.addColumn(tableName, colName, safeAttr);
        console.log(`  [+] ${tableName}.${colName} ajoutée`);
        addedCols++;
      } catch (err) {
        console.error(
          `  [✗] ${tableName}.${colName} : échec d'ajout (${err.message}). ` +
            `Migration manuelle requise.`
        );
        warnings++;
      }
    }

    // ── 3. Signaler (sans supprimer) les colonnes orphelines en base
    const expected = new Set(
      Object.entries(modelAttrs).map(([name, a]) =>
        expectedColumnName(name, a, underscored)
      )
    );
    const orphans = Object.keys(dbCols).filter((c) => !expected.has(c));

    if (orphans.length) {
      console.warn(
        `  [!] ${tableName} : colonnes en base absentes du modèle ` +
          `(NON supprimées) → ${orphans.join(", ")}`
      );
      warnings++;
    }
  }

  if (createdTables === 0 && addedCols === 0) {
    console.log("  [=] schéma à jour, aucune modification.");
  } else {
    console.log(
      `  [✓] ${createdTables} table(s) créée(s), ${addedCols} colonne(s) ajoutée(s), ` +
        `${warnings} avertissement(s).`
    );
  }
}

async function ensureDefaultAdmin() {
  const existing = await Admin.findOne({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log("Admin déjà présent :", existing.email);
    return;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await Admin.create({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    password: hashedPassword,
    role: "admin",
  });

  console.log("Compte admin initial créé pour", ADMIN_EMAIL);
  console.log(
    "⚠️  Changez le mot de passe par défaut avant la mise en ligne."
  );
}

(async () => {
  try {
    await sequelize.authenticate();
    console.log("Connexion DB établie.");

    console.log(`[sync] mode "${SYNC_MODE}"`);

    if (SYNC_MODE === "alter") {
      console.warn(
        "⚠️  DB_SYNC_MODE=alter : Sequelize peut supprimer/réécrire des colonnes. " +
          "À n'utiliser qu'en dev, jamais en prod."
      );
      await sequelize.sync({ alter: true });
      console.log("[sync] schéma synchronisé (alter).");
    } else if (SYNC_MODE === "none") {
      console.log("[sync] aucune modification du schéma (mode none).");
    } else {
      await syncSchemaSafe();
    }

    await ensureDefaultAdmin();

    app.listen(PORT, () =>
      console.log(`Serveur DIC en écoute sur le port ${PORT}`)
    );
  } catch (err) {
    console.error("Impossible de démarrer le serveur :", err);
    process.exit(1);
  }
})();