const Agency = require("../models/agencySchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { paginationObject, capitalizeFirstLetter } = require("../utils/utils");
const Role_Master = require("../models/masters/roleMasterSchema");
const Authentication = require("../models/authenticationSchema");
const SubscriptionPlan = require("../models/subscriptionplanSchema");
const Client = require("../models/clientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Activity = require("../models/activitySchema");
const moment = require("moment");
const Invoice = require("../models/invoiceSchema");
const mongoose = require("mongoose");
const PaymentService = require("../services/paymentService");
const SheetManagement = require("../models/sheetManagementSchema");
const Agreement = require("../models/agreementSchema");
const paymentService = new PaymentService();
const fs = require("fs");
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

      if (payload.status_name && payload.status_name !== "") {
        query_obj["status"] = {
          $regex: payload.status_name.toLowerCase(),
          $options: "i",
        };
      }

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
        { _id: { $in: payload?.agencies } },
        update_obj,
        { new: true }
      );
      if (payload?.delete) {
        let agency = await Authentication.find({
          _id: { $in: payload?.agencies },
          status: { $ne: "payment_pending" },
        }).lean();
        for (let i = 0; i < agency?.length; i++) {
          paymentService.deactivateAgency(agency[i]);
        }
      }
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
        Authentication.findById(agency?._id)
          .populate("purchased_plan", "plan_type")
          .select("-password")
          .lean(),
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
  updateAgencyProfile = async (payload, user_id, reference_id, image) => {
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
      let imagePath = false;
      if (image) {
        imagePath = "uploads/" + image.filename;
      } else if (image === "") {
        imagePath = "";
      }
      const existingImage = await Authentication.findById(user_id);
      existingImage &&
        fs.unlink(`./src/public/${existingImage.profile_image}`, (err) => {
          if (err) {
            logger.error(`Error while unlinking the documents: ${err}`);
          }
        });
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
          {
            $set: authData,
            ...((imagePath || imagePath === "") && {
              profile_image: imagePath,
            }),
          },
          { new: true }
        ),
        Agency.updateOne(
          { _id: reference_id },
          {
            $set: agencyData,
          },
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

      let subscription, planDetailForSubscription, Next_billing_amount;
      if (user?.status !== "free_trial" && user?.subscription_id) {
        subscription = await paymentService.subscripionDetail(
          user?.subscription_id
        );
      }

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
        invoiceSentCount,
        agreementPendingCount,
      ] = await Promise.all([
        Client.aggregate([
          {
            $lookup: {
              from: "authentications",
              localField: "_id",
              foreignField: "reference_id",
              as: "statusName",
              pipeline: [{ $project: { is_deleted: 1, status: 1 } }],
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
              "agency_ids.agency_id": user.reference_id,
              "agency_ids.status": "active",
              "statusName.is_deleted": { $eq: false },
              "statusName.status": "confirmed",
            },
          },
          {
            $count: "clientCount",
          },
        ]),
        Team_Agency.aggregate([
          {
            $lookup: {
              from: "authentications",
              localField: "_id",
              foreignField: "reference_id",
              as: "statusName",
              pipeline: [{ $project: { is_deleted: 1, status: 1 } }],
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
              "statusName.is_deleted": { $eq: false },
              "statusName.status": "confirmed",
            },
          },
          {
            $count: "teamMemberCount",
          },
        ]),
        Client.aggregate([
          {
            $lookup: {
              from: "authentications",
              localField: "_id",
              foreignField: "reference_id",
              as: "statusName",
              pipeline: [{ $project: { is_deleted: 1, status: 1 } }],
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
              "agency_ids.agency_id": user.reference_id,
              "agency_ids.status": "active",
              createdAt: {
                $gte: startOfMonth.toDate(),
                $lte: endOfMonth.toDate(),
              },
              "statusName.is_deleted": { $eq: false },
              "statusName.status": "confirmed",
            },
          },
          {
            $count: "clientCountMonth",
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
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $ne: "cancel" }, // Fix: Change $nq to $ne
              is_deleted: false,
              "typeName.name": "task",
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
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "pending" },
              is_deleted: false,
              "typeName.name": "task",
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
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "completed" },
              is_deleted: false,
              "typeName.name": "task",
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
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              agency_id: user.reference_id,
              "statusName.name": { $eq: "in_progress" },
              is_deleted: false,
              "typeName.name": "task",
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
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              agency_id: user.reference_id,
              is_deleted: false,
              "statusName.name": { $eq: "overdue" },
              "typeName.name": "task",
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
              is_deleted: false,
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
              "invoiceStatus.name": { $eq: "paid" },
              is_deleted: false,
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
              "invoiceStatus.name": { $eq: "overdue" },
              is_deleted: false,
            },
          },
          {
            $count: "invoiceOverdueCount",
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
              "invoiceStatus.name": { $eq: "sent" },
              is_deleted: false,
            },
          },
          {
            $count: "invoiceSentCount",
          },
        ]),

        Agreement.aggregate([
          {
            $match: {
              agency_id: new mongoose.Types.ObjectId(user?._id),
              status: "sent",
              is_deleted: false,
            },
          },
          {
            $count: "agreementPendingCount",
          },
        ]),
      ]);

      if (user?.status === "confirmed" && user?.subscription_id) {
        planDetailForSubscription = await paymentService.planDetails(
          subscription?.plan_id
        );
        Next_billing_amount =
          subscription?.quantity *
            (planDetailForSubscription?.item.amount / 100) ?? 0;
      }
      // commented because of the multiple plans
      // if (user?.status === "free_trial") {
      //   const [sheets, plan_details] = await Promise.all([
      //     SheetManagement.findOne({ agency_id: user?.reference_id }).lean(),
      //     SubscriptionPlan.findOne({ active: true }).lean(),
      //   ]);
      //   Next_billing_amount =
      //     sheets.total_sheets * (plan_details?.amount / 100);
      // }

      return {
        client_count: clientCount[0]?.clientCount ?? 0,
        team_member_count: teamMemberCount[0]?.teamMemberCount ?? 0,
        client_count_month: clientCountMonth[0]?.clientCountMonth ?? 0,
        task_count: taskCount[0]?.totalTaskCount ?? 0,
        pending_task_count: pendingTask[0]?.pendingTask ?? 0,
        completed_task_count: completedTask[0]?.completedTask ?? 0,
        in_progress_task_count: inprogressTask[0]?.inprogressTask ?? 0,
        overdue_task_count: overdueTask[0]?.overdueTask ?? 0,
        todays_call_meeting: todaysCallMeeting[0]?.todaysCallMeeting ?? 0,
        total_invoice_amount: totalAmountInvoices[0]?.totalPaidAmount ?? 0,
        invoice_overdue_count: invoiceOverdueCount[0]?.invoiceOverdueCount ?? 0,
        Next_billing_amount: Next_billing_amount || 0,
        agreement_pending_count:
          agreementPendingCount[0]?.agreementPendingCount ?? 0,
        Next_billing_amount:
          subscription?.quantity *
            (planDetailForSubscription?.item.amount / 100) ?? 0,
        invoice_sent_count: invoiceSentCount[0]?.invoiceSentCount ?? 0,
      };
    } catch (error) {
      logger.error(`Error while fetch dashboard data for agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = AgencyService;
