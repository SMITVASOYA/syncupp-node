const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const ActivityService = require("../services/activityService");
const { sendResponse } = require("../utils/sendResponse");
const activityService = new ActivityService();

exports.createCallActivity = catchAsyncError(async (req, res, next) => {
  await activityService.createCallMeeting(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityCreated"),
    {},
    200
  );
});

exports.getActivity = catchAsyncError(async (req, res, next) => {
  const activity = await activityService.getActivityById(
    req?.params?.activityId
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityFetched"),
    activity,
    200
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

exports.deleteActivity = catchAsyncError(async (req, res, next) => {
  const deleteActivity = await activityService.deleteActivity(req?.body);
  sendResponse(
    res,
    true,
    returnMessage("activity", "deleteActivity"),
    deleteActivity,
    statusCode.success
  );
});

exports.updateStatus = catchAsyncError(async (req, res, next) => {
  const updateStatus = await activityService.statusUpdate(
    req?.body,
    req?.params?.id,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityStatusUpdated"),
    updateStatus,
    statusCode.success
  );
});

// this will help to update the details of the activity not the status
exports.updateCallActivity = catchAsyncError(async (req, res, next) => {
  await activityService.updateActivity(
    req?.params?.activityId,
    req?.body,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityUpdated"),
    {},
    200
  );
});

exports.getActivities = catchAsyncError(async (req, res, next) => {
  const activities = await activityService.getActivities(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("activity", "activityListFetched"),
    activities,
    200
  );
});

exports.leaderboard = catchAsyncError(async (req, res, next) => {
  const leaderboard = await activityService.leaderboard(req?.body, req?.user);
  sendResponse(res, true, undefined, leaderboard, 200);
});

// this function is used for the get the status of the attendees
exports.assignedActivity = catchAsyncError(async (req, res, next) => {
  const assigned_activity = await activityService.checkAnyActivitiesAssingend(
    req?.body,
    req?.user
  );
  sendResponse(res, true, undefined, assigned_activity, 200);
});

exports.completionHistory = catchAsyncError(async (req, res, next) => {
  const completionHistory = await activityService.completionHistory(
    req?.body,
    req?.user
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
  const competitionStats = await activityService.competitionStats(req?.user);
  sendResponse(res, true, undefined, competitionStats, statusCode.success);
});

exports.createCallGoogleMeeting = catchAsyncError(async (req, res, next) => {
  const createCallGoogleMeeting = await activityService.createCallGoogleMeeting(
    req?.body,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("activity", "createCallMeeting"),
    createCallGoogleMeeting,
    200
  );
});
