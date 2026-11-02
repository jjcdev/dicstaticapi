/**
 * Synchronisation automatique de la base de données au démarrage.
 *
 * Étapes (dans l'ordre) :
 *   1. Crée les tables manquantes
 *   2. Ajoute les colonnes manquantes (NULLABLE si NOT NULL sans default)
 *   3. Étend les ENUM MySQL si de nouvelles valeurs apparaissent
 *   4. Détecte les tables orphelines (en DB, absentes des modèles)
 *      → Supprime conditionnellement selon DB_DROP_ORPHAN_TABLES
 *   5. Détecte les anomalies (colonnes orphelines, mismatches de type)
 *   6. Migre les Admin legacy → User
 *   7. Crée l'admin par défaut si aucun n'existe
 *
 * Modes :
 *   safe   (défaut) : applique tout ce qui est safe, warn le reste
 *   strict          : fail au démarrage si une action manuelle est requise
 *   none            : aucune modification du schéma
 *   alter           : Sequelize alter (dev uniquement, peut supprimer)
 *
 * Suppression de tables orphelines :
 *   DB_DROP_ORPHAN_TABLES=true        → active le drop (tables vides uniquement)
 *   DB_FORCE_DROP_NON_EMPTY=true      → autorise le drop des tables non vides
 *                                       (backup SQL automatique dans backups/)
 *
 * Tables système JAMAIS touchées :
 *   SequelizeMeta, sequelize_meta, _migrations, sqlite_sequence
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const sequelize = require("./database");
const { ROLES } = require("../utils/constants");

const MODE = (process.env.DB_SYNC_MODE || "safe").toLowerCase();
const AUTO_MIGRATE_LEGACY = process.env.DB_AUTO_MIGRATE_LEGACY !== "false";
const DROP_ORPHAN = process.env.DB_DROP_ORPHAN_TABLES === "true";
const FORCE_DROP_NON_EMPTY = process.env.DB_FORCE_DROP_NON_EMPTY === "true";
const FAIL_ON_WARN = MODE === "strict";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@dic.org";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminDIC2026";

// Tables système à ne JAMAIS toucher
const PROTECTED_TABLES = new Set([
  "SequelizeMeta",
  "sequelize_meta",
  "_migrations",
  "sqlite_sequence",
]);

const BACKUP_DIR = path.join(__dirname, "..", "backups");

const warnings = [];
function warn(message) {
  warnings.push(message);
  console.warn(`  [!] ${message}`);
}

function expectedColumnName(attrName, attr, underscored) {
  if (attr.field) return attr.field;
  if (underscored) return attrName.replace(/([A-Z])/g, "_$1").toLowerCase();
  return attrName;
}

function getModels() {
  return require("../models");
}

/* ──────────── 1. Tables ──────────── */

async function ensureTables() {
  const qi = sequelize.getQueryInterface();
  let created = 0;

  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;
    const exists = await qi.tableExists(tableName);
    if (!exists) {
      await model.sync();
      console.log(`  [+] table créée : ${tableName}`);
      created++;
    }
  }
  return created;
}

/* ──────────── 2. Colonnes ──────────── */

async function ensureColumns() {
  const qi = sequelize.getQueryInterface();
  const underscored = sequelize.options.define?.underscored === true;
  let added = 0;

  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;

    if (!(await qi.tableExists(tableName))) continue;

    const dbCols = await qi.describeTable(tableName);
    const modelAttrs = model.rawAttributes;

    for (const [attrName, attr] of Object.entries(modelAttrs)) {
      if (attr.type && attr.type.key === "VIRTUAL") continue;
      const colName = expectedColumnName(attrName, attr, underscored);
      if (dbCols[colName]) continue;

      const safeAttr = { ...attr };
      if (
        safeAttr.allowNull === false &&
        safeAttr.defaultValue === undefined &&
        safeAttr.autoIncrement !== true
      ) {
        safeAttr.allowNull = true;
        warn(
          `${tableName}.${colName} ajoutée NULLABLE ` +
            `(NOT NULL sans default — remplir puis passer en NOT NULL manuellement)`
        );
      }

      try {
        await qi.addColumn(tableName, colName, safeAttr);
        console.log(`  [+] ${tableName}.${colName} ajoutée`);
        added++;
      } catch (err) {
        warn(`${tableName}.${colName} : échec d'ajout (${err.message})`);
      }
    }
  }
  return added;
}

