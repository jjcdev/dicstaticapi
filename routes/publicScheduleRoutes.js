const router = require("express").Router();
const ctrl = require("../controllers/publicScheduleController");

router.get("/", ctrl.listWeek);
router.get("/:workshopId", ctrl.getWorkshopWeek);

module.exports = router;