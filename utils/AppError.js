/**
 * Erreur applicative standardisée.
 *
 * - statusCode : code HTTP (400, 401, 403, 404, 409, 500...)
 * - isOperational = true : erreur "attendue" (métier/validation), gérée proprement
 * - isOperational = false (défaut) : erreur inattendue, message caché en prod
 *
 * Toute erreur levée avec `throw new AppError(...)` est considérée comme
 * une erreur métier dont le message PEUT être renvoyé au client.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.isOperational = statusCode >= 400 && statusCode < 500;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;