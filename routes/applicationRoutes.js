const router = require("express").Router();
const ctrl = require("../controllers/applicationController");
const { protectAdmin } = require("../middlewares/authMiddleware");
const { applicationIpLimiter } = require("../middlewares/rateLimit");

// Public
router.post("/", applicationIpLimiter, ctrl.create);

// Admin — protectAdmin obligatoire
router.get("/", protectAdmin, ctrl.list);
router.get("/:id", protectAdmin, ctrl.getOne);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;