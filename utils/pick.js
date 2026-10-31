const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Extrait UNIQUEMENT les clés autorisées d'un objet.
 * - Ignore les clés héritées (hasOwnProperty strict)
 * - Bloque __proto__ / constructor / prototype
 * - Ignore les undefined
 */
module.exports = (obj, keys) => {
  const out = {};
  if (!obj || typeof obj !== "object") return out;

  for (const k of keys) {
    if (typeof k !== "string" || DANGEROUS.has(k)) continue;
    if (
      Object.prototype.hasOwnProperty.call(obj, k) &&
      obj[k] !== undefined
    ) {
      out[k] = obj[k];
    }
  }
  return out;
};