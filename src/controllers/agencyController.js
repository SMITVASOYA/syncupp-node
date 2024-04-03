const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const AgencyService = require("../services/agencyService");
const ClientService = require("../services/clientService");
const { sendResponse } = require("../utils/sendResponse");
const Authentication = require("../models/authenticationSchema");
const { throwError } = require("../helpers/errorUtil");
const AffiliateService = require("../services/affiliateService");
const affiliateService = new AffiliateService();
const agencyService = new AgencyService();
const clientService = new ClientService();

// Agency get Profile
exports.getAgencyProfile = catchAsyncError(async (req, res, next) => {
  const agency = await agencyService.getAgencyProfile(req.user);
  sendResponse(
    res,
    true,
    returnMessage("agency", "agencyGet"),
    agency,
    statusCode.success
  );
});

// Agency update profile
exports.updateAgencyProfile = catchAsyncError(async (req, res, next) => {
  const user_id = req?.user?._id;
  const reference_id = req?.user?.reference_id;
  await agencyService.updateAgencyProfile(req.body, user_id, reference_id);

  sendResponse(
    res,
    true,
    returnMessage("agency", "agencyUpdate"),
    null,
    statusCode.success
  );
});

exports.getAllAgency = catchAsyncError(async (req, res, next) => {
  const agencies = await agencyService.allAgencies(req.body);
  sendResponse(res, true, null, agencies, statusCode.success);
});

exports.updateAgency = catchAsyncError(async (req, res, next) => {
  await agencyService.updateAgencyStatus(req.body);
  if (req.body.delete) {
    sendResponse(
      res,
      true,
      returnMessage("agency", "agencyDeletedMessage"),
      {},
      statusCode.success
    );
  }
  sendResponse(
    res,
    true,
    returnMessage("agency", "agencyUpdated"),
    {},
    statusCode.success
  );
});

exports.updateClient = catchAsyncError(async (req, res, next) => {
  if (!req.params?.clientId)
    return throwError(returnMessage("default", "default"));

  const client_exist = await Authentication.findById(
    req.params?.clientId
  ).lean();
  if (!client_exist)
    return throwError(
      returnMessage("client", "clientNotFound"),
      statusCode.notFound
    );
  await clientService.updateClient(req.body, client_exist);
  sendResponse(
    res,
    true,
    returnMessage("agency", "clientUpdated"),
    {},
    statusCode.success
  );
});

exports.getClient = catchAsyncError(async (req, res, next) => {
  if (!req.params?.clientId)
    return throwError(returnMessage("default", "default"));

  const client_exist = await Authentication.findById(
    req.params?.clientId
  ).lean();
  if (!client_exist)
    return throwError(
      returnMessage("client", "clientNotFound"),
      statusCode.notFound
    );
  const client = await clientService.getClientDetail(client_exist);
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileFetched"),
    client,
    statusCode.success
  );
});

// Affiliate Dashboard Data
exports.getAffiliateData = catchAsyncError(async (req, res, next) => {
  const dashboardData = await affiliateService.getDashboardData(req?.user);
  sendResponse(
    res,
    true,
    returnMessage("affiliate", "affiliateDataFetched"),
    dashboardData,
    statusCode.success
  );
});
