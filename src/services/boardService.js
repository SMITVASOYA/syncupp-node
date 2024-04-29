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
const Team_Agency = require("../models/teamAgencySchema");
const Team_Role_Master = require("../models/masters/teamRoleSchema");

class BoardService {
  // Add   Board
  addBoard = async (payload, user, image) => {
    try {
      const { project_name, description, members } = payload;

      const memberRoleId = await Team_Agency.findById(user?.reference_id);
      const memberRoleType = await Team_Role_Master.findById(
        memberRoleId?.role
      );
      const memberAgency = await Authentication.findOne({
        reference_id: memberRoleId?.agency_id,
      });

      if (memberRoleType?.name !== "admin" && user?.role?.name !== "agency") {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      payload.members = JSON.parse(members);
      payload.members.push(user?.reference_id);
      if (memberAgency) payload.members.push(memberAgency?.reference_id);
      payload.members = [...new Set(payload.members)];

      const memberObjects = payload?.members.map((member) => ({
        member_id: member,
      }));

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
        members: memberObjects,
        ...((imagePath || imagePath === "") && {
          board_image: imagePath,
        }),
        agency_id: memberAgency
          ? memberAgency.reference_id
          : user?.reference_id,
      });

      return newBoard;
    } catch (error) {
      logger.error(`Error while  create Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Get   Board
  getBoard = async (user, board_id) => {
    try {
      const board = await Board.findById(board_id);
      return board;
    } catch (error) {
      logger.error(`Error while  Board fetched, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update   Board
  updateBoard = async (payload, boardId, user, image) => {
    try {
      const { project_name, description, members } = payload;
      payload.members = JSON.parse(members);

      const existingBoard = await Board.findById(boardId);
      if (existingBoard) {
        payload.members.push(existingBoard?.agency_id);
      }
      if (!payload.members.includes(user.reference_id)) {
        payload.members.push(user?.reference_id);
      }
      payload.members = [...new Set(payload.members)];
      console.log(payload.members);
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
      // const memberRoleId = await Team_Agency.findById(user?.reference_id);
      // const memberRoleType = await Team_Role_Master.findById(
      //   memberRoleId?.role
      // );

      const { skip = 0, limit = 5, all } = searchObj;

      if (all) {
        let query = {};

        if (user) {
          if (user.role.name === "agency") {
            query.agency_id = user.reference_id;
          } else {
            query["members.member_id"] = user.reference_id;
          }
        }

        const pipeline = [
          {
            $match: query,
          },

          {
            $project: {
              project_name: 1,
              createdAt: 1,
            },
          },
        ];
        const boards = await Board.aggregate(pipeline).sort({ createdAt: -1 });
        return boards;
      } else {
        let query = {};

        if (user) {
          if (user.role.name === "agency") {
            query.agency_id = user.reference_id;
          } else {
            query["members.member_id"] = user.reference_id;
          }
        }

        const pipeline = [
          {
            $match: query,
          },
          {
            $unwind: "$members",
          },
          {
            $match: {
              "members.member_id": user.reference_id,
            },
          },
          {
            $project: {
              project_name: 1,
              description: 1,
              board_image: 1,
              agency_id: 1,
              is_pinned: "$members.is_pinned",
              createdAt: 1,
            },
          },
        ];

        const boards = await Board.aggregate(pipeline)
          .sort({ is_pinned: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit);

        return boards;
      }
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  changePinStatus = async (payload, user) => {
    try {
      const { is_pinned, board_id } = payload;
      const updatedBoard = await Board.updateOne(
        { _id: board_id, "members.member_id": user?.reference_id },
        { $set: { "members.$.is_pinned": is_pinned } },
        { new: true }
      );
      return updatedBoard;
    } catch (error) {
      logger.error(`Error while change pin status: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  memberList = async (board_id, user) => {
    try {
      console.log(board_id);
      // const updatedBoard = await Board.updateOne(
      //   { _id: board_id, "members.member_id": user?.reference_id },
      //   { $set: { "members.$.is_pinned": is_pinned } },
      //   { new: true }
      // );
      const pipeline = [
        {
          $match: { _id: new ObjectId(board_id) },
        },
        {
          $unwind: "$members",
        },

        {
          $lookup: {
            from: "authentications",
            localField: "members.member_id",
            foreignField: "reference_id",
            as: "member",
          },
        },
        {
          $unwind: {
            path: "$member",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "role_masters",
            localField: "member.role",
            foreignField: "_id",
            as: "statusName",
          },
        },
        {
          $unwind: {
            path: "$statusName",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            member_name: {
              $concat: ["$member.first_name", " ", "$member.last_name"],
            },
            role: "$statusName.name",
            reference_id: "$member.reference_id",
          },
        },
      ];
      const memberList = await Board.aggregate(pipeline);
      return memberList;
    } catch (error) {
      logger.error(`Error while member list fetch: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = BoardService;
