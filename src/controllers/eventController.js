const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const EventService = require("../services/eventService");
const { sendResponse } = require("../utils/sendResponse");
const eventService = new EventService();

exports.createEvent = catchAsyncError(async (req, res, next) => {
  const createEvent = await eventService.createEvent(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("event", "createEvent"),
    createEvent,
    statusCode.success
  );
});

exports.fetchEvent = catchAsyncError(async (req, res, next) => {
  const fetchEvent = await eventService.fetchEvent(req?.params?.id);
  sendResponse(
    res,
    true,
    returnMessage("event", "fetchEvent"),
    fetchEvent,
    statusCode.success
  );
});

exports.eventList = catchAsyncError(async (req, res, next) => {
  const eventList = await eventService.eventList(req?.body, req?.user);
  sendResponse(
    res,
    true,
    returnMessage("event", "eventList"),
    eventList,
    statusCode.success
  );
});

exports.updateEvent = catchAsyncError(async (req, res, next) => {
  const eventUpdate = await eventService.updateEvent(
    req?.params?.id,
    req?.body,
    req?.user
  );
  sendResponse(
    res,
    true,
    returnMessage("event", "eventUpdate"),
    eventUpdate,
    statusCode.success
  );
});
