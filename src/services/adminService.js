const jwt = require("jsonwebtoken");
const Admin = require("../models/adminSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  forgotPasswordEmailTemplate,
  validateEmail,
  passwordValidation,
  paginationObject,
  getKeywordType,
} = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const sendEmail = require("../helpers/sendEmail");
const PaymentHistory = require("../models/paymentHistorySchema");
const PaymentService = require("./paymentService");
const { default: mongoose } = require("mongoose");
const paymentService = new PaymentService();

class AdminService {
  tokenGenerator = (payload) => {
    try {
      const expiresIn = payload?.rememberMe
        ? process.env.JWT_REMEMBER_EXPIRE
        : process.env.JWT_EXPIRES_IN;
      const token = jwt.sign(
        { id: payload._id },
        process.env.JWT_ADMIN_SECRET_KEY,
        {
          expiresIn,
        }
      );
      return { token, user: payload };
    } catch (error) {
      logger.error(`Error while token generate, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  login = async (payload) => {
    try {
      const { email, password, rememberMe } = payload;

      if (!validateEmail(email)) {
        return throwError(returnMessage("auth", "invalidEmail"));
      }

      if (!passwordValidation(password)) {
        return throwError(returnMessage("auth", "invalidPassword"));
      }

      if (!email || !password)
        return throwError(
          returnMessage("auth", "emailPassNotFound"),
          statusCode.badRequest
        );

      const admin_exist = await Admin.findOne({
        email,
        is_deleted: false,
      }).lean();

      if (!admin_exist)
        return throwError(
          returnMessage("admin", "adminNotFound"),
          statusCode.notFound
        );

      const correct_password = await bcrypt.compare(
        password,
        admin_exist?.password
      );
      if (!correct_password)
        return throwError(returnMessage("auth", "incorrectPassword"));
      return this.tokenGenerator({ ...admin_exist, rememberMe });
    } catch (error) {
      logger.error(`Error while admin login, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  getAdmin = async (payload) => {
    try {
      const admin_id = payload;
      const admin = await Admin.findOne({ _id: admin_id }).lean();

      if (!admin) {
        return throwError(returnMessage("admin", "adminNotFound"));
      }
      return admin;
    } catch (error) {
      logger.error(`Error while get Admin, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  forgotPassword = async (payload) => {
    try {
      const { email } = payload;

      if (!validateEmail(email)) {
        return throwError(returnMessage("auth", "invalidEmail"));
      }
      const admin = await Admin.findOne({ email: email }, { password: 0 });
      if (!admin) {
        return throwError(returnMessage("admin", "emailNotFound"));
      }
      const reset_password_token = crypto.randomBytes(32).toString("hex");
      const encode = encodeURIComponent(email);
      const link = `${process.env.REACT_APP_URL}/admin/reset-password?token=${reset_password_token}&email=${encode}`;
      const forgot_email_template = forgotPasswordEmailTemplate(
        link,
        admin?.first_name + " " + admin?.last_name
      );

      await sendEmail({
        email: email,
        subject: returnMessage("emailTemplate", "forgotPasswordSubject"),
        message: forgot_email_template,
      });

      const hash_token = crypto
        .createHash("sha256")
        .update(reset_password_token)
        .digest("hex");
      admin.reset_password_token = hash_token;
      await admin.save();
      return;
    } catch (error) {
      logger.error(`Error while admin forgotpassword, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  resetPassword = async (payload) => {
    try {
      const { token, email, newPassword } = payload;

      if (!validateEmail(email)) {
        return throwError(returnMessage("auth", "invalidEmail"));
      }

      if (!passwordValidation(newPassword)) {
        return throwError(returnMessage("auth", "invalidPassword"));
      }

      const hash_token = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const admin = await Admin.findOne({
        email: email,
        reset_password_token: hash_token,
        is_deleted: false,
      });

      if (!admin) {
        return throwError(returnMessage("admin", "invalidToken"));
      }

      const hash_password = await bcrypt.hash(newPassword, 14);
      admin.password = hash_password;
      admin.reset_password_token = null;
      await admin.save();
      return;
    } catch (error) {
      logger.error(`Error while admin resetPassword, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  changePassword = async (payload, teamId) => {
    try {
      const { newPassword, oldPassword } = payload;
      const admin = await Admin.findById({ _id: teamId });
      if (!admin) {
        return throwError(returnMessage("admin", "emailNotFound"));
      }
      if (newPassword === oldPassword) {
        return throwError(returnMessage("auth", "oldAndNewPasswordSame"));
      }

      if (!passwordValidation(newPassword)) {
        return throwError(returnMessage("auth", "invalidPassword"));
      }

      const is_match = await bcrypt.compare(oldPassword, admin.password);
      if (!is_match) {
        return throwError(returnMessage("admin", "passwordNotMatch"));
      }
      const hash_password = await bcrypt.hash(newPassword, 14);
      admin.password = hash_password;
      await admin.save();
    } catch (error) {
      logger.error(`Error while admin updatePassword, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // updateAdmin
  updateAdmin = async (payload, admin_id) => {
    try {
      const admin = await Admin.findByIdAndUpdate(
        {
          _id: admin_id,
        },
        payload,
        { new: true, useFindAndModify: false }
      );

      if (!admin) {
        return throwError(returnMessage("admin", "invalidId"));
      }
      return admin;
    } catch (error) {
      logger.error(`Error while Admin update, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  transactionHistory = async (payload) => {
    try {
      const search_obj = {};
      let match_obj = { subscription_id: { $exists: true } };

      if (payload?.subscription_id && payload?.agency_id) {
        match_obj = {
          subscription_id: { $exists: false },
          agency_id: new mongoose.Types.ObjectId(payload?.agency_id),
        };
      }
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          {
            "agency.name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agency.first_name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agency.last_name": {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            subscription_id: {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            order_id: {
              $regex: payload?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(payload?.search);
        if (keywordType === "number") {
          search_obj["$or"].push({
            amount: { $regex: parseInt(payload?.search), $options: "i" },
          });
        }
      }
      const pagination = paginationObject(payload);
      const aggragate = [
        {
          $match: search_obj,
        },
        {
          $match: match_obj,
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "reference_id",
            as: "agency",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                  email: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: "$agency",
        },
      ];

      const [transactions, total_transactions] = await Promise.all([
        PaymentHistory.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        PaymentHistory.aggregate(aggragate),
      ]);

      for (let i = 0; i < transactions.length; i++) {
        if (
          payload?.subscription_id &&
          payload?.agency_id &&
          transactions[i].order_id
        ) {
          const paymentDetails = await paymentService.orderPaymentDetails(
            transactions[i].order_id
          );
          transactions[i].method = paymentDetails?.items[0].method;
        } else {
          const subscription_detail =
            await paymentService.getSubscriptionDetail(
              transactions[i].subscription_id
            );
          transactions[i].method = subscription_detail.payment_method;
        }
      }

      return {
        transactions,
        page_count:
          Math.ceil(total_transactions.length / pagination.result_per_page) ||
          0,
      };
    } catch (error) {
      logger.error(
        `Error while fetching the Transaction history for the Admin: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = AdminService;
