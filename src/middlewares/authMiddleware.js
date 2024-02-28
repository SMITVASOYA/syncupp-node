const catchAsyncErrors = require("../helpers/catchAsyncError");
const jwt = require("jsonwebtoken");
const Authentication = require("../models/authenticationSchema");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage } = require("../utils/utils");
const Competition_Point = require("../models/competitionPointSchema");
const Configuration = require("../models/configurationSchema");

const moment = require("moment");

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

    // Convert last_login_date to UTC format using Moment.js
    const lastLoginDateUTC = moment.utc(user.last_login_date);

    // Get the current date in UTC format using Moment.js
    const currentDateUTC = moment().startOf("day");

    // Check if last login date is the same as current date
    if (lastLoginDateUTC.isSameOrBefore(currentDateUTC)) {
      // If the condition is true, execute the following code
      if (user?.role?.name === "team_agency" || user?.role?.name === "agency") {
        const referral_data = await Configuration.findOne().lean();

        await Competition_Point.create({
          user_id: user.reference_id,
          agency_id: user.reference_id,
          point: +referral_data.competition.successful_login.toString(),
          type: "login",
          role: user?.role?.name,
        });

        await Authentication.findOneAndUpdate(
          { reference_id: user.reference_id },
          {
            $inc: {
              total_referral_point:
                referral_data?.competition?.successful_login,
            },
            last_login_date: moment.utc().startOf("day"),
          },
          { new: true }
        );
      }
    }

    const req_paths = ["/create-subscription", "/order"];
    if (
      user?.role?.name === "agency" &&
      user?.status !== "confirmed" &&
      !req_paths.includes(req.path)
    )
      return throwError(returnMessage("payment", "agencyPaymentPending"), 422);

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
