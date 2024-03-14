const catchAsyncError = require("../helpers/catchAsyncError");
const { returnMessage } = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const TeamMemberService = require("../services/teamMemberService");
const { sendResponse } = require("../utils/sendResponse");
const teamMemberService = new TeamMemberService();

// Team Member add
exports.add = catchAsyncError(async (req, res, next) => {
  const team_member = await teamMemberService.addTeamMember(req.body, req.user);
  let message = returnMessage("teamMember", "teamMemberCreated");
  if (req?.user?.role?.name === "client") {
    message = returnMessage("teamMember", "teamMemberCreatedByClient");
  }
  sendResponse(res, true, message, team_member, statusCode.success);
});

// Team Member Verification
exports.verify = catchAsyncError(async (req, res, next) => {
  const verify = await teamMemberService.verify(req.body);
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "verified"),
    verify,
    statusCode.success
  );
});

// Team Member Login
exports.login = catchAsyncError(async (req, res, next) => {
  const teamMember = await teamMemberService.login(req.body);
  sendResponse(
    res,
    true,
    returnMessage("auth", "loggedIn"),
    teamMember,
    statusCode.success
  );
});

//  Get one Team Member

exports.getMember = catchAsyncError(async (req, res, next) => {
  const teamMember = await teamMemberService.getMember(
    req?.user?._id,
    req?.params?.id
  );
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "memberGet"),
    teamMember,
    statusCode.success
  );
});

//  Delete Team Member

exports.deleteMember = catchAsyncError(async (req, res, next) => {
  const delete_member = await teamMemberService.deleteMember(
    req?.body,
    req.user
  );
  sendResponse(
    res,
    true,
    !delete_member?.force_fully_remove
      ? returnMessage("teamMember", "deleted")
      : undefined,
    delete_member,
    statusCode.success
  );
});

//  Get All Team Member
exports.getAll = catchAsyncError(async (req, res, next) => {
  const teamMemberList = await teamMemberService.getAllTeam(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "TeamMemberFetched"),
    teamMemberList,
    statusCode.success
  );
});

//  Edit Team Member

exports.editMember = catchAsyncError(async (req, res, next) => {
  const teamMember = await teamMemberService.editMember(
    req.body,
    req.params.id,
    req.user
  );
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "updated"),
    teamMember,
    statusCode.success
  );
});

// reject client team member
exports.rejectTeamMember = catchAsyncError(async (req, res, next) => {
  await teamMemberService.rejectTeamMember(req.body, req.user);
  sendResponse(
    res,
    true,
    returnMessage("teamMember", "teamMemberRejected"),
    {},
    statusCode.success
  );
});
