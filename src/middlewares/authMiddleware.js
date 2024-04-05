const catchAsyncErrors = require("../helpers/catchAsyncError");
const jwt = require("jsonwebtoken");
const Authentication = require("../models/authenticationSchema");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage } = require("../utils/utils");
const Competition_Point = require("../models/competitionPointSchema");

const moment = require("moment");
const NotificationService = require("../services/notificationService");
const notificationService = new NotificationService();

const Configuration = require("../models/configurationSchema");
const Agency = require("../models/agencySchema");
const Team_Agency = require("../models/teamAgencySchema");
const { eventEmitter } = require("../socket");
exports.protect = catchAsyncErrors(async (req, res, next) => {
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
});

exports.authorizeRole = (requiredRole) => (req, res, next) => {
  if (req?.user?.role?.name !== requiredRole)
    return throwError(returnMessage("auth", "insufficientPermission"), 403);
  next();
};
