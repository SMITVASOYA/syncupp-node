const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const AuthService = require("../services/authService");
const AgencyService = require("../services/agencyService");
const ClientService = require("../services/clientService");
const TeamMemberService = require("../services/teamMemberService");
const authService = new AuthService();
const agencyService = new AgencyService();
const clientService = new ClientService();
const teamMemberService = new TeamMemberService();
const { sendResponse } = require("../utils/sendResponse");
const { throwError } = require("../helpers/errorUtil");

// this function is used only for the Agency Sign-up

exports.agencySignUp = catchAsyncError(async (req, res, next) => {
  const files = req?.files || undefined;
  const agency = await authService.agencySignUp(req.body, files);

  let message = returnMessage("agency", "agencyRegistered");
  if (agency?.user?.status === "free_trial") {
    message = "Agency registered successfully.";
  }
  sendResponse(res, true, message, agency, statusCode.success);
});

exports.agencyGoogleSignUp = catchAsyncError(async (req, res, next) => {
  const agencyGoogleSignUp = await authService.googleSign(req.body);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "loggedIn"),
    agencyGoogleSignUp,
    statusCode.success
  );
});

exports.agencyFacebookSignUp = catchAsyncError(async (req, res, next) => {
  const agencyFacebookSignUp = await authService.facebookSignIn(req.body);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "loggedIn"),
    agencyFacebookSignUp,
    statusCode.success
  );
});

exports.login = catchAsyncError(async (req, res, next) => {
  const loggedIn = await authService.login(req.body);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "loggedIn"),
    loggedIn,
    statusCode.success
  );
});

exports.forgotPassword = catchAsyncError(async (req, res, next) => {
  await authService.forgotPassword(req.body);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "resetPasswordMailSent"),
    {},
    statusCode.success
  );
});

exports.resetPassword = catchAsyncError(async (req, res, next) => {
  await authService.resetPassword(req.body);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "passwordReset"),
    {},
    statusCode.success
  );
});

exports.changePassword = catchAsyncError(async (req, res, next) => {
  await authService.changePassword(req.body, req.user._id);
  return sendResponse(
    res,
    true,
    returnMessage("auth", "passwordChanged"),
    {},
    statusCode.success
  );
});

exports.countriesList = catchAsyncError(async (req, res, next) => {
  const countries = await authService.countryList(req.body);
  return sendResponse(res, true, undefined, countries, statusCode.success);
});

exports.statesList = catchAsyncError(async (req, res, next) => {
  if (!req.params.countryId)
    return throwError(returnMessage("auth", "countryIdRequired"));
  const states = await authService.statesList(req.params.countryId, req.body);
  return sendResponse(res, true, undefined, states, statusCode.success);
});

exports.citiesList = catchAsyncError(async (req, res, next) => {
  if (!req.params.stateId)
    return throwError(returnMessage("auth", "stateIdRequired"));
  const cities = await authService.citiesList(req.params.stateId, req.body);
  return sendResponse(res, true, undefined, cities, statusCode.success);
});

exports.getProfile = catchAsyncError(async (req, res, next) => {
  const user = req?.user;
  let profile;
  if (user?.role?.name === "agency") {
    profile = await agencyService.getAgencyProfile(req.user);
  } else if (user?.role?.name === "client") {
    profile = await clientService.getClientDetail(req.user);
  } else if (
    user?.role?.name === "team_agency" ||
    user?.role?.name === "team_client"
  ) {
    profile = await teamMemberService.getProfile(req.user);
  }
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileFetched"),
    profile,
    statusCode.success
  );
});

exports.updateProfile = catchAsyncError(async (req, res, next) => {
  const user_id = req?.user?._id;
  const reference_id = req?.user?.reference_id;
  const user = req.user;

  if (user?.role?.name === "agency") {
    await agencyService.updateAgencyProfile(
      req.body,
      user_id,
      reference_id,
      req?.file
    );
  } else if (user?.role?.name === "client") {
    await clientService.updateClientProfile(
      req.body,
      user_id,
      reference_id,
      req?.file
    );
  } else if (
    user?.role?.name === "team_agency" ||
    user?.role?.name === "team_client"
  ) {
    await teamMemberService.updateTeamMeberProfile(
      req.body,
      user_id,
      reference_id,
      user?.role?.name,
      req?.file
    );
  }
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileUpdated"),
    {},
    statusCode.success
  );
});

exports.passwordSetRequired = catchAsyncError(async (req, res, next) => {
  const password_set_required = await authService.passwordSetRequired(req.body);
  sendResponse(
    res,
    true,
    returnMessage("auth", "profileUpdated"),
    password_set_required,
    statusCode.success
  );
});
exports.refferalEmail = catchAsyncError(async (req, res, next) => {
  const refferal_email = await authService.sendReferaal(req.user, req.body);
  sendResponse(
    res,
    true,
    returnMessage("auth", "sendRefferalEmail"),
    refferal_email,
    statusCode.success
  );
});

exports.checkSubscriptionHalt = catchAsyncError(async (req, res, next) => {
  const checkSubscriptionHalt = await authService.checkSubscriptionHalt(
    req.user
  );
  sendResponse(res, true, undefined, checkSubscriptionHalt, statusCode.success);
});