/* ──────────── 3. Extension des ENUM (MySQL) ──────────── */

async function ensureEnumColumns() {
  const dialect = sequelize.getDialect();
  if (dialect !== "mysql") return 0;

  const qi = sequelize.getQueryInterface();
  const underscored = sequelize.options.define?.underscored === true;
  let updated = 0;

  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;

    if (!(await qi.tableExists(tableName))) continue;

    const dbCols = await qi.describeTable(tableName);

    for (const [attrName, attr] of Object.entries(model.rawAttributes)) {
      if (attr.type?.key !== "ENUM") continue;
      const colName = expectedColumnName(attrName, attr, underscored);
      const dbCol = dbCols[colName];
      if (!dbCol) continue;

      const modelValues = attr.type.values || [];
      const dbType = String(dbCol.type || "");
      const match = dbType.match(/^enum\((.+)\)$/i);
      if (!match) continue;

      const dbValues = match[1]
        .split(",")
        .map((v) => v.trim().replace(/^'|'$/g, ""));

      const missingInDb = modelValues.filter((v) => !dbValues.includes(v));
      if (missingInDb.length === 0) continue;

      try {
        const allValues = [...new Set([...dbValues, ...modelValues])];
        const enumDef = allValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(",");
        const nullSql = attr.allowNull === false ? "NOT NULL" : "NULL";
        let defaultSql = "";
        if (attr.defaultValue !== undefined && attr.defaultValue !== null) {
          const def = String(attr.defaultValue).replace(/'/g, "''");
          defaultSql = ` DEFAULT '${def}'`;
        }

        await sequelize.query(
          `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${colName}\` ` +
            `ENUM(${enumDef}) ${nullSql}${defaultSql}`
        );
        console.log(
          `  [+] ${tableName}.${colName} ENUM étendu (+${missingInDb.join(", ")})`
        );
        updated++;
      } catch (err) {
        warn(`${tableName}.${colName} : impossible d'étendre l'ENUM (${err.message})`);
      }
    }
  }
  return updated;
}

/* ──────────── 4. Détection + suppression des tables orphelines ──────────── */

/**
 * Retourne la liste des tables présentes en DB mais absentes des modèles.
 * Ignore les tables système.
 */
async function getOrphanTables() {
  const qi = sequelize.getQueryInterface();
  const allTables = await qi.showAllTables();

  const knownTables = new Set();
  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    knownTables.add(typeof rawTable === "string" ? rawTable : rawTable.tableName);
  }

  const orphans = [];
  for (const raw of allTables) {
    const name = typeof raw === "string" ? raw : raw.tableName || raw.TABLE_NAME || raw.name;
    if (!name) continue;
    if (PROTECTED_TABLES.has(name)) continue;
    if (knownTables.has(name)) continue;
    orphans.push(name);
  }
  return orphans;
}

/**
 * Compte les lignes d'une table.
 */
