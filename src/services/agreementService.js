const Agreement = require("../models/agreementSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  agrementEmail,
  paginationObject,
  getKeywordType,
} = require("../utils/utils");
const fs = require("fs");
const sendEmail = require("../helpers/sendEmail");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const { default: mongoose } = require("mongoose");
const Handlebars = require("handlebars");
const pdf = require("html-pdf");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const NotificationService = require("./notificationService");
const Configuration = require("../models/configurationSchema");
const notificationService = new NotificationService();

class AgreementService {
  // Add   Agreement
  addAgreement = async (payload, user) => {
    try {
      const {
        client_id,
        title,
        agreement_content,
        due_date,
        status,
        receiver,
        send,
      } = payload;
      const dueDate = moment.utc(due_date, "DD/MM/YYYY").utc();

      const auth = await Authentication.findById(receiver).populate("role");
      if (auth.role.name === "client") {
        const client = await Client.findOne({
          _id: auth.reference_id,
          "agency_ids.agency_id": user.reference_id,
        });

        if (!client) {
          return throwError(returnMessage("agreement", "clientnotexist"));
        }
      }

      const agreements = await Agreement.create({
        title,
        agreement_content,
        due_date: dueDate,
        status,
        receiver,
        agency_id: user._id,
      });

      if (send === true) {
        const clientDetails = await Authentication.findOne({
          _id: receiver,
        });
        const aggregationPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "receiver",
              foreignField: "_id",
              as: "receiver_Data",
            },
          },

          {
            $unwind: "$receiver_Data",
          },
          {
            $lookup: {
              from: "authentications",
              localField: "agency_id",
              foreignField: "_id",
              as: "sender_Data",
            },
          },

          {
            $unwind: "$sender_Data",
          },

          {
            $match: {
              _id: new mongoose.Types.ObjectId(agreements._id),
              is_deleted: false,
            },
          },
          {
            $project: {
              _id: 1,
              first_name: "$receiver_Data.first_name",
              last_name: "$receiver_Data.last_name",
              email: "$receiver_Data.email",
              receiver: "$receiver_Data.name",
              receiver_email: "$receiver_Data.email",
              receiver_number: "$receiver_Data.contact_number",
              receiver_id: "$receiver_Data._id",
              contact_number: 1,
              sender: "$sender_Data.name",
              sender_email: "$sender_Data.email",
              sender_number: "$sender_Data.contact_number",
              sender_first_name: "$sender_Data.first_name",
              sender_last_name: "$sender_Data.last_name",
              sender_id: "$sender_Data._id",
              sender_fullName: {
                $concat: [
                  "$sender_Data.first_name",
                  " ",
                  "$sender_Data.last_name",
                ],
              },
              receiver_fullName: {
                $concat: [
                  "$receiver_Data.first_name",
                  " ",
                  "$receiver_Data.last_name",
                ],
              },
              title: 1,
              status: 1,
              agreement_content: 1,
              due_date: 1,
            },
          },
        ];
        const agreement = await Agreement.aggregate(aggregationPipeline);
        var data = {
          title: agreement[0].title,
          dueDate: moment(agreement[0].due_date).format("DD/MM/YYYY"),
          content: agreement[0].agreement_content,
          receiverName: agreement[0].receiver_fullName,
          senderName: agreement[0].sender_fullName,
          status: agreement[0].status,
          senderNumber: agreement[0].sender_number,
          receiverNumber: agreement[0].receiver_number,
          senderEmail: agreement[0].sender_email,
          receiverEmail: agreement[0].receiver_email,
        };
        const ageremantMessage = agrementEmail(data);
        await sendEmail({
          email: clientDetails?.email,
          subject: returnMessage("emailTemplate", "agreementReceived"),
          message: ageremantMessage,
        });
        await Agreement.findOneAndUpdate(
          { _id: agreements._id },
          { status: "sent" },
          { new: true }
        );
        payload.status = "sent";

