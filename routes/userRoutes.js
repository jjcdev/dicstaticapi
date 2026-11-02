const router = require("express").Router();
const ctrl = require("../controllers/userController");
const { protect, protectAdmin } = require("../middlewares/authMiddleware");

router.get("/", protectAdmin, ctrl.getAll);
router.get("/:id", protect, ctrl.getOne);
router.patch("/:id/role", protectAdmin, ctrl.updateRole);
router.patch("/:id/activate", protectAdmin, ctrl.reactivate);
router.delete("/:id", protectAdmin, ctrl.deactivate);

module.exports = router;