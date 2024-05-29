const catchAsyncError = require("../helpers/catchAsyncError");
const ClientService = require("../services/clientService");
const clientService = new ClientService();
const { sendResponse } = require("../utils/sendResponse");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const { throwError } = require("../helpers/errorUtil");
const TeamMemberService = require("../services/teamMemberService");
const teamMemberService = new TeamMemberService();

exports.createClient = catchAsyncError(async (req, res, next) => {
  const client = await clientService.createClient(req.body, req.user);
  sendResponse(res, true, client?.message, client, statusCode.success);
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
  if (req?.body?.client_ids?.length === 0)
    return throwError(returnMessage("default", "default"));

  const delete_clients = await clientService.deleteClient(req.body, req.user);

  sendResponse(
    res,
    true,
    !delete_clients.force_fully_remove
      ? returnMessage("client", "clientDeleted")
      : undefined,
    delete_clients,
    statusCode.success
  );
});

exports.clients = catchAsyncError(async (req, res, next) => {
  const clients = await clientService.clientList(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("client", "clientsFetched"),
    clients,
    statusCode.success
  );
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

exports.getAgencies = catchAsyncError(async (req, res, next) => {
  const agencies = await clientService.getAgencies(req.user);
  sendResponse(
    res,
    true,
    returnMessage("client", "agenciesFetched"),
    agencies,
    statusCode.success
  );
});

exports.addClientTeam = catchAsyncError(async (req, res, next) => {
  await teamMemberService.addClientTeam(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "teamMemberCreatedByClient"),
    {},
    statusCode.success
  );
});

exports.deleteTeamMember = catchAsyncError(async (req, res, next) => {
  await teamMemberService.deleteMemberByClient(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "deleted"),
    {},
    statusCode.success
  );
});
