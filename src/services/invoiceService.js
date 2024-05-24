const Invoice = require("../models/invoiceSchema");
const Invoice_Status_Master = require("../models/masters/invoiceStatusMaster");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, invoiceTemplate } = require("../utils/utils");
const Client = require("../models/clientSchema");
const mongoose = require("mongoose");
const { calculateInvoice, calculateAmount } = require("./commonSevice");
const { paginationObject, getKeywordType } = require("../utils/utils");
const statusCode = require("../messages/english.json");
const Authentication = require("../models/authenticationSchema");
const sendEmail = require("../helpers/sendEmail");
const pdf = require("html-pdf");
const NotificationService = require("./notificationService");
const notificationService = new NotificationService();
const moment = require("moment");
const Currency = require("../models/masters/currencyListSchema");
const Configuration = require("../models/configurationSchema");
const Workspace = require("../models/workspaceSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const Setting = require("../models/settingSchema");
const AuthService = require("../services/authService");
const authService = new AuthService();
const fs = require("fs");

class InvoiceService {
  // Get Client list  ------   AGENCY API
  getClients = async (user) => {
    try {
      const client_data = await Role_Master.findOne({ name: "client" }).lean();
      const team_client_data = await Role_Master.findOne({
        name: "team_client",
      }).lean();
      const pipeline = [
        {
          $match: { _id: new mongoose.Types.ObjectId(user?.workspace) },
        },

        {
          $unwind: {
            path: "$members",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "members.user_id",
            foreignField: "_id",
            as: "user_details",
          },
        },

        {
          $unwind: {
            path: "$user_details",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "role_masters",
            localField: "members.role",
            foreignField: "_id",
            as: "status_name",
          },
        },
        {
          $unwind: {
            path: "$status_name",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "client_data.state",
            foreignField: "_id",
            as: "client_state",
            pipeline: [
              {
                $project: {
                  name: 1,
                  _id: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$client_state", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "city_masters",
            localField: "client_data.city",
            foreignField: "_id",
            as: "clientCity",
            pipeline: [
              {
                $project: {
                  name: 1,
                  _id: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$clientCity", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "country_masters",
            localField: "client_data.country",
            foreignField: "_id",
            as: "clientCountry",
            pipeline: [
              {
                $project: {
                  name: 1,
                  _id: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$clientCountry", preserveNullAndEmptyArrays: true },
        },

        {
          $match: {
            $or: [
              {
                "status_name._id": new mongoose.Types.ObjectId(
                  client_data?._id
                ),
              },
              {
                "status_name._id": new mongoose.Types.ObjectId(
                  team_client_data?._id
                ),
              },
            ],
          },
        },

        {
          $project: {
            _id: 0,
            role: "$status_name.name",
            _id: "$user_details._id",
            profile_image: "$user_details.profile_image",
            first_name: "$user_details.first_name",
            last_name: "$user_details.last_name",
            company_name: "$user_details.company_name",
            contact_number: "$user_details.contact_number",
            address: "$user_details.address",
            industry: "$user_details.industry",
            no_of_people: "$user_details.no_of_people",
            pincode: "$user_details.pincode",
            email: "$user_details.email",
            city: "$clientCity",
            state: "$clientState",
            country: "$clientCountry",
            client_full_name: {
              $concat: [
                "$user_details.first_name",
                " ",
                "$user_details.last_name",
              ],
            },
          },
        },
      ];
      const client_list = await Workspace.aggregate(pipeline);

      return client_list;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Add   Invoice    ------   AGENCY API
  addInvoice = async (payload, user, logo) => {
    try {
      const {
        due_date,
        invoice_number,
        invoice_date,
        invoice_content,
        client_id,
        sent,
        currency,
        memo,
      } = payload;

      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      if (user_role_data?.user_role !== "agency") {
        return throwError(returnMessage("auth", "insufficientPermission"), 403);
      }

      if (due_date < invoice_date) {
        return throwError(returnMessage("invoice", "invalidDueDate"));
      }

      const invoiceItems = JSON.parse(invoice_content);
      calculateAmount(invoiceItems);

      let newInvoiceNumber;

      // If invoice_number is not provided, generate a new one based on count
      if (!invoice_number) {
        let invoiceCount = await Invoice.countDocuments({
          agency_id: user?._id,
        });

        // Generate a new invoice number and ensure it's unique
        do {
          invoiceCount += 1;
          newInvoiceNumber = `INV-${invoiceCount}`;
          var existingInvoice = await Invoice.findOne({
            invoice_number: newInvoiceNumber,
            agency_id: user?._id,
          });
        } while (existingInvoice);
      } else {
        newInvoiceNumber = `INV-${invoice_number}`;
        const isInvoice = await Invoice.findOne({
          invoice_number: newInvoiceNumber,
          agency_id: user?._id,
        });
        if (isInvoice) {
          return throwError(returnMessage("invoice", "invoiceNumberExists"));
        }
      }

      const { total, sub_total } = calculateInvoice(invoiceItems);

      // Update Invoice status
      let getInvoiceStatus;
      if (sent === "true") {
        getInvoiceStatus = await Invoice_Status_Master.findOne({
          name: "unpaid",
        });
      } else {
        getInvoiceStatus = await Invoice_Status_Master.findOne({
          name: "draft",
        });
      }

      const invoice_setting_data = await Setting.findOne({
        workspace_id: user?.workspace,
      }).lean();
      let image_path = false;
      if (logo) {
        image_path = "uploads/" + logo?.filename;
        if (!invoice_setting_data?.invoice?.logo) {
          await Setting.findOneAndUpdate(
            { workspace_id: user?.workspace },
            { invoice: { logo: image_path } },
            { new: true }
          );
        }
      } else {
        image_path = invoice_setting_data?.invoice?.logo;
      }
      var invoice = await Invoice.create({
        due_date,
        invoice_number: newInvoiceNumber,
        invoice_date,
        total,
        sub_total,
        invoice_content: invoiceItems,
        ...(client_id && { client_id: client_id }),
        currency,
        workspace_id: user?.workspace,
        memo,
        agency_id: user?._id,
        status: getInvoiceStatus?._id,
        ...(image_path && {
          invoice_logo: image_path,
        }),
      });

      if (sent === "true") {
        const payload = { invoice_id: invoice?._id };
        await this.sendInvoice(payload, "create", user?.workspace);
      }

      return invoice;
    } catch (error) {
      logger.error(`Error while  create Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update Invoice   ------   AGENCY API
  updateInvoice = async (payload, invoiceIdToUpdate, user, logo) => {
    try {
      const {
        due_date,
        invoice_content,
        client_id,
        invoice_date,
        sent,
        currency,
        memo,
        invoice_number,
      } = payload;

      // Check Permission
      const user_role_data = await authService?.getRoleSubRoleInWorkspace(user);
      if (user_role_data?.user_role !== "agency") {
        return throwError(returnMessage("auth", "insufficientPermission"), 403);
      }

      // Check invoice number already exists
      const draftKey = await Invoice_Status_Master.findOne({
        name: "draft",
      }).lean();
      const isInvoice = await Invoice.findOne({
        invoice_number: `INV-${invoice_number}`,
        agency_id: user?._id,
        status: { $ne: draftKey?._id },
      }).lean();

      if (isInvoice) {
        return throwError(returnMessage("invoice", "invoiceNumberExists"));
      }

      if (due_date < invoice_date) {
        return throwError(returnMessage("invoice", "invalidDueDate"));
      }

      const invoice = await Invoice.findById(invoiceIdToUpdate)
        .populate("status")
        .lean();

      if (invoice.status.name === "draft") {
        if (sent === "true") {
          var getInvoiceStatus = await Invoice_Status_Master.findOne({
            name: "unpaid",
          }).lean();
        }

        // For invoice calculation
        const invoiceItems = JSON.parse(invoice_content);
        calculateAmount(invoiceItems);
        const { total, sub_total } = calculateInvoice(invoiceItems);

        const invoice_setting_data = await Setting.findOne({
          workspace_id: user?.workspace,
        }).lean();

        // For update Image
        let image_path = false;
        if (logo) {
          image_path = "uploads/" + logo?.filename;
          if (!invoice_setting_data?.invoice?.logo) {
            await Setting.findOneAndUpdate(
              { workspace_id: user?.workspace },
              { invoice: { logo: image_path } },
              { new: true }
            );
          }
        }

        // For delete Image
        if (
          logo &&
          invoice_setting_data?.invoice?.logo !== invoice?.invoice_logo
        ) {
          invoice?.invoice_logo &&
            fs.unlink(`./src/public/${invoice?.invoice_logo}`, (err) => {
              if (err) {
                logger.error(`Error while unlinking the documents: ${err}`);
              }
            });
        }
        await Invoice.updateOne(
          { _id: invoiceIdToUpdate },
          {
            $set: {
              total,
              sub_total,
              due_date,
              invoice_content: invoiceItems,
              ...(!client_id || client_id === "null" || client_id === undefined
                ? {
                    client_id: null,
                  }
                : { client_id: client_id }),
              invoice_date,
              status: getInvoiceStatus,
              currency,
              memo,
              invoice_number: `INV-${invoice_number}`,
              ...(image_path && { invoice_logo: image_path }),
            },
          }
        );

        if (sent === "true") {
          const payload = { invoice_id: invoice?._id };
          await this.sendInvoice(payload, "create", user?.workspace);
        }
      } else {
        return throwError(returnMessage("invoice", "canNotUpdate"));
      }
      return true;
    } catch (error) {
      logger.error(`Error while updating Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Invoice    ------   AGENCY API
  getAllInvoice = async (searchObj, user) => {
    try {
      const { client_id } = searchObj;
      const queryObj = {
        is_deleted: false,
        agency_id: new mongoose.Types.ObjectId(user?._id),
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        ...(client_id && { client_id: new mongoose.Types.ObjectId(client_id) }),
      };
      if (
        searchObj?.start_date !== null &&
        searchObj?.end_date !== null &&
        searchObj?.start_date !== undefined &&
        searchObj?.start_date !== undefined
      ) {
        const parsedEndDate = moment.utc(searchObj?.end_date, "DD/MM/YYYY");
        const parsedStartDate = moment.utc(searchObj?.start_date, "DD/MM/YYYY");
        searchObj.start_date = parsedStartDate.utc();
        searchObj.end_date = parsedEndDate.utc();
      }
      // Add date range conditions for invoice date and due date

      if (searchObj?.start_date && searchObj?.end_date) {
        queryObj.$and = [
          {
            $or: [
              {
                invoice_date: {
                  $gte: new Date(searchObj?.start_date),
                  $lte: new Date(searchObj?.end_date),
                },
              },
              {
                due_date: {
                  $gte: new Date(searchObj?.start_date),
                  $lte: new Date(searchObj?.end_date),
                },
              },
            ],
          },
        ];
      } else if (searchObj?.start_date) {
        queryObj.$or = [
          { invoice_date: { $gte: new Date(searchObj?.start_date) } },
          { due_date: { $gte: new Date(searchObj?.start_date) } },
        ];
      } else if (searchObj?.end_date) {
        queryObj.$or = [
          { invoice_date: { $lte: new Date(searchObj?.end_date) } },
          { due_date: { $lte: new Date(searchObj?.end_date) } },
        ];
      }

      if (searchObj?.search && searchObj?.search !== "") {
        queryObj["$or"] = [
          {
            invoice_number: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            "status.name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customer_info.first_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customer_info.last_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customer_info.client_fullName": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj?.search);
        if (keywordType === "number") {
          const numericKeyword = parseFloat(searchObj?.search);

          queryObj["$or"].push({
            total: numericKeyword,
          });
        }
      }

      if (searchObj?.client_name && searchObj?.client_name !== "") {
        const clientId = new mongoose.Types.ObjectId(searchObj?.client_name); // Convert string to ObjectId
        queryObj["customer_info._id"] = clientId;
      }
      if (searchObj.status_name && searchObj.status_name !== "") {
        queryObj["status.name"] = {
          $regex: searchObj.status_name.toLowerCase(),
          $options: "i",
        };
      }
      const pagination = paginationObject(searchObj);
      const pipeLine = [
        {
          $lookup: {
            from: "invoice_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },

        {
          $unwind: { path: "$status", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "_id",
            as: "customer_info",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  reference_id: 1,
                  client_fullName: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$customer_info", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "_id",
            as: "customer_data",
            pipeline: [
              {
                $project: {
                  company_name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$customer_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "currencies",
            localField: "currency",
            foreignField: "_id",
            as: "currency_name",
            pipeline: [
              {
                $project: {
                  symbol: 1,
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$currency_name", preserveNullAndEmptyArrays: true },
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            _id: 1,
            invoice_number: 1,
            invoice_date: 1,
            due_date: 1,
            first_name: "$customer_info.first_name",
            last_name: "$customer_info.last_name",
            company_name: "$customer_data.company_name",
            status: "$status.name",
            client_full_name: "$customer_info.client_fullName",
            total: 1,
            createdAt: 1,
            updatedAt: 1,
            client_id: "$customer_info._id",
            currency_symbol: "$currency_name.symbol",
            currency_name: "$currency_name.name",
            memo: 1,
          },
        },
      ];

      const [invoiceList, total_invoices] = await Promise.all([
        Invoice.aggregate(pipeLine)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Invoice.aggregate(pipeLine),
      ]);

      return {
        invoiceList,
        page_count:
          Math.ceil(total_invoices.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while Lising ALL Invoice Listing, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET Invoice   ------   Client and Agency API

  getInvoice = async (invoice_id) => {
    try {
      const invoice = await Invoice.aggregate([
        {
          $match: { _id: new mongoose.Types.ObjectId(invoice_id) },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "_id",
            as: "client_info",
            pipeline: [
              {
                $project: {
                  name: 1,
                  _id: 0,
                  contact_number: 1,
                  first_name: 1,
                  last_name: 1,
                  client_full_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$client_info", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "_id",
            as: "agency_info",
            pipeline: [
              {
                $project: {
                  name: 1,
                  _id: 0,
                  contact_number: 1,
                  first_name: 1,
                  last_name: 1,
                  agency_full_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$agency_info", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "invoice_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "status_data",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$status_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "_id",
            as: "client_data",
            pipeline: [
              {
                $project: {
                  agency_ids: 0,
                  title: 0,
                  company_website: 0,
                  createdAt: 0,
                  updatedAt: 0,
                  __v: 0,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$client_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "client_data.state",
            foreignField: "_id",
            as: "client_state",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$client_state", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "city_masters",
            localField: "client_data.city",
            foreignField: "_id",
            as: "client_city",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$client_city", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "country_masters",
            localField: "client_data.country",
            foreignField: "_id",
            as: "client_country",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: {
            path: "$client_country",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "agencies",
            localField: "agency_id",
            foreignField: "_id",
            as: "agency_data",

            pipeline: [
              {
                $project: {
                  company_website: 0,
                  no_of_people: 0,
                  createdAt: 0,
                  updatedAt: 0,
                  industry: 0,
                  __v: 0,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$agency_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "agency_data.state",
            foreignField: "_id",
            as: "agencyState",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$agencyState", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "city_masters",
            localField: "agency_data.city",
            foreignField: "_id",
            as: "agencyCity",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$agencyCity", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "country_masters",
            localField: "agency_data.country",
            foreignField: "_id",
            as: "agencyCountry",
            pipeline: [
              {
                $project: {
                  name: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$agencyCountry", preserveNullAndEmptyArrays: true },
        },

        {
          $lookup: {
            from: "currencies",
            localField: "currency",
            foreignField: "_id",
            as: "currency_name",
            pipeline: [
              {
                $project: {
                  symbol: 1,
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$currency_name", preserveNullAndEmptyArrays: true },
        },
        {
          $project: {
            _id: 1,
            invoice_number: 1,
            invoice_date: 1,
            invoice_logo: 1,
            due_date: 1,
            status: "$status_data.name",
            from: {
              _id: "$agency_data._id",
              first_name: "$agency_info.first_name",
              last_name: "$agency_info.last_name",
              agency_full_name: "$agency_info.agency_full_name",
              contact_number: "$agency_info.contact_number",
              company_name: "$agency_data.company_name",
              address: "$agency_data.address",
              pincode: "$agency_data.pincode",
              state: "$agencyState",
              city: "$agencyCity",
              country: "$agencyCountry",
            },

            to: {
              _id: "$client_data._id",
              first_name: "$client_info.first_name",
              last_name: "$client_info.last_name",
              client_full_name: "$client_info.client_full_name",
              contact_number: "$client_info.contact_number",
              company_name: "$client_data.company_name",
              address: "$client_data.address",
              pincode: "$client_data.pincode",
              state: "$client_state",
              city: "$client_city",
              country: "$client_country",
            },

            invoice_content: 1,
            sub_total: 1,
            total: 1,
            createdAt: 1,
            updatedAt: 1,
            memo: 1,
            currency_symbol: "$currency_name.symbol",
            currency_name: "$currency_name.name",
            currency_id: "$currency_name._id",
          },
        },
      ]);

      return invoice;
    } catch (error) {
      logger.error(`Error while Get Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update Status Invoice   ------   AGENCY API
  updateStatusInvoice = async (payload, invoiceIdToUpdate, user) => {
    try {
      const { status } = payload;

      if (status === "unpaid") {
        const payload = { invoice_id: invoiceIdToUpdate };
        await this.sendInvoice(payload, "updateStatusUnpaid", user?.workspace);
      }

      if (status === "unpaid" || status === "paid" || status === "overdue") {
        // Get Invoice status
        const get_invoice_status = await Invoice_Status_Master.findOne({
          name: status,
        }).lean();
        await Invoice.updateOne(
          { _id: invoiceIdToUpdate },
          { $set: { status: get_invoice_status?._id } }
        );
      }

      if (status === "paid") {
        const payload = { invoice_id: invoiceIdToUpdate };
        await this.sendInvoice(payload, "updateStatusPaid", user?.workspace);
      }
      return true;
    } catch (error) {
      logger.error(`Error while updating  Invoice status, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Delete Invoice  ------   AGENCY API

  deleteInvoice = async (payload) => {
    try {
      const { invoiceIdsToDelete } = payload;

      const invoices = await Invoice.find({
        _id: { $in: invoiceIdsToDelete },
        is_deleted: false,
      })
        .populate("status", "name")
        .lean();
      const deletableInvoices = invoices.filter(
        (invoice) => invoice.status.name === "draft"
      );
      if (deletableInvoices.length === invoiceIdsToDelete.length) {
        await Invoice.updateMany(
          { _id: { $in: invoiceIdsToDelete } },
          { $set: { is_deleted: true } },
          { new: true }
        );
        return true;
      } else {
        return throwError(returnMessage("invoice", "canNotDelete"));
      }
    } catch (error) {
      logger.error(`Error while Deleting Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Invoice    ------   CLient API
  getClientInvoice = async (searchObj, user) => {
    try {
      const queryObj = {
        is_deleted: false,
        client_id: new mongoose.Types.ObjectId(user?._id),
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
      };
      if (
        searchObj?.start_date !== null &&
        searchObj?.end_date !== null &&
        searchObj?.start_date !== undefined &&
        searchObj?.start_date !== undefined
      ) {
        const parsedStartDate = moment.utc(searchObj?.start_date, "DD/MM/YYYY");
        searchObj.start_date = parsedStartDate.utc();
        const parsedEndDate = moment.utc(searchObj?.end_date, "DD/MM/YYYY");
        searchObj.end_date = parsedEndDate.utc();
      }
      // Add date range conditions for invoice date and due date
      if (searchObj?.start_date && searchObj?.end_date) {
        queryObj.$and = [
          {
            $or: [
              {
                invoice_date: {
                  $gte: new Date(searchObj?.start_date),
                  $lte: new Date(searchObj?.end_date),
                },
              },
              {
                due_date: {
                  $gte: new Date(searchObj?.start_date),
                  $lte: new Date(searchObj?.end_date),
                },
              },
            ],
          },
        ];
      } else if (searchObj.start_date) {
        queryObj.$or = [
          { invoice_date: { $gte: new Date(searchObj?.start_date) } },
          { due_date: { $gte: new Date(searchObj?.start_date) } },
        ];
      } else if (searchObj.end_date) {
        queryObj.$or = [
          { invoice_date: { $lte: new Date(searchObj?.end_date) } },
          { due_date: { $lte: new Date(searchObj?.end_date) } },
        ];
      }

      if (searchObj?.search && searchObj?.search !== "") {
        queryObj["$or"] = [
          {
            invoice_number: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "status_array.name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj?.search);
        if (keywordType === "number") {
          const numericKeyword = parseFloat(searchObj?.search);
          queryObj["$or"].push({
            total: numericKeyword,
          });
        }
      }

      if (searchObj?.status_name && searchObj?.status_name !== "") {
        queryObj["status.name"] = {
          $regex: searchObj?.status_name.toLowerCase(),
          $options: "i",
        };
      }

      const pagination = paginationObject(searchObj);
      const pipeLine = [
        {
          $lookup: {
            from: "invoice_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "status_array",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$status_array", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "currencies",
            localField: "currency",
            foreignField: "_id",
            as: "currency_name",
            pipeline: [
              {
                $project: {
                  symbol: 1,
                  name: 1,
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$currency_name", preserveNullAndEmptyArrays: true },
        },

        {
          $match: {
            "status_array.name": { $ne: "draft" }, // Exclude documents with status "draft"
          },
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            _id: 1,
            invoice_number: 1,
            client_id: 1,
            due_date: 1,
            invoice_date: 1,
            status: "$status_array.name",
            agency_id: 1,
            sub_total: 1,
            total: 1,
            createdAt: 1,
            updatedAt: 1,
            memo: 1,
            currency_symbol: "$currency_name.symbol",
            currency_name: "$currency_name.name",
          },
        },
      ];

      const [invoiceList, total_invoices] = await Promise.all([
        Invoice.aggregate(pipeLine)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Invoice.aggregate(pipeLine),
      ]);

      return {
        invoiceList,
        page_count:
          Math.ceil(total_invoices.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while Lising ALL Invoice Listing, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Send Invoice

  sendInvoice = async (payload, type, workspace_id) => {
    try {
      let notification;
      let invoice_data;

      const { invoice_id } = payload;

      if (invoice_id) {
        const invoice = await Invoice.findOne({
          _id: invoice_id,
          is_deleted: false,
        })
          .populate("client_id")
          .populate("agency_id")
          .populate("status")
          .lean();

        if (invoice?.status?.name === "draft") {
          notification = true;
          const get_invoice_status = await Invoice_Status_Master.findOne({
            name: "unpaid",
          }).lean();
          await Invoice.updateOne(
            { _id: invoice_id },
            { $set: { status: get_invoice_status?._id } }
          );
        }
        invoice_data = await this.getInvoice(invoice_id);

        const client_details = await Authentication.findOne({
          _id: invoice?.client_id,
        });
        if (client_details) {
          const company_urls = await Configuration.find().lean();
          // Use a template or format the invoice message accordingly
          const formatted_inquiry_email = invoiceTemplate({
            ...invoice_data[0],
            invoice_date: moment(invoice_data[0]?.invoice_date).format(
              "DD-MM-YYYY"
            ),
            privacy_policy: company_urls[0]?.urls?.privacy_policy,
            facebook: company_urls[0]?.urls?.facebook,
            instagram: company_urls[0]?.urls?.instagram,
          });
          let invoiceSubject = "invoiceSubject";
          if (type === "updateStatusPaid") invoiceSubject = "invoicePaid";
          if (type === "create") invoiceSubject = "invoiceCreated";
          if (type === "updateStatusUnpaid") invoiceSubject = "invoicePaid";

          await sendEmail({
            email: client_details?.email,
            subject:
              returnMessage("invoice", invoiceSubject) +
              invoice?.invoice_number,
            message: formatted_inquiry_email,
          });
        }
      }
      if (
        (invoice_data &&
          invoice_data[0]?.status === "unpaid" &&
          type === "create") ||
        notification ||
        (invoice_data &&
          invoice_data[0]?.status === "unpaid" &&
          type === "updateStatusUnpaid") ||
        (invoice_data &&
          invoice_data[0]?.status === "paid" &&
          type === "updateStatusPaid")
      ) {
        if (invoice_data[0]?.to?._id) {
          // ----------------  Notification start    -----------------

          await notificationService.addNotification(
            {
              receiver_name: invoice_data[0]?.to?.client_full_name,
              sender_name: invoice_data[0]?.from?.agency_full_name,
              receiver_id: invoice_data[0]?.to?._id,
              invoice_number: invoice_data[0]?.invoice_number,
              module_name: "invoice",
              action_type: type,
              workspace_id: workspace_id,
            },
            invoice_data[0]?._id
          );
          // ----------------  Notification end    -----------------
        }
      }
      if (Array.isArray(payload) && type === "overdue") {
        payload.forEach(async (invoice_id) => {
          const invoice = await this.getInvoice(invoice_id);

          if (invoice[0]?.to?._id) {
            // ----------------  Notification start    -----------------

            await notificationService?.addNotification(
              {
                receiver_name: invoice[0]?.to?.client_full_name,
                sender_name: invoice[0]?.from?.agency_full_name,
                receiver_id: invoice[0]?.to?._id,
                invoice_number: invoice[0]?.invoice_number,
                module_name: "invoice",
                action_type: "overdue",
                workspace_id: workspace_id,
              },
              invoice_id
            );
          }
          const client_details = await Authentication.findOne({
            _id: invoice[0]?.to?._id,
          });
          if (client_details) {
            const company_urls = await Configuration.find().lean();
            // Use a template or format the invoice message accordingly
            const formatted_inquiry_email = invoiceTemplate({
              ...invoice[0],
              invoice_date: moment(invoice[0]?.invoice_date).format(
                "DD-MM-YYYY"
              ),
              privacy_policy: company_urls[0]?.urls?.privacy_policy,
              facebook: company_urls[0]?.urls?.facebook,
              instagram: company_urls[0]?.urls?.instagram,
            });
            sendEmail({
              email: client_details?.email,
              subject:
                returnMessage("invoice", "invoiceOverdue") +
                invoice[0]?.invoice_number,
              message: formatted_inquiry_email,
            });
          }

          // ----------------  Notification end    -----------------
        });
      }

      return true;
    } catch (error) {
      logger.error(`Error while send Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Download PDF

  downloadPdf = async (payload, res) => {
    try {
      const { invoice_id } = payload;
      const invoice = await this.getInvoice(invoice_id);
      const company_urls = await Configuration.find().lean();

      const renderedHtml = invoiceTemplate({
        ...invoice[0],
        invoice_date: moment(invoice[0]?.invoice_date).format("DD-MM-YYYY"),
        privacy_policy: company_urls[0]?.urls?.privacy_policy,
        facebook: company_urls[0]?.urls?.facebook,
        instagram: company_urls[0]?.urls?.instagram,
      });
      const pdfOptions = {};
      // Convert the PDF to a buffer using html-pdf
      const pdfBuffer = await new Promise((resolve, reject) => {
        pdf.create(renderedHtml, pdfOptions).toBuffer((err, buffer) => {
          if (err) {
            reject(err);
          } else {
            resolve(buffer);
          }
        });
      });

      // res.set({ "Content-Type": "application/pdf" });
      // res.send(pdfBuffer);
      return pdfBuffer;
    } catch (error) {
      logger.error(`Error while generating PDF, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Overdue crone Job

  overdueCronJob = async () => {
    try {
      const currentDate = new Date();
      const overdue = await Invoice_Status_Master.findOne({ name: "overdue" });
      const paid = await Invoice_Status_Master.findOne({ name: "paid" });
      const overdueInvoices = await Invoice.find({
        due_date: { $lt: currentDate },
        status: { $nin: [overdue._id, paid._id] },
      });

      const overDueIds = await Invoice.distinct("_id", {
        due_date: { $lt: currentDate },
        status: { $nin: [overdue._id, paid._id] },
      }).lean();

      // Update status to "overdue" for each overdue invoice
      const overdueStatus = await Invoice_Status_Master.findOne({
        name: "overdue",
      });
      for (const invoice of overdueInvoices) {
        invoice.status = overdueStatus._id;
        await invoice.save();
      }

      await this.sendInvoice(overDueIds, "overdue");
    } catch (error) {
      logger.error(`Error while Overdue crone Job PDF, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Currency List

  currencyList = async () => {
    try {
      const currencies = await Currency.find({ is_deleted: false });
      return currencies;
    } catch (error) {
      logger.error(`Error while Currency list Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  addCurrency = async (payload) => {
    try {
      await Currency.create({
        symbol: payload.symbol,
        name: payload.name,
        code: payload.code,
      });
    } catch (error) {
      logger.error(`Error while Currency list Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Upload logo
  uploadLogo = async (user, logo) => {
    try {
      if (logo) {
        const is_exist = await Setting.findOne({
          workspace_id: user?.workspace,
        }).lean();

        if (is_exist) {
          fs.unlink(`./src/public/${is_exist?.invoice?.logo}`, (err) => {
            if (err) {
              logger.error(`Error while unlinking the documents: ${err}`);
            }
          });
        }

        const image_path = "uploads/" + logo?.filename;
        await Setting.findOneAndUpdate(
          { workspace_id: user?.workspace },
          {
            invoice: { logo: image_path },
          },
          { upsert: true }
        );
      }
      return;
    } catch (error) {
      logger.error(`Error while Upload image , ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET Invoice information like address , company name pin etc before creating.  ------   AGENCY API
  // getInvoiceInformation = async (payload, user) => {
  //   try {
  //     const { client_id } = payload;
  //     const getClientData = await Client.findOne(
  //       {
  //         _id: client_id,
  //       },
  //       {
  //         agency_ids: 0,
  //         createdAt: 0,
  //         updatedAt: 0,
  //         __v: 0,
  //         company_website: 0,
  //         title: 0,
  //       }
  //     )
  //       .populate("city", "name")
  //       .populate("state", "name")
  //       .populate("country", "name")
  //       .lean();
  //     const getClientInfo = await Authentication.findOne(
  //       { reference_id: client_id },
  //       { contact_number: 1 }
  //     ).lean();

  //     return { ...getClientData, contact_number: getClientInfo.contact_number };
  //   } catch (error) {
  //     logger.error(`Error while Get Invoice information, ${error}`);
  //     throwError(error?.message, error?.statusCode);
  //   }
  // };
}

module.exports = InvoiceService;
