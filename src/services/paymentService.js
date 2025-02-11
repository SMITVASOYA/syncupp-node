const Razorpay = require("razorpay");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const SubscriptionPlan = require("../models/subscriptionplanSchema");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const Team_Client = require("../models/teamClientSchema");
const PaymentHistory = require("../models/paymentHistorySchema");
const SheetManagement = require("../models/sheetManagementSchema");
const Activity_Status = require("../models/masters/activityStatusMasterSchema");
const {
  returnMessage,
  invitationEmail,
  paginationObject,
  capitalizeFirstLetter,
  getKeywordType,
  returnNotification,
  seatRemoved,
  paymentAboutToExpire,
  templateMaker,
  memberDetail,
} = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const crypto = require("crypto");
const moment = require("moment");
const sendEmail = require("../helpers/sendEmail");
const Configuration = require("../models/configurationSchema");
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_SECRET,
});
const axios = require("axios");
const AdminCoupon = require("../models/adminCouponSchema");
const Affiliate_Referral = require("../models/affiliateReferralSchema");
const Invoice = require("../models/invoiceSchema");
const Agreement = require("../models/agreementSchema");
const { eventEmitter } = require("../socket");
const NotificationService = require("./notificationService");
const Admin = require("../models/adminSchema");
const notificationService = new NotificationService();
const fs = require("fs");
const Affiliate = require("../models/affiliateSchema");
const Payout = require("../models/payoutSchema");
const Notification = require("../models/notificationSchema");
const Workspace = require("../models/workspaceSchema");
const Task = require("../models/taskSchema");
const Order_Management = require("../models/orderManagementSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const Gamification = require("../models/gamificationSchema");

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
      if (payload?.products?.length > 0) {
        await SubscriptionPlan.updateMany({}, { active: false });
      }

      // this will create the product from the Backend
      payload?.products?.forEach(async (product) => {
        const planData = {
          period: product?.period,
          interval: 1, // Charge every month
          item: {
            name: product?.name,
            description: product?.description,
            amount: product?.amount * 100, // Amount in paise (6000 INR)
            currency: product?.currency,
          },
        };
        const plan = await Promise.resolve(razorpay.plans.create(planData));

        if (plan) {
          await SubscriptionPlan.create({
            amount: product?.amount * 100,
            currency: product?.currency,
            description: product?.description,
            plan_id: plan?.id,
            period: product?.period,
            name: product?.name,
            active: true,
            symbol: product?.symbol,
            seat: product?.seat,
            sort_value: product?.sort_value,
            plan_type: product?.plan_type,
          });
        }
        return;
      });
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the plan: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  subscription = async (payload, user) => {
    try {
      if (
        user?.workspace_detail?.created_by?.toString() !== user?._id?.toString()
      )
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode.forbidden
        );

      const member_details = user?.workspace_detail?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      if (
        (user?.subscription_id && user?.subscribe_date) ||
        member_details?.status !== "payment_pending"
      )
        return throwError(returnMessage("payment", "alreadyPaid"));

      if (user?.workspace_detail?.trial_end_date)
        return throwError(returnMessage("payment", "freeTrialOn"));

      const [plan, sheets] = await Promise.all([
        SubscriptionPlan.findById(payload?.plan_id).lean(),
        SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean(),
      ]);

      if (!plan || !plan?.active)
        return throwError(
          returnMessage("payment", "planNotFound"),
          statusCode.notFound
        );

      const subscription_obj = {
        plan_id: plan?.plan_id,
        quantity: sheets?.total_sheets || 1,
        customer_notify: 1,
        total_count: 120,
      };

      if (plan?.plan_type === "unlimited") {
        subscription_obj.quantity = 1;
      }
      // commenting because to test the razorpay axios api call
      // const subscription = await razorpay.subscriptions.create(
      //   subscription_obj
      // );

      // creating the customer to the razorpay
      // this.razorpayApi.post("/customers", {
      //   name: user?.first_name + " " + user?.last_name,
      //   email: user?.email,
      //   fail_existing: 0,
      // });

      const { data } = await this.razorpayApi.post(
        "/subscriptions",
        subscription_obj
      );

      const subscription = data;

      await Authentication.findByIdAndUpdate(
        user?._id,
        { subscription_id: subscription?.id, purchased_plan: plan?._id },
        { new: true }
      );

      await Order_Management.create({
        subscription_id: subscription?.id,
        amount:
          plan?.plan_type === "unlimited"
            ? plan?.amount * 1
            : plan?.amount * (sheets?.total_sheets || 1),
        currency: plan?.currency,
        agency_id: user?._id,
        email: user?.email,
        contact_number: user?.contact_number,
        workspace_id: user?.workspace_detail?._id,
      });

      return {
        payment_id: subscription?.id,
        amount:
          plan?.plan_type === "unlimited"
            ? plan?.amount * 1
            : plan?.amount * (sheets?.total_sheets || 1),
        currency: plan?.currency,
        agency_id: user?._id,
        email: user?.email,
        contact_number: user?.contact_number,
        workspace: user?.workspace_detail?._id,
      };
    } catch (error) {
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
        if (body?.event === "subscription.charged") {
          const subscription_id = payload?.subscription?.entity?.id;
          const payment_id = payload?.payment?.entity?.id;
          const currency = payload?.payment?.entity?.currency;
          const amount = payload?.payment?.entity?.amount;
          const plan_id = payload?.subscription?.entity?.plan_id;
          const quantity = payload?.subscription?.entity?.quantity;

          const [agency_detail, plan, order_management] = await Promise.all([
            Authentication.findOne({ subscription_id }).lean(),
            SubscriptionPlan.findOne({ plan_id }).lean(),
            Order_Management.findOne({
              subscription_id,
              is_deleted: false,
            }).lean(),
          ]);
          if (!order_management) {
            await Promise.all([
              PaymentHistory.create({
                agency_id: agency_detail?._id,
                amount,
                subscription_id,
                currency,
                payment_id,
                plan_id,
                quantity,
              }),
              Authentication.findByIdAndUpdate(order_management?.agency_id, {
                purchased_plan: plan?._id,
                subscribe_date: moment().format("YYYY-MM-DD").toString(),
              }),
            ]);

            return;
          }

          if (plan?.plan_type === "unlimited") {
            await SheetManagement.findByIdAndUpdate(
              order_management?.agency_id,
              {
                total_sheets: plan?.seat,
              }
            );
          }

          await Promise.all([
            PaymentHistory.create({
              agency_id: order_management?.agency_id,
              amount,
              subscription_id,
              currency,
              payment_id,
              plan_id,
              quantity,
            }),
            Authentication.findByIdAndUpdate(order_management?.agency_id, {
              purchased_plan: plan?._id,
              subscribe_date: moment().format("YYYY-MM-DD").toString(),
            }),
            Workspace.findOneAndUpdate(
              {
                _id: order_management?.workspace_id,
                created_by: order_management?.agency_id,
                "members.user_id": order_management?.agency_id,
                is_deleted: false,
              },
              {
                $set: {
                  "members.$.status": "confirmed",
                  trial_end_date: undefined,
                },
              }
            ),
            Order_Management.findByIdAndUpdate(order_management?._id, {
              is_deleted: true,
            }),
          ]);
          const sheets = await SheetManagement.findOne({
            user_id: order_management?.agency_id,
            is_deleted: false,
          }).lean();
          if (!sheets)
            await SheetManagement.findOneAndUpdate(
              { user_id: order_management?.agency_id },
              {
                user_id: order_management?.agency_id,
                total_sheets: 1,
                occupied_sheets: [],
              },
              { upsert: true }
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
            });
            await Workspace.findOneAndUpdate(
              {
                created_by: agency_details?._id,
                "members.user_id": agency_details?._id,
              },
              {
                $set: {
                  "members.$.status": "confirmed",
                  trial_end_date: undefined,
                },
              }
            );
          }

          await Affiliate_Referral.findOneAndUpdate(
            {
              referred_to: agency_details?._id,
              status: "inactive",
            },
            {
              $set: {
                status: "active",
                payment_id: payload?.subscription?.entity?.plan_id,
              },
            },
            { new: true }
          );

          let affilate_detail = await Affiliate_Referral.findOne({
            referred_to: agency_details?._id,
            status: "active",
          }).lean();
          const [affiliateCheck, crmAffiliate] = await Promise.all([
            Affiliate.findById(affilate_detail?.referred_by).lean(),
            Authentication.findById(affilate_detail?.referred_by).lean(),
          ]);

          if (affiliateCheck) {
            await Affiliate.findByIdAndUpdate(
              affiliateCheck._id,
              {
                $inc: {
                  affiliate_point:
                    referral_data?.referral?.successful_referral_point,
                  total_affiliate_earned_point:
                    referral_data?.referral?.successful_referral_point,
                },
              },
              { new: true }
            );
          }
          if (crmAffiliate) {
            await Authentication.findByIdAndUpdate(
              crmAffiliate?._id,
              {
                $inc: {
                  affiliate_point:
                    referral_data?.referral?.successful_referral_point,
                  total_affiliate_earned_point:
                    referral_data?.referral?.successful_referral_point,
                },
              },
              { new: true }
            );
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
        } else if (body?.event === "order.paid") {
          const order_id = payload?.order?.entity?.id;
          const payment_id = payload?.payment?.entity?.id;
          const currency = payload?.payment?.entity?.currency;
          const amount = payload?.payment?.entity?.amount;
          const order_management = await Order_Management.findOne({
            order_id,
            is_deleted: false,
          }).lean();
          if (!order_management) return;
          const [
            agency_details,
            user_details,
            sheets,
            workspace_exist,
            configuration,
          ] = await Promise.all([
            Authentication.findById(order_management?.agency_id).lean(),
            Authentication.findById(order_management?.member_id).lean(),
            SheetManagement.findOne({
              user_id: order_management?.agency_id,
              is_deleted: false,
            }).lean(),
            Workspace.findById(order_management?.workspace_id).lean(),
            Configuration.findOne().lean(),
          ]);
          const member_detail = workspace_exist?.members?.find(
            (member) =>
              member?.user_id?.toString() === user_details?._id?.toString()
          );
          let invitation_token = crypto.randomBytes(16).toString("hex");
          const link = `${process.env.REACT_APP_URL}/verify?workspace=${
            workspace_exist?._id
          }&email=${encodeURIComponent(
            user_details?.email
          )}&token=${invitation_token}&workspace_name=${
            workspace_exist?.name
          }&first_name=${user_details?.first_name}&last_name=${
            user_details?.last_name
          }`;

          const email_template = templateMaker("teamInvitation.html", {
            REACT_APP_URL: process.env.REACT_APP_URL,
            SERVER_URL: process.env.SERVER_URL,
            username:
              capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text: `You are invited to the ${capitalizeFirstLetter(
              workspace_exist?.name
            )} workspace by ${
              capitalizeFirstLetter(agency_details?.first_name) +
              " " +
              capitalizeFirstLetter(agency_details?.last_name)
            }. Click on the below link to join the workspace.`,
            link: link,
            instagram: configuration?.urls?.instagram,
            facebook: configuration?.urls?.facebook,
            privacy_policy: configuration?.urls?.privacy_policy,
          });

          sendEmail({
            email: user_details?.email,
            subject: returnMessage("auth", "invitationEmailSubject"),
            message: email_template,
          });

          await Promise.all([
            PaymentHistory.create({
              agency_id: order_management?.agency_id,
              member_id: user_details?._id,
              amount,
              order_id,
              currency,
              role: member_detail?.role,
              payment_id,
            }),
            Workspace.findOneAndUpdate(
              {
                _id: workspace_exist?._id,
                "members.user_id": user_details?._id,
              },
              {
                $set: {
                  "members.$.status": "confirm_pending",
                  "mwmbers.$.invitation_token": invitation_token,
                },
              }
            ),
            this.updateSubscription(
              order_management?.agency_id,
              sheets?.total_sheets
            ),
            Order_Management.findByIdAndUpdate(order_management?._id, {
              is_deleted: true,
            }),
          ]);

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
      // removed the one time payment because only Agency allowed to do payment
      // let check_agency = await Team_Agency.findById(user?.reference_id)
      //   .populate("role", "name")
      //   .lean();
      // if (user?.role?.name !== "agency") {
      //   if (check_agency?.role?.name !== "admin") {
      //     return throwError(
      //       returnMessage("auth", "forbidden"),
      //       statusCode.forbidden
      //     );
      //   }
      // }
      // if (check_agency?.role?.name === "admin") {
      //   let agency_data = await Authentication.findOne({
      //     reference_id: check_agency?.agency_id,
      //   }).lean();
      //   user.status = agency_data?.status;
      //   user.subscribe_date = agency_data?.subscribe_date;
      //   user.subscription_id = agency_data?.subscription_id;
      // }

      if (user?.workspace_detail?.trial_end_date)
        return throwError(returnMessage("payment", "freeTrialOn"));

      const member_details = user?.workspace_detail?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      if (
        member_details?.status === "payment_pending" ||
        !user?.subscribe_date ||
        !user?.subscription_id
      )
        return throwError(returnMessage("payment", "agencyPaymentPending"));

      if (!payload?.user_id)
        return throwError(returnMessage("payment", "userIdRequried"));

      const agency_exist = this.checkAgencyExist(payload?.user_id, user);

      if (!agency_exist) return throwError(returnMessage("default", "default"));

      const plan = await SubscriptionPlan.findById(user?.purchased_plan).lean();

      if (!plan)
        return throwError(
          returnMessage("payment", "planNotFound"),
          statusCode.notFound
        );

      if (plan?.plan_type === "unlimited") {
        const sheets = await SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean();

        // this is used if the users has selected unlimited plan wants to add the user even after the occupied
        if (sheets.occupied_sheets + 1 + 1 > plan?.seat)
          return throwError(returnMessage("payment", "maxSheetsAllocated"));
      }

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

      await Order_Management.create({
        order_id: order?.id,
        amount: prorate_value,
        currency: plan?.currency,
        member_id: payload?.user_id,
        agency_id: user?._id,
        email: user?.email,
        contact_number: user?.contact_number,
        workspace_id: user?.workspace_detail?._id,
      });

      return {
        payment_id: order?.id,
        amount: prorate_value,
        currency: plan?.currency,
        user_id: payload?.user_id,
        agency_id: user?._id,
        email: user?.email,
        contact_number: user?.contact_number,
        workspace: user?.workspace_detail?._id,
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

  verifySignature = async (payload, user) => {
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
        const status_change = await this.statusChange(payload, user);
        // if (!status_change.success) return { success: false };

        // need to work on later
        /*         // ---------------------- Notification ----------------------
        let userData;
        if (payload?.user_id) {
          userData = await Authentication.findById(payload?.user_id).lean();
        }

        const agencyData = await Authentication.findById(
          payload?.agency_id
        ).lean();

        if (userData && payload.agency_id) {
          await notificationService.addNotification({
            receiver_id: payload?.agency_id,
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            module_name: "payment",
            action_name: userData.role.name,
            user_name: userData?.first_name + " " + userData?.last_name,
            amount: payload?.amount,
            currency: payload?.currency,
          });
          await notificationService.addAdminNotification({
            receiver_id: payload?.agency_id,
            agency_name: agencyData?.first_name + " " + agencyData?.last_name,
            module_name: "payment",
            action_name: userData.role.name,
            user_name: userData?.first_name + " " + userData?.last_name,
            amount: payload?.amount,
            currency: payload?.currency,
          });
        }

        if (payload.agency_id) {
          await notificationService.addAdminNotification({
            receiver_id: payload?.agency_id,
            action_name: "agency",
            module_name: "payment",
            amount: payload?.amount,
            currency: payload?.currency,
            user_name: agencyData?.first_name + " " + agencyData?.last_name,
          });
        }

        // ---------------------- Notification ----------------------
 */
        return {
          success: true,
          data: status_change?.data,
        };
      }

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
  checkAgencyExist = (user_id, agency) => {
    try {
      const user_exist = agency?.workspace_detail?.members?.find(
        (member) =>
          member?.user_id?.toString() === user_id?.toString() &&
          member?.status === "payment_pending"
      );

      if (!user_exist) return false;

      return true;
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while checking agency exist: ${error}`);
      return false;
    }
  };

  // create the payemnt history and change the status based on that
  statusChange = async (payload, user) => {
    try {
      const {
        agency_id,
        user_id,
        amount,
        subscription_id,
        razorpay_order_id,
        currency,
        razorpay_payment_id,
        workspace_id,
      } = payload;
      if (payload?.agency_id && !payload?.user_id) {
        const updated_agency_detail = await Authentication.findByIdAndUpdate(
          agency_id,
          {
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

        await Workspace.findOneAndUpdate(
          {
            _id: workspace_id,
            "members.user_id": agency_id,
          },
          {
            $set: {
              "members.$.status": "confirmed",
              trial_end_date: undefined,
            },
          }
        );
        const sheets = await SheetManagement.findOne({
          user_id: agency_id,
          is_deleted: false,
        }).lean();
        if (!sheets)
          await SheetManagement.findOneAndUpdate(
            { user_id: agency_id },
            {
              user_id: agency_id,
              total_sheets: 1,
              occupied_sheets: [],
            },
            { upsert: true }
          );
        // updated_agency_detail = updated_agency_detail.toJSON();
        delete updated_agency_detail?.password;
        delete updated_agency_detail?.is_google_signup;
        delete updated_agency_detail?.is_facebook_signup;
        delete updated_agency_detail?.subscription_id;

        await Order_Management.findOneAndUpdate(
          { subscription_id },
          { is_deleted: true }
        );
        return {
          success: true,
          message: returnMessage("payment", "paymentCompleted"),
          data: { user: updated_agency_detail },
        };
      } else if (payload?.agency_id && payload?.user_id) {
        const [
          agency_details,
          user_details,
          sheets,
          workspace_exist,
          configuration,
        ] = await Promise.all([
          Authentication.findById(agency_id).lean(),
          Authentication.findById(payload?.user_id).lean(),
          SheetManagement.findOne({
            user_id: agency_id,
            is_deleted: false,
          }).lean(),
          Workspace.findById(workspace_id).lean(),
          Configuration.findOne().lean(),
        ]);

        const member_detail = workspace_exist?.members?.find(
          (member) =>
            member?.user_id?.toString() === user_details?._id?.toString()
        );

        let invitation_token = crypto.randomBytes(16).toString("hex");
        const link = `${process.env.REACT_APP_URL}/verify?workspace=${
          workspace_exist?._id
        }&email=${encodeURIComponent(
          user_details?.email
        )}&token=${invitation_token}&workspace_name=${
          workspace_exist?.name
        }&first_name=${user_details?.first_name}&last_name=${
          user_details?.last_name
        }`;

        const email_template = templateMaker("teamInvitation.html", {
          REACT_APP_URL: process.env.REACT_APP_URL,
          SERVER_URL: process.env.SERVER_URL,
          username:
            capitalizeFirstLetter(user_details?.first_name) +
            " " +
            capitalizeFirstLetter(user_details?.last_name),
          invitation_text: `You are invited to the ${capitalizeFirstLetter(
            workspace_exist?.name
          )} workspace by ${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }. Click on the below link to join the workspace.`,
          link: link,
          instagram: configuration?.urls?.instagram,
          facebook: configuration?.urls?.facebook,
          privacy_policy: configuration?.urls?.privacy_policy,
        });

        sendEmail({
          email: user_details?.email,
          subject: returnMessage("auth", "invitationEmailSubject"),
          message: email_template,
        });

        await PaymentHistory.create({
          agency_id,
          member_id: user_details?._id,
          amount,
          order_id: razorpay_order_id,
          currency,
          role: member_detail?.role,
          payment_id: razorpay_payment_id,
        });
        await Workspace.findOneAndUpdate(
          {
            _id: workspace_exist?._id,
            "members.user_id": payload?.user_id,
          },
          {
            $set: {
              "members.$.status": "confirm_pending",
              "mwmbers.$.invitation_token": invitation_token,
            },
          }
        );
        await Order_Management.findOneAndUpdate(
          { order_id: razorpay_order_id },
          { is_deleted: true }
        );
        await this.updateSubscription(agency_id, sheets?.total_sheets);

        return { success: true };
      }
      return { success: false };
    } catch (error) {
      console.log(JSON.stringify(error));

      logger.error(`Error while changing status after the payment: ${error}`);
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
      const agency = await Authentication.findById(agency_id).lean();
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
      const pagination = paginationObject(payload);

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
        PaymentHistory.find({ agency_id: user?._id, ...search_obj })
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page)
          .lean(),
        PaymentHistory.countDocuments({
          agency_id: user?._id,
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
      const pagination = paginationObject(payload);

      // aggragate reference from the https://mongoplayground.net/p/TqFafFxrncM

      const aggregate = [
        { $match: { user_id: user?._id, is_deleted: false } },
        {
          $unwind: {
            path: "$occupied_sheets",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "authentications", // The collection name of the users
            localField: "occupied_sheets.user_id",
            foreignField: "_id",
            as: "user",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                  _id: 1,
                },
              },
            ],
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }, // Unwind the user details array
        {
          $lookup: {
            from: "role_masters", // The collection name of the sub_roles
            localField: "occupied_sheets.role",
            foreignField: "_id",
            as: "role",
          },
        },
        {
          $unwind: {
            path: "$role",
            preserveNullAndEmptyArrays: true,
          },
        }, // Unwind the sub_role details array
        {
          $project: {
            _id: 0,
            user: "$user",
            _id: "$user._id",
            first_name: "$user.first_name",
            last_name: "$user.last_name",
            role: "$role.name",
            total_sheets: 1,
          },
        },
        {
          $group: {
            _id: null,
            items: {
              $push: {
                user: "$user",
                first_name: "$first_name",
                last_name: "$last_name",
                name: "$name",
                role: "$role",
                user_id: "$_id",
              },
            },
            total_sheets: { $first: "$total_sheets" },
          },
        },
        {
          $project: {
            _id: 0,
            items: 1,
            total_sheets: 1,
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
        role: "agency",
      });

      occupied_sheets.items = occupied_sheets?.items?.filter(
        (item) => Object.keys(item)?.length !== 0
      );

      for (let i = 0; i < occupied_sheets.total_sheets; i++) {
        if (occupied_sheets?.items[i]) {
          occupied_sheets.items[i] = {
            ...occupied_sheets.items[i],
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
        occupied_sheets?.items?.sort((a, b) => {
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
      if (
        user?.workspace_detail?.created_by?.toString() !== user?._id?.toString()
      )
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode.forbidden
        );

      const [sheets] = await Promise.all([
        SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean(),
      ]);

      if (!sheets)
        return throwError(
          returnMessage("payment", "sheetsNotAvailable"),
          statusCode.notFound
        );

      const user_exist = sheets?.occupied_sheets?.filter(
        (sheet) => sheet?.user_id?.toString() === user_id?.toString()
      );

      if (user_exist.length === 0)
        return throwError(
          returnMessage("auth", "userNotFound"),
          statusCode.notFound
        );

      const updated_users = sheets?.occupied_sheets?.filter(
        (sheet) => sheet?.user_id?.toString() !== user_id?.toString()
      );

      const remove_user = user_exist[0];

      // notification module is pending to work
      /* // ---------------- Notification ----------------
      const removeUserData = await Authentication.findOne({
        reference_id: remove_user.user_id,
      }).lean();
      let roleName;
      if (remove_user.role === "client") roleName = "client";
      if (remove_user.role === "team_agency") roleName = "Team Agency";
      if (remove_user.role === "team_client") roleName = "Team Client";
      await notificationService.addAdminNotification({
        action_name: "seatRemoved",
        user_type: roleName,
        removed_user:
          removeUserData.first_name + " " + removeUserData.last_name,
        agency_name: user.first_name + " " + user.last_name,
        user_type: roleName,
        ...removeUserData,
      });

      const admin = await Admin.findOne({});

      const seatTemplate = seatRemoved({
        ...removeUserData,
        removed_user:
          removeUserData.first_name + " " + removeUserData.last_name,
        agency_name: user.first_name + " " + user.last_name,
        user_type: roleName,
      });
      sendEmail({
        email: admin?.email,
        subject: returnMessage("emailTemplate", "seatRemoved"),
        message: seatTemplate,
      });
      // ---------------- Notification ---------------- */

      // this will used to check weather this user id has assined any task and it is in the pending state
      let task_assigned = await Task.aggregate([
        {
          $match: {
            workspace_id: user?.workspace,
            assign_to: { $in: [user_id] },
            is_deleted: false,
          },
        },
        {
          $lookup: {
            from: "sections",
            localField: "activity_status",
            foreignField: "_id",
            as: "activity_status",
          },
        },
        {
          $unwind: {
            path: "$activity_status",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: { "activity_status.key": { $ne: "completed" } } },
      ]);

      if (task_assigned.length > 0 && !payload?.force_fully_remove)
        return { force_fully_remove: true };

      if (
        (task_assigned.length > 0 && payload?.force_fully_remove) ||
        !task_assigned.length > 0
      ) {
        const update_obj = { occupied_sheets: updated_users };
        if (user?.workspace_detail?.trial_end_date) {
          update_obj.total_sheets = sheets?.total_sheets - 1;
        }
        await SheetManagement.findByIdAndUpdate(sheets._id, update_obj);
        await Workspace.findOneAndUpdate(
          { _id: user?.workspace, "members.user_id": user_id },
          {
            $set: {
              "members.$.status": "deleted",
              "members.$.invitation_token": null,
            },
          }
        );
      }
      return;
    } catch (error) {
      logger.error(`Error while removing the user from the sheet: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  cancelSubscription = async (user) => {
    try {
      const [sheets, plan] = await Promise.all([
        SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean(),
        SubscriptionPlan.findById(user?.purchased_plan).lean(),
      ]);

      if (sheets.total_sheets === 1 || plan?.plan_type === "unlimited")
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

      if (!user?.workspace_detail?.trial_end_date && user?.subscription_id) {
        await this.razorpayApi.patch(
          `/subscriptions/${user?.subscription_id}`,
          {
            quantity: updated_sheet?.total_sheets,
          }
        );
      }

      return;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while canceling the subscription: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getSubscription = async (agency) => {
    try {
      let subscription, plan_details;
      const agency_detail = memberDetail(agency);

      if (agency?.subscribe_date && agency?.subscription_id) {
        subscription = await this.subscripionDetail(agency?.subscription_id);
        plan_details = await this.planDetails(subscription.plan_id);
      }

      const [sheets_detail, earned_total] = await Promise.all([
        SheetManagement.findOne({
          user_id: agency?._id,
          is_deleted: false,
        }).lean(),
        this.calculateTotalReferralPoints(agency),
      ]);

      if (agency?.subscription_halted) {
        await Authentication.findByIdAndUpdate(agency?._id, {
          subscription_halted_displayed: true,
        });
      }

      return {
        next_billing_date:
          subscription?.current_end || agency?.workspace_detail?.trial_end_date,
        next_billing_price:
          subscription?.quantity * (plan_details?.item?.amount / 100) ||
          plan_details?.amount / 100,
        total_sheets: sheets_detail?.total_sheets,
        available_sheets: Math.abs(
          sheets_detail?.total_sheets -
            1 -
            sheets_detail?.occupied_sheets?.length
        ),
        subscription,
        referral_points: {
          erned_points: earned_total,
          available_points: agency_detail?.gamification_points || 0,
        },
      };
    } catch (error) {
      logger.error(`Error while getting the referral: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
  /* Need to work on the referral points later */
  calculateTotalReferralPoints = async (agency) => {
    try {
      const total_earned_point = await Gamification.find({
        user_id: agency?._id,
        workspace_id: agency?.workspace,
      }).lean();
      return total_earned_point.reduce((acc, curr) => {
        return acc + parseInt(curr.point);
      }, 0);
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
      // removed as this has no meaning at all
      /*  if (payload?.without_referral === true) {
        return await this.withoutReferralPay(payload, user);
      } */

      const member_detail = memberDetail(user);

      const configuration = await Configuration.findOne().lean();
      if (
        !(
          member_detail?.gamification_points >=
          configuration?.referral?.redeem_required_point
        )
      )
        return throwError(
          returnMessage("referral", "insufficientReferralPoints")
        );

      payload.redeem_required_point =
        configuration?.referral?.redeem_required_point;
      const status_change = await this.referralStatusChange(payload, user);
      if (!status_change.success) return { success: false };

      await Workspace.findOneAndUpdate(
        { _id: user?.workspace, "members.user_id": payload?.user_id },
        {
          $inc: {
            "members.$.gamification_points":
              -configuration?.referral?.redeem_required_point,
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

      const new_member_detail = user?.workspace_detail?.members?.find(
        (member) =>
          member?.user_id?.toString() === user_id?.toString() &&
          member?.status === "payment_pending"
      );
      if (!new_member_detail) return { success: false };
      if (payload?.user_id) {
        const [user_details, sheets, configuration, role] = await Promise.all([
          Authentication.findById(user_id).lean(),
          SheetManagement.findOne({
            user_id: user?._id,
            is_deleted: false,
          }).lean(),
          Configuration.findOne().lean(),
          Role_Master.findById(new_member_detail?.role).lean(),
        ]);

        if (!sheets) return { success: false };

        let invitation_token = crypto.randomBytes(16).toString("hex");
        const link = `${process.env.REACT_APP_URL}/verify?workspace=${
          workspace_exist?._id
        }&email=${encodeURIComponent(
          user_details?.email
        )}&token=${invitation_token}&workspace_name=${
          workspace_exist?.name
        }&first_name=${user_details?.first_name}&last_name=${
          user_details?.last_name
        }`;

        const email_template = templateMaker("teamInvitation.html", {
          REACT_APP_URL: process.env.REACT_APP_URL,
          SERVER_URL: process.env.SERVER_URL,
          username:
            capitalizeFirstLetter(user_details?.first_name) +
            " " +
            capitalizeFirstLetter(user_details?.last_name),
          invitation_text: `You are invited to the ${capitalizeFirstLetter(
            workspace_exist?.name
          )} workspace by ${
            capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
          }. Click on the below link to join the workspace.`,
          link: link,
          instagram: configuration?.urls?.instagram,
          facebook: configuration?.urls?.facebook,
          privacy_policy: configuration?.urls?.privacy_policy,
        });

        sendEmail({
          email: user_details?.email,
          subject: returnMessage("auth", "invitationEmailSubject"),
          message: email_template,
        });

        await PaymentHistory.create({
          agency_id: agency_details?._id,
          member_id: user_details?._id,
          amount: redeem_required_point,
          role: role?.name,
          payment_mode: "referral",
          workspace_id: user?.workspace,
        });

        await this.updateSubscription(
          agency_details?._id,
          sheets?.total_sheets
        );

        let message;
        if (role?.name === "client") {
          message = returnMessage("agency", "clientCreated");
        } else if (role?.name === "team_agency") {
          message = returnMessage("teamMember", "teamMemberCreated");
        } else if (role?.name === "team_client") {
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
      const member_detail = agency?.workspace_detail?.members?.find(
        (member) =>
          member?.user_id?.toString() === agency?._id?.toString() &&
          member?.status === "confirmed"
      );

      const [plan, subscription_detail, config, sheet, role] =
        await Promise.all([
          SubscriptionPlan.findById(agency?.purchased_plan).lean(),
          this.subscripionDetail(agency?.subscription_id),
          Configuration.findOne().lean(),
          SheetManagement.findOne({
            user_id: agency?._id,
            is_deleted: false,
          }).lean(),
          Role_Master.findById(member_detail?.role).lean(),
        ]);

      if (role?.name !== "agency")
        return throwError(
          returnMessage("auth", "insufficientPermission"),
          statusCode.forbidden
        );

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
      const redirect_payment_page =
        member_detail?.gamification_points >=
        config?.referral?.redeem_required_point
          ? true
          : false;

      return {
        payable_amount: plan?.symbol + " " + payable_amount,
        referral_point: member_detail?.gamification_points,
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
          SheetManagement.findOne({
            user_id: user?._id,
            is_deleted: false,
          }).lean(),
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
          )} has sent an invitation to you. please click on below button to join Syncupp.`;
          const company_urls = await Configuration.find().lean();
          let privacy_policy = company_urls[0]?.urls?.privacy_policy;

          let facebook = company_urls[0]?.urls?.facebook;

          let instagram = company_urls[0]?.urls?.instagram;
          const invitation_mail = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text,
            privacy_policy,
            facebook,
            instagram
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
          )} has sent an invitation to you. please click on below button to join Syncupp.`;
          const company_urls = await Configuration.find().lean();
          let privacy_policy = company_urls[0]?.urls?.privacy_policy;

          let facebook = company_urls[0]?.urls?.facebook;

          let instagram = company_urls[0]?.urls?.instagram;
          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text,
            privacy_policy,
            facebook,
            instagram
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
          )} has sent an invitation to you. please click on below button to join Syncupp.`;
          const company_urls = await Configuration.find().lean();
          let privacy_policy = company_urls[0]?.urls?.privacy_policy;

          let facebook = company_urls[0]?.urls?.facebook;

          let instagram = company_urls[0]?.urls?.instagram;
          const invitation_template = invitationEmail(
            link,
            capitalizeFirstLetter(user_details?.first_name) +
              " " +
              capitalizeFirstLetter(user_details?.last_name),
            invitation_text,
            privacy_policy,
            facebook,
            instagram
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

      const member_detail = user?.workspace_detail?.members?.find(
        (member) =>
          member?.user_id?.toString() === user?._id?.toString() &&
          member?.status === "confirmed"
      );

      const configuration = await Configuration.findOne().lean();

      if (
        !(
          member_detail?.gamification_points >=
          configuration?.coupon?.reedem_coupon
        )
      )
        return throwError(
          returnMessage("referral", "insufficientReferralPoints")
        );

      const updated_gamification_points = await Workspace.findOneAndUpdate(
        { _id: user?.workspace, "members.user_id": user?._id },
        {
          $inc: {
            "members.$.gamification_points":
              -configuration?.coupon?.reedem_coupon,
          },
          $push: {
            "members.$.total_coupon": coupon?._id,
          },
        },
        { new: true }
      );

      if (updated_gamification_points) {
        await Gamification.create({
          user_id: user?._id,
          agency_id: user?.workspace_detail?.created_by,
          point: "-" + configuration?.coupon?.reedem_coupon.toString(),
          type: "coupon_purchase",
          role: member_detail?.role,
          workspace_id: user?.workspace,
        });
      }

      return { success: true };
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
      if (
        agency?.subscription_id &&
        !agency?.workspace_detail?.trial_end_date
      ) {
        const { data } = await this.razorpayApi.post(
          `/subscriptions/${agency?.subscription_id}/cancel`,
          {
            cancel_at_cycle_end: 0,
          }
        );
        if (!data || data?.status !== "cancelled")
          return throwError(returnMessage("default", "default"));
      }
      await this.deactivateAccount(agency);
      return;
    } catch (error) {
      logger.error(`Error while deactivating the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // deactivate account for the agency and delete all connected users
  deactivateAccount = async (agency) => {
    try {
      await Promise.all([
        Agreement.updateMany(
          { agency_id: agency?._id, workspace_id: agency?.workspace },
          { $set: { is_deleted: true } }
        ),
        Invoice.updateMany(
          { agency_id: agency?._id, workspace_id: agency?.workspace },
          { $set: { is_deleted: true } }
        ),
        Workspace.updateMany(
          { created_by: agency?._id, _id: agency?.workspace },
          { $set: { is_deleted: true } }
        ),
        SheetManagement.updateMany(
          { user_id: agency?._id },
          { $set: { is_deleted: true } }
        ),
        Task.updateMany(
          { workspace_id: agency?.workspace },
          { $set: { is_deleted: true } }
        ),
        this.glideCampaignContactDelete(agency?.glide_campaign_id),
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
      const test_subscription = [
        "sub_Nney65aXuztTyh",
        "sub_No3VnlWavkrKWl",
        "sub_No837ufiB4Nx6f",
        "sub_No7bZmb3v1bzYH",
        "sub_No7doVXUkh4gsX",
        "sub_No7qax1tjaAbHv",
      ];
      const [agencies, configuration] = await Promise.all([
        Authentication.find({
          subscription_id: { $exists: true },
          is_deleted: false,
        }).lean(),
        Configuration.findOne({}).lean(),
      ]);

      let privacy_policy = configuration?.urls?.privacy_policy;
      let facebook = configuration?.urls?.facebook;
      let instagram = configuration?.urls?.instagram;

      for (let i = 0; i < agencies.length; i++) {
        if (test_subscription?.includes(agencies[i].subscription_id)) {
        }
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

          let dayDifference = false;
          if (days_diff == 3) {
            notification_message = notification_message.replaceAll(
              "{{no_days}}",
              3
            );

            dayDifference = 3;
          } else if (days_diff === 1) {
            notification_message = notification_message.replaceAll(
              "{{no_days}}",
              1
            );
            dayDifference = 1;
          }

          if (dayDifference) {
            const paymentAboutToExpireTemp = paymentAboutToExpire(
              agencies[i].first_name + " " + agencies[i].last_name,
              dayDifference,
              privacy_policy,
              instagram,
              facebook
            );

            sendEmail({
              email: agencies[i]?.email,
              subject: returnMessage("emailTemplate", "planIsAboutExpired"),
              message: paymentAboutToExpireTemp,
            });
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
        } else if (subscription_detail?.status === "authenticated") {
          const renew_date = moment.unix(subscription_detail?.charge_at);
          const today = moment.utc();
          const days_diff = Math.abs(today.diff(renew_date, "days"));

          if (days_diff < 1) {
            let notification_message = returnNotification(
              "payment",
              "trialPeriodEnd"
            );
            notification_message = notification_message.replaceAll(
              "{{no_days}}",
              1
            );

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

            let template = fs.readFileSync(
              `src/utils/freeTrialEnd.html`,
              "utf-8"
            );

            template = template.replaceAll(
              "{{server_url}}",
              process.env.SERVER_URL
            );
            template = template.replaceAll(
              "{{user_name}}",
              agencies[i].first_name + " " + agencies[i].last_name
            );

            await sendEmail({
              email: agencies[i]?.email,
              subject: returnMessage("emailTemplate", "freeTrialEndMail"),
              message: template,
            });
          }
        }
      }
    } catch (error) {
      logger.error(
        `Error while running the cron of the subscription expire cron: ${error}`
      );
      console.log(error);
    }
  };

  cronForFreeTrialEnd = async () => {
    try {
      const workspaces = await Workspace.find({
        trial_end_date: { $exist: true },
        is_deleted: false,
      }).lean();
      const today = moment.utc().startOf("day");

      workspaces.forEach(async (workspace) => {
        const trial_end_date = moment
          .utc(workspace?.trial_end_date)
          .startOf("day");

        if (trial_end_date.isAfter(today)) {
          await Workspace.findOneAndUpdate(
            {
              _id: workspace?._id,
              "members.user_id": workspace?.created_by,
              is_deleted: false,
            },
            {
              $set: {
                "members.$.status": "payment_pending",
                trial_end_date: null,
              },
            }
          );
        }
      });
    } catch (error) {
      logger.error(
        `Error while running cron for the free tial expire: ${error}`
      );
    }
  };

  listPlan = async () => {
    try {
      return await SubscriptionPlan.find({ active: true })
        .sort({ sort_value: 1 })
        .lean();
    } catch (error) {
      logger.error(`Error while running the list plan: ${error}`);
    }
  };

  getPlan = async (payload) => {
    try {
      const { planId } = payload;
      const response = await SubscriptionPlan.findOne({ _id: planId });
      return response;
    } catch (error) {
      logger.error(`Error while running the get plan: ${error}`);
      console.log(error);
    }
  };

  updateSubscriptionPlan = async (payload, agency) => {
    try {
      const [plan_detail, sheets] = await Promise.all([
        SubscriptionPlan.findById(payload?.plan_id).lean(),
        SheetManagement.findOne({
          user_id: agency?._id,
          is_deleted: false,
        }).lean(),
      ]);

      if (!plan_detail || !plan_detail.active)
        return throwError(returnMessage("payment", "planNotFound"), 404);

      if (agency?.purchased_plan?.toString() === plan_detail?._id?.toString())
        return throwError(returnMessage("payment", "alreadySubscribed"));

      const update_subscription_obj = {
        plan_id: plan_detail?.plan_id,
        quantity: sheets?.occupied_sheets?.length + 1,
        schedule_change_at: "now",
        customer_notify: 1,
      };

      if (plan_detail?.plan_type === "unlimited") {
        update_subscription_obj.quantity = 1;
      }

      const { data } = await this.razorpayApi.patch(
        `/subscriptions/${agency?.subscription_id}`,
        update_subscription_obj
      );

      if (!data) return throwError(returnMessage("default", "default"));

      const sheet_obj = {};
      if (plan_detail?.plan_type === "unlimited") {
        sheet_obj.total_sheets = plan_detail?.seat;
      } else if (plan_detail?.plan_type === "limited") {
        sheet_obj.total_sheets = sheets.occupied_sheets.length + 1;
      }
      await Promise.all([
        SheetManagement.findByIdAndUpdate(sheets._id, sheet_obj),
        Authentication.findByIdAndUpdate(agency?._id, {
          purchased_plan: plan_detail?._id,
        }),
      ]);
      return;
    } catch (error) {
      logger.error(`Error while updating the subscription plan: ${error}`);
    }
  };

  //create contact for payout
  createContact = async (user) => {
    try {
      let { data } = await this.razorpayApi.post("/contacts", {
        name: user?.first_name + " " + user?.last_name,
        email: user?.email,
        contact: user?.contact_number,
        type: "Affiliate",
        reference_id: user?._id?.toString(),
      });

      await Promise.all([
        Authentication.findByIdAndUpdate(
          user?._id,
          { contact_id: data?.id },
          { new: true }
        ),
        Affiliate.findByIdAndUpdate(
          user?._id,
          { contact_id: data?.id },
          { new: true }
        ),
      ]);

      return data;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the contact: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  creatFundAccount = async (payload, user) => {
    try {
      let fund_detail = {
        contact_id: user.contact_id,
        account_type: payload.account_type,
        bank_account: {
          name: payload.name,
          ifsc: payload.ifsc,
          account_number: payload.account_number,
        },
      };

      let { data } = await this.razorpayApi.post("/fund_accounts", fund_detail);

      await Authentication.findByIdAndUpdate(
        user?._id,
        { fund_id: data?.id },
        { new: true }
      );

      await Affiliate.findByIdAndUpdate(
        user?._id,
        { fund_id: data?.id },
        { new: true }
      );

      return data;
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the fund account: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  requestforPayout = async (user, payload) => {
    try {
      const refer_data = await Configuration.findOne({}).lean();
      if (user?.affiliate_point >= refer_data?.affiliate?.payout_points) {
        if (user?.affiliate_point < payload?.payout_amount) {
          return throwError(
            returnMessage("payment", "withdrawAmountNotMoreThanAffiliate")
          );
        }
        if (!user?.fund_id) {
          return throwError(returnMessage("payment", "bankDetailNotFound"));
        }
        let payoutRequest = await Payout.create({
          contact_id: user.contact_id,
          reference_id: user._id,
          email: user.email,
          contact: user?.contact_number,
          name: user.first_name + " " + user.last_name,
          fund_id: user?.fund_id,
          payout_amount: payload?.payout_amount,
          payout_requested: true,
        });

        await Affiliate.findOneAndUpdate(
          { _id: user?._id },
          {
            $inc: {
              affiliate_point: -payload?.payout_amount,
            },
          },
          { new: true }
        );
        return payoutRequest;
      } else {
        return throwError(
          returnMessage("payment", "insufficientReferralPoints")
        );
      }
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the fund account: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  pendingpayout = async (payload) => {
    try {
      let filter = {
        $match: {},
      };
      let filterObj = {};
      if (payload?.payout_requested) {
        if (payload?.payout_requested === "unpaid") {
          filter["$match"] = {
            ...filter["$match"],
            payout_requested: true,
          };
        } else if (payload?.payout_requested === "paid") {
          filter["$match"] = {
            ...filter["$match"],
            payout_requested: false,
          };
        } else if (payload?.payout_requested === "All") {
        }
      }

      if (payload?.search && payload?.search !== "") {
        filterObj["$or"] = [
          {
            email: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agency_data.agency_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agency_data.first_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agency_data.last_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "affiliates_data.affiliate_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "affiliates_data.first_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "affiliates_data.last_name": {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            fullname: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(payload.search);
        if (keywordType === "number") {
          const numericKeyword = parseInt(payload.search);

          filterObj["$or"].push({
            payout_amount: numericKeyword,
          });
        } else if (keywordType === "date") {
          const dateKeyword = new Date(payload.search);
          filterObj["$or"].push({ createdAt: dateKeyword });
          filterObj["$or"].push({ updatedAt: dateKeyword });
        }
      }
      const pagination = paginationObject(payload);
      let pipeline = [
        filter,

        {
          $lookup: {
            from: "authentications",
            let: { reference_id: { $toObjectId: "$reference_id" } },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$reference_id"] },
                },
              },
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  agency_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
            as: "agency_data",
          },
        },
        {
          $unwind: { path: "$agency_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "affiliates",
            let: { reference_id: { $toObjectId: "$reference_id" } },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$_id", "$$reference_id"] },
                },
              },
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  affiliate_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
            as: "affiliates_data",
          },
        },
        {
          $unwind: {
            path: "$affiliates_data",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: filterObj },
        {
          $project: {
            email: 1,
            contact_id: 1,
            payout_requested: 1,
            payout_amount: 1,
            createdAt: 1,
            updatedAt: 1,
            _id: 1,
            fullname: {
              $cond: {
                if: { $gt: ["$agency_data", null] },
                then: "$agency_data.agency_name",
                else: "$affiliates_data.affiliate_name",
              },
            },
          },
        },
      ];

      const pendingPayout = await Payout.aggregate(pipeline)
        .sort(pagination.sort)
        .skip(pagination.skip)
        .limit(pagination.result_per_page);
      const totalpendingPayout = await Payout.aggregate(pipeline);
      const pages = Math.ceil(
        totalpendingPayout.length / pagination.result_per_page
      );
      return { pendingPayout, page_count: pages };
    } catch (error) {
      console.log(JSON.stringify(error));
      logger.error(`Error while creating the listing payout: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  createPayouts = async (payload) => {
    try {
      let payout_details = await Payout.findById(payload?.id);

      const { data } = await this.razorpayApi.post("/payouts", {
        account_number: "2323230003384962",
        fund_account_id: payout_details?.fund_id,
        amount: payout_details?.payout_amount,
        currency: "INR",
        mode: "IMPS",
        purpose: "payout",
        reference_id: payout_details?.reference_id, // You can use a unique reference ID for each payout
      });

      if (data) {
        await Payout.findByIdAndUpdate(
          payload?.id,
          {
            payout_requested: false,
          },
          { new: true }
        );
      }

      return data;
    } catch (error) {
      console.log(JSON.stringify(error?.response?.data));
      logger.error(`Error while creating the payout: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchAccountDetail = async (user) => {
    try {
      if (!user?.fund_id)
        return throwError(returnMessage("payment", "accountnotfound"));
      const { data } = await this.razorpayApi.get(
        `/fund_accounts/${user?.fund_id}`
      );

      return data;
    } catch (error) {
      console.log(JSON.stringify(error?.response?.data));
      logger.error(`Error while fetch account detail: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  glideCampaignContactDelete = async (glide_campaign_id) => {
    try {
      if (!glide_campaign_id) return;

      const submission_id = await axios.get(
        process.env.GLIDE_CAMPAIGN_CONTACT_UPDATE_URL +
          "/" +
          glide_campaign_id +
          "/submission",
        {
          auth: {
            username: process.env.GLIDE_PUBLICE_KEY,
            password: process.env.GLIDE_PRIVATE_KEY,
          },
        }
      );

      if (!submission_id?.data?.data[0]?.submission_id) return;

      await axios.delete(process.env.GLIDE_CAMPAIGN_CONTACT_DELETE_URL, {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              process.env.GLIDE_PUBLICE_KEY +
                ":" +
                process.env.GLIDE_PRIVATE_KEY
            ).toString("base64"),
          "Content-Type": "application/json",
        },
        data: { contacts: [glide_campaign_id] },
      });
      return;
    } catch (error) {
      console.log(error);
      logger.error(
        `Error while creating the contact in the glide campaign: ${error}`
      );
    }
  };
}

module.exports = PaymentService;
