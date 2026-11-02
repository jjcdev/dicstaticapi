/**
 * Synchronisation automatique de la base de données au démarrage.
 *
 * Étapes (dans l'ordre) :
 *   1. Crée les tables manquantes
 *   2. Ajoute les colonnes manquantes (sans FK d'abord, puis FK séparément)
 *   3. Étend les ENUM MySQL/TiDB si de nouvelles valeurs apparaissent
 *   4. Détecte les tables orphelines → drop conditionnel
 *   5. Détecte les anomalies (colonnes orphelines, FK manquantes)
 *   6. Migre les Admin legacy → User
 *   7. Crée l'admin par défaut si aucun n'existe
 *
 * Gestion des FK :
 *   - addColumn SANS references (bug connu Sequelize sur MySQL/TiDB)
 *   - addConstraint APRÈS, avec check idempotent via information_schema
 *   - TiDB : si tidb_enable_foreign_key=OFF, on warn et on n'essaie pas
 *
 * Modes :
 *   safe   (défaut) : applique tout ce qui est safe, warn le reste
 *   strict          : fail au démarrage si une action manuelle est requise
 *   none            : aucune modification du schéma
 *   alter           : Sequelize alter (dev uniquement, peut supprimer)
 *
 * Suppression de tables orphelines :
 *   DB_DROP_ORPHAN_TABLES=true        → active le drop (tables vides)
 *   DB_FORCE_DROP_NON_EMPTY=true      → autorise le drop non vide (backup auto)
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

/* ═══════════════════════════════════════════════════════════
   Helpers DB (dialect-aware)
   ═══════════════════════════════════════════════════════════ */

/**
 * Quote un identifiant selon le dialecte.
 * MySQL/TiDB → `xxx`
 * Postgres    → "xxx"
 */
function quoteIdent(name) {
  const dialect = sequelize.getDialect();
  if (dialect === "postgres") {
    return `"${String(name).replace(/"/g, '""')}"`;
  }
  return `\`${String(name).replace(/`/g, "``")}\``;
}

/**
 * Récupère la liste des tables réelles via information_schema.
 * Plus fiable que sequelize.getQueryInterface().showAllTables().
 */
