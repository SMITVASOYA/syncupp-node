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
const paymentService = require("../services/paymentService");
const PaymentService = new paymentService();
const WorkspaceService = require("../services/workspaceService");
const Workspace = require("../models/workspaceSchema");
const Team_Role_Master = require("../models/masters/teamRoleSchema");
const workspaceService = new WorkspaceService();

class AuthService {
  tokenGenerator = async (payload) => {
    try {
      let role, sub_role;
      const expiresIn = payload?.rememberMe
        ? process.env.JWT_REMEMBER_EXPIRE
        : process.env.JWT_EXPIRES_IN;

      let workspace = await Workspace.findOne({
        created_by: payload?._id,
      }).lean();
      if (!workspace) {
        workspace = await Workspace.findOne({
          "members.user_id": payload?._id,
          is_deleted: false,
        })
          .sort({ "members.joining_date": -1 })
          .lean();
      }
      if (workspace) {
        const member_details = workspace?.members?.find(
          (member) => member?.user_id?.toString() === payload?._id?.toString()
        );

        [role, sub_role] = await Promise.all([
          Role_Master.findById(member_details?.role).lean(),
          Team_Role_Master.findById(member_details?.sub_role).lean(),
        ]);
      }

      const token = jwt.sign(
        { id: payload._id, workspace: workspace?._id },
        process.env.JWT_SECRET_KEY,
        {
          expiresIn,
        }
      );

      return {
        token,
        user: payload,
        workspace: { workspace, role: role?.name, sub_role: sub_role?.name },
      };
    } catch (error) {
      logger.error(`Error while token generate: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  tokenRegenerator = (token, workspace_id, user_id) => {
    try {
      const cleanedToken = token.replace(/^Bearer\s+/i, "");
      const decode = jwt.decode(cleanedToken);

      return jwt.sign(
        { id: user_id, workspace: workspace_id },
        process.env.JWT_SECRET_KEY,
        {
          expiresIn: decode?.exp,
        }
      );
    } catch (error) {
      logger.error(`Error while regenerating the token: ${error}`);
    }
  };

  changeWorkspace = async (token, payload, user) => {
    try {
      const { workspace_id } = payload;
      if (!workspace_id)
        return throwError(returnMessage("workspace", "workspaceRequired"));
      const workspace_exist = await Workspace.findOne({
        _id: workspace_id,
        "members.user_id": user?._id,
        is_deleted: false,
      }).lean();

      if (!workspace_exist)
        return throwError(
          returnMessage("workspace", "workspaceNotFound"),
          statusCode.notFound
        );

      const new_token = this.tokenRegenerator(
        token,
        workspace_exist?._id,
        user?._id
      );

      const member_details = workspace_exist?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      const [role, sub_role] = await Promise.all([
        Role_Master.findById(member_details?.role).lean(),
        Team_Role_Master.findById(member_details?.sub_role).lean(),
      ]);

      return {
        token: new_token,
        workspace: workspace_exist,
        user,
        user_role: role?.name,
        sub_role: sub_role?.name,
      };
    } catch (error) {
      logger.error(`Error while changing the workspace: ${error}`);
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

  userSignUp = async (payload) => {
    try {
      let user_enroll;
      const { email, referral_code } = payload;

      validateRequestFields(payload, ["email"]);

      if (!validateEmail(email))
        return throwError(returnMessage("auth", "invalidEmail"));

      const user_exist = await Authentication.findOne({
        email,
        is_deleted: false,
      }).lean();

      if (
        user_exist &&
        user_exist?.status === "signup_completed" &&
        user_exist?.contact_number &&
        user_exist?.no_of_people &&
        user_exist?.profession_role
      )
        return throwError(returnMessage("user", "userAlreadyExist"));

      if (user_exist) return user_exist;

      if (!payload?.referral_code) {
        payload.referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!payload.referral_code)
          return throwError(returnMessage("referral", "codeGenerationFailed"));

        user_enroll = await Authentication.create({
          email,
          referral_code: payload?.referral_code,
          affiliate_referral_code,
        });

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: user_enroll._id,
            email: decodedEmail,
          });
        }
      } else if (payload?.referral_code) {
        let new_referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!new_referral_code)
          return throwError(returnMessage("referral", "codeGenerationFailed"));

        user_enroll = await Authentication.create({
          email: email?.toLowerCase(),
          referral_code: new_referral_code,
          affiliate_referral_code,
        });

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: referral_code,
            referred_to: user_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(user_enroll._id);
            return referral_registered;
          }
        }
      }
      return user_enroll?.toObject();
    } catch (error) {
      logger.error(`Error while agency signup: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  signupComplete = async (payload) => {
    try {
      let {
        email,
        first_name,
        last_name,
        password,
        contact_number,
        no_of_people,
        profession_role,
        referral_code,
      } = payload;

      validateRequestFields(payload, ["email", "first_name", "last_name"]);

      if (!validateEmail(email))
        return throwError(returnMessage("auth", "invalidEmail"));

      if (password) {
        if (!passwordValidation(password))
          return throwError(returnMessage("auth", "invalidPassword"));
        password = await this.passwordEncryption({ password });
      }

      const user_exist = await Authentication.findOne({
        email,
        is_deleted: false,
      }).lean();

      if (contact_number) {
        const unique_contact = await Authentication.findOne({
          contact_number,
          _id: { $ne: user_exist?._id },
          is_deleted: false,
        }).lean();
        if (unique_contact)
          return throwError(returnMessage("user", "contactNumberExist"));
      }

      if (
        user_exist &&
        user_exist?.contact_number &&
        user_exist?.no_of_people &&
        user_exist?.profession_role
      )
        return throwError(returnMessage("user", "userAlreadyExist"));

      if (payload?.workspace_name) {
        await workspaceService.createWorkspace(
          { workspace_name: payload?.workspace_name?.replace(/\s+/g, "-") },
          user_exist
        );
      }

      let user_enroll = await Authentication.findByIdAndUpdate(
        user_exist?._id,
        {
          email: email?.toLowerCase(),
          password,
          first_name: first_name?.toLowerCase(),
          last_name: last_name?.toLowerCase(),
          profession_role,
          no_of_people,
          contact_number,
          status: "signup_completed",
        },
        { new: true }
      );

      if (!payload?.referral_code) {
        // commented as we will create the contact after the user will fill the details like
        // email, firstname and lastname
        // PaymentService.createContact(agency_enroll);

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: user_enroll._id,
            email: decodedEmail,
          });
        }

        // this is pending while changing the signup flow
        // -------------------- Notification --------------------------------

        // notificationService.addAdminNotification({
        //   action_name: "agencyCreated",
        //   agency_name:
        //     capitalizeFirstLetter(first_name) +
        //     " " +
        //     capitalizeFirstLetter(last_name),
        //   email: email,
        //   contact_number: contact_number,
        // });

        // var agencyCreated = agencyCreatedTemplate({
        //   agency_name:
        //     capitalizeFirstLetter(first_name) +
        //     " " +
        //     capitalizeFirstLetter(last_name),
        //   email: email,
        //   contact_number: contact_number,
        // });

        // sendEmail({
        //   email: admin?.email,
        //   subject: returnMessage("emailTemplate", "agencyCreated"),
        //   message: agencyCreated,
        // });
        // -------------------- Notification --------------------------------

        // this will used if we are adding the trial periods
        // if (configuration?.payment?.free_trial > 0) {
        //   await SheetManagement.findOneAndUpdate(
        //     { agency_id: agency_enroll?.reference_id },
        //     {
        //       agency_id: agency_enroll?.reference_id,
        //       total_sheets: 1,
        //       occupied_sheets: [],
        //     },
        //     { upsert: true }
        //   );
        // }
      } else if (payload?.referral_code) {
        // commented as we will create the contact after the user will fill the details like
        // email, firstname and lastname
        // PaymentService.createContact(agency);

        // removed as of now because of the implementation of the new sign up flow
        // -------------------- Notification --------------------------------

        // notificationService.addAdminNotification({
        //   action_name: "agencyCreated",
        //   agency_name:
        //     capitalizeFirstLetter(first_name) +
        //     " " +
        //     capitalizeFirstLetter(last_name),
        //   email: email,
        //   contact_number: contact_number,
        // });

        // sendEmail({
        //   email: admin?.email,
        //   subject: returnMessage("emailTemplate", "agencyCreated"),
        //   message: agencyCreated,
        // });
        // -------------------- Notification --------------------------------

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: referral_code,
            referred_to: user_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(user_enroll._id);
            return referral_registered;
          }
        }
      }
      user_enroll = user_enroll?.toObject();
      // this.glideCampaign({
      //   ...user_enroll,
      //   no_of_people: payload?.no_of_people,
      //   industry: payload?.profession_role,
      // });
      return await this.tokenGenerator({
        ...user_enroll,
        rememberMe: payload?.rememberMe,
      });
    } catch (error) {
      logger.error(`Error while agency signup: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  checkContactunique = async (payload) => {
    try {
      validateRequestFields(payload, ["email", "contact_number"]);
      const { email, contact_number } = payload;

      const contact_exist = await Authentication.findOne({
        contact_number,
        email: { $ne: email },
        is_deleted: false,
      }).lean();
      let unique_contact = true;
      if (contact_exist) unique_contact = false;
      return { unique_contact };
    } catch (error) {
      logger.error(`Error while checking the unique number: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getEmailDetails = async (payload) => {
    try {
      validateRequestFields(payload, ["email"]);
      const { email } = payload;

      const user = await Authentication.findOne({
        email,
        is_deleted: false,
      })
        .populate("country city state")
        .lean();

      if (payload?.token) {
        return {
          first_name: user?.first_name,
          last_name: user?.last_name,
          email: user?.email,
          status: user?.status,
          password_set: user?.password ? true : false,
          is_google_signup: user?.is_google_signup,
          is_facebook_signup: user?.is_facebook_signup,
          company_name: user?.company_name,
          company_website: user?.company_website,
          gst: user?.gst,
          contact_number: user?.contact_number,
          address: user?.address,
          state: user?.state,
          city: user?.city,
          country: user?.country,
          pincode: user?.pincode,
        };
      }
      return {
        email: user?.email,
        status: user?.status,
        password_set: user?.password ? true : false,
        is_google_signup: user?.is_google_signup,
        is_facebook_signup: user?.is_facebook_signup,
      };
    } catch (error) {
      logger.error(`Error while checking the unique number: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  googleSign = async (payload) => {
    try {
      const { signupId } = payload;

      if (!signupId)
        return throwError(returnMessage("auth", "googleAuthTokenNotFound"));

      const decoded = jwt.decode(signupId);

      let user_exist = await Authentication.findOne({
        email: decoded.email,
        is_deleted: false,
        is_google_signup: true,
      }).lean();

      if (!user_exist) {
        const referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!referral_code) return returnMessage("default");

        let user_enroll = await Authentication.create({
          first_name: decoded?.given_name,
          last_name: decoded?.family_name,
          email: decoded?.email,
          is_google_signup: true,
          referral_code,
          affiliate_referral_code,
          status: "signup_incomplete",
        });

        user_enroll = user_enroll?.toObject();

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: payload?.referral_code,
            referred_to: user_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(user_enroll?._id);
            return referral_registered;
          }
        }

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          await this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: user_enroll?._id,
            email: decodedEmail,
          });
        }
        // removed as of now we will integrate this one later
        // PaymentService.createContact(user_enroll);
        // this is on halt as of now
        // const lastLoginDateUTC = moment
        //   .utc(user_enroll?.last_login_date)
        //   .startOf("day");
        // const currentDateUTC = moment.utc().startOf("day");

        // if (
        //   currentDateUTC.isAfter(lastLoginDateUTC) ||
        //   !user_enroll?.last_login_date
        // ) {
        //   if (
        //     agency_enroll?.role?.name === "team_agency" ||
        //     agency_enroll?.role?.name === "agency"
        //   ) {
        //     await CompetitionPoint.create({
        //       user_id: agency_enroll?.reference_id,
        //       agency_id: agency_enroll?.reference_id,
        //       point: +referral_data?.competition?.successful_login?.toString(),
        //       type: "login",
        //       role: agency_enroll?.role?.name,
        //     });

        //     await notificationService.addNotification({
        //       module_name: "referral",
        //       action_type: "login",
        //       referred_to:
        //         agency_enroll?.first_name + " " + agency_enroll?.last_name,
        //       receiver_id: agency_enroll?.reference_id,
        //       points: referral_data?.competition?.successful_login?.toString(),
        //     });

        //     await Agency.findOneAndUpdate(
        //       { _id: agency_enroll?.reference_id },
        //       {
        //         $inc: {
        //           total_referral_point:
        //             referral_data?.competition?.successful_login,
        //         },
        //       },
        //       { new: true }
        //     );
        //     await Authentication.findOneAndUpdate(
        //       { reference_id: agency_enroll.reference_id },
        //       { last_login_date: moment.utc().startOf("day") },
        //       { new: true }
        //     );
        //   }
        // }

        // currently it is on halt
        // this will used if we are adding the trial periods
        // if (referral_data?.payment?.free_trial > 0) {
        //   await SheetManagement.findOneAndUpdate(
        //     { agency_id: agency_enroll?.reference_id },
        //     {
        //       agency_id: agency_enroll?.reference_id,
        //       total_sheets: 1,
        //       occupied_sheets: [],
        //     },
        //     { upsert: true }
        //   );
        // }

        // notification flow is on halt in the new sign up flow
        // -------------------- Notification --------------------------------

        // notificationService.addAdminNotification({
        //   action_name: "agencyCreated",
        //   agency_name:
        //     capitalizeFirstLetter(decoded?.given_name) +
        //     " " +
        //     capitalizeFirstLetter(decoded?.family_name),
        //   email: decoded?.email,
        // });

        // const agencyCreated = agencyCreatedTemplate({
        //   agency_name:
        //     capitalizeFirstLetter(decoded?.given_name) +
        //     " " +
        //     capitalizeFirstLetter(decoded?.family_name),
        //   email: decoded?.email,
        // });

        // sendEmail({
        //   email: admin?.email,
        //   subject: returnMessage("emailTemplate", "agencyCreated"),
        //   message: agencyCreated,
        // });
        // // -------------------- Notification --------------------------------
        // glide campaign is on halt and it will resume after the new Sign up flow
        // this.glideCampaign({
        //   ...agency_enroll,
        //   company_name: payload?.company_name,
        //   company_website: payload?.company_website,
        //   no_of_people: payload?.no_of_people,
        //   industry: payload?.industry,
        // });
        return user_enroll;
      } else {
        // this condition is used when user enters the same email id while sign up and then uses google signin method
        if (!user_exist?.is_google_signup)
          await Authentication.findByIdAndUpdate(user_exist?._id, {
            is_google_signup: true,
          });
        // this is on halt now
        // const lastLoginDateUTC = moment
        //   .utc(existing_agency?.last_login_date)
        //   .startOf("day");
        // const currentDateUTC = moment.utc().startOf("day");

        // if (
        //   currentDateUTC.isAfter(lastLoginDateUTC) ||
        //   !existing_agency?.last_login_date
        // ) {
        //   if (
        //     existing_agency?.role?.name === "team_agency" ||
        //     existing_agency?.role?.name === "agency"
        //   ) {
        //     await CompetitionPoint.create({
        //       user_id: existing_agency?.reference_id,
        //       agency_id: existing_agency?.reference_id,
        //       point: +referral_data?.competition?.successful_login?.toString(),
        //       type: "login",
        //       role: existing_agency?.role?.name,
        //     });

        //     await notificationService.addNotification({
        //       module_name: "referral",
        //       action_type: "login",
        //       referred_to:
        //         existing_agency?.first_name + " " + existing_agency?.last_name,
        //       receiver_id: existing_agency?.reference_id,
        //       points: referral_data?.competition?.successful_login?.toString(),
        //     });
        //     if (existing_agency?.role?.name === "agency") {
        //       await Agency.findOneAndUpdate(
        //         { _id: existing_agency.reference_id },
        //         {
        //           $inc: {
        //             total_referral_point:
        //               referral_data?.competition?.successful_login,
        //           },
        //         },
        //         { new: true }
        //       );
        //     } else if (existing_agency?.role?.name === "team_agency") {
        //       await Team_Agency.findOneAndUpdate(
        //         { _id: existing_agency.reference_id },
        //         {
        //           $inc: {
        //             total_referral_point:
        //               referral_data?.competition?.successful_login,
        //           },
        //         },
        //         { new: true }
        //       );
        //     }
        //     await Authentication.findOneAndUpdate(
        //       { reference_id: existing_agency.reference_id },
        //       { last_login_date: moment.utc().startOf("day") },
        //       { new: true }
        //     );
        //   }
        // }
        return await this.tokenGenerator({
          ...user_exist,
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

      let user_exist = await Authentication.findOne({
        email: data?.email,
        is_deleted: false,
        is_facebook_signup: true,
      }).lean();

      if (!user_exist) {
        const referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        if (!referral_code) return returnMessage("default");

        let user_enroll = await Authentication.create({
          first_name: data?.first_name,
          last_name: data?.last_name,
          email: data?.email,
          status: "signup_incomplete",
          is_facebook_signup: true,
          referral_code,
          affiliate_referral_code,
        });

        user_enroll = user_enroll?.toObject();

        if (payload?.referral_code) {
          const referral_registered = await this.referralSignUp({
            referral_code: payload?.referral_code,
            referred_to: user_enroll,
          });

          if (typeof referral_registered === "string") {
            await Authentication.findByIdAndDelete(user_enroll?._id);
            return referral_registered;
          }
        }

        if (payload?.affiliate_referral_code) {
          const decodedEmail = decodeURIComponent(payload?.affiliate_email);
          await this.affiliateReferralSignUp({
            referral_code: payload?.affiliate_referral_code,
            referred_to: user_enroll?._id,
            email: decodedEmail,
          });
        }
        // need to check the flow after the new signup flow
        // PaymentService.createContact(user_enroll);
        // need to verify later and store process of the login points
        // const lastLoginDateUTC = moment
        //   .utc(agency_enroll?.last_login_date)
        //   .startOf("day");
        // const currentDateUTC = moment.utc().startOf("day");

        // if (
        //   currentDateUTC.isAfter(lastLoginDateUTC) ||
        //   !agency_enroll?.last_login_date
        // ) {
        //   if (
        //     agency_enroll?.role?.name === "team_agency" ||
        //     agency_enroll?.role?.name === "agency"
        //   ) {
        //     await CompetitionPoint.create({
        //       user_id: agency_enroll?.reference_id,
        //       agency_id: agency_enroll?.reference_id,
        //       point: +referral_data?.competition?.successful_login?.toString(),
        //       type: "login",
        //       role: agency_enroll?.role?.name,
        //       login_date: moment.utc().startOf("day"),
        //     });

        //     await notificationService.addNotification({
        //       module_name: "referral",
        //       action_type: "login",
        //       referred_to:
        //         agency_enroll?.first_name + " " + agency_enroll?.last_name,
        //       receiver_id: agency_enroll?.reference_id,
        //       points: referral_data?.competition?.successful_login?.toString(),
        //     });

        //     await Agency.findOneAndUpdate(
        //       { _id: agency_enroll?.reference_id },
        //       {
        //         $inc: {
        //           total_referral_point:
        //             referral_data?.competition?.successful_login,
        //         },
        //       },
        //       { new: true }
        //     );
        //     await Authentication.findOneAndUpdate(
        //       { reference_id: agency_enroll.reference_id },
        //       { last_login_date: moment.utc().startOf("day") },
        //       { new: true }
        //     );
        //   }
        // }

        // this will used if we are adding the trial periods
        // if (referral_data?.payment?.free_trial > 0) {
        //   await SheetManagement.findOneAndUpdate(
        //     { agency_id: agency_enroll?.reference_id },
        //     {
        //       agency_id: agency_enroll?.reference_id,
        //       total_sheets: 1,
        //       occupied_sheets: [],
        //     },
        //     { upsert: true }
        //   );
        // }

        // notification is on halt now
        // // -------------------- Notification --------------------------------

        // notificationService.addAdminNotification({
        //   action_name: "agencyCreated",
        //   agency_name:
        //     capitalizeFirstLetter(data?.first_name) +
        //     " " +
        //     capitalizeFirstLetter(data?.last_name),
        //   email: data?.email,
        // });

        // const agencyCreated = agencyCreatedTemplate({
        //   agency_name:
        //     capitalizeFirstLetter(data?.first_name) +
        //     " " +
        //     capitalizeFirstLetter(data?.last_name),
        //   email: data?.email,
        // });

        // sendEmail({
        //   email: admin?.email,
        //   subject: returnMessage("emailTemplate", "agencyCreated"),
        //   message: agencyCreated,
        // });
        // // -------------------- Notification --------------------------------
        // this.glideCampaign({
        //   ...agency_enroll,
        //   company_name: payload?.company_name,
        //   company_website: payload?.company_website,
        //   no_of_people: payload?.no_of_people,
        //   industry: payload?.industry,
        // });

        return user_enroll;
      } else {
        // this condition is used when user enters the same email id while sign up and then uses google signin method
        if (!user_exist?.is_facebook_signup)
          await Authentication.findByIdAndUpdate(user_exist?._id, {
            is_facebook_signup: true,
          });
        // need to integrate and test later
        // const lastLoginDateUTC = moment
        //   .utc(existing_agency?.last_login_date)
        //   .startOf("day");
        // const currentDateUTC = moment.utc().startOf("day");

        // if (
        //   currentDateUTC.isAfter(lastLoginDateUTC) ||
        //   !existing_agency?.last_login_date
        // ) {
        //   if (
        //     existing_agency?.role?.name === "team_agency" ||
        //     existing_agency?.role?.name === "agency"
        //   ) {
        //     await CompetitionPoint.create({
        //       user_id: existing_agency?.reference_id,
        //       agency_id: existing_agency?.reference_id,
        //       point: +referral_data?.competition?.successful_login?.toString(),
        //       type: "login",
        //       role: existing_agency?.role?.name,
        //     });

        //     await notificationService.addNotification({
        //       module_name: "referral",
        //       action_type: "login",
        //       referred_to:
        //         existing_agency?.first_name + " " + existing_agency?.last_name,
        //       receiver_id: existing_agency?.reference_id,
        //       points: referral_data?.competition?.successful_login?.toString(),
        //     });

        //     if (existing_agency?.role?.name === "agency") {
        //       await Agency.findOneAndUpdate(
        //         { _id: existing_agency.reference_id },
        //         {
        //           $inc: {
        //             total_referral_point:
        //               referral_data?.competition?.successful_login,
        //           },
        //         },
        //         { new: true }
        //       );
        //     } else if (existing_agency?.role?.name === "team_agency") {
        //       await Team_Agency.findOneAndUpdate(
        //         { _id: existing_agency.reference_id },
        //         {
        //           $inc: {
        //             total_referral_point:
        //               referral_data?.competition?.successful_login,
        //           },
        //         },
        //         { new: true }
        //       );
        //     }
        //     await Authentication.findOneAndUpdate(
        //       { reference_id: existing_agency?.reference_id },
        //       { last_login_date: moment.utc().startOf("day") },
        //       { new: true }
        //     );
        //   }
        // }
        return await this.tokenGenerator({
          ...user_exist,
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

      const user_exist = await Authentication.findOne({
        email,
        is_deleted: false,
      }).lean();

      if (!user_exist)
        return throwError(
          returnMessage("auth", "dataNotFound"),
          statusCode.notFound
        );

      if (user_exist?.status === "signup_incomplete")
        return { user: user_exist };

      if (!user_exist?.password)
        return throwError(returnMessage("auth", "incorrectPassword"));

      if (
        !(await this.passwordVerifier({
          password,
          encrypted_password: user_exist?.password,
        }))
      )
        return throwError(returnMessage("auth", "incorrectPassword"));

      if (user_exist?.status == "inactive")
        return throwError(returnMessage("user", "userInactive"));

      delete user_exist?.is_facebook_signup;
      delete user_exist?.is_google_signup;
      delete user_exist?.password;

      // removed as of now
      // const lastLoginDateUTC = moment
      //   .utc(existing_Data?.last_login_date)
      //   .startOf("day");

      // // Get the current date in UTC format using Moment.js
      // const currentDateUTC = moment.utc().startOf("day");
      // const referral_data = await Configuration.findOne().lean();
      // Check if last login date is the same as current date
      // if (
      //   currentDateUTC.isAfter(lastLoginDateUTC) ||
      //   !existing_Data?.last_login_date
      // ) {
      //   // If the condition is true, execute the following code
      //   if (
      //     existing_Data?.role?.name === "team_agency" ||
      //     existing_Data?.role?.name === "agency"
      //   ) {
      //     let agency_key,
      //       parent_id = existing_Data?.reference_id;

      //     if (existing_Data?.role?.name === "team_agency") {
      //       const team_detail = await Team_Agency.findOneAndUpdate(
      //         { _id: existing_Data.reference_id },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_login,
      //           },
      //         },
      //         { new: true }
      //       );
      //       parent_id = team_detail?.agency_id;
      //     }

      //     await CompetitionPoint.create({
      //       user_id: existing_Data?.reference_id,
      //       agency_id: parent_id,
      //       point: +referral_data?.competition?.successful_login?.toString(),
      //       type: "login",
      //       role: existing_Data?.role?.name,
      //     });

      //     await notificationService.addNotification({
      //       module_name: "referral",
      //       action_type: "login",
      //       referred_to:
      //         existing_Data?.first_name + " " + existing_Data?.last_name,
      //       receiver_id: existing_Data?.reference_id,
      //       points: referral_data?.competition?.successful_login?.toString(),
      //     });

      //     if (existing_Data?.role?.name === "agency") {
      //       await Agency.findOneAndUpdate(
      //         { _id: existing_Data.reference_id },
      //         {
      //           $inc: {
      //             total_referral_point:
      //               referral_data?.competition?.successful_login,
      //           },
      //         },
      //         { new: true }
      //       );
      //     }
      //     await Authentication.findOneAndUpdate(
      //       { reference_id: existing_Data.reference_id },
      //       { last_login_date: moment.utc().startOf("day") },
      //       { new: true }
      //     );
      //   }
      // }

      // this will check after the complete signup flow
      // if (existing_Data?.role?.name === "agency") {
      //   const agency_profile = await Agency.findById(
      //     existing_Data?.reference_id
      //   ).lean();
      //   if (
      //     !agency_profile?.address ||
      //     agency_profile?.address === "" ||
      //     !agency_profile?.state ||
      //     !agency_profile?.country ||
      //     !agency_profile?.city ||
      //     !agency_profile?.pincode ||
      //     agency_profile?.pincode === ""
      //   )
      //     existing_Data.profile_pending = true;
      // } else if (existing_Data?.role?.name === "client") {
      //   const client_profile = await Client.findById(
      //     existing_Data?.reference_id
      //   ).lean();
      //   if (
      //     !client_profile?.address ||
      //     client_profile?.address === "" ||
      //     !client_profile?.state ||
      //     !client_profile?.country ||
      //     !client_profile?.city ||
      //     !client_profile?.pincode ||
      //     client_profile?.pincode === ""
      //   )
      //     existing_Data.profile_pending = true;
      // }

      return await this.tokenGenerator({
        ...user_exist,
        rememberMe: payload?.rememberMe,
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
        referred_by: referral_code_exist?._id,
        email: referred_to?.email,
      });

      await ReferralHistory.create({
        referral_code,
        referred_by: referral_code_exist?._id,
        referred_to: referred_to?._id,
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

  // this function is used to create the contact in the  glide campaign
  glideCampaign = async (payload) => {
    try {
      const compaign_object = {
        first_name: capitalizeFirstLetter(payload?.first_name),
        last_name: capitalizeFirstLetter(payload?.last_name),
        email: payload?.email,
        phone: payload?.contact_number,
        company: payload?.company_name
          ? capitalizeFirstLetter(payload?.company_name)
          : undefined,
        website: payload?.website,
        role: "Agency",
        created: moment().format("DD-MM-YYYY"),
      };

      const contact_created = await axios.post(
        process.env.GLIDE_CAMPAIGN_URL,
        compaign_object
      );
      if (contact_created) {
        await Authentication.findByIdAndUpdate(payload?._id, {
          glide_campaign_id: contact_created?.data?.data?.contact_id,
        });
      }
      return;
    } catch (error) {
      console.log(error);
      logger.error(
        `Error while creating the contact in the glide campaign: ${error}`
      );
    }
  };

  getProfile = async (user) => {
    try {
      return await Authentication.findById(user?._id)
        .select("-password")
        .lean();
    } catch (error) {
      logger.error(`Error while fetching the profile: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = AuthService;
