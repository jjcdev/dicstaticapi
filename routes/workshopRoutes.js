const router = require("express").Router();
const ctrl = require("../controllers/workshopController");
const { protect } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/rbac");

router.get(
  "/available",
  protect,
  authorize("workshop:read_available"),
  ctrl.getAvailable
);

router.get("/my-workshops", protect, ctrl.getMyWorkshops);

router.get(
  "/",
  protect,
  authorize("workshop:read_all", "workshop:read_own"),
  ctrl.getAll
);

router.post("/", protect, authorize("workshop:create"), ctrl.create);

router.get("/:id", protect, ctrl.getOne);

router.patch(
  "/:id",
  protect,
  authorize("workshop:update_own", "workshop:update_all"),
  ctrl.update
);

router.delete(
  "/:id",
  protect,
  authorize("workshop:delete"),
  ctrl.remove
);

router.post("/:id/join", protect, authorize("workshop:join"), ctrl.joinRequest);
router.post("/:id/leave", protect, authorize("workshop:leave"), ctrl.leaveWorkshop);
router.get("/:id/requests", protect, ctrl.getRequests);
router.patch("/:id/enrollment", protect, authorize("student:accept"), ctrl.manageEnrollment);

module.exports = router;