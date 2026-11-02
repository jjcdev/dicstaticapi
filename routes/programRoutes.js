const router = require("express").Router();
const ctrl = require("../controllers/programController");
const { protectAdmin } = require("../middlewares/authMiddleware");
const { programPublicLimiter } = require("../middlewares/rateLimit");

router.get("/", programPublicLimiter, ctrl.publicList);
router.get("/:id", programPublicLimiter, ctrl.publicGetOne);

router.get("/admin/list", protectAdmin, ctrl.adminList);
router.get("/admin/:id", protectAdmin, ctrl.adminGetOne);
router.post("/reorder", protectAdmin, ctrl.reorder);
router.post("/", protectAdmin, ctrl.create);
router.put("/:id", protectAdmin, ctrl.update);
router.delete("/:id", protectAdmin, ctrl.remove);

module.exports = router;