async function countRows(tableName) {
  try {
    const [result] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM \`${tableName}\``
    );
    return Number(result?.[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Backup une table en SQL dans backups/<timestamp>_<table>.sql
 * Retourne le chemin du fichier ou null si erreur.
 */
async function backupTable(tableName) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const rows = await sequelize.query(`SELECT * FROM \`${tableName}\``, {
      type: sequelize.QueryTypes.SELECT,
    });

    if (!rows || rows.length === 0) {
      return null;
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(BACKUP_DIR, `${ts}_${tableName}.sql`);

    const columns = Object.keys(rows[0]);
    const lines = [
      `-- Backup automatique de la table \`${tableName}\``,
      `-- Date : ${new Date().toISOString()}`,
      `-- Lignes : ${rows.length}`,
      ``,
    ];

    for (const row of rows) {
      const values = columns.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "number") return String(v);
        if (typeof v === "boolean") return v ? "1" : "0";
        if (v instanceof Date) return `'${v.toISOString()}'`;
        return `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
      });
      lines.push(
        `INSERT INTO \`${tableName}\` (${columns.map((c) => `\`${c}\``).join(", ")}) ` +
          `VALUES (${values.join(", ")});`
      );
    }

    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    return filePath;
  } catch (err) {
    console.error(`  [✗] backup de ${tableName} échoué : ${err.message}`);
    return null;
  }
}

/**
 * Détecte les tables orphelines et les supprime conditionnellement.
 */
async function handleOrphanTables() {
  const orphans = await getOrphanTables();

  if (orphans.length === 0) {
    return { detected: 0, dropped: 0, warned: 0 };
  }

  console.log(`  [!] ${orphans.length} table(s) orpheline(s) détectée(s) :`);

  let dropped = 0;
  let warned = 0;

  for (const table of orphans) {
    const count = await countRows(table);
    const isEmpty = count === 0;

    // Cas 1 : mode warn (défaut) — on ne supprime jamais
    if (!DROP_ORPHAN) {
      warn(
        `table orpheline "${table}" (${count} ligne(s)) — ` +
          `non supprimée (définir DB_DROP_ORPHAN_TABLES=true pour autoriser)`
      );
      warned++;
      continue;
    }

    // Cas 2 : DROP_ORPHAN=true mais table NON vide et FORCE_DROP_NON_EMPTY=false
    if (!isEmpty && !FORCE_DROP_NON_EMPTY) {
      warn(
        `table orpheline "${table}" (${count} ligne(s)) — ` +
          `NON supprimée (non vide ; définir DB_FORCE_DROP_NON_EMPTY=true pour forcer)`
      );
      warned++;
      continue;
    }

    // Cas 3 : suppression autorisée
    let backupPath = null;
    if (!isEmpty) {
      console.log(`  [~] backup de "${table}" (${count} ligne(s))...`);
      backupPath = await backupTable(table);
      if (!backupPath) {
        warn(
          `table orpheline "${table}" — backup échoué, suppression ANNULÉE par sécurité`
        );
        warned++;
        continue;
      }
      console.log(`  [✓] backup sauvegardé : ${path.relative(process.cwd(), backupPath)}`);
    }

    try {
      await sequelize.query(`DROP TABLE \`${table}\``);
      console.log(
        `  [+] table orpheline supprimée : ${table}` +
          (backupPath ? ` (backup : ${path.basename(backupPath)})` : " (vide)")
      );
      dropped++;
    } catch (err) {
      warn(`table orpheline "${table}" : suppression échouée (${err.message})`);
      warned++;
    }
  }

  return { detected: orphans.length, dropped, warned };
}

/* ──────────── 5. Anomalies (colonnes orphelines) ──────────── */

async function detectAnomalies() {
  const qi = sequelize.getQueryInterface();
  const underscored = sequelize.options.define?.underscored === true;
  let anomalies = 0;

  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;
    if (!(await qi.tableExists(tableName))) continue;

    const dbCols = await qi.describeTable(tableName);
    const modelAttrs = model.rawAttributes;

    const expected = new Set(
      Object.entries(modelAttrs).map(([name, a]) =>
        expectedColumnName(name, a, underscored)
      )
    );
    const orphans = Object.keys(dbCols).filter((c) => !expected.has(c));
    if (orphans.length) {
      warn(
        `${tableName} : colonnes en DB absentes du modèle ` +
          `(NON supprimées) → ${orphans.join(", ")}`
      );
      anomalies += orphans.length;
    }
  }
  return anomalies;
}

/* ──────────── 6. Migration legacy Admin → User ──────────── */

