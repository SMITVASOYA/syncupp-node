const Razorpay = require("razorpay");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const SubscriptionPlan = require("../models/subscriptionplanSchema");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Client = require("../models/teamClientSchema");
const PaymentHistory = require("../models/paymentHistorySchema");
const SheetManagement = require("../models/sheetManagementSchema");
const Activity = require("../models/activitySchema");
const Activity_Status = require("../models/masters/activityStatusMasterSchema");
const {
  returnMessage,
  invitationEmail,
  paginationObject,
  capitalizeFirstLetter,
  getKeywordType,
  returnNotification,
} = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const crypto = require("crypto");
const moment = require("moment");
const sendEmail = require("../helpers/sendEmail");
const Configuration = require("../models/configurationSchema");
const CompetitionPoint = require("../models/competitionPointSchema");
const ReferralHistory = require("../models/referralHistorySchema");
const Agency = require("../models/agencySchema");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});
const axios = require("axios");
const AdminCoupon = require("../models/adminCouponSchema");
const Affiliate_Referral = require("../models/affiliateReferralSchema");
const Event = require("../models/eventSchema");
const Invoice = require("../models/invoiceSchema");
const Agreement = require("../models/agreementSchema");
const { eventEmitter } = require("../socket");

class PaymentService {
  constructor() {
    this.razorpayApi = axios.create({
      baseURL: "https://api.razorpay.com/v1",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_SECRET}`
        ).toString("base64")}`,
      },
    });
  }

  createPlan = async (payload) => {
    try {
      // const planExist = await SubscriptionPlan.findOne({
      //   period: "monthly",
      // }).lean();
      // if (planExist) return throwError(returnMessage("payment", "planExist"));

      const planData = {
        period: payload?.period,
        interval: 1, // Charge every month
        item: {
          name: payload?.name,
          description: payload?.description,
          amount: payload?.amount * 100, // Amount in paise (6000 INR)
          currency: payload?.currency,
        },
      };
      const plan = await Promise.resolve(razorpay.plans.create(planData));

      if (plan) {
        await SubscriptionPlan.updateMany({}, { active: false }, { new: true });
        await SubscriptionPlan.create({
          amount: payload?.amount * 100,
          currency: payload?.currency,
          description: payload?.description,
          plan_id: plan?.id,
          period: payload?.period,
          name: payload?.name,
          active: true,
        });
      }

      return;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the plan: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  subscription = async (user) => {
    try {
      if (user?.role?.name !== "agency")
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode.forbidden
        );

      if (
        (user?.subscription_id && user?.subscribe_date) ||
        user?.status !== "payment_pending"
      )
        return throwError(returnMessage("payment", "alreadyPaid"));
      const [plan, configuration] = await Promise.all([
        SubscriptionPlan.findOne({ active: true }).lean(),
        Configuration.findOne().lean(),
      ]);

      if (!plan)
        return throwError(
          returnMessage("payment", "planNotFound"),
          statusCode.notFound
        );

      const start_at = moment
        .utc()
        .add(configuration?.payment?.free_trial, "days")
        .startOf("day");
      const subscription_obj = {
        plan_id: plan?.plan_id,
        quantity: 1,
        customer_notify: 1,
        total_count: 120,
        start_at: start_at.unix(),
      };
      // commenting because to test the razorpay axios api call
      // const subscription = await razorpay.subscriptions.create(
      //   subscription_obj
      // );

      // creating the customer to the razorpay
      await this.razorpayApi.post("/customers", {
        name: user?.first_name + " " + user?.last_name,
        contact: user?.contact_number,
        email: user?.email,
        fail_existing: 0,
      });

      const { data } = await this.razorpayApi.post(
        "/subscriptions",
        subscription_obj
      );
      const subscription = data;

      await Authentication.findByIdAndUpdate(
        user?._id,
        { subscription_id: subscription?.id },
        { new: true }
      );

      return {
        payment_id: subscription?.id,
        amount: plan?.amount,
        currency: plan?.currency,
        agency_id: user?.reference_id,
        email: user?.email,
        contact_number: user?.contact_number,
      };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while creating subscription: ${error}`);
      return throwError(
        error?.message || error?.error?.description,
        error?.statusCode
      );
    }
  };

  webHookHandlar = async (request) => {
    try {
      const { body, headers } = request;

      // verify webhook signature is commented because it is not working for the invoice paid event
      // const razorpaySignature = headers["x-razorpay-signature"];
      // const signature = crypto
      //   .createHmac("sha256", process.env.WEBHOOK_SECRET)
      //   .update(JSON.stringify(body))
      //   .digest("hex");
      //   if (razorpaySignature !== signature)
      //     return throwError(
      //       returnMessage("payment", "invalidSignature"),
      //       statusCode.forbidden
      //     );

      // await PaymentHistory.create({
      //   agency_id,
      //   amount,
      //   subscription_id,
      //   currency,
      //   payment_id: razorpay_payment_id,
      // });

      console.log(JSON.stringify(body), 100);

      if (body) {
        const { payload } = body;
        if (body?.event === "subscription.authenticated") {
          const subscription_id = payload?.subscription?.entity?.id;
          const plan_id = payload?.subscription?.entity?.plan_id;

          const [agency_details, payment_history, configuration] =
            await Promise.all([
              Authentication.findOne({ subscription_id }).lean(),
              PaymentHistory.findOne({ subscription_id }),
              Configuration.findOne().lean(),
            ]);

          if (!(configuration.payment.free_trial > 0)) return;
          if (!agency_details) return;
          let first_time = false;
          if (!payment_history) first_time = true;

          const pp = await PaymentHistory.create({
            agency_id: agency_details?.reference_id,
            subscription_id,
            first_time,
            plan_id,
            payment_mode: "free_trial",
          });
          console.log(pp, 219);
          return;
        } else if (body?.event === "subscription.charged") {
          const subscription_id = payload?.subscription?.entity?.id;
          const payment_id = payload?.payment?.entity?.id;
          const currency = payload?.payment?.entity?.currency;
          const amount = payload?.payment?.entity?.amount;
          const plan_id = payload?.subscription?.entity?.plan_id;

          const [agency_details, payment_history] = await Promise.all([
            Authentication.findOne({ subscription_id }).lean(),
            PaymentHistory.findOne({ subscription_id }),
          ]);
          if (!agency_details) return;
          let first_time = false;
          if (!payment_history) first_time = true;

          const paymentData = await PaymentHistory.create({
            agency_id: agency_details?.reference_id,
            amount,
            subscription_id,
            currency,
            payment_id,
            first_time,
            plan_id,
          });

          await Affiliate_Referral.findOneAndUpdate(
            {
              referred_to: agency_details?.reference_id,
              $eq: { status: "inactive" },
            },
            {
              $set: { status: "active", payment_id: paymentData._id },
            },
            { new: true }
          );

          return;
        } else if (body?.event === "subscription.activated") {
          const subscription_id = payload?.subscription?.entity?.id;
          const agency_details = await Authentication.findOne({
            subscription_id,
          }).lean();

          if (agency_details && agency_details?.subscription_halted) {
            await Authentication.findByIdAndUpdate(agency_details?._id, {
              subscription_halted: undefined,
              status: "confirmed",
            });
          }

          return;
        } else if (
          body?.event === "subscription.halted" ||
          body?.event === "subscription.pending"
        ) {
          const subscription_id = payload?.subscription?.entity?.id;
          const agency_details = await Authentication.findOne({
            subscription_id,
          }).lean();

          if (agency_details && !agency_details?.subscription_halted) {
            await Authentication.findByIdAndUpdate(agency_details?._id, {
              subscription_halted: moment.utc().startOf("day"),
            });
          }

          return;
        }
      }

      return;
    } catch (error) {
      console.log(JSON.stringify(error));

      console.log(`Error with webhook handler`, error);
      return throwError(
        error?.message || error?.error?.description,
        error.status
      );
    }
  };

  customPaymentCalculator = (
    subscription_start_date,
    renew_subscription_date,
    plan
  ) => {
    try {
      const start_date = moment.unix(subscription_start_date).startOf("day");
      const renew_date = moment.unix(renew_subscription_date).endOf("day");

      const paymentMoment = moment().startOf("day");

      // days difference between payment start and renew subscription date
      const days_diff = Math.abs(paymentMoment.diff(renew_date, "days"));
      console.log("Days diff", days_diff);
      // calculate the total days between subscription dates
      const total_days = Math.abs(renew_date.diff(start_date, "days"));
      console.log("total days", total_days);

      const proratedAmount = (plan?.amount / total_days) * days_diff;
      console.log("prorated value", proratedAmount);
      if (paymentMoment.isSame(start_date)) return plan?.amount;

      return proratedAmount.toFixed(2);
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while calculating the custom payment: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  oneTimePayment = async (payload, user) => {
    try {
      if (user?.role?.name !== "agency")
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode.forbidden
        );

      if (
        user?.status === "payment_pending" ||
        !user?.subscribe_date ||
        !user?.subscription_id
      )
        return throwError(returnMessage("payment", "agencyPaymentPending"));

      if (!payload?.user_id)
        return throwError(returnMessage("payment", "userIdRequried"));

      const agency_exist = await this.checkAgencyExist(
        payload?.user_id,
        user?.reference_id
      );

      if (!agency_exist) return throwError(returnMessage("default", "default"));

      const plan = await SubscriptionPlan.findOne({ active: true }).lean();

      if (!plan)
        return throwError(
          returnMessage("payment", "planNotFound"),
          statusCode.notFound
        );

      const subscripion_detail = await this.subscripionDetail(
        user?.subscription_id
      );

      let prorate_value;

      if (
        !subscripion_detail?.current_start &&
        !subscripion_detail?.current_end
      ) {
        let start = moment().startOf("day");
        const current_month_days = moment().daysInMonth();
        const end = moment.unix(subscripion_detail?.charge_at).startOf("day");
        const days_diff = Math.abs(moment.duration(end.diff(start)).asDays());
        prorate_value = parseInt(
          ((plan?.amount / current_month_days) * days_diff).toFixed(2)
        );
      } else {
        prorate_value = parseInt(
          this.customPaymentCalculator(
            subscripion_detail?.current_start,
            subscripion_detail?.current_end,
            plan
          )
        );
      }

      // removing the by default package and using the axios call instead of the npm package
      // const order = await Promise.resolve(
      //   razorpay.orders.create({
      //     amount: prorate_value,
      //     currency: "INR",
      //     receipt: Date.now().toString(),
      //   })
      // );

      const { data } = await this.razorpayApi.post("/orders", {
        amount: prorate_value,
        currency: plan?.currency,
        receipt: Date.now().toString(),
      });

      const order = data;
      return {
        payment_id: order?.id,
        amount: prorate_value,
        currency: plan?.currency,
        user_id: payload?.user_id,
        agency_id: user?.reference_id,
        email: user?.email,
        contact_number: user?.contact_number,
      };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while doing the one time payment: ${error}`);
      return throwError(
        error?.message || error?.error?.description,
        error?.statusCode
      );
    }
  };

  verifySignature = async (payload) => {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
        payload;

      const expected_signature_1 = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(razorpay_payment_id + "|" + razorpay_order_id, "utf-8")
        .digest("hex");
      const expected_signature_2 = crypto
        .createHmac("sha256", process.env.RAZORPAY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id, "utf-8")
        .digest("hex");

      if (
        expected_signature_1 === razorpay_signature ||
        expected_signature_2 === razorpay_signature
      ) {
        const status_change = await this.statusChange(payload);
        // if (!status_change.success) return { success: false };

        // ---------------------- Notification ----------------------

        // await notificationService.addNotification({
        //   receiver_id: payload?.agency_id,
        //   team_member_name:
        //     memberData?.first_name + " " + memberData?.last_name,
        //   module_name: "general",
        //   action_name: "memberPaymentDone",
        // });

        // ---------------------- Notification ----------------------

        return {
          success: true,
          message: status_change?.message,
          updated_agency_detail: status_change?.updated_agency_detail,
        };
      }

      // ---------------------- Notification ----------------------

      // await notificationService.addNotification({
      //   receiver_id: payload?.agency_id,
      //   team_member_name: memberData?.first_name + " " + memberData?.last_name,
      //   module_name: "general",
      //   action_name: "memberPaymentFail",
      // });

      // ---------------------- Notification ----------------------

      // await this.deleteUsers(payload);
      return { success: false };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while verifying signature: ${error}`);
      return throwError(
        error?.message || error?.error?.description,
        error?.statusCode
      );
    }
  };

  // this function is used to check the agency is exist when doing the custompayment(single payment)
  checkAgencyExist = async (user_id, agency_id) => {
    try {
      const user_exist = await Authentication.findOne({
        reference_id: user_id,
      })
        .populate("role", "name")
        .lean();

      if (!user_exist)
        return throwError(
          returnMessage("auth", "userNotFound"),
          statusCode?.notFound
        );

      if (user_exist?.role?.name === "client") {
        const client_exist = await Client.findOne({
          agency_ids: {
            $elemMatch: {
              agency_id,
              status: "payment_pending",
            },
          },
        });

        if (!client_exist) return false;
        return true;
      } else if (user_exist?.role?.name === "team_agency") {
        const team_agency_exist = await Team_Agency.findOne({
          agency_id,
        }).lean();
        if (
          !team_agency_exist ||
          user_exist?.status === "confirmed" ||
          user_exist?.status !== "payment_pending"
        )
          return false;
        return true;
      } else if (user_exist?.role?.name === "team_client") {
        const team_client_exist = await Team_Client.findOne({
          agency_ids: {
            $elemMatch: {
              agency_id,
              status: "requested",
            },
          },
        });
        if (!team_client_exist) return false;
        return true;
      }
      return false;
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while checking agency exist: ${error}`);
      return false;
    }
  };

  // create the payemnt history and change the status based on that
  statusChange = async (payload) => {
    try {
      const {
        agency_id,
        user_id,
        amount,
        subscription_id,
        razorpay_order_id,
        currency,
        razorpay_payment_id,
      } = payload;
      if (payload?.agency_id && !payload?.user_id) {
        let updated_agency_detail = await Authentication.findOneAndUpdate(
          { reference_id: agency_id },
          {
            status: "confirmed",
            subscribe_date: moment().format("YYYY-MM-DD").toString(),
          },
          { new: true }
        );
        // commenting to create the payment history by the webhook
        // await PaymentHistory.create({
        //   agency_id,
        //   amount,
        //   subscription_id,
        //   currency,
        //   payment_id: razorpay_payment_id,
        // });

        await SheetManagement.findOneAndUpdate(
          { agency_id },
          {
            agency_id,
            total_sheets: 1,
            occupied_sheets: [],
          },
          { upsert: true }
        );
        updated_agency_detail = updated_agency_detail.toJSON();
        delete updated_agency_detail?.password;
        delete updated_agency_detail?.is_google_signup;
        delete updated_agency_detail?.is_facebook_signup;
        delete updated_agency_detail?.subscription_id;
        return {
          success: true,
          message: returnMessage("payment", "paymentCompleted"),
          updated_agency_detail,
        };
      } else if (payload?.agency_id && payload?.user_id) {
        const [agency_details, user_details, sheets] = await Promise.all([
          Authentication.findOne({
            reference_id: agency_id,
          }).lean(),
          Authentication.findOne({
            reference_id: payload?.user_id,
          })
            .populate("role", "name")
            .lean(),
          SheetManagement.findOne({ agency_id }).lean(),
        ]);
        // const agency_details = await Authentication.findOne({
        //   reference_id: agency_id,
        // }).lean();
        // const user_details = await Authentication.findOne({
        //   reference_id: payload?.user_id,
        // })
        //   .populate("role", "name")
        //   .lean();
        // const sheets = await SheetManagement.findOne({ agency_id }).lean();
        if (!sheets) return { success: false };

        if (user_details?.role?.name === "client") {
          let link = `${
            process.env.REACT_APP_URL
          }/client/verify?name=${encodeURIComponent(
            capitalizeFirstLetter(agency_details?.first_name) +
              " " +
              capitalizeFirstLetter(agency_details?.last_name)
          )}&email=${encodeURIComponent(
            user_details?.email
          )}&agency=${encodeURIComponent(agency_details?.reference_id)}`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_mail = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_mail,
          });
          await Client.updateOne(
            { _id: user_id, "agency_ids.agency_id": agency_id },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        } else if (user_details?.role?.name === "team_agency") {
          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&token=${user_details?.invitation_token}&redirect=false`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });
        } else if (user_details?.role?.name === "team_client") {
          const team_client_detail = await Team_Client.findById(
            user_details.reference_id
          ).lean();

          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&clientId=${team_client_detail.client_id}`;
          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;

          const invitation_template = invitationEmail(
            link,
            user_details?.first_name + " " + user_details?.last_name,
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });

          await Team_Client.updateOne(
            { _id: user_id, "agency_ids.agency_id": agency_id },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        }

        await PaymentHistory.create({
          agency_id,
          user_id: user_details?.reference_id,
          amount,
          order_id: razorpay_order_id,
          currency,
          role: user_details?.role?.name,
          payment_id: razorpay_payment_id,
        });

        const occupied_sheets = [
          ...sheets.occupied_sheets,
          {
            user_id,
            role: user_details?.role?.name,
          },
        ];

        const sheet_obj = {
          total_sheets: sheets?.total_sheets + 1,
          occupied_sheets,
        };
        await SheetManagement.findByIdAndUpdate(sheets._id, sheet_obj);
        // await Team_Client.updateOne(
        //   { _id: user_id, "agency_ids.agency_id": agency_id },
        //   { $set: { "agency_ids.$.status": "confirmed" } },
        //   { new: true }
        // );
        await this.updateSubscription(agency_id, sheet_obj.total_sheets);

        let message;
        if (user_details?.role?.name === "client") {
          message = returnMessage("agency", "clientCreated");
        } else if (user_details?.role?.name === "team_agency") {
          message = returnMessage("teamMember", "teamMemberCreated");
        } else if (user_details?.role?.name === "team_client") {
          message = returnMessage("teamMember", "teamMemberCreated");
        }

        return { success: true, message };
      }
      return { success: false };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while changing status after the payment: ${error}`);
      return false;
    }
  };

  // this functio will use if the signature fails to verify after the payment
  deleteUsers = async (payload) => {
    try {
      const { user_id } = payload;
      const user_details = await Authentication.findOne({
        reference_id: user_id,
      })
        .populate("role", "name")
        .lean();
      if (user_details?.role?.name === "team_agency") {
        await Authentication.findByIdAndDelete(user_details._id);
        await Team_Agency.findByIdAndDelete(user_details.reference_id);
      }
      return;
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while deleting the User: ${error}`);
      return false;
    }
  };

  // fetch subscription by id
  subscripionDetail = async (subscription_id) => {
    try {
      const { data } = await this.razorpayApi.get(
        `/subscriptions/${subscription_id}`
      );
      return data;
      // commented because of the taking more time in the staging server
      // return await razorpay.subscriptions.fetch(subscription_id);
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while gettign subscription detail: ${error}`);
      return false;
    }
  };

  // update subscription whenever new sheet is addded or done the payment
  updateSubscription = async (agency_id, quantity) => {
    try {
      const agency = await Authentication.findOne({
        reference_id: agency_id,
      }).lean();
      if (!agency) return;
      // commmenting to apply the razorpay axios api
      // await Promise.resolve(
      //   razorpay.subscriptions.update(agency?.subscription_id, {
      //     quantity,
      //   })
      // );

      await this.razorpayApi.patch(
        `/subscriptions/${agency?.subscription_id}`,
        {
          quantity,
        }
      );
      return;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while updating the subscription: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // fetch the payment history for the agency only
  paymentHistory = async (payload, user) => {
    try {
      if (user?.role?.name !== "agency" && user?.role?.name !== "team_agency")
        return throwError(
          returnMessage("auth", "unAuthorized"),
          statusCode.forbidden
        );

      const pagination = paginationObject(payload);
      if (user?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          user?.reference_id
        )
          .populate("role", "name")
          .lean();
        if (team_agency_detail?.role?.name === "admin")
          user = await Authentication.findOne({
            reference_id: team_agency_detail?.agency_id,
          })
            .populate("role", "name")
            .lean();
      }
      let search_obj = {};
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          {
            payment_mode: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(payload.search);

        if (keywordType === "date") {
          const dateKeyword = new Date(payload.search);
          search_obj["$or"].push({ createdAt: dateKeyword });
        }
        if (keywordType === "number") {
          const number = parseInt(payload.search);
          search_obj["$or"].push({ amount: number });
        }
      }

      const [payment_history, total_history] = await Promise.all([
        PaymentHistory.find({ agency_id: user?.reference_id, ...search_obj })
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page)
          .lean(),
        PaymentHistory.countDocuments({
          agency_id: user?.reference_id,
          ...search_obj,
        }),
      ]);

      return {
        payment_history,
        page_count: Math.ceil(total_history / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while getting the payment history: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // fetch the sheets lists and who is assined to the particular sheet
  sheetsListing = async (payload, user) => {
    try {
      if (user?.role?.name !== "agency" && user?.role?.name !== "team_agency")
        return throwError(
          returnMessage("auth", "unAuthorized"),
          statusCode.forbidden
        );

      const pagination = paginationObject(payload);
      if (user?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          user?.reference_id
        )
          .populate("role", "name")
          .lean();
        if (team_agency_detail?.role?.name === "admin")
          user = await Authentication.findOne({
            reference_id: team_agency_detail?.agency_id,
          })
            .populate("role", "name")
            .lean();
      }

      // aggragate reference from the https://mongoplayground.net/p/TqFafFxrncM

      const aggregate = [
        { $match: { agency_id: user?.reference_id } },

        {
          $unwind: {
            path: "$occupied_sheets",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "authentications",
            let: {
              itemId: {
                $toObjectId: "$occupied_sheets.user_id",
              },
              items: "$occupied_sheets",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$reference_id", "$$itemId"],
                  },
                },
              },
              {
                $project: {
                  name: { $concat: ["$first_name", " ", "$last_name"] },
                  first_name: 1,
                  last_name: 1,
                },
              },
              {
                $replaceRoot: {
                  newRoot: {
                    $mergeObjects: ["$$items", "$$ROOT"],
                  },
                },
              },
            ],
            as: "occupied_sheets",
          },
        },
        {
          $group: {
            _id: "$_id",
            total_sheets: {
              $first: "$total_sheets",
            },
            items: {
              $push: {
                $first: "$occupied_sheets",
              },
            },
          },
        },
      ];

      const sheets = await SheetManagement.aggregate(aggregate);
      const occupied_sheets = sheets[0];

      occupied_sheets?.items?.unshift({
        name:
          capitalizeFirstLetter(user?.first_name) +
          " " +
          capitalizeFirstLetter(user?.last_name),
        first_name: user?.first_name,
        last_name: user?.last_name,
        role: user?.role?.name,
      });

      for (let i = 0; i < occupied_sheets.total_sheets; i++) {
        if (occupied_sheets?.items[i] != undefined) {
          occupied_sheets.items[i] = {
            ...occupied_sheets?.items[i],
            seat_no: (i + 1).toString(),
            status: "Allocated",
          };
        } else {
          occupied_sheets.items[i] = {
            seat_no: (i + 1).toString(),
            status: "Available",
          };
        }
      }

      if (payload?.search && payload?.search !== "") {
        // Create a regex pattern based on the query
        const regex = new RegExp(
          payload?.search?.toLowerCase().split(/\s+/).join(".*")
        );
        occupied_sheets.items = occupied_sheets?.items?.filter((item) => {
          return (
            regex.test(item?.first_name?.toLowerCase()) ||
            regex.test(item?.last_name?.toLowerCase()) ||
            regex.test(item?.name?.toLowerCase()) ||
            regex.test(item?.role?.toLowerCase()) ||
            regex.test(item?.status?.toLowerCase()) ||
            regex.test(item?.seat_no)
          );
        });
      }

      if (payload?.sort_field && payload?.sort_field !== "") {
        // Sort the results based on the name
        occupied_sheets?.items.sort((a, b) => {
          let nameA, nameB;
          if (payload?.sort_field === "name") {
            nameA = a?.name?.toLowerCase();
            nameB = b?.name?.toLowerCase();
          } else if (payload?.sort_field === "role") {
            nameA = a?.role?.toLowerCase();
            nameB = b?.role?.toLowerCase();
          } else if (payload?.sort_field === "status") {
            nameA = a?.status?.toLowerCase();
            nameB = b?.status?.toLowerCase();
          } else if (payload?.sort_field === "seat_no") {
            nameA = a?.seat_no;
            nameB = b?.seat_no;
          }

          if (payload?.sort_order === "asc") {
            return nameA?.localeCompare(nameB);
          } else {
            return nameB?.localeCompare(nameA);
          }
        });
      }

      const page = pagination.page;
      const pageSize = pagination?.result_per_page;

      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      return {
        sheets: occupied_sheets?.items?.slice(startIndex, endIndex),
        total_sheets: occupied_sheets?.total_sheets,
        page_count:
          Math.ceil(
            occupied_sheets?.items?.length / pagination.result_per_page
          ) || 0,
      };
    } catch (error) {
      logger.error(`Error while fetching the sheets listing: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  removeUser = async (payload, user) => {
    try {
      const { user_id } = payload;
      const sheets = await SheetManagement.findOne({
        agency_id: user?.reference_id,
      }).lean();

      const activity_status = await Activity_Status.findOne({ name: "pending" })
        .select("_id")
        .lean();

      if (!sheets)
        return throwError(
          returnMessage("payment", "sheetsNotAvailable"),
          statusCode.notFound
        );

      const user_exist = sheets?.occupied_sheets?.filter(
        (sheet) => sheet?.user_id?.toString() === user_id
      );

      if (user_exist.length === 0)
        return throwError(
          returnMessage("auth", "userNotFound"),
          statusCode.notFound
        );

      const updated_users = sheets?.occupied_sheets?.filter(
        (sheet) => sheet?.user_id?.toString() !== user_id
      );

      const remove_user = user_exist[0];

      // this will used to check weather this user id has assined any task and it is in the pending state
      let activity_assigned;
      if (remove_user.role === "client") {
        activity_assigned = await Activity.findOne({
          agency_id: user?.reference_id,
          client_id: user_id,
          activity_status: activity_status?._id,
        }).lean();
      } else if (remove_user.role === "team_agency") {
        activity_assigned = await Activity.findOne({
          agency_id: user?.reference_id,
          assign_to: user_id,
          activity_status: activity_status?._id,
        }).lean();
      } else if (remove_user.role === "team_client") {
        activity_assigned = await Activity.findOne({
          agency_id: user?.reference_id,
          client_id: user_id,
          activity_status: activity_status?._id,
        }).lean();
      }

      if (activity_assigned && !payload?.force_fully_remove)
        return { force_fully_remove: true };

      if (
        (activity_assigned && payload?.force_fully_remove) ||
        !activity_assigned
      ) {
        if (remove_user.role === "client") {
          await Client.updateOne(
            {
              _id: remove_user?.user_id,
              "agency_ids.agency_id": user?.reference_id,
            },
            { $set: { "agency_ids.$.status": "deleted" } },
            { new: true }
          );
        } else if (remove_user.role === "team_agency") {
          await Authentication.findOneAndUpdate(
            { reference_id: remove_user?.user_id },
            { status: "team_agency_inactive", is_deleted: true },
            { new: true }
          );
        } else if (remove_user.role === "team_client") {
          await Team_Client.updateOne(
            {
              _id: remove_user?.user_id,
              "agency_ids.agency_id": user?.reference_id,
            },
            { $set: { "agency_ids.$.status": "deleted" } },
            { new: true }
          );
        }

        await SheetManagement.findByIdAndUpdate(sheets._id, {
          occupied_sheets: updated_users,
        });
      }
      return;
    } catch (error) {
      logger.error(`Error while removing the user from the sheet: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  cancelSubscription = async (user) => {
    try {
      const sheets = await SheetManagement.findOne({
        agency_id: user?.reference_id,
      }).lean();

      if (sheets.total_sheets === 1)
        return throwError(returnMessage("payment", "canNotCancelSubscription"));

      if (!(sheets.occupied_sheets.length >= 0))
        return throwError(returnMessage("payment", "canNotCancel"));

      const updated_sheet = await SheetManagement.findByIdAndUpdate(
        sheets?._id,
        { total_sheets: sheets?.total_sheets - 1 },
        { new: true }
      ).lean();

      // removed the razorpay package code
      // await Promise.resolve(
      //   razorpay.subscriptions.update(user?.subscription_id, {
      //     quantity: updated_sheet?.total_sheets,
      //   })
      // );

      await this.razorpayApi.patch(`/subscriptions/${user?.subscription_id}`, {
        quantity: updated_sheet?.total_sheets,
      });
      return;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while canceling the subscription: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getSubscription = async (agency) => {
    try {
      const subscription = await this.subscripionDetail(
        agency?.subscription_id
      );
      const [plan_details, sheets_detail, earned_total, agency_details] =
        await Promise.all([
          this.planDetails(subscription.plan_id),
          SheetManagement.findOne({ agency_id: agency?.reference_id }).lean(),
          this.calculateTotalReferralPoints(agency),
          Agency.findById(agency?.reference_id).lean(),
        ]);

      if (agency?.subscription_halted) {
        await Authentication.findByIdAndUpdate(agency?._id, {
          subscription_halted_displayed: true,
        });
      }

      return {
        next_billing_date: subscription?.current_end,
        next_billing_price:
          subscription?.quantity * (plan_details?.item.amount / 100),
        total_sheets: sheets_detail.total_sheets,
        available_sheets: Math.abs(
          sheets_detail.total_sheets - 1 - sheets_detail.occupied_sheets.length
        ),
        subscription,
        referral_points: {
          erned_points: earned_total,
          available_points: agency_details?.total_referral_point,
        },
      };
    } catch (error) {
      logger.error(`Error while getting the referral: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
  calculateTotalReferralPoints = async (agency) => {
    try {
      const referral_data = await Configuration.findOne().lean();
      const total_earned_point = await CompetitionPoint.find({
        agency_id: agency.reference_id,
      });
      const total_earned_points_sum = total_earned_point.reduce((acc, curr) => {
        return acc + parseInt(curr.point);
      }, 0);
      const total_referral = await ReferralHistory.find({
        referred_by: agency.reference_id,
      });
      const total_referral_points_sum =
        total_referral.length * referral_data.referral.redeem_required_point;

      const total_earned = total_referral_points_sum + total_earned_points_sum;
      return total_earned;
    } catch (error) {
      throw error;
    }
  };

  planDetails = async (plan_id) => {
    try {
      const { data } = await this.razorpayApi.get(`/plans/${plan_id}`);
      return data;
      // commenting the razorpay package code
      // return Promise.resolve(razorpay.plans.fetch(plan_id));
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(
        `Error while getting the plan details from the razorpay: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  planDetailsAxios = async (plan_id) => {
    try {
      const response = await axios.get(
        `https://api.razorpay.com/v1/plans/${plan_id}`,
        {
          auth: {
            username: "rzp_test_lGt50R6T1BIUBR",
            password: "TI8QOrNF6L6Qft2U9CZ5JyLq",
          },
        }
      );
      return response?.data;
    } catch (error) {
      logger.error(
        `Error while getting the plan details from the razorpay: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  paymentDetails = async (payment_id) => {
    try {
      return Promise.resolve(razorpay.payments.fetch(payment_id));
    } catch (error) {
      logger.error(
        `Error while getting the plan details from the razorpay: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  referralPay = async (payload, user) => {
    try {
      if (payload?.without_referral === true) {
        return await this.withoutReferralPay(payload, user);
      }
      const agency = await Agency.findById(user.reference_id);
      const referral_data = await Configuration.findOne().lean();
      if (
        !(
          agency?.total_referral_point >=
          referral_data?.referral?.redeem_required_point
        )
      )
        return throwError(
          returnMessage("referral", "insufficientReferralPoints")
        );

      payload.redeem_required_point =
        referral_data?.referral?.redeem_required_point;
      const status_change = await this.referralStatusChange(payload, user);
      if (!status_change.success) return { success: false };

      await Agency.findOneAndUpdate(
        { _id: agency?._id },
        {
          $inc: {
            total_referral_point:
              -referral_data?.referral?.redeem_required_point,
          },
        }
      );
      return { success: true, message: status_change?.message };
    } catch (error) {
      logger.error(`Error while verifying referral: ${error}`);
      return throwError(
        error?.message || error?.error?.description,
        error?.statusCode
      );
    }
  };

  referralStatusChange = async (payload, user) => {
    try {
      const { user_id, redeem_required_point } = payload;
      const agency_details = user;
      if (payload?.user_id) {
        const [user_details, sheets] = await Promise.all([
          Authentication.findOne({
            reference_id: payload?.user_id,
          })
            .populate("role", "name")
            .lean(),
          SheetManagement.findOne({ agency_id: user?.reference_id }).lean(),
        ]);

        if (!sheets) return { success: false };

        if (user_details?.role?.name === "client") {
          let link = `${
            process.env.REACT_APP_URL
          }/client/verify?name=${encodeURIComponent(
            capitalizeFirstLetter(agency_details?.first_name) +
              " " +
              capitalizeFirstLetter(agency_details?.last_name)
          )}&email=${encodeURIComponent(
            user_details?.email
          )}&agency=${encodeURIComponent(agency_details?.reference_id)}`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_mail = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_mail,
          });
          await Client.updateOne(
            {
              _id: user_id,
              "agency_ids.agency_id": agency_details?.reference_id,
            },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        } else if (user_details?.role?.name === "team_agency") {
          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&token=${user_details?.invitation_token}&redirect=false`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });
        } else if (user_details?.role?.name === "team_client") {
          const team_client_detail = await Team_Client.findById(
            user_details.reference_id
          ).lean();

          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&clientId=${team_client_detail.client_id}`;
          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;

          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });

          await Team_Client.updateOne(
            {
              _id: user_id,
              "agency_ids.agency_id": agency_details?.reference_id,
            },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        }

        await PaymentHistory.create({
          agency_id: agency_details?.reference_id,
          user_id: user_details?.reference_id,
          amount: redeem_required_point,
          role: user_details?.role?.name,
          payment_mode: "referral",
        });

        const occupied_sheets = [
          ...sheets.occupied_sheets,
          {
            user_id,
            role: user_details?.role?.name,
          },
        ];

        const sheet_obj = {
          total_sheets: sheets?.total_sheets + 1,
          occupied_sheets,
        };
        await SheetManagement.findByIdAndUpdate(sheets._id, sheet_obj);

        await this.updateSubscription(
          agency_details?.reference_id,
          sheet_obj.total_sheets
        );

        let message;
        if (user_details?.role?.name === "client") {
          message = returnMessage("agency", "clientCreated");
        } else if (user_details?.role?.name === "team_agency") {
          message = returnMessage("teamMember", "teamMemberCreated");
        } else if (user_details?.role?.name === "team_client") {
          message = returnMessage("teamMember", "teamMemberCreated");
        }

        return { success: true, message };
      }
      return { success: false };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while changing status after the payment: ${error}`);
      return false;
    }
  };

  // this function is used to get the referral and available sheets
  paymentScopes = async (agency) => {
    try {
      const [plan, subscription_detail, config, sheet] = await Promise.all([
        SubscriptionPlan.findOne({ active: true }).lean(),
        this.subscripionDetail(agency?.subscription_id),
        Configuration.findOne().lean(),
        SheetManagement.findOne({ agency_id: agency?.reference_id }),
      ]);

      let payable_amount;

      if (
        !subscription_detail?.current_start &&
        !subscription_detail?.current_end
      ) {
        let start = moment().startOf("day");
        const current_month_days = moment().daysInMonth();
        const end = moment.unix(subscription_detail?.charge_at).startOf("day");
        const days_diff = Math.abs(moment.duration(end.diff(start)).asDays());
        payable_amount = (
          ((plan?.amount / current_month_days) * days_diff) /
          100
        ).toFixed(2);
      } else {
        payable_amount = (
          this.customPaymentCalculator(
            subscription_detail?.current_start,
            subscription_detail?.current_end,
            plan
          ) / 100
        ).toFixed(2);
      }
      const agency_data = await Agency.findById(agency.reference_id).lean();
      const redirect_payment_page =
        agency_data?.total_referral_point >=
        config?.referral?.redeem_required_point
          ? true
          : false;

      return {
        payable_amount: plan?.symbol + " " + payable_amount,
        referral_point: agency_data?.total_referral_point,
        redeem_required_point: config?.referral?.redeem_required_point,
        redirect_payment_page,
        available_sheets:
          sheet?.total_sheets - sheet?.occupied_sheets?.length - 1,
      };
    } catch (error) {
      logger.error(`Error while fetching referral statistics: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for to add the team member or the client without redeeming the points and currency
  withoutReferralPay = async (payload, user) => {
    try {
      const { user_id } = payload;
      const agency_details = user;
      if (payload?.user_id) {
        const [user_details, sheets] = await Promise.all([
          Authentication.findOne({
            reference_id: payload?.user_id,
          })
            .populate("role", "name")
            .lean(),
          SheetManagement.findOne({ agency_id: user?.reference_id }).lean(),
        ]);

        if (
          !sheets ||
          !(sheets.total_sheets - sheets.occupied_sheets.length - 1 > 0)
        )
          return { success: false };

        if (user_details?.role?.name === "client") {
          let link = `${
            process.env.REACT_APP_URL
          }/client/verify?name=${encodeURIComponent(
            capitalizeFirstLetter(agency_details?.first_name) +
              " " +
              capitalizeFirstLetter(agency_details?.last_name)
          )}&email=${encodeURIComponent(
            user_details?.email
          )}&agency=${encodeURIComponent(agency_details?.reference_id)}`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_mail = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_mail,
          });
          await Client.updateOne(
            {
              _id: user_id,
              "agency_ids.agency_id": agency_details?.reference_id,
            },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        } else if (user_details?.role?.name === "team_agency") {
          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&token=${user_details?.invitation_token}&redirect=false`;

          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;
          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await Authentication.findByIdAndUpdate(
            user_details?._id,
            { status: "confirm_pending" },
            { new: true }
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });
        } else if (user_details?.role?.name === "team_client") {
          const team_client_detail = await Team_Client.findById(
            user_details.reference_id
          ).lean();

          const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
            user_details?.email
          )}&clientId=${team_client_detail.client_id}`;
          const invitation_text = `${capitalizeFirstLetter(
            agency_details?.first_name
          )} ${capitalizeFirstLetter(
            agency_details?.last_name
          )} has sent an invitation to you. please click on below button to join SyncUpp.`;

          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text
          );

          await sendEmail({
            email: user_details?.email,
            subject: returnMessage("emailTemplate", "invitation"),
            message: invitation_template,
          });

          await Team_Client.updateOne(
            {
              _id: user_id,
              "agency_ids.agency_id": agency_details?.reference_id,
            },
            { $set: { "agency_ids.$.status": "pending" } },
            { new: true }
          );
        }

        const occupied_sheets = [
          ...sheets.occupied_sheets,
          {
            user_id,
            role: user_details?.role?.name,
          },
        ];

        await SheetManagement.findByIdAndUpdate(sheets._id, {
          occupied_sheets,
        });

        let message;
        if (user_details?.role?.name === "client") {
          message = returnMessage("agency", "clientCreated");
        } else if (user_details?.role?.name === "team_agency") {
          message = returnMessage("teamMember", "teamMemberCreated");
        } else if (user_details?.role?.name === "team_client") {
          message = returnMessage("teamMember", "teamMemberCreated");
        }

        return { success: true, message };
      }
      return { success: false };
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while changing status after the payment: ${error}`);
      return { success: false };
    }
  };

  // this function is used to get the invoice details from the subscription id
  invoices = async (subscription_id) => {
    try {
      const { data } = await this.razorpayApi.get(
        `/invoices?subscription_id=${subscription_id}`
      );
      return data;
      // removed the npm package code
      // return await Promise.resolve(razorpay.invoices.all({ subscription_id }));
    } catch (error) {
      logger.error(
        `Error while getting the invoices from the Subscription id :${error} `
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to get the payment details from the Order id
  // and the order id is generate based on the agency doing single payment
  orderPaymentDetails = async (order_id) => {
    try {
      const { data } = await this.razorpayApi.get(
        `/orders/${order_id}/payments`
      );
      return data;
      // removed the npm package code
      // return await Promise.resolve(razorpay.orders.fetchPayments(order_id));
    } catch (error) {
      logger.error(
        `Error while getting the payment details from the order id :${error} `
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to get the subscription details from the subscription id
  getSubscriptionDetail = async (subscription_id) => {
    try {
      const { data } = await this.razorpayApi.get(
        `/subscriptions/${subscription_id}`
      );
      return data;
      // removed the npm package code
      // return await Promise.resolve(
      //   razorpay.subscriptions.fetch(subscription_id)
      // );
    } catch (error) {
      logger.error(
        `Error while getting the invoices from the Subscription id :${error} `
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  couponPay = async (payload, user) => {
    try {
      const coupon = await AdminCoupon.findById(payload?.couponId).lean();
      if (!coupon) return returnMessage("payment", "CouponNotExist");
      if (user.role.name === "agency") {
        const agency = await Agency.findById(user?.reference_id);
        const referral_data = await Configuration.findOne().lean();
        if (
          !(
            agency?.total_referral_point >= referral_data?.coupon?.reedem_coupon
          )
        )
          return throwError(
            returnMessage("referral", "insufficientReferralPoints")
          );

        await Agency.findOneAndUpdate(
          { _id: agency?._id },
          {
            $inc: {
              total_referral_point: -referral_data?.coupon?.reedem_coupon,
            },
            $push: {
              total_coupon: coupon?._id,
            },
          },
          { new: true }
        );

        return { success: true };
      }

      if (user.role.name === "team_agency") {
        const teamMember = await Team_Agency.findById(user?.reference_id);
        const referral_data = await Configuration.findOne().lean();
        if (
          !(
            teamMember?.total_referral_point >=
            referral_data?.coupon?.reedem_coupon
          )
        )
          return throwError(
            returnMessage("referral", "insufficientReferralPoints")
          );

        // payload?.redeem_required_point =
        //   referral_data?.referral?.redeem_required_point;
        // const status_change = await this.referralStatusChange(payload, user);
        // if (!status_change.success) return { success: false };

        const coupon = await AdminCoupon.findById(payload?.couponId).lean();
        await Team_Agency.findOneAndUpdate(
          { _id: teamMember?._id },
          {
            $inc: {
              total_referral_point: -referral_data?.coupon?.reedem_coupon,
            },
            $push: {
              total_coupon: coupon?._id,
            },
          },
          { new: true }
        );

        return { success: true };
      }
    } catch (error) {
      logger.error(`Error while verifying referral: ${error}`);
      return throwError(
        error?.message || error?.error?.description,
        error?.statusCode
      );
    }
  };

  deactivateAgency = async (agency) => {
    try {
      const { data } = await this.razorpayApi.post(
        `/subscriptions/${agency?.subscription_id}/cancel`,
        {
          cancel_at_cycle_end: 0,
        }
      );
      if (!data || data?.status !== "cancelled")
        return throwError(returnMessage("default", "default"));

      await this.deactivateAccount(agency);
    } catch (error) {
      logger.error(`Error while deactivating the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // deactivate account for the agency and delete all connected users
  deactivateAccount = async (agency) => {
    try {
      const team_agency = await Team_Agency.distinct("_id", {
        agency_id: agency?.reference_id,
      });
      await Promise.all([
        Team_Agency.updateMany(
          { agency_id: agency?.reference_id },
          { is_deleted: true }
        ),
        Authentication.updateMany(
          { reference_id: { $in: team_agency } },
          { is_deleted: true }
        ),
        Client.updateMany(
          { "agency_ids.agency_id": agency?.reference_id },
          { "agency_ids.status": "deleted" }
        ),
        Team_Client.updateMany(
          { "agency_ids.agency_id": agency?.reference_id },
          { "agency_ids.status": "deleted" }
        ),
        Authentication.updateMany(
          { reference_id: agency?.reference_id },
          { is_deleted: true, status: "subscription_cancelled" }
        ),
        Activity.updateMany(
          { agency_id: agency?.reference_id },
          { is_deleted: true }
        ),
        Agreement.updateMany({ agency_id: agency?._id }, { is_deleted: true }),
        Event.updateMany(
          { agency_id: agency?.reference_id },
          { is_deleted: true }
        ),
        Invoice.updateMany(
          { agency_id: agency?.reference_id },
          { is_deleted: true }
        ),
      ]);
      return;
    } catch (error) {
      logger.error(
        `Error while deleting all of the users from the agency: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // cron for the AGency to check subscription is expired or not and if it is expired with the given date then
  //  delete the user and do the cancel the subscription

  cronForSubscription = async () => {
    try {
      const [agencies, configuration] = await Promise.all([
        Authentication.find({
          subscription_id: { $exists: true },
          is_deleted: false,
        }).lean(),
        Configuration.findOne({}).lean(),
      ]);

      for (let i = 0; i < agencies.length; i++) {
        const subscription_detail = await this.subscripionDetail(
          agencies[i].subscription_id
        );
        if (
          (subscription_detail?.status === "pending" ||
            subscription_detail?.status === "halted") &&
          agencies[i].subscription_halted
        ) {
          const today = moment.utc();
          const subscription_halt_date = moment.utc(
            agencies[i].subscription_halted
          );

          const days_diff = Math.abs(
            today.diff(subscription_halt_date, "days")
          );

          if (days_diff > configuration?.payment?.subscription_halt_days) {
            await this.deactivateAgency(agencies[i]);
          }
        } else if (subscription_detail?.status === "active") {
          const renew_date = moment.unix(subscription_detail?.charge_at);
          const today = moment.utc();
          const days_diff = Math.abs(today.diff(renew_date, "days"));
          let notification_message = returnNotification(
            "payment",
            "nextSubscriptionStart"
          );

          if (days_diff == 3) {
            notification_message = notification_message.replaceAll(
              "{{no_days}}",
              3
            );
          } else if (days_diff === 1) {
            notification_message = notification_message.replaceAll(
              "{{no_days}}",
              1
            );
          }

          const notification = await Notification.create({
            type: "payment",
            user_id: agencies[i].reference_id,
            message: notification_message,
          });

          const pending_notification = await Notification.countDocuments({
            user_id: agencies[i].reference_id,
            is_read: false,
          });

          eventEmitter(
            "NOTIFICATION",
            {
              notification,
              un_read_count: pending_notification,
            },
            agencies[i].reference_id
          );
        }
      }
    } catch (error) {
      logger.error(
        `Error while running the cron of the subscription expire cron: ${error}`
      );
      console.log(error);
    }
  };
}

module.exports = PaymentService;
