const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage } = require("../utils/utils");
const { ObjectId } = require("mongodb");
const Authentication = require("../models/authenticationSchema");
const Board = require("../models/boardSchema");
const fs = require("fs");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Role_Master = require("../models/masters/teamRoleSchema");
const Activity = require("../models/activitySchema");

class BoardService {
  // Add   Board
  addBoard = async (payload, user, image) => {
    try {
      const { project_name, description, members } = payload;
      const member_role_id = await Team_Agency.findById(user?.reference_id);
      const member_role_type = await Team_Role_Master.findById(
        member_role_id?.role
      );
      const member_agency = await Authentication.findOne({
        reference_id: member_role_id?.agency_id,
      });

      if (member_role_type?.name !== "admin" && user?.role?.name !== "agency") {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      payload.members = JSON.parse(members);
      payload.members.push(user?.reference_id);
      if (member_agency) payload.members.push(member_agency?.reference_id);
      payload.members = [...new Set(payload.members)];

      const member_objects = payload?.members.map((member) => ({
        member_id: member,
      }));

      const board = await Board.findOne({ project_name: project_name });
      if (board) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      let image_path = false;
      if (image) {
        image_path = "uploads/" + image.filename;
      } else if (image === "") {
        image_path = "";
      }
      const new_board = await Board.create({
        project_name,
        description,
        members: member_objects,
        ...((image_path || image_path === "") && {
          board_image: image_path,
        }),
        agency_id: member_agency
          ? member_agency.reference_id
          : user?.reference_id,
      });

      return new_board;
    } catch (error) {
      logger.error(`Error while  create Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Get   Board
  getBoard = async (board_id) => {
    try {
      const board = await Board.findById(board_id)
        .select("-createdAt -updatedAt -__v")
        .lean();
      return board;
    } catch (error) {
      logger.error(`Error while  Board fetched, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update   Board
  updateBoard = async (payload, board_id, user, image) => {
    try {
      const { project_name, description, members, only_member_update } =
        payload;
      payload.members = JSON.parse(members);

      const existing_board = await Board.findById(board_id).lean();

      const member_role_id = await Team_Agency.findById(user?.reference_id);
      const member_role_type = await Team_Role_Master.findById(
        member_role_id?.role
      );

      if (member_role_type?.name === "admin") {
        const is_include = existing_board.members
          .map((member) => member.member_id.toString())
          .includes(user?.reference_id.toString());
        if (!is_include)
          return throwError(returnMessage("auth", "insufficientPermission"));
      }

      if (existing_board) {
        payload.members.push(existing_board?.agency_id);
      }
      if (!payload.members.includes(user.reference_id)) {
        payload.members.push(user?.reference_id);
      }

      payload.members = [
        ...new Set(payload.members.map((member) => member.toString())),
      ].map((member) => new ObjectId(member));

      // Add agency_id to members if not already included
      const updated_members = payload?.members.map((member) => ({
        member_id: member,
      }));
      const agency_member = { member_id: user.reference_id };

      if (!payload?.members.map((member) => member === user.reference_id)) {
        updated_members.push(agency_member);
      }

      const board = await Board.findOne({ project_name: project_name });

      if (
        board &&
        board?._id.toString() !== new ObjectId(board_id).toString()
      ) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      // Check task assigned
      for (const member of existing_board.members) {
        const is_include = payload.members
          .map(String)
          .includes(String(member.member_id));
        if (!is_include) {
          const task = await Activity.findOne({
            $or: [
              {
                $and: [
                  { assign_by: member.member_id },
                  {
                    board_id: board_id,
                  },
                ],
              },
              {
                $and: [
                  { client_id: member.member_id },
                  {
                    board_id: board_id,
                  },
                ],
              },
              {
                $and: [
                  { assign_to: member.member_id },
                  {
                    board_id: board_id,
                  },
                ],
              },
            ],
          });
          if (task) {
            throwError(returnMessage("board", "canNotRemove"));
          }
        }
      }
      if (only_member_update === "false") {
        let image_path = false;
        if (image) {
          image_path = "uploads/" + image.filename;
        } else if (image === "") {
          image_path = "";
        }
        const existing_image = await Board.findById(board_id);
        existing_image &&
          fs.unlink(`./src/public/${existing_image.board_image}`, (err) => {
            if (err) {
              logger.error(`Error while unlinking the documents: ${err}`);
            }
          });

        const new_board = await Board.findByIdAndUpdate(
          board_id,
          {
            project_name,
            description,
            members: updated_members,
            ...(image_path && {
              board_image: image_path,
            }),
          },
          { new: true }
        );

        return new_board;
      } else {
        const new_board = await Board.findByIdAndUpdate(
          board_id,
          {
            members: updated_members,
          },
          { new: true }
        );

        return new_board;
      }
    } catch (error) {
      logger.error(`Error while  update Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Boards

  listBoards = async (search_obj, user) => {
    try {
      const { skip = 0, limit = 5, all, project_name, agency_id } = search_obj;

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
        return { board_list: boards };
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

        const [boards, total_board_count] = await Promise.all([
          Board.aggregate(pipeline)
            .sort({
              ...(project_name
                ? { project_name: 1 }
                : { is_pinned: -1, createdAt: -1 }),
            })
            .skip(skip)
            .limit(limit),
          Board.aggregate(pipeline),
        ]);

        return {
          board_list: boards,
          total_board_count: Math.ceil(total_board_count.length) || 0,
        };
      }
    } catch (error) {
      logger.error(`Error while fetching agencies: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  changePinStatus = async (payload, user) => {
    try {
      const { is_pinned, board_id } = payload;
      const updated_board = await Board.updateOne(
        { _id: board_id, "members.member_id": user?.reference_id },
        { $set: { "members.$.is_pinned": is_pinned } },
        { new: true }
      );
      return updated_board;
    } catch (error) {
      logger.error(`Error while change pin status: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  memberList = async (board_id) => {
    try {
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
              $concat: [
                { $toUpper: { $substrCP: ["$member.first_name", 0, 1] } },
                {
                  $substrCP: [
                    "$member.first_name",
                    1,
                    { $strLenCP: "$member.first_name" },
                  ],
                },
                " ",
                { $toUpper: { $substrCP: ["$member.last_name", 0, 1] } },
                {
                  $substrCP: [
                    "$member.last_name",
                    1,
                    { $strLenCP: "$member.last_name" },
                  ],
                },
              ],
            },
            role: "$statusName.name",
            reference_id: "$member.reference_id",
          },
        },
      ];
      const member_list = await Board.aggregate(pipeline);
      return member_list;
    } catch (error) {
      logger.error(`Error while member list fetch: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = BoardService;
