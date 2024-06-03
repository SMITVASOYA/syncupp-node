const catchAsyncErrors = require("../helpers/catchAsyncError");
const jwt = require("jsonwebtoken");
const Authentication = require("../models/authenticationSchema");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage } = require("../utils/utils");

const NotificationService = require("../services/notificationService");
const notificationService = new NotificationService();

const Configuration = require("../models/configurationSchema");
const { eventEmitter } = require("../socket");
const Workspace = require("../models/workspaceSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const Gamification = require("../models/gamificationSchema");
const moment = require("moment");

// removed the old middleware as of now
/* exports.protect = catchAsyncErrors(async (req, res, next) => {
  const token = req.headers.authorization || req.headers.token;

  if (token) {
    const Authorization = token.split(" ")[1];
    const decodedUserData = jwt.verify(
      Authorization,
      process.env.JWT_SECRET_KEY
    );
    const user = await Authentication.findById(decodedUserData.id)
      .where("is_deleted")
      .equals("false")
      .select("-password")
      .populate("role", "name")
      .lean();
    if (!user) return throwError(returnMessage("auth", "unAuthorized"), 401);

    if (user?.role?.name === "team_agency") {
      const team_agency_detail = await Team_Agency.findById(
        user?.reference_id
      ).lean();
      const agency_detail = await Authentication.findOne({
        reference_id: team_agency_detail?.agency_id,
      }).lean();

      if (agency_detail?.status === "payment_pending")
        return throwError(returnMessage("payment", "paymentPendingForAgency"));
    }

    // Convert last_login_date to UTC format using Moment.js
    const lastLoginDateUTC = moment.utc(user.last_login_date).startOf("day");

    // Get the current date in UTC format using Moment.js
    const currentDateUTC = moment.utc().startOf("day");

    // Check if last login date is the same as current date
    if (currentDateUTC.isAfter(lastLoginDateUTC) || !user.last_login_date) {
      // If the condition is true, execute the following code
      if (user?.role?.name === "team_agency" || user?.role?.name === "agency") {
        const referral_data = await Configuration.findOne().lean();
        let parent_id = user?.reference_id;
        if (user?.role?.name === "team_agency") {
          const team_agency_detail = await Team_Agency.findById(
            user?.reference_id
          ).lean();
          parent_id = team_agency_detail?.agency_id;
        }
        await Competition_Point.create({
          user_id: user.reference_id,
          agency_id: parent_id,
          point: +referral_data.competition.successful_login.toString(),
          type: "login",
          role: user?.role?.name,
        });

        if (user?.role?.name === "agency") {
          await Agency.findOneAndUpdate(
            { _id: user.reference_id },
            {
              $inc: {
                total_referral_point:
                  referral_data?.competition?.successful_login,
              },
            },
            { new: true }
          );
        }

        if (user?.role?.name === "team_agency") {
          await Team_Agency.findOneAndUpdate(
            { _id: user.reference_id },
            {
              $inc: {
                total_referral_point:
                  referral_data?.competition?.successful_login,
              },
            },
            { new: true }
          );
        }

        await Authentication.findByIdAndUpdate(
          user?._id,
          { last_login_date: currentDateUTC },
          { new: true }
        );
      }
    }

    const req_paths = ["/create-subscription", "/order"];
    if (
      user?.role?.name === "agency" &&
      user?.status === "payment_pending" &&
      !req_paths.includes(req.path)
    )
      return eventEmitter(
        "PAYMENT_PENDING",
        { status: "payment_pending" },
        user?.reference_id?.toString()
      );

    req.user = user;
    next();
  } else {
    return throwError(returnMessage("auth", "unAuthorized"), 401);
  }
}); */

exports.protect = catchAsyncErrors(async (req, res, next) => {
  const token = req.headers.authorization || req.headers.token;

  if (token) {
    const Authorization = token.split(" ")[1];
    const decodedUserData = jwt.verify(
      Authorization,
      process.env.JWT_SECRET_KEY
    );

    const [user, workspace] = await Promise.all([
      Authentication.findById(decodedUserData?.id)
        .populate("purchased_plan")
        .where("is_deleted")
        .equals("false")
        .select("-password")
        .lean(),
      Workspace.findOne({
        _id: decodedUserData?.workspace,
        is_deleted: false,
        members: {
          $elemMatch: {
            user_id: decodedUserData?.id,
            status: { $ne: "deleted" },
          },
        },
      }).lean(),
    ]);

    if (!user) return throwError(returnMessage("auth", "unAuthorized"), 401);

    if (!workspace)
      return throwError(
        returnMessage("workspace", "notAssignToWorkspace"),
        401
      );

    const req_paths = [
      "/create-subscription",
      "/order",
      "/profile",
      "/list",
      "/change-workspace",
    ];
    const workspace_creator = workspace?.members?.find(
      (member) =>
        member?.user_id?.toString() === workspace?.created_by?.toString() &&
        member?.status === "payment_pending"
    );
    if (
      workspace?.created_by?.toString() !== user?._id?.toString() &&
      workspace_creator?.status === "payment_pending" &&
      !["/change-workspace", "/profile", "/list"].includes(req.path)
    )
      return throwError(returnMessage("workspace", "workspacePaymentPending"));

    if (workspace_creator && !req_paths.includes(req.path))
      return eventEmitter(
        "PAYMENT_PENDING",
        { status: "payment_pending" },
        user?._id?.toString(),
        workspace?._id
      );

    req.user = user;

    req.user["workspace"] = decodedUserData?.workspace;
    req.user["workspace_detail"] = workspace;

    await this.loginGamificationPointIncrease(user, workspace);

    next();
  } else {
    return throwError(returnMessage("auth", "unAuthorized"), 401);
  }
});

exports.authorizeRole = (requiredRole) => (req, res, next) => {
  if (req?.user?.role?.name !== requiredRole)
    return throwError(returnMessage("auth", "insufficientPermission"), 403);
  next();
};

exports.authorizeMultipleRoles = (user, requiredRoles) => (req, res, next) => {
  if (!Array.isArray(requiredRoles)) {
    return throwError(returnMessage("auth", "arrayRequired"), 403);
  }
  const userRole = user?.role;
  if (requiredRoles.includes(userRole.toString())) {
    return next();
  }
  return throwError(returnMessage("auth", "insufficientPermission"), 403);
};

exports.loginGamificationPointIncrease = async (user, workspace) => {
  try {
    if (!workspace) return;
    const today = moment.utc().startOf("day");
    const workspace_user_detail = workspace?.members?.find(
      (member) => member?.user_id?.toString() === user?._id?.toString()
    );

    if (!workspace_user_detail || workspace_user_detail?.status !== "confirmed")
      return;

    const [role, configuration] = await Promise.all([
      Role_Master.findById(workspace_user_detail?.role).lean(),
      Configuration.findOne({}).lean(),
    ]);

    if (role?.name !== "agency" || role?.name !== "team_agency") return;

    const last_visit_date = moment
      .utc(workspace_user_detail?.last_visit_date)
      .startOf("day");

    if (
      !last_visit_date.isAfter(today) ||
      !workspace_user_detail?.last_visit_date
    ) {
      await Gamification.create({
        user_id: user._id,
        agency_id: workspace?.created_by,
        point: +configuration?.competition.successful_login.toString(),
        type: "login",
        role: role?.name,
        workspace_id: workspace?._id,
      });

      await Workspace.findOneAndUpdate(
        { _id: workspace?._id, "members.user_id": user?._id },
        {
          $inc: {
            "members.$.gamification_points":
              configuration?.competition.successful_login,
          },
          "memebrs.$.last_visit_date": last_visit_date,
        }
      );
    }
    return;
  } catch (error) {
    console.log(`Error while increasing the gamification points: ${error}`);
  }
};