async function migrateLegacyAdmins() {
  if (!AUTO_MIGRATE_LEGACY) {
    console.log("  [=] migration legacy désactivée");
    return { created: 0, skipped: 0 };
  }

  const { Admin, User } = getModels();

  let admins;
  try {
    admins = await Admin.findAll();
  } catch {
    console.log("  [=] table admins absente — rien à migrer");
    return { created: 0, skipped: 0 };
  }

  if (admins.length === 0) {
    console.log("  [=] aucun Admin legacy à migrer");
    return { created: 0, skipped: 0 };
  }

  let created = 0;
  let skipped = 0;

  for (const admin of admins) {
    const existing = await User.findOne({ where: { email: admin.email } });
    if (existing) { skipped++; continue; }

    const legacy = await User.findOne({ where: { legacy_admin_id: admin.id } });
    if (legacy) { skipped++; continue; }

    await User.create(
      {
        first_name: admin.username || "Admin",
        last_name: "DIC",
        email: admin.email,
        password: admin.password,
        role: ROLES.ADMIN,
        is_active: true,
        legacy_admin_id: admin.id,
      },
      { hooks: false }
    );
    console.log(`  [+] Admin#${admin.id} → User (${admin.email})`);
    created++;
  }

  return { created, skipped };
}

/* ──────────── 7. Admin par défaut ──────────── */

async function ensureDefaultAdmin() {
  const { User } = getModels();

  const existing = await User.findOne({
    where: { email: ADMIN_EMAIL, role: ROLES.ADMIN },
  });
  if (existing) {
    console.log(`  [=] admin déjà présent (${existing.email})`);
    return false;
  }

  await User.create({
    first_name: ADMIN_USERNAME,
    last_name: "DIC",
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: ROLES.ADMIN,
    is_active: true,
  });

  console.log(`  [+] admin créé : ${ADMIN_EMAIL}`);
  console.log("  ⚠️  Changez ADMIN_PASSWORD avant la mise en ligne.");
  return true;
}

/* ──────────── Entry point ──────────── */

async function runStartupMigrations() {
  console.log(`[db-sync] mode "${MODE}"`);
  if (DROP_ORPHAN) {
    console.log(
      `[db-sync] DROP_ORPHAN activé` +
        (FORCE_DROP_NON_EMPTY ? " + FORCE_DROP_NON_EMPTY" : " (tables vides uniquement)")
    );
  }

  if (MODE === "none") {
    console.log("[db-sync] aucune modification du schéma (mode none)");
    // On saute tout, y compris la détection orphelines
  } else if (MODE === "alter") {
    console.warn("[db-sync] ⚠️  mode alter — Sequelize peut supprimer/réécrire");
    await sequelize.sync({ alter: true });
    console.log("[db-sync] schéma synchronisé (alter)");
  } else {
    const tables = await ensureTables();
    const cols = await ensureColumns();
    const enums = await ensureEnumColumns();

    // Détection + traitement des tables orphelines
    const orphanResult = await handleOrphanTables();

    // Détection anomalies
    const anomalies = await detectAnomalies();

    if (
      tables === 0 &&
      cols === 0 &&
      enums === 0 &&
      orphanResult.detected === 0 &&
      anomalies === 0
    ) {
      console.log("[db-sync] [=] schéma à jour, aucune modification");
    } else {
      const parts = [];
      if (tables) parts.push(`${tables} table(s) créée(s)`);
      if (cols) parts.push(`${cols} colonne(s) ajoutée(s)`);
      if (enums) parts.push(`${enums} enum(s) étendu(s)`);
      if (orphanResult.dropped) parts.push(`${orphanResult.dropped} table(s) supprimée(s)`);
      if (orphanResult.warned) parts.push(`${orphanResult.warned} table(s) orpheline(s) ignorée(s)`);
      if (anomalies) parts.push(`${anomalies} anomalie(s)`);
      console.log(`[db-sync] [✓] ${parts.join(", ")}`);
    }

    if (anomalies > 0 && FAIL_ON_WARN) {
      throw new Error(
        `[db-sync] ${anomalies} anomalie(s) — mode strict, arrêt.`
      );
    }
  }

  // Migration legacy + admin par défaut (toujours exécutés sauf mode none)
  if (MODE !== "none") {
    const migrateResult = await migrateLegacyAdmins();
    if (migrateResult.created > 0) {
      console.log(
        `[db-migrate] ${migrateResult.created} admin(s) migré(s), ` +
          `${migrateResult.skipped} ignoré(s)`
      );
      console.log("[db-migrate] ⚠️  Anciens tokens admin invalides — re-login requis.");
    }

    await ensureDefaultAdmin();
  }
}

module.exports = { runStartupMigrations };