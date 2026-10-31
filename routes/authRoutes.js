const router = require("express").Router();
const { login, me } = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { loginLimiter } = require("../middlewares/rateLimit");

router.post("/login", loginLimiter, login);
router.get("/me", protect, me);

module.exports = router;