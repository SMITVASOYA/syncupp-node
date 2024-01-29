const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const activityController = require("../controllers/activityController");
const activityRoute = require("express").Router();

activityRoute.post("/create-task", activityController.addTask);
activityRoute.get("/get-list", activityController.statusList);

module.exports = activityRoute;
