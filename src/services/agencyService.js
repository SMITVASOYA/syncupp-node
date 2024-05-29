const Agency = require("../models/agencySchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  paginationObject,
  capitalizeFirstLetter,
  validateRequestFields,
} = require("../utils/utils");
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
const Agreement = require("../models/agreementSchema");
const paymentService = new PaymentService();
const fs = require("fs");
const axios = require("axios");
const Workspace = require("../models/workspaceSchema");
const Task = require("../models/taskSchema");
const Section = require("../models/sectionSchema");
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
      const pagination = paginationObject(payload);
      const query_obj = { is_deleted: false };

      if (payload?.filter) {
        const { status, industry, no_of_people, date } = payload?.filter;
        if (status && status !== "") query_obj["status"] = status;
        if (industry && industry !== "") query_obj["industry"] = industry;
        if (no_of_people && no_of_people !== "")
          query_obj["no_of_people"] = no_of_people;
        if (date && date !== "") {
          const start_date = moment(date?.start_date, "DD-MM-YYYY").startOf(
            "day"
          );
          const end_date = moment(date?.end_date, "DD-MM-YYYY").endOf("day");

          query_obj["$and"] = [
            { createdAt: { $gte: new Date(start_date) } },
            { createdAt: { $lte: new Date(end_date) } },
          ];
        }
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
            company_name: {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            company_website: {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            no_of_people: {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            industry: {
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
        { $match: { is_deleted: false } },
        { $unwind: { path: "$members", preserveNullAndEmptyArrays: true } },
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$members.user_id", "$created_by"] },
                { $eq: ["$_id", "$_id"] }, // Ensures the matching is within the same workspace
              ],
            },
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "created_by",
            foreignField: "_id",
            as: "created_by",
            pipeline: [
              {
                $project: {
                  company_name: 1,
                  company_website: 1,
                  industry: 1,
                  no_of_people: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  contact_number: 1,
                  name: { $concat: ["$first_name", " ", "$last_name"] },
                  _id: 1,
                },
              },
            ],
          },
        },
        { $unwind: { path: "$created_by", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: "$created_by._id",
            company_name: "$created_by.company_name",
            company_website: "$created_by.company_website",
            industry: "$created_by.industry",
            no_of_people: "$created_by.no_of_people",
            first_name: "$created_by.first_name",
            last_name: "$created_by.last_name",
            email: "$created_by.email",
            contact_number: "$created_by.contact_number",
            name: "$created_by.name",
            trial_end_date: 1,
            status: "$members.status",
            workspace_name: "$name",
          },
        },
      ];

      const [agencyList, total_agencies] = await Promise.all([
        Workspace.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Workspace.aggregate(aggragate),
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
      const [agency_detail, plan] = await Promise.all([
        Authentication.findById(agency?._id)
          .populate("purchased_plan", "plan_type")
          .select("-password")
          .lean(),
        SubscriptionPlan.findOne({ active: true }).lean(),
      ]);
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
      let {
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

      validateRequestFields(payload, ["contact_number"]);

      if (
        country == null ||
        country == "null" ||
        country == "undefined" ||
        country == undefined
      )
        country = null;
      if (
        state == null ||
        state == "null" ||
        state == "undefined" ||
        state == undefined
      )
        state = null;
      if (
        city == null ||
        city == "null" ||
        city == "undefined" ||
        city == undefined
      )
        city = null;
      if (
        company_website == null ||
        company_website == "null" ||
        company_website == "undefined" ||
        company_website == undefined
      )
        company_website = null;
      const existingImage = await Authentication.findById(user_id).lean();
      let imagePath = false;
      if (image) {
        imagePath = "uploads/" + image.filename;
      } else if (
        image === "" ||
        (image === undefined && !payload?.profile_image)
      ) {
        imagePath = "";
        existingImage &&
          fs.unlink(`./src/public/${existingImage.profile_image}`, (err) => {
            if (err) {
              logger.error(`Error while unlinking the documents: ${err}`);
            }
          });
      }
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
        this.glideCampaignContactUpdate(
          existingImage?.glide_campaign_id,
          payload
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
      const currentDate = moment().utc();
      const startOfMonth = moment(currentDate).startOf("month").utc();
      const endOfMonth = moment(currentDate).endOf("month").utc();
      const startOfToday = moment(currentDate).startOf("day").utc();
      const endOfToday = moment(currentDate).endOf("day").utc();
      // let subscription, planDetailForSubscription, Next_billing_amount;
      // if (user?.status !== "free_trial" && user?.subscription_id) {
      //   subscription = await paymentService.subscripionDetail(
      //     user?.subscription_id
      //   );
      // }
      const pending_status = await Section.distinct("_id", {
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        key: "pending",
      });
      const completed_status = await Section.distinct("_id", {
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        key: "completed",
      });
      const overdue_status = await Section.distinct("_id", {
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        key: "overdue",
      });
      const in_progress_status = await Section.distinct("_id", {
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        key: "in_progress",
      });

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
        Authentication.aggregate([
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
        Task.aggregate([
          {
            $match: {
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              is_deleted: false,
            },
          },
          {
            $count: "totalTaskCount",
          },
        ]),
        Task.aggregate([
          {
            $match: {
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              is_deleted: false,
              activity_status: { $in: pending_status },
            },
          },
          {
            $count: "pendingTask",
          },
        ]),
        Task.aggregate([
          {
            $match: {
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              is_deleted: false,
              activity_status: { $in: completed_status },
            },
          },
          {
            $count: "completedTask",
          },
        ]),
        Task.aggregate([
          {
            $match: {
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              is_deleted: false,
              activity_status: { $in: in_progress_status },
            },
          },
          {
            $count: "inprogressTask",
          },
        ]),
        Task.aggregate([
          {
            $match: {
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              is_deleted: false,
              activity_status: { $in: overdue_status },
            },
          },
          {
            $count: "overdueTask",
          },
        ]),
        Activity.aggregate([
          {
            $match: {
              is_deleted: false,
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              meeting_date: {
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
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
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
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
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
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
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
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
              status: "sent",
              is_deleted: false,
            },
          },
          {
            $count: "agreementPendingCount",
          },
        ]),
      ]);

      // if (user?.status === "confirmed" && user?.subscription_id) {
      //   planDetailForSubscription = await paymentService.planDetails(
      //     subscription?.plan_id
      //   );
      //   Next_billing_amount =
      //     subscription?.quantity *
      //       (planDetailForSubscription?.item.amount / 100) ?? 0;
      // }
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
        pending_task_count: pendingTask[0].pendingTask ?? 0,
        completed_task_count: completedTask[0]?.completedTask ?? 0,
        in_progress_task_count: inprogressTask[0]?.inprogressTask ?? 0,
        overdue_task_count: overdueTask[0]?.overdueTask ?? 0,
        todays_call_meeting: todaysCallMeeting[0]?.todaysCallMeeting ?? 0,
        total_invoice_amount: totalAmountInvoices[0]?.totalPaidAmount ?? 0,
        invoice_overdue_count: invoiceOverdueCount[0]?.invoiceOverdueCount ?? 0,
        invoice_sent_count: invoiceSentCount[0]?.invoiceSentCount ?? 0,
        // Next_billing_amount: Next_billing_amount || 0,
        agreement_pending_count:
          agreementPendingCount[0]?.agreementPendingCount ?? 0,
        // Next_billing_amount:
        //   subscription?.quantity *
        //     (planDetailForSubscription?.item.amount / 100) ?? 0,
        // invoice_sent_count: invoiceSentCount[0]?.invoiceSentCount ?? 0,
      };
    } catch (error) {
      logger.error(`Error while fetch dashboard data for agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  glideCampaignContactUpdate = async (glide_campaign_id, payload) => {
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

      const contact_update_object = {
        form_data: {
          first_name: capitalizeFirstLetter(payload?.first_name),
          last_name: capitalizeFirstLetter(payload?.last_name),
          phone:
            payload?.contact_number?.length <= 10
              ? "91" + payload?.contact_number
              : payload?.contact_number,
          company: capitalizeFirstLetter(payload?.company_name),
          website:
            payload?.company_website &&
            payload?.company_website !== "null" &&
            payload?.company_website !== "undefined"
              ? payload?.website
              : undefined,
          role: "Agency",
          no_of_people:
            payload?.no_of_people &&
            payload?.no_of_people !== "null" &&
            payload?.no_of_people !== "undefined"
              ? payload?.no_of_people
              : undefined,
          industry:
            payload?.industry &&
            payload?.industry !== "null" &&
            payload?.industry !== "undefined"
              ? payload?.industry
              : undefined,
        },
      };

      await axios.put(
        process.env.GLIDE_CAMPAIGN_CONTACT_UPDATE_URL +
          "/" +
          glide_campaign_id +
          "/submission/" +
          submission_id?.data?.data[0]?.submission_id,
        contact_update_object,
        {
          auth: {
            username: process.env.GLIDE_PUBLICE_KEY,
            password: process.env.GLIDE_PRIVATE_KEY,
          },
        }
      );

      return;
    } catch (error) {
      console.log(error);
      logger.error(
        `Error while creating the contact in the glide campaign: ${error}`
      );
    }
  };
}

module.exports = AgencyService;
