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
const { default: mongoose } = require("mongoose");
const Handlebars = require("handlebars");
const pdf = require("html-pdf");
const moment = require("moment");
const NotificationService = require("./notificationService");
const Configuration = require("../models/configurationSchema");
const notificationService = new NotificationService();
const AuthService = require("../services/authService");
const authService = new AuthService();

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

      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      if (user_role_data?.user_role !== "agency") {
        return throwError(returnMessage("auth", "insufficientPermission"), 403);
      }

      const dueDate = moment.utc(due_date, "DD/MM/YYYY").utc();

      let client_data;
      if (receiver && receiver !== "undefined" && receiver !== "null") {
        client_data = await Authentication.findById(receiver).lean();
      }

      const update_data = {
        title,
        agreement_content,
        due_date: dueDate,
        status,
        ...(receiver && receiver !== "undefined" && { receiver: receiver }),
        agency_id: user?._id,
        workspace_id: user?.workspace,
      };

      const agreements = await Agreement.create(update_data);

      if (send === true) {
        const aggregationPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "receiver",
              foreignField: "_id",
              as: "receiver_data",
            },
          },

          {
            $unwind: "$receiver_data",
          },
          {
            $lookup: {
              from: "authentications",
              localField: "agency_id",
              foreignField: "_id",
              as: "sender_data",
            },
          },

          {
            $unwind: "$sender_data",
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
              first_name: "$receiver_data.first_name",
              last_name: "$receiver_data.last_name",
              email: "$receiver_data.email",
              receiver: "$receiver_data.name",
              receiver_email: "$receiver_data.email",
              receiver_number: "$receiver_data.contact_number",
              receiver_id: "$receiver_data._id",
              contact_number: 1,
              sender: "$sender_data.name",
              sender_email: "$sender_data.email",
              sender_number: "$sender_data.contact_number",
              sender_first_name: "$sender_data.first_name",
              sender_last_name: "$sender_data.last_name",
              sender_id: "$sender_data._id",
              sender_full_name: {
                $concat: [
                  "$sender_data.first_name",
                  " ",
                  "$sender_data.last_name",
                ],
              },
              receiver_full_name: {
                $concat: [
                  "$receiver_data.first_name",
                  " ",
                  "$receiver_data.last_name",
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
        if (client_data) {
          var data = {
            title: agreement[0]?.title,
            dueDate: moment(agreement[0]?.due_date).format("DD/MM/YYYY"),
            content: agreement[0]?.agreement_content,
            receiverName: agreement[0]?.receiver_full_name,
            senderName: agreement[0]?.sender_full_name,
            status: agreement[0]?.status,
            senderNumber: agreement[0]?.sender_number,
            receiverNumber: agreement[0]?.receiver_number,
            senderEmail: agreement[0]?.sender_email,
            receiverEmail: agreement[0]?.receiver_email,
          };
          const ageremant_message = agrementEmail(data);

          sendEmail({
            email: client_data?.email,
            subject: returnMessage("emailTemplate", "agreementReceived"),
            message: ageremant_message,
          });
        }

        await Agreement.findOneAndUpdate(
          { _id: agreements._id },
          { status: "sent" },
          { new: true }
        );
        payload.status = "sent";

        // ----------------  Notification start    -----------------
        if (client_data) {
          await notificationService.addNotification(
            {
              receiver_name: agreement[0]?.receiver_full_name,
              sender_name: agreement[0]?.sender_full_name,
              receiver_id: receiver,
              title,
              agreement_content,
              module_name: "agreement",
              action_type: "create",
              workspace_id: user?.workspace,
            },
            agreement[0]?._id
          );
        }
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
      const queryObj = {
        is_deleted: false,
        agency_id: user_id,
        ...(client_id && { receiver: new mongoose.Types.ObjectId(client_id) }),
      };

      // if (
      //   searchObj?.start_date !== null &&
      //   searchObj?.end_date !== null &&
      //   searchObj?.start_date !== undefined &&
      //   searchObj?.end_date !== undefined
      // ) {
      //   const parsedStartDate = moment.utc(searchObj?.start_date, "DD/MM/YYYY");
      //   searchObj.start_date = parsedStartDate.utc();
      //   const parsedEndDate = moment.utc(searchObj?.end_date, "DD/MM/YYYY");
      //   searchObj.end_date = parsedEndDate.utc();
      // }
      // // Add date range conditions for invoice date and due date
      // if (searchObj?.start_date && searchObj?.end_date) {
      //   queryObj.due_date = {
      //     $gte: new Date(searchObj?.start_date),
      //     $lte: new Date(searchObj?.end_date),
      //   };
      // }

      const filter = {
        $match: {},
      };
      if (searchObj?.client_name) {
        queryObj["agreement_data._id"] = new mongoose.Types.ObjectId(
          searchObj?.client_name
        );
      }
      if (searchObj?.status_name) {
        filter["$match"] = {
          ...filter["$match"],
          status: searchObj?.status_name,
        };
      }
      if (searchObj?.start_date && searchObj?.end_date) {
        queryObj.due_date = {
          $gte: new Date(searchObj?.start_date),
          $lte: new Date(searchObj?.end_date),
        };
      }

      if (searchObj?.search && searchObj?.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            status: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agreement_data.first_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "agreement_data.last_name": {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj?.search);
        if (keywordType === "date") {
          const dateKeyword = new Date(searchObj?.search);
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
            as: "agreement_data",
          },
        },

        {
          $unwind: {
            path: "$agreement_data",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            first_name: "$agreement_data.first_name",
            last_name: "$agreement_data.last_name",
            email: "$agreement_data.email",
            contact_number: 1,
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
            createdAt: 1,
            receiver: {
              $concat: [
                "$agreement_data.first_name",
                " ",
                "$agreement_data.last_name",
              ],
            },
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
      // Validate board_id
      if (!mongoose.Types.ObjectId.isValid(agreementId)) {
        return throwError(returnMessage("agreement", "agreementNotFound"));
      }
      const agreement_data = await Agreement.findById(agreementId).lean();

      if (!agreement_data) {
        return throwError(returnMessage("agreement", "agreementNotFound"));
      }

      const aggregationPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "receiver_data",
          },
        },
        {
          $unwind: {
            path: "$receiver_data",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "agency_id",
            foreignField: "_id",
            as: "sender_data",
          },
        },
        {
          $unwind: {
            path: "$sender_data",
            preserveNullAndEmptyArrays: true,
          },
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
            first_name: "$receiver_data.first_name",
            last_name: "$receiver_data.last_name",
            email: "$receiver_data.email",
            receiver: {
              $concat: [
                "$receiver_data.first_name",
                " ",
                "$receiver_data.last_name",
              ],
            },
            receiver_email: "$receiver_data.email",
            receiver_number: "$receiver_data.contact_number",
            receiver_id: "$receiver_data._id",
            contact_number: 1,
            // sender: "$sender_data.name",
            sender_email: "$sender_data.email",
            sender_number: "$sender_data.contact_number",
            sender_first_name: "$sender_data.first_name",
            sender_last_name: "$sender_data.last_name",
            sender_id: "$sender_data._id",
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

      if (payload?.due_date) {
        payload.due_date = moment.utc(payload?.due_date, "DD/MM/YYYY").utc();
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
            ...(!receiver || receiver === "null" || receiver === "undefined"
              ? {
                  receiver: null,
                }
              : { receiver: receiver }),
          },
          { new: true, useFindAndModify: false }
        );
      }
      let clientDetails;
      if (status === "sent") {
        if (receiver && receiver !== null) {
          clientDetails = await Authentication.findOne({
            _id: agreement?.receiver,
          }).lean();
        }
        // const agreement_detail = await this.getAgreement(agreementId);

        const aggregationPipeline = [
          {
            $lookup: {
              from: "authentications",
              localField: "receiver",
              foreignField: "_id",
              as: "receiver_data",
            },
          },
          {
            $unwind: {
              path: "$receiver_data",
              preserveNullAndEmptyArrays: true,
            },
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
            $unwind: {
              path: "$sender_Data",
              preserveNullAndEmptyArrays: true,
            },
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
              first_name: "$receiver_data.first_name",
              last_name: "$receiver_data.last_name",
              email: "$receiver_data.email",
              // receiver: "$receiver_data.name",
              receiver_email: "$receiver_data.email",
              receiver_number: "$receiver_data.contact_number",
              receiver_id: "$receiver_data._id",
              contact_number: 1,
              // sender: "$sender_Data.name",
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
                  "$receiver_data.first_name",
                  " ",
                  "$receiver_data.last_name",
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

      const update_date = {
        title,
        agreement_content,
        due_date: payload.due_date,
        status,
        ...(!receiver || receiver === "null" || receiver === "undefined"
          ? {
              receiver: null,
            }
          : { receiver: receiver }),
      };

      if (agreement.status === "draft") {
        const dueDate = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
        const updatedAgreement = await Agreement.findByIdAndUpdate(
          {
            _id: agreementId,
          },
          update_date,
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

      let clientDetails;
      if (agreements?.receiver) {
        clientDetails = await Authentication.findOne({
          _id: agreements.receiver,
        }).lean();
      }
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
          $unwind: {
            path: "$receiver_Data",
            preserveNullAndEmptyArrays: true,
          },
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
          $unwind: {
            path: "$sender_Data",
            preserveNullAndEmptyArrays: true,
          },
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
            // receiver: "$receiver_Data.name",
            receiver_email: "$receiver_Data.email",
            receiver_number: "$receiver_Data.contact_number",
            receiver_id: "$receiver_Data._id",
            contact_number: 1,
            // sender: "$sender_Data.name",
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

      if (clientDetails) {
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
      }

      if (agreements.status === "sent" || agreements.status === "draft") {
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

      // ----------------  Notification start    -----------------

      if (agreements.status === "draft" && clientDetails) {
        await notificationService.addNotification(
          {
            receiver_name: agreement[0]?.receiver_fullName,
            sender_name: agreement[0]?.sender_fullName,
            receiver_id: clientDetails?._id,
            title: agreement[0]?.title,
            module_name: "agreement",
            action_type: "create",
            workspace_id: user?.workspace,
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
      let clientDetails;

      if (status === "sent" || status === "agreed") {
        const agreements = await Agreement.findOne({
          _id: agreementId,
          is_deleted: false,
        }).lean();

        if (agreements?.receiver && agreements?.receiver !== null) {
          clientDetails = await Authentication.findOne({
            _id: agreements?.receiver,
          }).lean();
        }

        if (clientDetails) {
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
              $unwind: {
                path: "$receiver_Data",
                preserveNullAndEmptyArrays: true,
              },
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
              $unwind: {
                path: "$sender_Data",
                preserveNullAndEmptyArrays: true,
              },
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
                // receiver: "$receiver_Data.name",
                receiver_email: "$receiver_Data.email",
                receiver_number: "$receiver_Data.contact_number",
                receiver_id: "$receiver_Data._id",
                contact_number: 1,
                // sender: "$sender_Data.name",
                sender_email: "$sender_Data.email",
                sender_number: "$sender_Data.contact_number",
                sender_first_name: "$sender_Data.first_name",
                sender_last_name: "$sender_Data.last_name",
                sender_id: "$sender_Data._id",
                sender_id_notification: "$sender_Data._id",

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
                receiver_id: clientDetails?._id,
                workspace_id: user?.workspace,
              },
              agreement[0]?._id
            );
          }

          // ----------------  Notification end    -----------------
        }
      }

      const updatedAgreement = await Agreement.findOneAndUpdate(
        {
          _id: agreementId,
        },
        { status },
        { new: true, useFindAndModify: false }
      );

      // ----------------  Notification start    -----------------

      if (status === "agreed" && clientDetails) {
        await notificationService.addNotification(
          {
            receiver_name: agreement[0]?.receiver_fullName,
            sender_name: agreement[0]?.sender_fullName,
            receiver_id: agreement[0]?.receiver_id,
            title: agreement[0]?.title,
            module_name: "agreement",
            action_type: "statusUpdate",
            sender_id: agreement[0]?.sender_id_notification,
            workspace_id: user?.workspace,
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
  getAllClientAgreement = async (searchObj, user) => {
    try {
      const queryObj = {
        is_deleted: false,
        receiver: user?._id,
        workspace_id: new mongoose.Types.ObjectId(user?.workspace),
        status: { $ne: "draft" }, // Exclude drafts
      };
      const filter = {
        $match: {},
      };
      if (searchObj?.status_name) {
        filter["$match"] = {
          ...filter["$match"],
          status: searchObj?.status_name,
        };
      }
      if (searchObj?.start_date && searchObj?.end_date) {
        queryObj.due_date = {
          $gte: new Date(searchObj?.start_date),
          $lte: new Date(searchObj?.end_date),
        };
      }

      if (searchObj?.search && searchObj?.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            status: {
              $regex: searchObj?.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj?.search);
        if (keywordType === "date") {
          const dateKeyword = new Date(searchObj?.search);
          queryObj["$or"].push({ due_date: dateKeyword });
        }
      }

      // const pagination = paginationObject(searchObj);
      // const agreements = await Agreement.find(queryObj)
      //   .sort(pagination.sort)
      //   .skip(pagination.skip)
      //   .limit(pagination.result_per_page)
      //   .populate({
      //     path: "agency_id",
      //     model: "authentication",
      //     select: "first_name last_name",
      //   });

      // const totalAgreementsCount = await Agreement.countDocuments(queryObj);

      // // Calculating total pages
      // const pages = Math.ceil(
      //   totalAgreementsCount / pagination.result_per_page
      // );

      // return {
      //   agreements,
      //   page_count: pages,
      // };
      const pagination = paginationObject(searchObj);
      const aggregationPipeline = [
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "agreement_data",
          },
        },

        {
          $unwind: {
            path: "$agreement_data",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            first_name: "$agreement_data.first_name",
            last_name: "$agreement_data.last_name",
            email: "$agreement_data.email",
            contact_number: 1,
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
            createdAt: 1,
            receiver: {
              $concat: [
                "$agreement_data.first_name",
                " ",
                "$agreement_data.last_name",
              ],
            },
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
          $unwind: {
            path: "$receiver_Data",
            preserveNullAndEmptyArrays: true,
          },
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
          $unwind: {
            path: "$sender_Data",
            preserveNullAndEmptyArrays: true,
          },
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
