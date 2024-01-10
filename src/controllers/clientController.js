const catchAsyncError = require("../helpers/catchAsyncError");
const ClientService = require("../services/clientService");
const clientService = new ClientService();
const { sendResponse } = require("../utils/sendResponse");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { throwError } = require("../helpers/errorUtil");

exports.createClient = catchAsyncError(async (req, res, next) => {
  await clientService.createClient(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("agency", "clientCreated"),
    {},
    statusCode.success
  );
});

exports.verifyClient = catchAsyncError(async (req, res, next) => {
  const client_verified = await clientService.verifyClient(req.body);
  sendResponse(
    res,
    true,
    returnMessage("client", "clientVerified"),
    client_verified,
    statusCode.success
  );
});

exports.deleteClient = catchAsyncError(async (req, res, next) => {
  if (req.body.client_id.length === 0)
    return throwError(returnMessage("default", "default"));

  await clientService.deleteClient(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("client", "clientDeleted"),
    {},
    statusCode.success
  );
});

exports.clients = catchAsyncError(async (req, res, next) => {
  const clients = await clientService.clientList(req.body, req.user);
  sendResponse(res, true, null, clients, statusCode.success);
});

// below functions are used for the Client only
exports.getClient = catchAsyncError(async (req, res, next) => {
  const client = await clientService.getClientDetail(req.user);
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileFetched"),
    client,
    statusCode.success
  );
});

exports.updateClient = catchAsyncError(async (req, res, next) => {
  await clientService.updateClient(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileUpdated"),
    {},
    statusCode.success
  );
});
