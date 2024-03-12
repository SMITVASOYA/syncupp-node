const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const activityController = require("../controllers/activityController");
const { upload } = require("../helpers/multer");

const activityRoute = require("express").Router();
activityRoute.use(protect);
activityRoute.post(
  "/create-task",
  upload.array("attachments"),
  activityController.addTask
);
activityRoute.get("/get-status-list", activityController.statusList);
activityRoute.post("/task-list", activityController.taskList);
activityRoute.post("/tag-list", activityController.tagList);
activityRoute.get("/get-task/:id", activityController.fetchTask);
activityRoute.delete("/delete-task", activityController.deleteTask);
activityRoute.put(
  "/update-task/:id",
  upload.array("attachments"),
  activityController.updateTask
);
activityRoute.put("/update-status/:id", activityController.updateStatus);

activityRoute.post("/call-meeting", activityController.createCallActivity);
activityRoute.patch(
  "/update/call-meeting/:activityId",
  activityController.updateCallActivity
);
activityRoute.get("/call-meeting/:activityId", activityController.getActivity);
activityRoute.post("/list", activityController.getActivities);
activityRoute.post("/leaderboard", activityController.leaderboard);
activityRoute.post("/assigned_activity", activityController.leaderboard);

module.exports = activityRoute;
