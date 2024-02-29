const Agency = require("../models/agencySchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { paginationObject, capitalizeFirstLetter } = require("../utils/utils");
const Role_Master = require("../models/masters/roleMasterSchema");
const Authentication = require("../models/authenticationSchema");
const SubscriptionPlan = require("../models/subscriptionplanSchema");
const PaymentService = require("./paymentService");
const paymentService = new PaymentService();
const ReferralService = require("./referralService");
const Client = require("../models/clientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Activity = require("../models/activitySchema");
const referralService = new ReferralService();
const moment = require("moment");
const Invoice = require("../models/invoiceSchema");
const mongoose = require("mongoose");

// Register Agency
class AgencyService {
  agencyRegistration = async (payload) => {
    try {
      return await Agency.create(payload);
    } catch (error) {
      logger.error(`Error while registering the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this will only avilabe for the admin panel
  allAgencies = async (payload) => {
    try {
      const role = await Role_Master.findOne({ name: "agency" })
        .select("_id")
        .lean();
      const pagination = paginationObject(payload);
      const query_obj = { role: role?._id, is_deleted: false };

      if (payload.search && payload.search !== "") {
        query_obj["$or"] = [
          {
            first_name: { $regex: payload.search, $options: "i" },
          },
          {
            last_name: { $regex: payload.search, $options: "i" },
          },
          {
            email: { $regex: payload.search, $options: "i" },
          },
          {
            contact_number: { $regex: payload.search, $options: "i" },
          },
          {
            "reference_id.company_name": {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            "reference_id.company_website": {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            "reference_id.no_of_people": {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            "reference_id.industry": {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            status: { $regex: payload.search, $options: "i" },
          },
        ];

        // const keyword_type = getKeywordType(payload.search);
        // if (keyword_type === "number") {
        //   query_obj["$or"].push({ contact_number: parseInt(payload.search) });
        // }
      }

      const aggragate = [
        {
          $lookup: {
            from: "agencies",
            localField: "reference_id",
            foreignField: "_id",
            as: "reference_id",
            pipeline: [
              {
                $project: {
                  company_name: 1,
                  company_website: 1,
                  industry: 1,
                  no_of_people: 1,
                },
              },
            ],
          },
        },
        { $unwind: "$reference_id" },
        { $match: query_obj },
      ];

      const [agencyList, total_agencies] = await Promise.all([
        Authentication.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Authentication.aggregate(aggragate),
      ]);

      return {
        agencyList,
        page_count:
          Math.ceil(total_agencies.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while getting agency list: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // admin only have rights to update the status and delete
  updateAgencyStatus = async (payload) => {
    try {
      const update_obj = {};
      if (payload?.status && payload?.status !== "") {
        if (payload.status === "active") update_obj.status = "confirmed";
        else if (payload.status === "inactive")
          update_obj.status = "agency_inactive";
      } else if (payload?.delete) update_obj.is_deleted = true;

      await Authentication.updateMany(
        { _id: { $in: payload?.agencies }, status: { $ne: "payment_pending" } },
        update_obj,
        { new: true }
      );

      return true;
    } catch (error) {
      logger.error(`Error while updating an agency status: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Get Agency profile
  getAgencyProfile = async (agency) => {
    try {
      const [agency_detail, agency_reference, plan] = await Promise.all([
        Authentication.findById(agency?._id).select("-password").lean(),
        Agency.findById(agency?.reference_id)
          .populate("city", "name")
          .populate("state", "name")
          .populate("country", "name")
          .lean(),
        SubscriptionPlan.findOne({ active: true }).lean(),
      ]);
      agency_detail.reference_id = agency_reference;
      // removed because of the subscription api is gettign cancelled due to razorpay api call
      // const [subscription_detail, check_referral] = await Promise.all([
      //   paymentService.subscripionDetail(agency_detail?.subscription_id),
      //   referralService.checkReferralAvailable(agency),
      // ]);
      // agency_detail.payable_amount = (
      //   paymentService.customPaymentCalculator(
      //     subscription_detail?.current_start,
      //     subscription_detail?.current_end,
      //     plan
      //   ) / 100
      // ).toFixed(2);
      // // let check_referral = await referralService.checkReferralAvailable(agency);
      // agency_detail.check_referral = check_referral.referralAvailable;
      return agency_detail;
    } catch (error) {
      logger.error(`Error while registering the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Update Agency profile
  updateAgencyProfile = async (payload, user_id, reference_id) => {
    try {
      const {
        first_name,
        last_name,
        contact_number,
        company_name,
        company_website,
        no_of_people,
        industry,
        city,
        address,
        state,
        country,
        pincode,
      } = payload;

      const authData = {
        first_name,
        last_name,
        contact_number,
        name:
          capitalizeFirstLetter(first_name) +
          " " +
          capitalizeFirstLetter(last_name),
      };
      const agencyData = {
        company_name,
        company_website,
        no_of_people,
        industry,
        city,
        address,
        state,
        country,
        pincode,
      };

      await Promise.all([
        Authentication.updateOne(
          { _id: user_id },
          { $set: authData },
          { new: true }
        ),
        Agency.updateOne(
          { _id: reference_id },
          { $set: agencyData },
          { new: true }
        ),
      ]);

      return;
    } catch (error) {
      logger.error(`Error while registering the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Dashboard Data
  dashboardData = async (user) => {
    try {
      const currentDate = moment();
      const startOfMonth = moment(currentDate).startOf("month");
      const endOfMonth = moment(currentDate).endOf("month");
      const startOfToday = moment(currentDate).startOf("day");
      const endOfToday = moment(currentDate).endOf("day");

      const subscription = await paymentService.subscripionDetail(
        user?.subscription_id
      );

      const [
        clientCount,
        teamMemberCount,
        clientCountMonth,
        taskCount,
        pendingTask,
        completedTask,
        inprogressTask,
        overdueTask,
        todaysCallMeeting,
        totalAmountInvoices,
        invoiceOverdueCount,
        planDetailForSubscription,
      ] = await Promise.all([
        Client.find({
          "agency_ids.agency_id": user.reference_id,
          "agency_ids.status": "active",
        }).countDocuments(),

        Team_Agency.find({
          agency_id: user.reference_id,
        }).countDocuments(),

        Client.find({
          "agency_ids.agency_id": user.reference_id,
          "agency_ids.status": "active",
          createdAt: {
            $gte: startOfMonth.toDate(),
            $lte: endOfMonth.toDate(),
          },
        }).countDocuments(),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $ne: "cancel" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "totalTaskCount",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "pending" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "pendingTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "completed" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "completedTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "in_progress" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "inprogressTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "overdue" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "overdueTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "activityType",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$activityType",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "activityType.name": { $eq: "call_meeting" },
              meeting_start_time: {
                $gte: startOfToday.toDate(),
                $lte: endOfToday.toDate(),
              },
            },
          },
          {
            $count: "todaysCallMeeting",
          },
        ]),

        Invoice.aggregate([
          {
            $lookup: {
              from: "invoice_status_masters",
              localField: "status",
              foreignField: "_id",
              as: "invoiceStatus",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$invoiceStatus",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              agency_id: new mongoose.Types.ObjectId(user.reference_id),
              "invoiceStatus.name": { $eq: "paid" }, // Exclude documents with status "draft"
            },
          },
          {
            $group: {
              _id: null,
              totalPaidAmount: { $sum: "$total" },
            },
          },
        ]),

        Invoice.aggregate([
          {
            $lookup: {
              from: "invoice_status_masters",
              localField: "status",
              foreignField: "_id",
              as: "invoiceStatus",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$invoiceStatus",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              agency_id: new mongoose.Types.ObjectId(user.reference_id),
              "invoiceStatus.name": { $eq: "overdue" }, // Exclude documents with status "draft"
            },
          },
          {
            $count: "invoiceOverdueCount",
          },
        ]),
        paymentService.planDetails(subscription.plan_id),
      ]);
      return {
        client_count: clientCount ?? null,
        team_member_count: teamMemberCount ?? null,
        client_count_month: clientCountMonth ?? null,
        task_count: taskCount[0]?.totalTaskCount ?? null,
        pending_task_count: pendingTask[0]?.pendingTask ?? null,
        completed_task_count: completedTask[0]?.completedTask ?? null,
        in_progress_task_count: inprogressTask[0]?.inprogressTask ?? null,
        overdue_task_count: overdueTask[0]?.overdueTask ?? null,
        todays_call_meeting: todaysCallMeeting[0]?.todaysCallMeeting ?? null,
        total_invoice_amount: totalAmountInvoices[0]?.totalPaidAmount ?? null,
        invoice_overdue_count:
          invoiceOverdueCount[0]?.invoiceOverdueCount ?? null,
        Next_billing_amount:
          subscription?.quantity *
            (planDetailForSubscription?.item.amount / 100) ?? null,
      };
    } catch (error) {
      logger.error(`Error while fetch dashboard data for agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = AgencyService;
