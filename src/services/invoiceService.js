const Invoice = require("../models/invoiceSchema");
const Invoice_Status_Master = require("../models/masters/invoiceStatusMaster");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, invoiceTemplate } = require("../utils/utils");
const Client = require("../models/clientSchema");
const { ObjectId } = require("mongodb");

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

class InvoiceService {
  // Get Client list  ------   AGENCY API
  getClients = async (user) => {
    const { reference_id } = user;
    try {
      const pipeline = [
        {
          $match: {
            "agency_ids.agency_id": reference_id,
            "agency_ids.status": {
              $in: ["active", "inactive"],
            },
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "_id",
            foreignField: "reference_id",
            as: "clientInfo",
            pipeline: [
              {
                $project: {
                  first_name: 1,
                  last_name: 1,
                  name: 1,
                  contact_number: 1,
                  client_full_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$clientInfo", preserveNullAndEmptyArrays: true },
        },

        {
          $lookup: {
            from: "clients",
            localField: "_id",
            foreignField: "_id",
            as: "clientData",
            pipeline: [
              {
                $project: {
                  _id: 1,
                  company_name: 1,
                  address: 1,
                  industry: 1,
                  no_of_people: 1,
                  pincode: 1,
                  city: 1,
                  country: 1,
                  state: 1,
                },
              },
            ],
          },
        },

        {
          $unwind: { path: "$clientData", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "clientData.state",
            foreignField: "_id",
            as: "clientState",
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
          $unwind: { path: "$clientState", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "city_masters",
            localField: "clientData.city",
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
            localField: "clientData.country",
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
          $project: {
            _id: "$clientData._id",
            company_name: "$clientData.company_name",
            first_name: "$clientInfo.first_name",
            last_name: "$clientInfo.last_name",
            client_full_name: "$clientInfo.client_full_name",
            contact_number: "$clientInfo.contact_number",
            address: "$clientData.address",
            industry: "$clientData.industry",
            no_of_people: "$clientData.no_of_people",
            pincode: "$clientData.pincode",
            city: "$clientCity",
            state: "$clientState",
            country: "$clientCountry",
          },
        },
      ];
      const findClient = await Client.aggregate(pipeline);

      return findClient;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // GET Invoice information like address , company name pin etc before creating.  ------   AGENCY API
  getInvoiceInformation = async (payload, user) => {
    try {
      const { client_id } = payload;
      const getClientData = await Client.findOne(
        {
          _id: client_id,
        },
        {
          agency_ids: 0,
          createdAt: 0,
          updatedAt: 0,
          __v: 0,
          company_website: 0,
          title: 0,
        }
      )
        .populate("city", "name")
        .populate("state", "name")
        .populate("country", "name")
        .lean();
      const getClientInfo = await Authentication.findOne(
        { reference_id: client_id },
        { contact_number: 1 }
      ).lean();

      return { ...getClientData, contact_number: getClientInfo.contact_number };
    } catch (error) {
      logger.error(`Error while Get Invoice information, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Add   Invoice    ------   AGENCY API
  addInvoice = async (payload, user) => {
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

      if (due_date < invoice_date) {
        return throwError(returnMessage("invoice", "invalidDueDate"));
      }

      const invoiceItems = invoice_content;
      calculateAmount(invoiceItems);

      let newInvoiceNumber;

      // If invoice_number is not provided, generate a new one based on count
      if (!invoice_number) {
        let invoiceCount = await Invoice.countDocuments({
          agency_id: user.reference_id,
        });

        // Generate a new invoice number and ensure it's unique
        do {
          invoiceCount += 1;
          newInvoiceNumber = `INV-${invoiceCount}`;
          var existingInvoice = await Invoice.findOne({
            invoice_number: newInvoiceNumber,
            agency_id: user.reference_id,
          });
        } while (existingInvoice);
      } else {
        newInvoiceNumber = invoice_number;
        const isInvoice = await Invoice.findOne({
          invoice_number: newInvoiceNumber,
          agency_id: user.reference_id,
        });
        if (isInvoice) {
          return throwError(returnMessage("invoice", "invoiceNumberExists"));
        }
      }

      const { total, sub_total } = calculateInvoice(invoiceItems);

      // Update Invoice status
      let getInvoiceStatus;
      if (sent === true) {
        getInvoiceStatus = await Invoice_Status_Master.findOne({
          name: "unpaid",
        });
      } else {
        getInvoiceStatus = await Invoice_Status_Master.findOne({
          name: "draft",
        });
      }

      var invoice = await Invoice.create({
        due_date,
        invoice_number: newInvoiceNumber,
        invoice_date,
        total,
        sub_total,
        invoice_content: invoiceItems,
        client_id,
        currency,
        memo,
        agency_id: user.reference_id,
        status: getInvoiceStatus._id,
      });

      if (sent === true) {
        const payload = { invoice_id: invoice._id };
        await this.sendInvoice(payload, "create");
      }

      return invoice;
    } catch (error) {
      logger.error(`Error while  create Invoice, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Invoice    ------   AGENCY API
  getAllInvoice = async (searchObj, user_id) => {
    try {
      const { client_id } = searchObj;
      const queryObj = {
        is_deleted: false,
        agency_id: user_id,
        ...(client_id && { client_id: new ObjectId(client_id) }),
      };

      if (searchObj?.start_date !== null && searchObj?.end_date !== null) {
        const parsedEndDate = moment.utc(searchObj?.end_date, "DD/MM/YYYY");
        const parsedStartDate = moment.utc(searchObj?.start_date, "DD/MM/YYYY");
        searchObj.start_date = parsedStartDate.utc();
        searchObj.end_date = parsedEndDate.utc();
      }
      // Add date range conditions for invoice date and due date
      if (searchObj.start_date && searchObj.end_date) {
        queryObj.$and = [
          {
            $or: [
              {
                invoice_date: {
                  $gte: new Date(searchObj.start_date),
                  $lte: new Date(searchObj.end_date),
                },
              },
              {
                due_date: {
                  $gte: new Date(searchObj.start_date),
                  $lte: new Date(searchObj.end_date),
                },
              },
            ],
          },
        ];
      } else if (searchObj.start_date) {
        queryObj.$or = [
          { invoice_date: { $gte: new Date(searchObj.start_date) } },
          { due_date: { $gte: new Date(searchObj.start_date) } },
        ];
      } else if (searchObj.end_date) {
        queryObj.$or = [
          { invoice_date: { $lte: new Date(searchObj.end_date) } },
          { due_date: { $lte: new Date(searchObj.end_date) } },
        ];
      }

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            invoice_number: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            "status.name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customerInfo.first_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customerInfo.last_name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "customerInfo.client_fullName": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "number") {
          const numericKeyword = parseFloat(searchObj.search);

          queryObj["$or"].push({
            total: numericKeyword,
          });
        }
      }

      if (searchObj.client_name && searchObj.client_name !== "") {
        const clientId = new ObjectId(searchObj.client_name); // Convert string to ObjectId
        queryObj["customerInfo.reference_id"] = clientId;
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
            foreignField: "reference_id",
            as: "customerInfo",
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
          $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "clients",
            localField: "client_id",
            foreignField: "_id",
            as: "customerData",
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
          $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true },
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
            first_name: "$customerInfo.first_name",
            last_name: "$customerInfo.last_name",
            company_name: "$customerData.company_name",
            status: "$status.name",
            client_full_name: "$customerInfo.client_fullName",
            total: 1,
            createdAt: 1,
            updatedAt: 1,
            client_id: "$customerInfo.reference_id",
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

  getInvoice = async (invoiceId) => {
    try {
      const invoice = await Invoice.aggregate([
        {
          $match: { _id: new ObjectId(invoiceId) },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "client_id",
            foreignField: "reference_id",
            as: "clientInfo",
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
          $unwind: { path: "$clientInfo", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "reference_id",
            as: "agencyInfo",
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
          $unwind: { path: "$agencyInfo", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "invoice_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "statusData",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$statusData", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "clients",
            localField: "client_id",
            foreignField: "_id",
            as: "clientData",
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
          $unwind: { path: "$clientData", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "clientData.state",
            foreignField: "_id",
            as: "clientState",
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
          $unwind: { path: "$clientState", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "city_masters",
            localField: "clientData.city",
            foreignField: "_id",
            as: "clientCity",
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
          $unwind: { path: "$clientCity", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "country_masters",
            localField: "clientData.country",
            foreignField: "_id",
            as: "clientCountry",
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
          $unwind: { path: "$clientCountry", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "agencies",
            localField: "agency_id",
            foreignField: "_id",
            as: "agencyData",

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
          $unwind: { path: "$agencyData", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "state_masters",
            localField: "agencyData.state",
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
            localField: "agencyData.city",
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
            localField: "agencyData.country",
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
            due_date: 1,
            status: "$statusData.name",
            from: {
              _id: "$agencyData._id",
              first_name: "$agencyInfo.first_name",
              last_name: "$agencyInfo.last_name",
              agency_full_name: "$agencyInfo.agency_full_name",
              contact_number: "$agencyInfo.contact_number",
              company_name: "$agencyData.company_name",
              address: "$agencyData.address",
              pincode: "$agencyData.pincode",
              state: "$agencyState",
              city: "$agencyCity",
              country: "$agencyCountry",
            },

            to: {
              _id: "$clientData._id",
              first_name: "$clientInfo.first_name",
              last_name: "$clientInfo.last_name",
              client_full_name: "$clientInfo.client_full_name",
              contact_number: "$clientInfo.contact_number",
              company_name: "$clientData.company_name",
              address: "$clientData.address",
              pincode: "$clientData.pincode",
              state: "$clientState",
              city: "$clientCity",
              country: "$clientCountry",
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

  // Update Invoice   ------   AGENCY API
  updateInvoice = async (payload, invoiceIdToUpdate, user) => {
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

      const draftKey = await Invoice_Status_Master.findOne({ name: "draft" });

      const isInvoice = await Invoice.findOne({
        invoice_number: invoice_number,
        agency_id: user.reference_id,
        status: { $ne: draftKey?._id },
      });

      if (isInvoice) {
        return throwError(returnMessage("invoice", "invoiceNumberExists"));
      }

      if (due_date < invoice_date) {
        return throwError(returnMessage("invoice", "invalidDueDate"));
      }

      const invoice = await Invoice.findById(invoiceIdToUpdate).populate(
        "status"
      );

      if (invoice.status.name === "draft") {
        if (due_date || invoice_content || client_id || invoice_date) {
          if (sent === true) {
            var getInvoiceStatus = await Invoice_Status_Master.findOne({
              name: "unpaid",
            });
          }

          const invoiceItems = invoice_content;
          calculateAmount(invoiceItems);
          const { total, sub_total } = calculateInvoice(invoiceItems);

          await Invoice.updateOne(
            { _id: invoiceIdToUpdate },
            {
              $set: {
                total,
                sub_total,
                due_date,
                invoice_content: invoiceItems,
                client_id,
                invoice_date,
                status: getInvoiceStatus,
                currency,
                memo,
                invoice_number,
              },
            }
          );

          if (sent === true) {
            const payload = { invoice_id: invoice._id };
            await this.sendInvoice(payload, "create");
          }
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

  // Update Status Invoice   ------   AGENCY API
  updateStatusInvoice = async (payload, invoiceIdToUpdate) => {
    try {
      const { status } = payload;

      if (status === "unpaid") {
        const payload = { invoice_id: invoiceIdToUpdate };
        await this.sendInvoice(payload, "updateStatusUnpaid");
      }

      if (status === "unpaid" || status === "paid" || status === "overdue") {
        // Get Invoice status
        const getInvoiceStatus = await Invoice_Status_Master.findOne({
          name: status,
        });
        await Invoice.updateOne(
          { _id: invoiceIdToUpdate },
          { $set: { status: getInvoiceStatus._id } }
        );
      }

      if (status === "paid") {
        const payload = { invoice_id: invoiceIdToUpdate };
        await this.sendInvoice(payload, "updateStatusPaid");
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
  getClientInvoice = async (searchObj, user_id) => {
    try {
      const { agency_id } = searchObj;
      if (!agency_id) {
        return throwError(returnMessage("invoice", "agencyIdRequired"));
      }
      const queryObj = {
        is_deleted: false,
        client_id: user_id,
        agency_id: new ObjectId(agency_id),
      };
      if (searchObj?.start_date !== null && searchObj?.end_date !== null) {
        const parsedStartDate = moment.utc(searchObj?.start_date, "DD/MM/YYYY");
        searchObj.start_date = parsedStartDate.utc();
        const parsedEndDate = moment.utc(searchObj?.end_date, "DD/MM/YYYY");
        searchObj.end_date = parsedEndDate.utc();
      }
      // Add date range conditions for invoice date and due date
      if (searchObj.start_date && searchObj.end_date) {
        queryObj.$and = [
          {
            $or: [
              {
                invoice_date: {
                  $gte: new Date(searchObj.start_date),
                  $lte: new Date(searchObj.end_date),
                },
              },
              {
                due_date: {
                  $gte: new Date(searchObj.start_date),
                  $lte: new Date(searchObj.end_date),
                },
              },
            ],
          },
        ];
      } else if (searchObj.start_date) {
        queryObj.$or = [
          { invoice_date: { $gte: new Date(searchObj.start_date) } },
          { due_date: { $gte: new Date(searchObj.start_date) } },
        ];
      } else if (searchObj.end_date) {
        queryObj.$or = [
          { invoice_date: { $lte: new Date(searchObj.end_date) } },
          { due_date: { $lte: new Date(searchObj.end_date) } },
        ];
      }

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            invoice_number: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "statusArray.name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "number") {
          const numericKeyword = parseFloat(searchObj.search);
          queryObj["$or"].push({
            total: numericKeyword,
          });
        }
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
            as: "statusArray",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: { path: "$statusArray", preserveNullAndEmptyArrays: true },
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
            "statusArray.name": { $ne: "draft" }, // Exclude documents with status "draft"
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
            status: "$statusArray.name",
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

  sendInvoice = async (payload, type) => {
    try {
      let notification;
      let invoiceData;

      const { invoice_id } = payload;

      if (invoice_id) {
        const invoice = await Invoice.findOne({
          _id: invoice_id,
          is_deleted: false,
        })
          .populate("client_id")
          .populate("agency_id")
          .populate("status");

        if (invoice.status.name === "draft") {
          notification = true;
          const getInvoiceStatus = await Invoice_Status_Master.findOne({
            name: "unpaid",
          });
          await Invoice.updateOne(
            { _id: invoice_id },
            { $set: { status: getInvoiceStatus._id } }
          );
        }
        invoiceData = await this.getInvoice(invoice_id);

        const clientDetails = await Authentication.findOne({
          reference_id: invoice.client_id,
        });
        const company_urls = await Configuration.find().lean();
        // Use a template or format the invoice message accordingly
        const formattedInquiryEmail = invoiceTemplate({
          ...invoiceData[0],
          invoice_date: moment(invoiceData[0]?.invoice_date).format(
            "DD-MM-YYYY"
          ),
          privacy_policy: company_urls[0]?.urls?.privacy_policy,
          facebook: company_urls[0]?.urls?.facebook,
          instagram: company_urls[0]?.urls?.instagram,
        });
        let invoiceSubject = "invoiceSubject";
        if (type === "updateStatusPaid") invoiceSubject = "invoicePaid";
        if (type === "create") invoiceSubject = "invoiceCreated";
        if (type === "updateStatusUnpaid") invoiceSubject = "invoiceCreated";

        await sendEmail({
          email: clientDetails?.email,
          subject:
            returnMessage("invoice", invoiceSubject) + invoice?.invoice_number,
          message: formattedInquiryEmail,
        });
      }
      if (
        (invoiceData &&
          invoiceData[0]?.status === "unpaid" &&
          type === "create") ||
        notification ||
        (invoiceData &&
          invoiceData[0]?.status === "unpaid" &&
          type === "updateStatusUnpaid") ||
        (invoiceData &&
          invoiceData[0]?.status === "paid" &&
          type === "updateStatusPaid")
      ) {
        // ----------------  Notification start    -----------------
        await notificationService.addNotification(
          {
            receiver_name: invoiceData[0]?.to.client_full_name,
            sender_name: invoiceData[0]?.from.agency_full_name,
            receiver_id: invoiceData[0]?.to._id,
            invoice_number: invoiceData[0]?.invoice_number,
            module_name: "invoice",
            action_type: type,
          },
          invoiceData[0]?._id
        );
        // ----------------  Notification end    -----------------
      }
      if (Array.isArray(payload) && type === "overdue") {
        payload.forEach(async (invoiceId) => {
          const invoice = await this.getInvoice(invoiceId);
          // ----------------  Notification start    -----------------
          await notificationService.addNotification(
            {
              receiver_name: invoice[0]?.to.client_full_name,
              sender_name: invoice[0]?.from.agency_full_name,
              receiver_id: invoice[0]?.to._id,
              invoice_number: invoice[0]?.invoice_number,
              module_name: "invoice",
              action_type: "overdue",
            },
            invoiceId
          );

          const clientDetails = await Authentication.findOne({
            reference_id: invoice[0]?.to?._id,
          });
          const company_urls = await Configuration.find().lean();
          // Use a template or format the invoice message accordingly
          const formattedInquiryEmail = invoiceTemplate({
            ...invoice[0],
            invoice_date: moment(invoice[0]?.invoice_date).format("DD-MM-YYYY"),
            privacy_policy: company_urls[0]?.urls?.privacy_policy,
            facebook: company_urls[0]?.urls?.facebook,
            instagram: company_urls[0]?.urls?.instagram,
          });

          await sendEmail({
            email: clientDetails?.email,
            subject:
              returnMessage("invoice", "invoiceOverdue") +
              invoice[0]?.invoice_number,
            message: formattedInquiryEmail,
          });
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
}

module.exports = InvoiceService;
