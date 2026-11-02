const { phonePrefixes } = require("../config/phonePrefixes");
const {
  sanitizeLine,
  sanitizeText,
  sanitizeRichText,
} = require("./sanitize");
const AppError = require("./AppError");

const POLE_CANONICAL = ["ia", "cybersecurity", "robotics"];

/* ──────── ValidationError : extension de AppError ──────── */

class ValidationError extends AppError {
  constructor(fields) {
    super("Validation échouée.", 400);
    this.name = "ValidationError";
    this.fields = fields; // { champ: "message", ... }
  }
}

/* ──────── Utilitaires de normalisation ──────── */

const stripAccents = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const POLE_ALIASES = {
  ia: "ia",
  ai: "ia",
  "intelligence artificielle": "ia",
  "intelligence-artificielle": "ia",
  "artificial intelligence": "ia",
  cybersecurite: "cybersecurity",
  cybersecurity: "cybersecurity",
  cyber: "cybersecurity",
  "securite informatique": "cybersecurity",
  "securite-informatique": "cybersecurity",
  robotique: "robotics",
  robotics: "robotics",
  robot: "robotics",
};

const normalizePole = (input) => {
  if (typeof input !== "string") return null;
  const key = stripAccents(input.trim().toLowerCase());
  return POLE_ALIASES[key] || null;
};

