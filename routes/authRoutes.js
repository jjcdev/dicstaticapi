const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { loginLimiter } = require("../middlewares/rateLimit");
const { loginIpLimiter, loginEmailLimiter } = require("../middlewares/rateLimit");

router.post("/register", loginLimiter, ctrl.register);
router.post("/login", loginLimiter, ctrl.login);
router.get("/me", protect, ctrl.me);
router.patch("/profile", protect, ctrl.updateProfile);
router.patch("/change-password", protect, ctrl.changePassword);
router.get("/check-role-change", protect, ctrl.checkRoleChange);
router.post("/login",loginIpLimiter,loginEmailLimiter,ctrl.login);
module.exports = router;