const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const ActivityService = require("../services/activityService");
const { sendResponse } = require("../utils/sendResponse");
const activityService = new ActivityService();

exports.addTask = catchAsyncError(async (req, res, next) => {
  const createTask = await activityService.createTask(
    req.body,
    req?.user,
    req?.files
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "createTask"),
    createTask,
    statusCode.success
  );
});

exports.statusList = catchAsyncError(async (req, res, next) => {
  const statusList = await activityService.activityStatus();
  sendResponse(
    res,
    true,
    returnMessage("activity", "statusList"),
    statusList,
    statusCode.success
  );
});

exports.taskList = catchAsyncError(async (req, res, next) => {
  let taskList = await activityService.taskList(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "taskList"),
    taskList,
    statusCode.success
  );
});

exports.fetchTask = catchAsyncError(async (req, res, next) => {
  const fetchTask = await activityService.getTaskById(req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("activity", "fetchTask"),
    fetchTask,
    statusCode.success
  );
});
exports.updateTask = catchAsyncError(async (req, res, next) => {
  const updateTask = await activityService.updateTask(
    req.body,
    req?.params?.id,
    req?.files,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "updateTask"),
    updateTask,
    statusCode.success
  );
});
exports.deleteTask = catchAsyncError(async (req, res, next) => {
  const deleteTask = await activityService.deleteTask(req?.body);
  sendResponse(
    res,
    true,
    returnMessage("activity", "deleteTask"),
    deleteTask,
    statusCode.success
  );
});

exports.updateStatus = catchAsyncError(async (req, res, next) => {
  const updateStatus = await activityService.statusUpdate(
    req?.body,
    req.params.id,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "updateStatus"),
    updateStatus,
    statusCode.success
  );
});

exports.createCallActivity = catchAsyncError(async (req, res, next) => {
  await activityService.createCallMeeting(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityCreated"),
    {},
    200
  );
});

// this will help to update the details of the activity not the status
exports.updateCallActivity = catchAsyncError(async (req, res, next) => {
  await activityService.updateActivity(
    req.params.activityId,
    req.body,
    req.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityUpdated"),
    {},
    200
  );
});

exports.getActivity = catchAsyncError(async (req, res, next) => {
  const activity = await activityService.getActivity(req.params.activityId);
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityUpdated"),
    activity,
    200
  );
});

exports.getActivities = catchAsyncError(async (req, res, next) => {
  const activities = await activityService.getActivities(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityListFetched"),
    activities,
    200
  );
});

exports.leaderboard = catchAsyncError(async (req, res, next) => {
  const leaderboard = await activityService.leaderboard(req.body, req.user);
  sendResponse(res, true, undefined, leaderboard, 200);
});

// this function is used for the get the status of the attendees
exports.assignedActivity = catchAsyncError(async (req, res, next) => {
  const assigned_activity = await activityService.checkAnyActivitiesAssingend(
    req.body,
    req.user
  );
  sendResponse(res, true, undefined, assigned_activity, 200);
});

exports.tagList = catchAsyncError(async (req, res, next) => {
  let tagList = await activityService.tagList(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "tagsList"),
    tagList,
    statusCode.success
  );
});

exports.completionHistory = catchAsyncError(async (req, res, next) => {
  const completionHistory = await activityService.completionHistory(
    req.body,
    req.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "completionHistory"),
    completionHistory,
    statusCode.success
  );
});

exports.competitionStats = catchAsyncError(async (req, res, next) => {
  const competitionStats = await activityService.competitionStats(req.user);
  sendResponse(res, true, undefined, competitionStats, statusCode.success);
});