const normalizePhonePrefix = (input) => {
  if (typeof input !== "string") return input;
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  if (!cleaned) return cleaned;
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2)}`;
  return `+${cleaned}`;
};

const trim = (v) => (typeof v === "string" ? v.trim() : v);

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : email;

const isEmail = (email) =>
  typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const normalizePhone = (phone) =>
  typeof phone === "string" ? phone.replace(/[\s\-().]/g, "") : phone;

const isValidDate = (s) => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const normalizeTime = (s) => {
  if (typeof s !== "string") return s;
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return m ? `${m[1]}:${m[2]}` : s;
};

const isValidTime = (s) =>
  typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(normalizeTime(s));

/* ──────── Candidature ──────── */

const validateApplication = (body = {}) => {
  const fields = {};

  const first_name = trim(body.first_name);
  const last_name = trim(body.last_name);
  const school = trim(body.school);
  const field_of_study = trim(body.field_of_study);
  const pole = normalizePole(body.pole);
  const email = normalizeEmail(body.email);
  const phone_prefix = normalizePhonePrefix(body.phone_prefix);
  const phone_number = normalizePhone(body.phone_number);
  const motivations = trim(body.motivations);
  const source = trim(body.source) || null;

  if (!first_name || first_name.length < 2 || first_name.length > 100) {
    fields.first_name = "Prénom requis (2 à 100 caractères).";
  }
  if (!last_name || last_name.length < 2 || last_name.length > 100) {
    fields.last_name = "Nom requis (2 à 100 caractères).";
  }
  if (!school || school.length > 160) {
    fields.school = "Établissement requis (max 160 caractères).";
  }
  if (!field_of_study || field_of_study.length > 160) {
    fields.field_of_study = "Filière requise (max 160 caractères).";
  }
  if (!pole) {
    fields.pole = `Pôle invalide. Valeurs acceptées : ${POLE_CANONICAL.join(", ")}.`;
  }
  if (!isEmail(email) || email.length > 160) {
    fields.email = "Email invalide.";
  }
  if (!phone_prefix || !phonePrefixes[phone_prefix]) {
    fields.phone_prefix = "Préfixe téléphonique non supporté.";
  } else if (
    !phone_number ||
    !phonePrefixes[phone_prefix].pattern.test(phone_number)
  ) {
    fields.phone_number = `Numéro invalide pour ${phonePrefixes[phone_prefix].label}. Format attendu : ${phonePrefixes[phone_prefix].placeholder}.`;
  }
  if (!motivations || motivations.length < 30 || motivations.length > 2000) {
    fields.motivations = "Motivations requises (30 à 2000 caractères).";
  }
  if (source && source.length > 160) {
    fields.source = "Source trop longue (max 160 caractères).";
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);

  return {
    first_name,
    last_name,
    school,
    field_of_study,
    pole,
    email,
    phone_prefix,
    phone_number,
    motivations,
    source,
  };
};

/* ──────── Contact ──────── */

const validateContactMessage = (body = {}) => {
  const fields = {};

  const name = sanitizeLine(trim(body.name));
  const email = normalizeEmail(body.email);
  const subject = sanitizeLine(trim(body.subject));
  const message = sanitizeText(String(body.message ?? ""));

  if (!name || name.length < 2 || name.length > 120) {
    fields.name = "Nom requis (2 à 120 caractères).";
  }
  if (!isEmail(email) || email.length > 160) {
    fields.email = "Email invalide.";
  }
  if (!subject || subject.length < 2 || subject.length > 200) {
    fields.subject = "Sujet requis (2 à 200 caractères).";
  }
  if (!message || message.length < 10 || message.length > 5000) {
    fields.message = "Message requis (10 à 5000 caractères).";
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return { name, email, subject, message };
};

/* ──────── Règlement ──────── */

const validateRuleSection = (body = {}, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length > 160) {
      fields.title = "Titre requis (max 160 caractères).";
    } else {
      data.title = title;
    }
  }

  if (body.content !== undefined || !partial) {
    const raw = typeof body.content === "string" ? body.content : "";
    const content = sanitizeRichText(raw);
    if (!content) {
      fields.content = "Contenu requis.";
    } else if (content.length > 20000) {
      fields.content = "Contenu trop long (max 20000 caractères).";
    } else {
      data.content = content;
    }
  }

  if (body.display_order !== undefined || !partial) {
    const order = parseInt(body.display_order, 10);
    if (!Number.isInteger(order) || order < 0) {
      fields.display_order = "Ordre d'affichage invalide (entier positif requis).";
    } else {
      data.display_order = order;
    }
  }

  if (body.slug !== undefined) {
    const slug = trim(body.slug);
    if (slug && !/^[a-z0-9-]+$/.test(slug)) {
      fields.slug = "Slug invalide (minuscules, chiffres et tirets uniquement).";
    } else {
      data.slug = slug || null;
    }
  }

  if (body.is_published !== undefined) {
    data.is_published = !!body.is_published;
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

/* ──────── Programme annuel ──────── */

const validateProgramItem = (body = {}, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length < 2 || title.length > 200) {
      fields.title = "Titre requis (2 à 200 caractères).";
    } else {
      data.title = title;
    }
  }

  if (body.description !== undefined || !partial) {
    const raw = body.description;
    if (raw === null || raw === undefined || raw === "") {
      data.description = null;
    } else {
      const description = sanitizeText(String(raw));
      if (description.length > 5000) {
        fields.description = "Description trop longue (max 5000 caractères).";
      } else {
        data.description = description || null;
      }
    }
  }

  if (body.start_date !== undefined || !partial) {
    if (!isValidDate(body.start_date)) {
      fields.start_date = "Date de début invalide (format YYYY-MM-DD).";
    } else {
      data.start_date = body.start_date;
    }
  }

  if (body.end_date !== undefined) {
    if (body.end_date === null || body.end_date === "") {
      data.end_date = null;
    } else if (!isValidDate(body.end_date)) {
      fields.end_date = "Date de fin invalide (format YYYY-MM-DD).";
    } else {
      data.end_date = body.end_date;
    }
  }

  if (body.start_time !== undefined) {
    if (body.start_time === null || body.start_time === "") {
      data.start_time = null;
    } else {
      const t = normalizeTime(body.start_time);
      if (!isValidTime(t)) {
        fields.start_time = "Heure de début invalide (format HH:MM).";
      } else {
        data.start_time = t;
      }
    }
  }

  if (body.end_time !== undefined) {
    if (body.end_time === null || body.end_time === "") {
      data.end_time = null;
    } else {
      const t = normalizeTime(body.end_time);
      if (!isValidTime(t)) {
        fields.end_time = "Heure de fin invalide (format HH:MM).";
      } else {
        data.end_time = t;
      }
    }
  }

  if (body.location !== undefined) {
    if (body.location === null || body.location === "") {
      data.location = null;
    } else {
      const location = sanitizeLine(String(body.location));
      if (location.length > 160) {
        fields.location = "Lieu trop long (max 160 caractères).";
      } else {
        data.location = location || null;
      }
    }
  }

  if (body.room !== undefined) {
    if (body.room === null || body.room === "") {
      data.room = null;
    } else {
      const room = sanitizeLine(String(body.room));
      if (room.length > 120) {
        fields.room = "Salle trop longue (max 120 caractères).";
      } else {
        data.room = room || null;
      }
    }
  }

  if (body.pole !== undefined) {
    if (
      body.pole === null ||
      body.pole === "" ||
      body.pole === "club" ||
      body.pole === "all"
    ) {
      data.pole = null;
    } else {
      const pole = normalizePole(body.pole);
      if (!pole) {
        fields.pole = `Pôle invalide. Valeurs acceptées : ${POLE_CANONICAL.join(
          ", "
        )} ou null (tout le club).`;
      } else {
        data.pole = pole;
      }
    }
  }

  if (body.is_public !== undefined) {
    if (typeof body.is_public !== "boolean") {
      fields.is_public = "is_public doit être un booléen.";
    } else {
      data.is_public = body.is_public;
    }
  }

  if (body.display_order !== undefined) {
    const order = parseInt(body.display_order, 10);
    if (!Number.isInteger(order) || order < 0) {
      fields.display_order = "Ordre d'affichage invalide (entier positif requis).";
    } else {
      data.display_order = order;
    }
  }

  if (body.academic_year_id !== undefined) {
    if (body.academic_year_id === null || body.academic_year_id === "") {
      data.academic_year_id = null;
    } else {
      const yearId = parseInt(body.academic_year_id, 10);
      if (!Number.isInteger(yearId) || yearId < 1) {
        fields.academic_year_id = "Identifiant d'année académique invalide.";
      } else {
        data.academic_year_id = yearId;
      }
    }
  }

  if (data.start_date && data.end_date && data.end_date < data.start_date) {
    fields.end_date = "La date de fin doit être ≥ à la date de début.";
  }
  if (data.start_time && data.end_time && data.end_time <= data.start_time) {
    fields.end_time = "L'heure de fin doit être > à l'heure de début.";
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};
/* ──────── Semaines (week_start = dimanche) ──────── */

/**
 * Normalise une date YYYY-MM-DD vers le dimanche de sa semaine.
 * Ex : "2026-11-11" (mercredi) → "2026-11-08" (dimanche)
 */
const normalizeToSunday = (dateStr) => {
  if (!isValidDate(dateStr)) return null;
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = dimanche
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

/**
 * Dimanche de la semaine courante (UTC).
 */
const currentWeekSunday = () => {
  const now = new Date();
  const day = now.getUTCDay();
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

/**
 * Ajoute n jours à une date YYYY-MM-DD.
 */
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ──────── WeeklySchedule ──────── */

const validateWeeklySchedulePayload = (body = {}) => {
  const fields = {};
  const data = {};

  if (!body.workshop_id || typeof body.workshop_id !== "string") {
    fields.workshop_id = "workshop_id requis.";
  } else {
    data.workshop_id = body.workshop_id;
  }

  const week_start = normalizeToSunday(body.week_start);
  if (!week_start) {
    fields.week_start = "week_start invalide (YYYY-MM-DD attendu).";
  } else if (week_start < currentWeekSunday()) {
    fields.week_start = "Impossible de créer un planning pour une semaine passée.";
  } else {
    data.week_start = week_start;
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

/* ──────── WeeklyScheduleSlot ──────── */

const validateSlotPayload = (body = {}, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.day_of_week !== undefined || !partial) {
    const dow = parseInt(body.day_of_week, 10);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      fields.day_of_week = "day_of_week doit être entre 0 (dim.) et 6 (sam.).";
    } else {
      data.day_of_week = dow;
    }
  }

  if (body.start_time !== undefined || !partial) {
    const t = normalizeTime(body.start_time);
    if (!isValidTime(t)) {
      fields.start_time = "start_time invalide (HH:MM).";
    } else {
      data.start_time = t;
    }
  }

  if (body.end_time !== undefined || !partial) {
    const t = normalizeTime(body.end_time);
    if (!isValidTime(t)) {
      fields.end_time = "end_time invalide (HH:MM).";
    } else {
      data.end_time = t;
    }
  }

  if (data.start_time && data.end_time && data.end_time <= data.start_time) {
    fields.end_time = "end_time doit être > start_time.";
  }

  if (body.title !== undefined || !partial) {
    const title = sanitizeLine(trim(body.title));
    if (!title || title.length > 160) {
      fields.title = "Titre requis (max 160 caractères).";
    } else {
      data.title = title;
    }
  }

  if (body.location !== undefined) {
    if (body.location === null || body.location === "") {
      data.location = null;
    } else {
      const loc = sanitizeLine(String(body.location));
      if (loc.length > 160) {
        fields.location = "Lieu trop long (max 160).";
      } else {
        data.location = loc || null;
      }
    }
  }

  if (body.room !== undefined) {
    if (body.room === null || body.room === "") {
      data.room = null;
    } else {
      const room = sanitizeLine(String(body.room));
      if (room.length > 120) {
        fields.room = "Salle trop longue (max 120).";
      } else {
        data.room = room || null;
      }
    }
  }

  if (body.display_order !== undefined) {
    const order = parseInt(body.display_order, 10);
    if (!Number.isInteger(order) || order < 0) {
      fields.display_order = "display_order doit être ≥ 0.";
    } else {
      data.display_order = order;
    }
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};
/* ──────── SessionReport ──────── */

const validateReportPayload = (body = {}, { partial = false } = {}) => {
  const fields = {};
  const data = {};

  if (body.workshop_id !== undefined || !partial) {
    if (!body.workshop_id || typeof body.workshop_id !== "string") {
      fields.workshop_id = "workshop_id requis.";
    } else {
      data.workshop_id = body.workshop_id;
    }
  }

  if (body.date !== undefined || !partial) {
    if (!isValidDate(body.date)) {
      fields.date = "date invalide (YYYY-MM-DD).";
    } else {
      const today = new Date().toISOString().slice(0, 10);
      if (body.date > today) {
        fields.date = "Impossible de créer un rapport pour une date future.";
      } else {
        data.date = body.date;
      }
    }
  }

  for (const key of ["activities", "concepts", "takeaways"]) {
    if (body[key] !== undefined) {
      if (body[key] === null || body[key] === "") {
        data[key] = null;
      } else {
        const t = sanitizeText(String(body[key]));
        if (t.length > 10000) {
          fields[key] = `${key} trop long (max 10000).`;
        } else {
          data[key] = t || null;
        }
      }
    }
  }

  if (body.client_id !== undefined) {
    if (body.client_id === null || body.client_id === "") {
      data.client_id = null;
    } else if (
      typeof body.client_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        body.client_id
      )
    ) {
      fields.client_id = "client_id doit être un UUID.";
    } else {
      data.client_id = body.client_id;
    }
  }

  if (body.client_created_at !== undefined) {
    if (body.client_created_at === null || body.client_created_at === "") {
      data.client_created_at = null;
    } else {
      const d = new Date(body.client_created_at);
      if (isNaN(d.getTime())) {
        fields.client_created_at = "client_created_at invalide.";
      } else if (d.getTime() > Date.now() + 5 * 60 * 1000) {
        fields.client_created_at = "client_created_at ne peut pas être dans le futur.";
      } else {
        data.client_created_at = d;
      }
    }
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};

const validateAttendeeEntry = (entry = {}) => {
  const fields = {};
  const data = {};

  if (!entry.student_id || typeof entry.student_id !== "string") {
    fields.student_id = "student_id requis.";
  } else {
    data.student_id = entry.student_id;
  }

  const status = entry.status === "present" ? "present" : "absent";
  data.status = status;

  if (status === "absent" && entry.absence_reason) {
    const reason = sanitizeText(String(entry.absence_reason));
    if (reason.length > 1000) {
      fields.absence_reason = "Raison trop longue (max 1000).";
    } else {
      data.absence_reason = reason || null;
    }
  } else {
    data.absence_reason = null;
  }

  if (Object.keys(fields).length) throw new ValidationError(fields);
  return data;
};
module.exports = {
  POLE_CANONICAL,
  ValidationError,
  trim,
  isEmail,
  normalizeEmail,
  normalizePhone,
  normalizePhonePrefix,
  normalizePole,
  isValidDate,
  isValidTime,
  validateApplication,
  validateContactMessage,
  validateRuleSection,
  validateProgramItem,
  normalizeToSunday,
currentWeekSunday,
addDays,
validateWeeklySchedulePayload,
validateSlotPayload,
validateReportPayload,
validateAttendeeEntry,
};