async function listTables() {
  const dialect = sequelize.getDialect();
  let rows;

  if (dialect === "postgres") {
    [rows] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    return rows.map((r) => r.table_name);
  }

  // mysql / tidb / mariadb
  [rows] = await sequelize.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()`
  );
  return rows.map((r) => r.table_name || r.TABLE_NAME);
}

/**
 * Vérifie si une FK existe déjà (idempotence).
 */
async function fkExists(tableName, constraintName) {
  const dialect = sequelize.getDialect();
  let rows;

  if (dialect === "postgres") {
    [rows] = await sequelize.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = :table AND constraint_name = :name`,
      { replacements: { table: tableName, name: constraintName } }
    );
  } else {
    [rows] = await sequelize.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = DATABASE()
         AND table_name = :table
         AND constraint_name = :name`,
      { replacements: { table: tableName, name: constraintName } }
    );
  }

  return rows.length > 0;
}

/**
 * Vérifie si TiDB a les FK activées (OFF par défaut sur TiDB Cloud).
 */
async function tidbForeignKeysEnabled() {
  if (sequelize.getDialect() !== "mysql") return true;
  try {
    const [rows] = await sequelize.query(
      `SHOW VARIABLES LIKE 'tidb_enable_foreign_key'`
    );
    if (!rows || rows.length === 0) return true; // pas TiDB, c'est MySQL normal
    const val = rows[0].Value || rows[0].value;
    return val === "1" || val === "ON" || val === "on";
  } catch {
    return true;
  }
}

/* ═══════════════════════════════════════════════════════════
   1. Tables
   ═══════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════
   2. Colonnes + FK (séparément — fix MySQL/TiDB)
   ═══════════════════════════════════════════════════════════ */

async function ensureColumns() {
  const qi = sequelize.getQueryInterface();
  const underscored = sequelize.options.define?.underscored === true;
  const allTables = await listTables();
  const fkEnabled = await tidbForeignKeysEnabled();

  let added = 0;
  let fkAdded = 0;
  let fkSkipped = 0;

  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    const tableName = typeof rawTable === "string" ? rawTable : rawTable.tableName;
    if (!allTables.includes(tableName)) continue;

    const dbCols = await qi.describeTable(tableName);
    const modelAttrs = model.rawAttributes;

    for (const [attrName, attr] of Object.entries(modelAttrs)) {
      if (attr.type && attr.type.key === "VIRTUAL") continue;
      const colName = expectedColumnName(attrName, attr, underscored);

      // ─── 2a. Ajouter la colonne SI elle manque (SANS FK) ───
      if (!dbCols[colName]) {
        const colAttr = {
          type: attr.type,
          allowNull: true, // toujours nullable à la création, resserré ensuite
          defaultValue: attr.defaultValue,
          comment: attr.comment,
        };

        if (
          attr.allowNull === false &&
          attr.defaultValue === undefined &&
          attr.autoIncrement !== true
        ) {
          warn(
            `${tableName}.${colName} ajoutée NULLABLE ` +
              `(NOT NULL sans default — remplir puis passer en NOT NULL manuellement)`
          );
        }

        try {
          await qi.addColumn(tableName, colName, colAttr);
          console.log(`  [+] ${tableName}.${colName} ajoutée`);
          added++;
        } catch (err) {
          warn(`${tableName}.${colName} : échec d'ajout (${err.message})`);
          continue;
        }
      }

      // ─── 2b. Ajouter la FK SI déclarée et si la cible existe ───
      if (!attr.references) continue;

      const refTable =
        typeof attr.references.model === "string"
          ? attr.references.model
          : attr.references.model.tableName;

      if (!allTables.includes(refTable)) {
        // La table cible n'existe pas encore → reporté au prochain boot
        continue;
      }

      if (!fkEnabled) {
        warn(
          `${tableName}.${colName} FK ignorée ` +
            `(TiDB : tidb_enable_foreign_key=OFF)`
        );
        fkSkipped++;
        continue;
      }

      const fkName = `${tableName}_${colName}_fk`;

      if (await fkExists(tableName, fkName)) {
        continue; // déjà présente
      }

      try {
        await qi.addConstraint(tableName, {
          type: "foreign key",
          fields: [colName],
          name: fkName,
          references: {
            table: refTable,
            field: attr.references.key || "id",
          },
          onDelete: attr.onDelete || "SET NULL",
          onUpdate: attr.onUpdate || "CASCADE",
        });
        console.log(`  [+] ${tableName}.${colName} FK → ${refTable}`);
        fkAdded++;
      } catch (err) {
        // Cas bénins : FK déjà existante sous un autre nom, contraintes système
        if (
          !/Duplicate foreign key|already exists|errno: 121|ER_FK_DUP_NAME/i.test(
            err.message
          )
        ) {
          warn(`${tableName}.${colName} FK : ${err.message}`);
        }
      }
    }
  }

  return { added, fkAdded, fkSkipped };
}

