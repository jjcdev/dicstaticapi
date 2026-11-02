const router = require("express").Router();
const ctrl = require("../controllers/sessionController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/rbac");

router.get("/workshops/:workshopId/sessions", protect, ctrl.getSessions);
router.post(
  "/workshops/:workshopId/sessions",
  protect,
  authorize("session:create_own", "session:create"),
  ctrl.createSession
);

router.get("/:id", protect, ctrl.getSession);
router.patch(
  "/:id",
  protect,
  authorize("session:update_own", "session:update"),
  ctrl.updateSession
);
router.delete(
  "/:id",
  protect,
  authorize("session:delete_own", "session:delete"),
  ctrl.deleteSession
);

module.exports = router;