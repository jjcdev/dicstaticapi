const sanitizeHtml = require("sanitize-html");

/**
 * Strip AGRESSIF : retire les balises ET le contenu des tags dangereux
 * (<script>, <style>, <iframe>, <object>, <embed>, <noscript>).
 * Ne laisse QUE du texte.
 */
const stripAllTags = (input) => {
  if (typeof input !== "string") return input;
  // 1. Supprimer les blocs dangereux ENTIERS (contenu inclus)
  let out = input.replace(
    /<(script|style|iframe|object|embed|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ""
  );
  // 2. Supprimer les balises auto-fermantes dangereuses
  out = out.replace(/<(script|style|iframe|object|embed|noscript)\b[^>]*\/?>/gi, "");
  // 3. Supprimer les balises restantes (une seule passe, non-récursive → pas de ReDoS)
  out = out.replace(/<[^>]*>/g, "");
  return out;
};

const stripControlChars = (input) => {
  if (typeof input !== "string") return input;
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
};

const sanitizeLine = (input) => {
  if (typeof input !== "string") return input;
  return stripControlChars(stripAllTags(input)).replace(/\s+/g, " ").trim();
};

const sanitizeText = (input) => {
  if (typeof input !== "string") return input;
  return stripControlChars(stripAllTags(input)).replace(/\r\n/g, "\n").trim();
};

/**
 * HTML restreint (uniquement pour le règlement).
 * Whitelist : p, strong, em, ul, ol, li, a (http/https/mailto uniquement).
 * Les blocs <script>/<style>/<iframe> sont supprimés avec leur contenu.
 */
const sanitizeRichText = (input) => {
  if (typeof input !== "string") return input;

  const clean = sanitizeHtml(input, {
    allowedTags: [
      "p", "br", "hr",
      "strong", "b", "em", "i", "u", "s",
      "ul", "ol", "li",
      "h2", "h3", "h4",
      "blockquote", "code", "pre",
      "a",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });

  return stripControlChars(clean).replace(/\r\n/g, "\n").trim();
};

/**
 * Défense en profondeur contre la pollution de prototype.
 * Retire __proto__, constructor, prototype de tout objet.
 */
const stripProtoKeys = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  for (const key of ["__proto__", "constructor", "prototype"]) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      try {
        delete obj[key];
      } catch {
        /* ignore */
      }
    }
  }
  return obj;
};

module.exports = {
  stripAllTags,
  stripControlChars,
  sanitizeLine,
  sanitizeText,
  sanitizeRichText,
  stripProtoKeys,
};