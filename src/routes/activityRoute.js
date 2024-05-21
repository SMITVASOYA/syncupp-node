const { protect } = require("../middlewares/authMiddleware");
const activityController = require("../controllers/activityController");
const activityRoute = require("express").Router();
activityRoute.use(protect);

// // Task
// activityRoute.post(
//   "/create-task",
//   authorizeMultipleRoles(["agency", "team_agency"]),
//   checkFileSize,
//   upload.array("attachments"),
//   activityController.addTask
// );
// activityRoute.post("/task-list", activityController.taskList);
// activityRoute.get("/get-task/:id", activityController.fetchTask);
// activityRoute.delete("/delete-task", activityController.deleteTask);
// activityRoute.put(
//   "/update-task/:id",
//   checkFileSize,
//   upload.array("attachments"),
//   activityController.updateTask
// );
// activityRoute.post("/add-comment", activityController.addTaskComment);
// activityRoute.get(
//   "/list-comments/:task_id",
//   activityController.listTaskComment
// );
// activityRoute.post("/leave-task", activityController.leaveTask);
// activityRoute.put("/update-status/:id", activityController.updateTaskStatus);

// Call Meeting & Others
activityRoute.post("/call-meeting", activityController.createCallActivity);
activityRoute.patch(
  "/update/call-meeting/:activityId",
  activityController.updateCallActivity
);
activityRoute.get("/call-meeting/:activityId", activityController.getActivity);
activityRoute.post("/list", activityController.getActivities);
activityRoute.put("/update-status/:id", activityController.updateStatus);
activityRoute.delete("/delete-activity", activityController.deleteActivity);
activityRoute.get("/get-status-list", activityController.statusList);

// Common for Task And Activity

// Others
activityRoute.post("/leaderboard", activityController.leaderboard);
activityRoute.post("/assigned_activity", activityController.leaderboard);
activityRoute.post("/completion_history", activityController.completionHistory);
activityRoute.get("/competitionStats", activityController.competitionStats);

module.exports = activityRoute;
