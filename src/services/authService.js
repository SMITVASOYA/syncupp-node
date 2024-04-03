require("dotenv").config();
const jwt = require("jsonwebtoken");
const logger = require("../logger");
const {
  returnMessage,
  validateRequestFields,
  validateEmail,
  passwordValidation,
  forgotPasswordEmailTemplate,
  capitalizeFirstLetter,
  invitationEmailTemplate,
  agencyCreatedTemplate,
} = require("../utils/utils");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const { throwError } = require("../helpers/errorUtil");
const Authentication = require("../models/authenticationSchema");
const AgencyService = require("../services/agencyService");
const agencyService = new AgencyService();
const Role_Master = require("../models/masters/roleMasterSchema");
const statusCode = require("../messages/statusCodes.json");
const crypto = require("crypto");
const sendEmail = require("../helpers/sendEmail");
const axios = require("axios");
const Country_Master = require("../models/masters/countryMasterSchema");
const City_Master = require("../models/masters/cityMasterSchema");
const State_Master = require("../models/masters/stateMasterSchema");
const Team_Agency = require("../models/teamAgencySchema");
const ReferralHistory = require("../models/referralHistorySchema");
const Configuration = require("../models/configurationSchema");
const Affiliate = require("../models/affiliateSchema");
const Affiliate_Referral = require("../models/affiliateReferralSchema");
const CompetitionPoint = require("../models/competitionPointSchema");
const Agency = require("../models/agencySchema");
const Client = require("../models/clientSchema");
const NotificationService = require("./notificationService");
const Admin = require("../models/adminSchema");
const SheetManagement = require("../models/sheetManagementSchema");
const notificationService = new NotificationService();
class AuthService {
  tokenGenerator = (payload) => {
    try {
      const expiresIn = payload?.rememberMe
        ? process.env.JWT_REMEMBER_EXPIRE
        : process.env.JWT_EXPIRES_IN;

      const token = jwt.sign(
        { id: payload._id, reference: payload.reference_id },
        process.env.JWT_SECRET_KEY,
        {
          expiresIn,
        }
      );

      return { token, user: payload };
    } catch (error) {
      logger.error(`Error while token generate: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  passwordVerifier = async (payload) => {
    try {
      return await bcrypt.compare(payload.password, payload.encrypted_password);
    } catch (error) {
      logger.error(`Error while password verification: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  passwordEncryption = async (payload) => {
    try {
      return await bcrypt.hash(payload.password, 14);
    } catch (error) {
      logger.error(`Error while password encryption: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  agencySignUp = async (payload, files) => {
    try {
      const {
        first_name,
        last_name,
        email,
        password,
        contact_number,
        referral_code,
      } = payload;

      validateRequestFields(payload, [
        "first_name",
        "last_name",
        "email",
        "password",
        "contact_number",
      ]);

      if (!validateEmail(email))
        return throwError(returnMessage("auth", "invalidEmail"));

      if (!passwordValidation(password))
        return throwError(returnMessage("auth", "invalidPassword"));

      const [agency_exist, configuration] = await Promise.all([
        Authentication.findOne({
          email,
          is_deleted: false,
        }).lean(),
        Configuration.findOne({}).lean(),
      ]);

      if (agency_exist)
        return throwError(returnMessage("agency", "agencyExist"));

      let image_url,
        status = "payment_pending";

      if (files && files.fieldname === "client_image") {
        image_url = "uploads/" + files?.filename;
      }

      if (configuration?.payment?.free_trial > 0) {
        status = "free_trial";
      }

      const agency_object = {
        company_name: payload?.company_name,
        company_website: payload?.company_website,
        no_of_people: payload?.no_of_people,
        industry: payload?.industry,
      };

      const [agency, encrypted_password, role] = await Promise.all([
        agencyService.agencyRegistration(agency_object),
        this.passwordEncryption({ password }),
        Role_Master.findOne({ name: "agency" }).select("name").lean(),
      ]);

      if (!payload?.referral_code) {
        payload.referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!payload.referral_code)
          return throwError(returnMessage("referral", "codeGenerationFailed"));

        let agency_enroll = await Authentication.create({
          first_name,
          last_name,
          email: email?.toLowerCase(),
          password: encrypted_password,
          contact_number,
          image_url,
          reference_id: agency?._id,
          remember_me: payload?.remember_me,
          role: role?._id,
          status,
          referral_code: payload.referral_code,
          affiliate_referral_code: affiliate_referral_code,
        });
        agency_enroll = agency_enroll.toObject();
        agency_enroll.role = role;

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          await this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: agency_enroll.reference_id,
            email: decodedEmail,
          });
        }

        delete agency_enroll?.password;
        delete agency_enroll?.is_facebook_signup;
        delete agency_enroll?.is_google_signup;

        // -------------------- Notification --------------------------------

        await notificationService.addAdminNotification({
          action_name: "agencyCreated",
          agency_name:
            capitalizeFirstLetter(first_name) +
            " " +
            capitalizeFirstLetter(last_name),
          email: email,
          contact_number: contact_number,
        });

        var agencyCreated = await agencyCreatedTemplate({
          agency_name:
            capitalizeFirstLetter(first_name) +
            " " +
            capitalizeFirstLetter(last_name),
          email: email,
          contact_number: contact_number,
        });

        const admin = await Admin.findOne({});

        await sendEmail({
          email: admin?.email,
          subject: returnMessage("emailTemplate", "agencyCreated"),
          message: agencyCreated,
        });
        // -------------------- Notification --------------------------------

        // this will used if we are adding the trial periods
        if (configuration?.payment?.free_trial > 0) {
          await SheetManagement.findOneAndUpdate(
            { agency_id: agency_enroll?.reference_id },
            {
              agency_id: agency_enroll?.reference_id,
              total_sheets: 1,
              occupied_sheets: [],
            },
            { upsert: true }
          );
        }
        return this.tokenGenerator({
          ...agency_enroll,
          rememberMe: payload?.rememberMe,
        });
      } else if (payload?.referral_code) {
        let new_referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!new_referral_code)
          return throwError(returnMessage("referral", "codeGenerationFailed"));

        let agency_enroll = await Authentication.create({
          first_name,
          last_name,
          email: email?.toLowerCase(),
          password: encrypted_password,
          contact_number,
          image_url,
          reference_id: agency?._id,
          remember_me: payload?.remember_me,
          role: role?._id,
          status,
          referral_code: new_referral_code,
          affiliate_referral_code: affiliate_referral_code,
        });

        agency_enroll = agency_enroll.toObject();
        agency_enroll.role = role;

        // -------------------- Notification --------------------------------

        await notificationService.addAdminNotification({
          action_name: "agencyCreated",
          agency_name:
            capitalizeFirstLetter(first_name) +
            " " +
            capitalizeFirstLetter(last_name),
          email: email,
          contact_number: contact_number,
        });

        const admin = await Admin.findOne({});

        await sendEmail({
          email: admin?.email,
          subject: returnMessage("emailTemplate", "agencyCreated"),
          message: agencyCreated,
        });
        // -------------------- Notification --------------------------------

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: referral_code,
            referred_to: agency_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(agency_enroll._id);
            return referral_registered;
          }
        }

        delete agency_enroll?.password;
        delete agency_enroll?.is_facebook_signup;
        delete agency_enroll?.is_google_signup;

        return this.tokenGenerator({
          ...agency_enroll,
          rememberMe: payload?.rememberMe,
        });
      }
    } catch (error) {
      logger.error(`Error while agency signup: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  googleSign = async (payload) => {
    try {
      const { signupId } = payload;

      if (!signupId)
        return throwError(returnMessage("auth", "googleAuthTokenNotFound"));

      const decoded = jwt.decode(signupId);

      let [existing_agency, referral_data] = await Promise.all([
        Authentication.findOne({ email: decoded.email, is_deleted: false })
          .populate("role", "name")
          .lean(),
        Configuration.findOne({}).lean(),
      ]);

      if (existing_agency?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          existing_agency?.reference_id
        ).lean();
        const agency_detail = await Authentication.findOne({
          reference_id: team_agency_detail?.agency_id,
        }).lean();

        if (agency_detail?.status === "payment_pending")
          return throwError(
            returnMessage("payment", "paymentPendingForAgency")
          );
      }

      let status = "payment_pending";

      if (referral_data?.payment?.free_trial > 0) {
        status = "free_trial";
      }
      if (!existing_agency) {
        const [agency, role] = await Promise.all([
          agencyService.agencyRegistration({}),
          Role_Master.findOne({ name: "agency" }).select("name").lean(),
        ]);

        const referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!referral_code) return returnMessage("default");

        let agency_enroll = await Authentication.create({
          first_name: decoded?.given_name,
          last_name: decoded?.family_name,
          name:
            capitalizeFirstLetter(decoded?.given_name) +
            " " +
            capitalizeFirstLetter(decoded?.family_name),
          email: decoded?.email,
          reference_id: agency?._id,
          role: role?._id,
          status,
          is_google_signup: true,
          referral_code,
          affiliate_referral_code: affiliate_referral_code,
        });

        agency_enroll = agency_enroll.toObject();
        agency_enroll.role = role;

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: payload?.referral_code,
            referred_to: agency_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(agency_enroll._id);
            return referral_registered;
          }
        }

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          await this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: agency_enroll.reference_id,
            email: decodedEmail,
          });
        }

        const lastLoginDateUTC = moment
          .utc(agency_enroll?.last_login_date)
          .startOf("day");
        const currentDateUTC = moment.utc().startOf("day");

        if (
          currentDateUTC.isAfter(lastLoginDateUTC) ||
          !agency_enroll.last_login_date
        ) {
          if (
            agency_enroll?.role?.name === "team_agency" ||
            agency_enroll?.role?.name === "agency"
          ) {
            await CompetitionPoint.create({
              user_id: agency_enroll?.reference_id,
              agency_id: agency_enroll?.reference_id,
              point: +referral_data?.competition?.successful_login?.toString(),
              type: "login",
              role: agency_enroll?.role?.name,
            });

            await notificationService.addNotification({
              module_name: "referral",
              action_type: "login",
              referred_to:
                agency_enroll?.first_name + " " + agency_enroll?.last_name,
              receiver_id: agency_enroll?.reference_id,
              points: referral_data?.competition?.successful_login?.toString(),
            });

            await Agency.findOneAndUpdate(
              { _id: agency_enroll?.reference_id },
              {
                $inc: {
                  total_referral_point:
                    referral_data?.competition?.successful_login,
                },
              },
              { new: true }
            );
            await Authentication.findOneAndUpdate(
              { reference_id: agency_enroll.reference_id },
              { last_login_date: moment.utc().startOf("day") },
              { new: true }
            );
          }
        }

        // this will used if we are adding the trial periods
        if (referral_data?.payment?.free_trial > 0) {
          await SheetManagement.findOneAndUpdate(
            { agency_id: agency_enroll?.reference_id },
            {
              agency_id: agency_enroll?.reference_id,
              total_sheets: 1,
              occupied_sheets: [],
            },
            { upsert: true }
          );
        }
        return this.tokenGenerator({
          ...agency_enroll,
          subscription_halt_days:
            referral_data?.payment?.subscription_halt_days,
        });
      } else {
        const lastLoginDateUTC = moment
          .utc(existing_agency?.last_login_date)
          .startOf("day");
        const currentDateUTC = moment.utc().startOf("day");

        if (
          currentDateUTC.isAfter(lastLoginDateUTC) ||
          !existing_agency?.last_login_date
        ) {
          if (
            existing_agency?.role?.name === "team_agency" ||
            existing_agency?.role?.name === "agency"
          ) {
            await CompetitionPoint.create({
              user_id: existing_agency?.reference_id,
              agency_id: existing_agency?.reference_id,
              point: +referral_data?.competition?.successful_login?.toString(),
              type: "login",
              role: existing_agency?.role?.name,
            });

            await notificationService.addNotification({
              module_name: "referral",
              action_type: "login",
              referred_to:
                existing_agency?.first_name + " " + existing_agency?.last_name,
              receiver_id: existing_agency?.reference_id,
              points: referral_data?.competition?.successful_login?.toString(),
            });
            if (existing_agency?.role?.name === "agency") {
              await Agency.findOneAndUpdate(
                { _id: existing_agency.reference_id },
                {
                  $inc: {
                    total_referral_point:
                      referral_data?.competition?.successful_login,
                  },
                },
                { new: true }
              );
            } else if (existing_agency?.role?.name === "team_agency") {
              await Team_Agency.findOneAndUpdate(
                { _id: existing_agency.reference_id },
                {
                  $inc: {
                    total_referral_point:
                      referral_data?.competition?.successful_login,
                  },
                },
                { new: true }
              );
            }
            await Authentication.findOneAndUpdate(
              { reference_id: existing_agency.reference_id },
              { last_login_date: moment.utc().startOf("day") },
              { new: true }
            );
          }
        }
        return this.tokenGenerator({
          ...existing_agency,
          subscription_halt_days:
            referral_data?.payment?.subscription_halt_days,
        });
      }
    } catch (error) {
      logger.error("Error while google sign In", error);
      return throwError(error?.message, error?.statusCode);
    }
  };

  facebookSignIn = async (payload) => {
    try {
      const { access_token } = payload;

      if (!access_token || access_token === "")
        return throwError(returnMessage("auth", "facebookAuthTokenNotFound"));

      const data = await axios
        .get(
          `https://graph.facebook.com/me?access_token=${access_token}&fields=id,name,email,first_name,last_name`
        )
        .then((res) => res.data);

      if (!data?.email)
        return throwError(returnMessage("auth", "facebookEmailNotFound"));

      let [existing_agency, referral_data] = await Promise.all([
        Authentication.findOne({
          email: data?.email,
          is_deleted: false,
        })
          .populate("role", "name")
          .lean(),
        Configuration.findOne({}).lean(),
      ]);

      if (existing_agency?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          existing_agency?.reference_id
        ).lean();
        const agency_detail = await Authentication.findOne({
          reference_id: team_agency_detail?.agency_id,
        }).lean();

        if (agency_detail?.status === "payment_pending")
          return throwError(
            returnMessage("payment", "paymentPendingForAgency")
          );
      }

      let status = "payment_pending";

      if (referral_data?.payment?.free_trial > 0) {
        status = "free_trial";
      }

      if (!existing_agency) {
        const [agency, role] = await Promise.all([
          agencyService.agencyRegistration({}),
          Role_Master.findOne({ name: "agency" }).select("name").lean(),
        ]);

        const referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!referral_code) return returnMessage("default");

        let agency_enroll = await Authentication.create({
          first_name: data?.first_name,
          last_name: data?.last_name,
          name:
            capitalizeFirstLetter(data?.first_name) +
            " " +
            capitalizeFirstLetter(data?.last_name),
          email: data?.email,
          reference_id: agency?._id,
          role: role?._id,
          status,
          is_facebook_signup: true,
          referral_code,
          affiliate_referral_code: affiliate_referral_code,
        });

        agency_enroll = agency_enroll.toObject();
        agency_enroll.role = role;

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: payload?.referral_code,
            referred_to: agency_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(agency_enroll._id);
            return referral_registered;
          }
        }

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          await this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: agency_enroll.reference_id,
            email: decodedEmail,
          });
        }

        const lastLoginDateUTC = moment
          .utc(agency_enroll?.last_login_date)
          .startOf("day");
        const currentDateUTC = moment.utc().startOf("day");

        if (
          currentDateUTC.isAfter(lastLoginDateUTC) ||
          !agency_enroll?.last_login_date
        ) {
          if (
            agency_enroll?.role?.name === "team_agency" ||
            agency_enroll?.role?.name === "agency"
          ) {
            await CompetitionPoint.create({
              user_id: agency_enroll?.reference_id,
              agency_id: agency_enroll?.reference_id,
              point: +referral_data?.competition?.successful_login?.toString(),
              type: "login",
              role: agency_enroll?.role?.name,
              login_date: moment.utc().startOf("day"),
            });

            await notificationService.addNotification({
              module_name: "referral",
              action_type: "login",
              referred_to:
                agency_enroll?.first_name + " " + agency_enroll?.last_name,
              receiver_id: agency_enroll?.reference_id,
              points: referral_data?.competition?.successful_login?.toString(),
            });

            await Agency.findOneAndUpdate(
              { _id: agency_enroll?.reference_id },
              {
                $inc: {
                  total_referral_point:
                    referral_data?.competition?.successful_login,
                },
              },
              { new: true }
            );
            await Authentication.findOneAndUpdate(
              { reference_id: agency_enroll.reference_id },
              { last_login_date: moment.utc().startOf("day") },
              { new: true }
            );
          }
        }

        // this will used if we are adding the trial periods
        if (referral_data?.payment?.free_trial > 0) {
          await SheetManagement.findOneAndUpdate(
            { agency_id: agency_enroll?.reference_id },
            {
              agency_id: agency_enroll?.reference_id,
              total_sheets: 1,
              occupied_sheets: [],
            },
            { upsert: true }
          );
        }

        return this.tokenGenerator({
          ...agency_enroll,
          subscription_halt_days:
            referral_data?.payment?.subscription_halt_days,
        });
      } else {
        const lastLoginDateUTC = moment
          .utc(existing_agency?.last_login_date)
          .startOf("day");
        const currentDateUTC = moment.utc().startOf("day");

        if (
          currentDateUTC.isAfter(lastLoginDateUTC) ||
          !existing_agency?.last_login_date
        ) {
          if (
            existing_agency?.role?.name === "team_agency" ||
            existing_agency?.role?.name === "agency"
          ) {
            await CompetitionPoint.create({
              user_id: existing_agency?.reference_id,
              agency_id: existing_agency?.reference_id,
              point: +referral_data?.competition?.successful_login?.toString(),
              type: "login",
              role: existing_agency?.role?.name,
            });

            await notificationService.addNotification({
              module_name: "referral",
              action_type: "login",
              referred_to:
                existing_agency?.first_name + " " + existing_agency?.last_name,
              receiver_id: existing_agency?.reference_id,
              points: referral_data?.competition?.successful_login?.toString(),
            });

            if (existing_agency?.role?.name === "agency") {
              await Agency.findOneAndUpdate(
                { _id: existing_agency.reference_id },
                {
                  $inc: {
                    total_referral_point:
                      referral_data?.competition?.successful_login,
                  },
                },
                { new: true }
              );
            } else if (existing_agency?.role?.name === "team_agency") {
              await Team_Agency.findOneAndUpdate(
                { _id: existing_agency.reference_id },
                {
                  $inc: {
                    total_referral_point:
                      referral_data?.competition?.successful_login,
                  },
                },
                { new: true }
              );
            }
            await Authentication.findOneAndUpdate(
              { reference_id: existing_agency?.reference_id },
              { last_login_date: moment.utc().startOf("day") },
              { new: true }
            );
          }
        }
        return this.tokenGenerator({
          ...existing_agency,
          subscription_halt_days:
            referral_data?.payment?.subscription_halt_days,
        });
      }
    } catch (error) {
      logger.error(`Error while facebook signup:${error.message}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  login = async (payload) => {
    try {
      const { email, password } = payload;
      validateRequestFields(payload, ["email", "password"]);

      const existing_Data = await Authentication.findOne({
        email,
        is_deleted: false,
      })
        .populate("role", "name")
        .lean();

      if (!existing_Data)
        return throwError(
          returnMessage("auth", "dataNotFound"),
          statusCode.notFound
        );

      if (!existing_Data?.password)
        return throwError(returnMessage("auth", "incorrectPassword"));

      if (
        !(await this.passwordVerifier({
          password,
          encrypted_password: existing_Data?.password,
        }))
      )
        return throwError(returnMessage("auth", "incorrectPassword"));

      if (
        existing_Data?.role?.name == "agency" &&
        existing_Data?.status == "agency_inactive"
      )
        return throwError(returnMessage("agency", "agencyInactive"));

      if (existing_Data?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          existing_Data?.reference_id
        )
          .populate("role", "name")
          .lean();
        existing_Data.team_agency_detail = team_agency_detail;
        const agency_detail = await Authentication.findOne({
          reference_id: team_agency_detail?.agency_id,
        }).lean();

        if (agency_detail?.status === "payment_pending")
          return throwError(
            returnMessage("payment", "paymentPendingForAgency")
          );
      }
      delete existing_Data?.is_facebook_signup;
      delete existing_Data?.is_google_signup;
      delete existing_Data?.password;

      const lastLoginDateUTC = moment
        .utc(existing_Data?.last_login_date)
        .startOf("day");

      // Get the current date in UTC format using Moment.js
      const currentDateUTC = moment.utc().startOf("day");
      const referral_data = await Configuration.findOne().lean();
      // Check if last login date is the same as current date
      if (
        currentDateUTC.isAfter(lastLoginDateUTC) ||
        !existing_Data?.last_login_date
      ) {
        // If the condition is true, execute the following code
        if (
          existing_Data?.role?.name === "team_agency" ||
          existing_Data?.role?.name === "agency"
        ) {
          let agency_key,
            parent_id = existing_Data?.reference_id;

          if (existing_Data?.role?.name === "team_agency") {
            const team_detail = await Team_Agency.findOneAndUpdate(
              { _id: existing_Data.reference_id },
              {
                $inc: {
                  total_referral_point:
                    referral_data?.competition?.successful_login,
                },
              },
              { new: true }
            );
            parent_id = team_detail?.agency_id;
          }

          await CompetitionPoint.create({
            user_id: existing_Data?.reference_id,
            agency_id: parent_id,
            point: +referral_data?.competition?.successful_login?.toString(),
            type: "login",
            role: existing_Data?.role?.name,
          });

          await notificationService.addNotification({
            module_name: "referral",
            action_type: "login",
            referred_to:
              existing_Data?.first_name + " " + existing_Data?.last_name,
            receiver_id: existing_Data?.reference_id,
            points: referral_data?.competition?.successful_login?.toString(),
          });

          if (existing_Data?.role?.name === "agency") {
            await Agency.findOneAndUpdate(
              { _id: existing_Data.reference_id },
              {
                $inc: {
                  total_referral_point:
                    referral_data?.competition?.successful_login,
                },
              },
              { new: true }
            );
          }
          await Authentication.findOneAndUpdate(
            { reference_id: existing_Data.reference_id },
            { last_login_date: moment.utc().startOf("day") },
            { new: true }
          );
        }
      }

      if (existing_Data?.role?.name === "agency") {
        const agency_profile = await Agency.findById(
          existing_Data?.reference_id
        ).lean();
        if (
          !agency_profile?.address ||
          agency_profile?.address === "" ||
          !agency_profile?.state ||
          !agency_profile?.country ||
          !agency_profile?.city ||
          !agency_profile?.pincode ||
          agency_profile?.pincode === ""
        )
          existing_Data.profile_pending = true;
      } else if (existing_Data?.role?.name === "client") {
        const client_profile = await Client.findById(
          existing_Data?.reference_id
        ).lean();
        if (
          !client_profile?.address ||
          client_profile?.address === "" ||
          !client_profile?.state ||
          !client_profile?.country ||
          !client_profile?.city ||
          !client_profile?.pincode ||
          client_profile?.pincode === ""
        )
          existing_Data.profile_pending = true;
      }

      return this.tokenGenerator({
        ...existing_Data,
        rememberMe: payload?.rememberMe,
        subscription_halt_days: referral_data?.payment?.subscription_halt_days,
      });
    } catch (error) {
      logger.error(`Error while login: ${error.message}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  resetPasswordTokenGenerator = () => {
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const hash_token = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      return { token, hash_token };
    } catch (error) {
      logger.error(`Error while generating reset password token: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  forgotPassword = async (payload) => {
    try {
      const { email } = payload;
      if (!email) return throwError(returnMessage("auth", "emailRequired"));

      const data_exist = await Authentication.findOne({
        email,
        is_deleted: false,
        is_facebook_signup: false,
        is_google_signup: false,
      }).lean();

      if (!data_exist)
        return throwError(
          returnMessage("auth", "emailNotFound"),
          statusCode.notFound
        );

      const { token, hash_token } = this.resetPasswordTokenGenerator();
      const encode = encodeURIComponent(email);
      const link = `${process.env.RESET_PASSWORD_URL}?token=${token}&email=${encode}`;
      const company_urls = await Configuration.find().lean();
      let privacy_policy = company_urls[0]?.urls?.privacy_policy;

      let facebook = company_urls[0]?.urls?.facebook;

      let instagram = company_urls[0]?.urls?.instagram;
      const forgot_email_template = forgotPasswordEmailTemplate(
        link,
        data_exist?.first_name + " " + data_exist?.last_name ||
          data_exist?.name,
        privacy_policy,
        facebook,
        instagram
      );

      await sendEmail({
        email,
        subject: returnMessage("emailTemplate", "forgotPasswordSubject"),
        message: forgot_email_template,
      });
      await Authentication.findByIdAndUpdate(
        data_exist?._id,
        { reset_password_token: hash_token },
        { new: true }
      );
      return true;
    } catch (error) {
      logger.error(`Error with forget password: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  resetPassword = async (payload) => {
    try {
      const { email, password, token } = payload;
      validateRequestFields(payload, ["email", "password", "token"]);
      if (!passwordValidation(password))
        return throwError(returnMessage("auth", "invalidPassword"));

      const reset_password_token = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      const data = await Authentication.findOne({
        email,
        reset_password_token,
        is_deleted: false,
        is_facebook_signup: false,
        is_google_signup: false,
      });

      if (!data) return throwError(returnMessage("auth", "invalidToken"));

      const hased_password = await this.passwordEncryption({ password });

      if (hased_password == data?.password)
        return throwError(returnMessage("auth", "oldAndNewPasswordSame"));

      await Authentication.findByIdAndUpdate(data?._id, {
        password: hased_password,
        reset_password_token: null,
      });
      return true;
    } catch (error) {
      logger.error(`Error while resetting password: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  changePassword = async (payload, user_id) => {
    try {
      const { old_password, new_password } = payload;

      if (!old_password || !new_password)
        return throwError(returnMessage("auth", "passwordRequired"));

      const user = await Authentication.findById(user_id);
      const old_password_valid = await this.passwordVerifier({
        password: old_password,
        encrypted_password: user?.password,
      });

      if (!old_password_valid)
        return throwError(returnMessage("auth", "incorrectOldPassword"));

      const hash_password = await this.passwordEncryption({
        password: new_password,
      });

      if (hash_password === user.password)
        return throwError(returnMessage("auth", "oldAndNewPasswordSame"));

      user.reset_password_token = null;
      user.password = hash_password;
      await user.save();

      return true;
    } catch (error) {
      logger.error(`Error while changing password: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  countryList = async (payload) => {
    try {
      const query_obj = {};

      if (payload.search && payload.search !== "") {
        query_obj["$or"] = [
          {
            name: { $regex: payload.search, $options: "i" },
          },
        ];
      }

      return await Country_Master.find(query_obj).select("name").lean();
    } catch (error) {
      logger.error(`Error while fectching countries list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  statesList = async (country_id, payload) => {
    try {
      const query_obj = { country: country_id };

      if (payload.search && payload.search !== "") {
        query_obj["$or"] = [
          {
            name: { $regex: payload.search, $options: "i" },
          },
        ];
      }
      return await State_Master.find(query_obj).select("name").lean();
    } catch (error) {
      logger.error(`Error while fectching states: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  citiesList = async (state_id, payload) => {
    try {
      const query_obj = { state: state_id };

      if (payload.search && payload.search !== "") {
        query_obj["$or"] = [
          {
            name: { $regex: payload.search, $options: "i" },
          },
        ];
      }

      return await City_Master.find(query_obj).select("name").lean();
    } catch (error) {
      logger.error(`Error while fectching cities list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // set password is required
  passwordSetRequired = async (payload) => {
    try {
      if (!payload.email)
        return throwError(returnMessage("auth", "emailRequired"));
      const password_required = await Authentication.findOne({
        email: payload?.email,
        is_deleted: false,
      }).lean();
      if (password_required?.password) return { password_required: false };
      return { password_required: true };
    } catch (error) {
      logger.error(`Error while getting password required: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  referralCodeGenerator = async () => {
    try {
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let referral_code = "";

      // Generate the initial code
      for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        referral_code += characters.charAt(randomIndex);
      }

      const referral_code_exist = await Authentication.findOne({
        $or: [{ referral_code }, { affiliate_referral_code: referral_code }],
      }).lean();
      if (referral_code_exist) return this.referralCodeGenerator();

      return referral_code;
    } catch (error) {
      logger.error("Error while generating the referral code", error);
      return false;
    }
  };

  referralSignUp = async ({ referral_code, referred_to }) => {
    try {
      const referral_code_exist = await Authentication.findOne({
        referral_code,
      })
        .select("referral_code reference_id")
        .lean();

      if (!referral_code_exist)
        return throwError(returnMessage("auth", "referralCodeNotFound"));

      await ReferralHistory.deleteMany({
        referral_code,
        registered: false,
        referred_by: referral_code_exist.reference_id,
        email: referred_to?.email,
      });

      await ReferralHistory.create({
        referral_code,
        referred_by: referral_code_exist?.reference_id,
        referred_to: referred_to?.reference_id,
        email: referred_to?.email,
        registered: true,
      });

      const referral_data = await Configuration.findOne().lean();

      await CompetitionPoint.create({
        user_id: referred_to?.reference_id,
        agency_id: referral_code_exist?.reference_id,
        point: referral_data?.referral?.successful_referral_point,
        type: "referral",
      });

      const userData = await Authentication.findOne({
        reference_id: referred_to?.reference_id,
      });

      await notificationService.addNotification({
        module_name: "referral",
        action_type: "signUp",
        referred_to: userData?.first_name + " " + userData?.last_name,
        receiver_id: referral_code_exist?.reference_id,
        points: referral_data?.referral?.successful_referral_point,
      });

      await Agency.findOneAndUpdate(
        { _id: referral_code_exist?.reference_id },
        {
          $inc: {
            total_referral_point:
              referral_data?.referral?.successful_referral_point,
          },
        },
        { new: true }
      );
      return;
    } catch (error) {
      logger.error("Error while referral SignUp", error);
      return throwError(error?.message, error?.statusCode);
    }
  };

  affiliateReferralSignUp = async ({ referral_code, referred_to, email }) => {
    try {
      const affiliateCheck = await Affiliate.findOne({
        referral_code,
        email,
      }).lean();
      const crmAffiliate = await Authentication.findOne({
        affiliate_referral_code: referral_code,
      }).lean();

      if (!affiliateCheck && !crmAffiliate)
        return throwError(returnMessage("auth", "referralCodeNotFound"));

      if (affiliateCheck) {
        await Affiliate_Referral.create({
          referral_code,
          referred_by: affiliateCheck._id,
          referred_to: referred_to,
        });
      }
      if (crmAffiliate) {
        await Affiliate_Referral.create({
          referral_code,
          referred_by: crmAffiliate.reference_id,
          referred_to: referred_to,
        });
      }

      return;
    } catch (error) {
      logger.error("Error while referral SignUp", error);
      return throwError(error?.message, error?.statusCode);
    }
  };

  sendReferaal = async (user, payload) => {
    try {
      const { email } = payload;
      if (!validateEmail(email)) return returnMessage("auth", "invalidEmail");
      const email_exist = await Authentication.findOne({ email }).lean();
      if (email_exist) return throwError(returnMessage("auth", "emailExist"));
      const link = `${process.env.REACT_APP_URL}/signup?referral=${user?.referral_code}`;
      const company_urls = await Configuration.find().lean();
      let privacy_policy = company_urls[0]?.urls?.privacy_policy;

      let facebook = company_urls[0]?.urls?.facebook;

      let instagram = company_urls[0]?.urls?.instagram;
      const refferralEmail = invitationEmailTemplate({
        link: link,
        user: `${user?.first_name} ${user?.last_name} `,
        email,
        privacy_policy,
        facebook,
        instagram,
      });

      await sendEmail({
        email: email,
        subject: returnMessage("auth", "invitationEmailSubject"),
        message: refferralEmail,
      });

      await ReferralHistory.create({
        referral_code: user?.referral_code,
        referred_by: user?._id,
        email,
        registered: false,
      });

      return;
    } catch (error) {
      logger.error(`Error while sending email: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  checkSubscriptionHalt = async (agency) => {
    try {
      if (
        agency?.role?.name === "agency" &&
        agency?.subscription_halted &&
        agency?.subscription_halted_displayed
      ) {
        return {
          is_subscription_halted: true,
          subscription_halted_date: agency?.subscription_halted,
        };
      }
      return {
        is_subscription_halted: false,
      };
    } catch (error) {
      logger.error(`Error while checking the subscription halt: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = AuthService;
