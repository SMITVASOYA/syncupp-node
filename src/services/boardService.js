const Invoice = require("../models/invoiceSchema");
const Invoice_Status_Master = require("../models/masters/invoiceStatusMaster");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, invoiceTemplate } = require("../utils/utils");
const Client = require("../models/clientSchema");
const { ObjectId } = require("mongodb");

const { paginationObject, getKeywordType } = require("../utils/utils");
const statusCode = require("../messages/english.json");
const Authentication = require("../models/authenticationSchema");
const NotificationService = require("./notificationService");
const notificationService = new NotificationService();
const moment = require("moment");
const Board = require("../models/boardSchema");
const { json } = require("express");
const fs = require("fs");

class BoardService {
  // Add   Board
  addBoard = async (payload, user, image) => {
    try {
      const { project_name, description, members } = payload;
      payload.members = JSON.parse(members);
      payload.members.push(user?.reference_id);
      const board = await Board.findOne({ project_name: project_name });

      if (board) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      let imagePath = false;
      if (image) {
        imagePath = "uploads/" + image.filename;
      } else if (image === "") {
        imagePath = "";
      }
      const newBoard = await Board.create({
        project_name,
        description,
        members: payload.members,
        ...((imagePath || imagePath === "") && {
          board_image: imagePath,
        }),
        agency_id: user?.reference_id,
      });

      return newBoard;
    } catch (error) {
      logger.error(`Error while  create Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update   Board
  updateBoard = async (payload, boardId, user, image) => {
    try {
      const { project_name, description, members } = payload;
      payload.members = JSON.parse(members);
      if (!payload.members.includes(user.reference_id)) {
        payload.members.push(user?.reference_id);
      }
      const board = await Board.findOne({ project_name: project_name });
      if (board && board?._id.toString() !== new ObjectId(boardId).toString()) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      let imagePath = false;
      if (image) {
        imagePath = "uploads/" + image.filename;
      } else if (image === "") {
        imagePath = "";
      }
      const existingImage = await Board.findById(boardId);
      existingImage &&
        fs.unlink(`./src/public/${existingImage.board_image}`, (err) => {
          if (err) {
            logger.error(`Error while unlinking the documents: ${err}`);
          }
        });

      const newBoard = await Board.findByIdAndUpdate(
        boardId,
        {
          project_name,
          description,
          members: payload.members,
          ...((imagePath || imagePath === "") && {
            board_image: imagePath,
          }),
          agency_id: user?.reference_id,
        },
        { new: true }
      );

      return newBoard;
    } catch (error) {
      logger.error(`Error while  update Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Boards

  listBoards = async (searchObj, user) => {
    try {
      const memberRoleId = await Team_Agency.findById(req?.user?.reference_id);
      const memberRoleType = await Team_Role_Master.findById(
        memberRoleId?.role
      );

      if (memberRoleType?.name === "admin") {
        invoicesList = await invoiceService.getAllInvoice(
          req.body,
          memberRoleId?.agency_id
        );
      }

      const { skip, limit } = searchObj;
      const boards = await Board.find({
        ...(user &&
          user.role.name === "agency" && {
            agency_id: user.reference_id,
          }),
        ...(user &&
          (user.role.name === "client" || user.role.name === "team_client") && {
            members: user.reference_id,
          }),
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return boards;
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = BoardService;