        // ----------------  Notification start    -----------------
        await notificationService.addNotification(
          {
            receiver_name: agreement[0]?.receiver_fullName,
            sender_name: agreement[0]?.sender_fullName,
            receiver_id: clientDetails?.reference_id,
            title,
            agreement_content,
            module_name: "agreement",
            action_type: "create",
          },
          agreement[0]?._id
        );
        // ----------------  Notification end    -----------------
      }

      return agreements;
    } catch (error) {
      logger.error(`Error while Admin add Agreement, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Agreement
  getAllAgreement = async (searchObj, user_id) => {
    try {
      const { client_id } = searchObj;

      const client = await Authentication.findOne({ reference_id: client_id });

      const queryObj = {
        is_deleted: false,
        agency_id: user_id,
        ...(client_id && { receiver: new ObjectId(client._id) }),
      };
      const filter = {
        $match: {},
      };
      // if (searchObj?.client_name) {
      //   filter["$match"] = {
      //     ...filter["$match"],
      //     receiver: new mongoose.Types.ObjectId(searchObj?.client_name),
      //   };
      // }
      if (searchObj.client_name) {
        queryObj["agreement_Data.reference_id"] = new mongoose.Types.ObjectId(
          searchObj?.client_name
        );
      }
      if (searchObj?.status_name) {
        filter["$match"] = {
          ...filter["$match"],
          status: searchObj?.status_name,
        };
      }
      if (searchObj.start_date && searchObj.end_date) {
        queryObj.due_date = {
          $gte: new Date(searchObj.start_date),
          $lte: new Date(searchObj.end_date),
        };
      }

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            status: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            "agreement_Data.name": {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
        }
      }
      const pagination = paginationObject(searchObj);
      const aggregationPipeline = [
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "agreement_Data",
          },
        },

        {
          $unwind: {
            path: "$agreement_Data",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            first_name: "$agreement_Data.first_name",
            last_name: "$agreement_Data.last_name",
            email: "$agreement_Data.email",
            receiver: "$agreement_Data.name",
            contact_number: 1,
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
            createdAt: 1,
          },
        },
      ];
      const agreements = await Agreement.aggregate(aggregationPipeline)
        .sort(pagination.sort)
        .skip(pagination.skip)
        .limit(pagination.result_per_page);

      const totalAgreementsCount = await Agreement.aggregate(
        aggregationPipeline
      );

      return {
        agreements,
        page_count:
          Math.ceil(totalAgreementsCount.length / pagination.result_per_page) ||
          0,
      };
    } catch (error) {
      logger.error(`Error while Admin Agreement Listing, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET Agreement

  getAgreement = async (agreementId) => {
    try {
      const aggregationPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "receiver_Data",
          },
        },

        {
          $unwind: "$receiver_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "_id",
            as: "sender_Data",
          },
        },

        {
          $unwind: "$sender_Data",
        },

        {
          $match: {
            _id: new mongoose.Types.ObjectId(agreementId),
            is_deleted: false,
          },
        },
        {
          $project: {
            _id: 1,
            first_name: "$receiver_Data.first_name",
            last_name: "$receiver_Data.last_name",
            email: "$receiver_Data.email",
            receiver: "$receiver_Data.name",
            receiver_email: "$receiver_Data.email",
            receiver_number: "$receiver_Data.contact_number",
            receiver_id: "$receiver_Data._id",
            contact_number: 1,
            sender: "$sender_Data.name",
            sender_email: "$sender_Data.email",
            sender_number: "$sender_Data.contact_number",
            sender_first_name: "$sender_Data.first_name",
            sender_last_name: "$sender_Data.last_name",
            sender_id: "$sender_Data._id",
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
          },
        },
      ];
      const agreement = await Agreement.aggregate(aggregationPipeline);
      const agreement_result = agreement.length > 0 ? agreement[0] : agreement;
      return agreement_result;
    } catch (error) {
      logger.error(`Error while Get Agreement, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  deleteAgreement = async (payload) => {
    try {
      const { agreementIdsToDelete } = payload;

      const agreements = await Agreement.find({
        _id: { $in: agreementIdsToDelete },
        is_deleted: false,
      }).lean();

      const deletableAgreements = agreements.filter(
        (agreement) => agreement.status === "draft"
      );

      if (deletableAgreements.length === agreementIdsToDelete.length) {
        await Agreement.updateMany(
          { _id: { $in: agreementIdsToDelete } },
          { $set: { is_deleted: true } },
          { new: true }
        );
        return true;
      } else {
        return throwError(returnMessage("agreement", "canNotDelete"));
      }
    } catch (error) {
      logger.error(`Error while Deleting Agreement(s): ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // update   Agreement

  updateAgreement = async (payload, agreementId) => {
    try {
      const { title, agreement_content, due_date, status, receiver } = payload;

      if (payload.due_date) {
        payload.due_date = moment.utc(payload.due_date, "DD/MM/YYYY").utc();
      }

      const agreement = await Agreement.findOne({
        _id: agreementId,
        is_deleted: false,
      }).lean();
      if (payload?.send) {
        await Agreement.findByIdAndUpdate(
          {
            _id: agreementId,
          },
          {
            status: "sent",
          },
          { new: true, useFindAndModify: false }
        );
      }

      if (status === "sent") {
        const clientDetails = await Authentication.findOne({
          _id: agreement.receiver,
        });
        // const agreement_detail = await this.getAgreement(agreementId);
        const aggregationPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "receiver",
              foreignField: "_id",
              as: "receiver_Data",
            },
          },

          {
            $unwind: "$receiver_Data",
          },
          {
            $lookup: {
              from: "authentications",
              localField: "agency_id",
              foreignField: "_id",
              as: "sender_Data",
            },
          },

          {
            $unwind: "$sender_Data",
          },

          {
            $match: {
              _id: new mongoose.Types.ObjectId(agreementId),
              is_deleted: false,
            },
          },
          {
            $project: {
              _id: 1,
              first_name: "$receiver_Data.first_name",
              last_name: "$receiver_Data.last_name",
              email: "$receiver_Data.email",
              receiver: "$receiver_Data.name",
              receiver_email: "$receiver_Data.email",
              receiver_number: "$receiver_Data.contact_number",
              receiver_id: "$receiver_Data._id",
              contact_number: 1,
              sender: "$sender_Data.name",
              sender_email: "$sender_Data.email",
              sender_number: "$sender_Data.contact_number",
              sender_first_name: "$sender_Data.first_name",
              sender_last_name: "$sender_Data.last_name",
              sender_id: "$sender_Data._id",
              sender_fullName: {
                $concat: [
                  "$sender_Data.first_name",
                  " ",
                  "$sender_Data.last_name",
                ],
              },
              receiver_fullName: {
                $concat: [
                  "$receiver_Data.first_name",
                  " ",
                  "$receiver_Data.last_name",
                ],
              },
              title: 1,
              status: 1,
              agreement_content: 1,
              due_date: 1,
            },
          },
        ];
        const agreement = await Agreement.aggregate(aggregationPipeline);
        var data = {
          title: agreement[0].title,
          dueDate: moment(agreement[0].due_date).format("DD/MM/YYYY"),
          content: agreement[0].agreement_content,
          receiverName: agreement[0].receiver_fullName,
          senderName: agreement[0].sender_fullName,
          status: agreement[0].status,
          senderNumber: agreement[0].sender_number,
          receiverNumber: agreement[0].receiver_number,
          senderEmail: agreement[0].sender_email,
          receiverEmail: agreement[0].receiver_email,
        };
        const ageremantMessage = agrementEmail(data);
        await sendEmail({
          email: clientDetails?.email,
          subject: returnMessage("emailTemplate", "agreementUpdated"),
          message: ageremantMessage,
        });
        payload.status = "sent";
      }

      if (agreement.status === "draft") {
        const dueDate = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
        const updatedAgreement = await Agreement.findByIdAndUpdate(
          {
            _id: agreementId,
          },
          {
            title,
            agreement_content,
            due_date: payload.due_date,
            status,
            receiver,
          },
          { new: true, useFindAndModify: false }
        );
        return updatedAgreement;
      } else {
        return throwError(returnMessage("agreement", "canNotUpdate"));
      }
    } catch (error) {
      logger.error(`Error while updating Agreement, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Send Agreement

  sendAgreement = async (payload) => {
    try {
      const { agreementId } = payload;

      const agreements = await Agreement.findOne({
        _id: agreementId,
        is_deleted: false,
      }).lean();
      const clientDetails = await Authentication.findOne({
        _id: agreements.receiver,
      });
      // const agreement_detail = await this.getAgreement(agreementId);
      const aggregationPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "receiver_Data",
          },
        },

        {
          $unwind: "$receiver_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "_id",
            as: "sender_Data",
          },
        },

        {
          $unwind: "$sender_Data",
        },

        {
          $match: {
            _id: new mongoose.Types.ObjectId(agreementId),
            is_deleted: false,
          },
        },
        {
          $project: {
            _id: 1,
            first_name: "$receiver_Data.first_name",
            last_name: "$receiver_Data.last_name",
            email: "$receiver_Data.email",
            receiver: "$receiver_Data.name",
            receiver_email: "$receiver_Data.email",
            receiver_number: "$receiver_Data.contact_number",
            receiver_id: "$receiver_Data._id",
            contact_number: 1,
            sender: "$sender_Data.name",
            sender_email: "$sender_Data.email",
            sender_number: "$sender_Data.contact_number",
            sender_first_name: "$sender_Data.first_name",
            sender_last_name: "$sender_Data.last_name",
            sender_id: "$sender_Data._id",
            sender_fullName: {
              $concat: [
                "$sender_Data.first_name",
                " ",
                "$sender_Data.last_name",
              ],
            },
            receiver_fullName: {
              $concat: [
                "$receiver_Data.first_name",
                " ",
                "$receiver_Data.last_name",
              ],
            },
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
          },
        },
      ];
      const agreement = await Agreement.aggregate(aggregationPipeline);
      var data = {
        title: agreement[0].title,
        dueDate: moment(agreement[0].due_date).format("DD/MM/YYYY"),
        content: agreement[0].agreement_content,
        receiverName: agreement[0].receiver_fullName,
        senderName: agreement[0].sender_fullName,
        status: agreement[0].status,
        senderNumber: agreement[0].sender_number,
        receiverNumber: agreement[0].receiver_number,
        senderEmail: agreement[0].sender_email,
        receiverEmail: agreement[0].receiver_email,
      };
      const ageremantMessage = agrementEmail(data);
      await sendEmail({
        email: clientDetails?.email,
        subject: returnMessage("emailTemplate", "agreementUpdated"),
        message: ageremantMessage,
      });

      if (agreements.status === "sent" || agreements.status === "draft") {
        const updatedAgreement = await Agreement.findByIdAndUpdate(
          {
            _id: agreementId,
          },
          {
            status: "sent",
          },
          { new: true, useFindAndModify: false }
        );
      }

      // ----------------  Notification start    -----------------

      if (agreements.status === "draft") {
        await notificationService.addNotification(
          {
            receiver_name: agreement[0]?.receiver_fullName,
            sender_name: agreement[0]?.sender_fullName,
            receiver_id: clientDetails?.reference_id,
            title: agreement[0]?.title,
            module_name: "agreement",
            action_type: "create",
          },
          agreementId
        );
      }

      // ----------------  Notification end    -----------------

      return true;
    } catch (error) {
      logger.error(`Error while send Agreement, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // -------------------   Client API ----------------------

  // Update Client Agreement

  updateAgreementStatus = async (payload, agreementId, user) => {
    try {
      const { status } = payload;

      if (user.role.name === "agency" && status === "agreed") {
        return throwError(returnMessage("agreement", "canNotUpdate"));
      }

      if (status === "draft") {
        return throwError(returnMessage("agreement", "canNotUpdate"));
      }
      let agreement;
      if (status === "sent" || status === "agreed") {
        const agreements = await Agreement.findOne({
          _id: agreementId,
          is_deleted: false,
        }).lean();
        const clientDetails = await Authentication.findOne({
          _id: agreements.receiver,
        });
        const aggregationPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "receiver",
              foreignField: "_id",
              as: "receiver_Data",
            },
          },

          {
            $unwind: "$receiver_Data",
          },
          {
            $lookup: {
              from: "authentications",
              localField: "agency_id",
              foreignField: "_id",
              as: "sender_Data",
            },
          },

          {
            $unwind: "$sender_Data",
          },

          {
            $match: {
              _id: new mongoose.Types.ObjectId(agreementId),
              is_deleted: false,
            },
          },
          {
            $project: {
              _id: 1,
              first_name: "$receiver_Data.first_name",
              last_name: "$receiver_Data.last_name",
              email: "$receiver_Data.email",
              receiver: "$receiver_Data.name",
              receiver_email: "$receiver_Data.email",
              receiver_number: "$receiver_Data.contact_number",
              receiver_id: "$receiver_Data._id",
              contact_number: 1,
              sender: "$sender_Data.name",
              sender_email: "$sender_Data.email",
              sender_number: "$sender_Data.contact_number",
              sender_first_name: "$sender_Data.first_name",
              sender_last_name: "$sender_Data.last_name",
              sender_id: "$sender_Data._id",
              sender_id_notification: "$sender_Data.reference_id",

              sender_fullName: {
                $concat: [
                  "$sender_Data.first_name",
                  " ",
                  "$sender_Data.last_name",
                ],
              },
              receiver_fullName: {
                $concat: [
                  "$receiver_Data.first_name",
                  " ",
                  "$receiver_Data.last_name",
                ],
              },
              title: 1,
              status: 1,
              agreement_content: 1,
              due_date: 1,
            },
          },
        ];
        agreement = await Agreement.aggregate(aggregationPipeline);
        if (status === "sent" || status === "agreed") {
          var data = {
            title: agreement[0].title,
            dueDate: moment(agreement[0].due_date).format("DD/MM/YYYY"),
            content: agreement[0].agreement_content,
            receiverName: agreement[0].receiver_fullName,
            senderName: agreement[0].sender_fullName,
            status: status === "sent" ? "sent" : "agreed",
            senderNumber: agreement[0].sender_number,
            receiverNumber: agreement[0].receiver_number,
            senderEmail: agreement[0].sender_email,
            receiverEmail: agreement[0].receiver_email,
          };
          const ageremantMessage = agrementEmail(data);
          let templateName;
          let receiverName;
          if (status === "agreed") {
            templateName = "agreementAgreed";
            receiverName = agreement[0]?.sender_email;
          } else {
            templateName = "agreementUpdated";
            receiverName = clientDetails?.email;
          }
          await sendEmail({
            email: receiverName,
            subject: returnMessage("emailTemplate", templateName),
            message: ageremantMessage,
          });
        }

        // ----------------  Notification start    -----------------
        if (status === "sent") {
          await notificationService.addNotification(
            {
              receiver_name: agreement[0]?.receiver_fullName,
              sender_name: agreement[0]?.sender_fullName,
              sender_id: agreement[0]?.sender_id,
              title: agreement[0]?.title,
              module_name: "agreement",
              action_type: "create",
              receiver_id: clientDetails?.reference_id,
            },
            agreement[0]?._id
          );
        }

        // ----------------  Notification end    -----------------
      }

      const updatedAgreement = await Agreement.findOneAndUpdate(
        {
          _id: agreementId,
        },
        { status },
        { new: true, useFindAndModify: false }
      );

      // ----------------  Notification start    -----------------

      if (status === "agreed") {
        await notificationService.addNotification(
          {
            receiver_name: agreement[0]?.receiver_fullName,
            sender_name: agreement[0]?.sender_fullName,
            receiver_id: agreement[0]?.receiver_id,
            title: agreement[0]?.title,
            module_name: "agreement",
            action_type: "statusUpdate",
            sender_id: agreement[0]?.sender_id_notification,
          },
          agreement[0]?._id
        );
      }

      // ----------------  Notification end    -----------------

      return updatedAgreement;
    } catch (error) {
      logger.error(`Error while updating Agreement, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET Client Agreement agencyWise
  getAllClientAgreement = async (searchObj, client_id) => {
    let agency_id = searchObj.agency_id;

    agency_id = await Authentication.findOne({ reference_id: agency_id });
    try {
      const queryObj = {
        is_deleted: false,
        receiver: client_id,
        agency_id: agency_id,
        status: { $ne: "draft" }, // Exclude drafts
      };
      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            status: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
        }
      }

      const pagination = paginationObject(searchObj);
      const agreements = await Agreement.find(queryObj)
        .sort(pagination.sort)
        .skip(pagination.skip)
        .limit(pagination.result_per_page)
        .populate({
          path: "agency_id",
          model: "authentication",
          select: "name",
        });

      const totalAgreementsCount = await Agreement.countDocuments(queryObj);

      // Calculating total pages
      const pages = Math.ceil(
        totalAgreementsCount / pagination.result_per_page
      );

      return {
        agreements,
        page_count: pages,
      };
    } catch (error) {
      logger.error(`Error while Admin Agreement Listing, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  downloadPdf = async (id, res) => {
    try {
      const aggregationPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "receiver_Data",
          },
        },

        {
          $unwind: "$receiver_Data",
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "_id",
            as: "sender_Data",
          },
        },

        {
          $unwind: "$sender_Data",
        },

        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            is_deleted: false,
          },
        },
        {
          $project: {
            _id: 1,
            first_name: "$receiver_Data.first_name",
            last_name: "$receiver_Data.last_name",
            email: "$receiver_Data.email",
            receiver: "$receiver_Data.name",
            receiver_email: "$receiver_Data.email",
            receiver_number: "$receiver_Data.contact_number",
            receiver_id: "$receiver_Data._id",
            contact_number: 1,
            sender: "$sender_Data.name",
            sender_email: "$sender_Data.email",
            sender_number: "$sender_Data.contact_number",
            sender_first_name: "$sender_Data.first_name",
            sender_last_name: "$sender_Data.last_name",
            sender_id: "$sender_Data._id",
            sender_fullName: {
              $concat: [
                "$sender_Data.first_name",
                " ",
                "$sender_Data.last_name",
              ],
            },
            receiver_fullName: {
              $concat: [
                "$receiver_Data.first_name",
                " ",
                "$receiver_Data.last_name",
              ],
            },
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
          },
        },
      ];
      const agreement = await Agreement.aggregate(aggregationPipeline);

      let htmlTemplate = fs.readFileSync(`src/utils/Invoice.html`, "utf-8");

      htmlTemplate = htmlTemplate.replaceAll(
        "{{content}}",
        agreement[0]?.agreement_content
      );

      htmlTemplate = htmlTemplate.replaceAll(
        "{{url}}",
        `${process.env.SERVER_URL}/template/syncupp-logo.png`
      );

      htmlTemplate = htmlTemplate.replaceAll(
        "{{web_url}}",
        `${process.env.REACT_APP_URL}`
      );
      const company_urls = await Configuration.find().lean();
      // Compile the HTML template with Handlebars
      const template = Handlebars.compile(htmlTemplate);
      var data = {
        title: agreement[0]?.title,
        dueDate: moment(agreement[0]?.due_date)?.format("DD/MM/YYYY"),
        receiverName: agreement[0]?.receiver_fullName,
        senderName: agreement[0]?.sender_fullName,
        status: agreement[0]?.status,
        senderNumber: agreement[0]?.sender_number,
        receiverNumber: agreement[0]?.receiver_number,
        senderEmail: agreement[0]?.sender_email,
        receiverEmail: agreement[0]?.receiver_email,
        privacy_policy: company_urls[0]?.urls?.privacy_policy,
        facebook: company_urls[0]?.urls?.facebook,
        instagram: company_urls[0]?.urls?.instagram,
      };
      // Render the template with data
      const renderedHtml = template(data);

      // Convert the PDF to a buffer using html-pdf
      const pdfBuffer = await new Promise((resolve, reject) => {
        pdf.create(renderedHtml, { format: "A4" }).toBuffer((err, buffer) => {
          if (err) {
            reject(err);
          } else {
            resolve(buffer);
          }
        });
      });
      // res.writeHead(200, {
      //   "Content-Type": "application/pdf",
      // });
      // res.set({ "Content-Type": "application/pdf" });
      return pdfBuffer;
      // res.send(pdfBuffer);
    } catch (error) {
      console.error("Error while generating PDF:", error);
      throw error;
    }
  };
}

module.exports = AgreementService;