/* ═══════════════════════════════════════════════════════════
   3. Extension des ENUM (MySQL / TiDB)
   ═══════════════════════════════════════════════════════════ */

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
        const enumDef = allValues
          .map((v) => `'${v.replace(/'/g, "''")}'`)
          .join(",");
        const nullSql = attr.allowNull === false ? "NOT NULL" : "NULL";
        let defaultSql = "";
        if (attr.defaultValue !== undefined && attr.defaultValue !== null) {
          const def = String(attr.defaultValue).replace(/'/g, "''");
          defaultSql = ` DEFAULT '${def}'`;
        }

        await sequelize.query(
          `ALTER TABLE ${quoteIdent(tableName)} MODIFY COLUMN ${quoteIdent(
            colName
          )} ENUM(${enumDef}) ${nullSql}${defaultSql}`
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

/* ═══════════════════════════════════════════════════════════
   4. Tables orphelines (drop conditionnel + backup)
   ═══════════════════════════════════════════════════════════ */

async function getOrphanTables() {
  const allTables = await listTables();

  const knownTables = new Set();
  for (const [, model] of Object.entries(sequelize.models)) {
    const rawTable = model.getTableName();
    knownTables.add(typeof rawTable === "string" ? rawTable : rawTable.tableName);
  }

  return allTables.filter(
    (name) => !PROTECTED_TABLES.has(name) && !knownTables.has(name)
  );
}

async function countRows(tableName) {
  try {
    const [rows] = await sequelize.query(
      `SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`
    );
    return Number(rows?.[0]?.count ?? rows?.[0]?.COUNT ?? 0);
  } catch {
    return 0;
  }
}

async function backupTable(tableName) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const rows = await sequelize.query(
      `SELECT * FROM ${quoteIdent(tableName)}`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (!rows || rows.length === 0) return null;

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(BACKUP_DIR, `${ts}_${tableName}.sql`);

    const columns = Object.keys(rows[0]);
    const lines = [
      `-- Backup automatique de la table ${quoteIdent(tableName)}`,
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
        `INSERT INTO ${quoteIdent(tableName)} (${columns
          .map(quoteIdent)
          .join(", ")}) VALUES (${values.join(", ")});`
      );
    }

    fs.writeFileSync(filePath, lines.join("\n"), "utf8");
    return filePath;
  } catch (err) {
    console.error(`  [✗] backup de ${tableName} échoué : ${err.message}`);
    return null;
  }
}

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

    if (!DROP_ORPHAN) {
      warn(
        `table orpheline "${table}" (${count} ligne(s)) — ` +
          `non supprimée (définir DB_DROP_ORPHAN_TABLES=true pour autoriser)`
      );
      warned++;
      continue;
    }

    if (!isEmpty && !FORCE_DROP_NON_EMPTY) {
      warn(
        `table orpheline "${table}" (${count} ligne(s)) — ` +
          `NON supprimée (non vide ; définir DB_FORCE_DROP_NON_EMPTY=true pour forcer)`
      );
      warned++;
      continue;
    }

    let backupPath = null;
    if (!isEmpty) {
      console.log(`  [~] backup de "${table}" (${count} ligne(s))...`);
      backupPath = await backupTable(table);
      if (!backupPath) {
        warn(
          `table orpheline "${table}" — backup échoué, suppression ANNULÉE`
        );
        warned++;
        continue;
      }
      console.log(`  [✓] backup : ${path.relative(process.cwd(), backupPath)}`);
    }

    try {
      await sequelize.query(`DROP TABLE ${quoteIdent(table)}`);
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

/* ═══════════════════════════════════════════════════════════
   5. Anomalies (colonnes orphelines)
   ═══════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════
   6. Migration Admin legacy → User
   ═══════════════════════════════════════════════════════════ */

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
    if (existing) {
      skipped++;
      continue;
    }

    const legacy = await User.findOne({ where: { legacy_admin_id: admin.id } });
    if (legacy) {
      skipped++;
      continue;
    }

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

/* ═══════════════════════════════════════════════════════════
   7. Admin par défaut
   ═══════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════
   Entry point
   ═══════════════════════════════════════════════════════════ */

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
  } else if (MODE === "alter") {
    console.warn("[db-sync] ⚠️  mode alter — Sequelize peut supprimer/réécrire");
    await sequelize.sync({ alter: true });
    console.log("[db-sync] schéma synchronisé (alter)");
  } else {
    const tables = await ensureTables();
    const colsResult = await ensureColumns();
    const enums = await ensureEnumColumns();
    const orphanResult = await handleOrphanTables();
    const anomalies = await detectAnomalies();

    const parts = [];
    if (tables) parts.push(`${tables} table(s) créée(s)`);
    if (colsResult.added) parts.push(`${colsResult.added} colonne(s) ajoutée(s)`);
    if (colsResult.fkAdded) parts.push(`${colsResult.fkAdded} FK ajoutée(s)`);
    if (colsResult.fkSkipped) parts.push(`${colsResult.fkSkipped} FK ignorée(s)`);
    if (enums) parts.push(`${enums} enum(s) étendu(s)`);
    if (orphanResult.dropped) parts.push(`${orphanResult.dropped} table(s) supprimée(s)`);
    if (orphanResult.warned) parts.push(`${orphanResult.warned} table(s) orpheline(s) ignorée(s)`);
    if (anomalies) parts.push(`${anomalies} anomalie(s)`);

    if (parts.length === 0) {
      console.log("[db-sync] [=] schéma à jour, aucune modification");
    } else {
      console.log(`[db-sync] [✓] ${parts.join(", ")}`);
    }

    if (anomalies > 0 && FAIL_ON_WARN) {
      throw new Error(
        `[db-sync] ${anomalies} anomalie(s) — mode strict, arrêt.`
      );
    }
  }

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