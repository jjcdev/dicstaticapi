const router = require("express").Router();
const ctrl = require("../controllers/phonePrefixController");

router.get("/", ctrl.list);

module.exports = router;