const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { loginIpLimiter, loginEmailLimiter } = require("../middlewares/rateLimit");

// Register : rate-limit IP seul (pas d'email check, l'email n'existe pas encore)
router.post("/register", loginIpLimiter, ctrl.register);

// Login : double rate-limit (IP + email)
router.post("/login", loginIpLimiter, loginEmailLimiter, ctrl.login);

// Routes protégées
router.get("/me", protect, ctrl.me);
router.patch("/profile", protect, ctrl.updateProfile);
router.patch("/change-password", protect, ctrl.changePassword);
router.get("/check-role-change", protect, ctrl.checkRoleChange);

module.exports = router;