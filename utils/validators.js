const { phonePrefixes } = require("../config/phonePrefixes");
const {
  sanitizeLine,
  sanitizeText,
  sanitizeRichText,
} = require("./sanitize");

const POLE_CANONICAL = ["ia", "cybersecurity", "robotics"];

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

class ValidationError extends Error {
  constructor(fields) {
    super("Validation échouée.");
    this.name = "ValidationError";
    this.fields = fields;
    this.status = 400;
  }
}

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

/* ────────── Candidature ────────── */

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
    first_name, last_name, school, field_of_study, pole, email,
    phone_prefix, phone_number, motivations, source,
  };
};

/* ────────── Contact ────────── */

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

/* ────────── Règlement ────────── */

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

/* ────────── Programme annuel ────────── */

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
};