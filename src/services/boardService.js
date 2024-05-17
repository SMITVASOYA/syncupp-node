const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  capitalizeFirstLetter,
  boardTemplate,
} = require("../utils/utils");
const { ObjectId } = require("mongodb");
const Authentication = require("../models/authenticationSchema");
const Board = require("../models/boardSchema");
const fs = require("fs");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Role_Master = require("../models/masters/teamRoleSchema");
const Activity = require("../models/activitySchema");
const NotificationService = require("./notificationService");
const sendEmail = require("../helpers/sendEmail");
const Workspace = require("../models/workspaceSchema");
const notificationService = new NotificationService();

class BoardService {
  // Add   Board
  addBoard = async (payload, user, image) => {
    try {
      const { project_name, description, members } = payload;
      // const member_role_id = await Team_Agency.findById(
      //   user?.reference_id
      // ).lean();
      // const member_role_type = await Team_Role_Master.findById(
      //   member_role_id?.role
      // ).lean();
      // const member_agency = await Authentication.findOne({
      //   _id: member_role_id?.agency_id,
      // }).lean();

      // if (member_role_type?.name !== "admin" && user?.role?.name !== "agency") {
      //   return throwError(returnMessage("auth", "insufficientPermission"));
      // }

      payload.members = JSON.parse(members);
      payload.members?.push(user?._id);
      // if (member_agency) payload.members?.push(member_agency?.reference_id);
      payload.members = [...new Set(payload.members)];

      const member_objects = payload.members?.map((member) => ({
        member_id: member,
      }));

      const board = await Board.findOne({ project_name: project_name }).lean();
      if (board) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      let image_path = false;
      if (image) {
        image_path = "uploads/" + image.filename;
      } else if (image === "") {
        image_path = "";
      }

      if (payload?.board_image) {
        var is_image_exist = await Board.findOne({
          board_image: payload?.board_image,
        }).lean();
      }
      const new_board = await Board.create({
        project_name,
        description,
        workspace_id: user.workspace,
        members: member_objects,
        ...((image_path || image_path === "") && {
          board_image: image_path,
        }),
        ...(is_image_exist && {
          board_image: payload?.board_image,
        }),
        agency_id: user?._id,
      });

      // ------------- Notifications -------------
      await notificationService.addNotification(
        {
          module_name: "board",
          members: payload?.members?.filter((item) => item !== user?._id),
          project_name: project_name,
          created_by_name:
            capitalizeFirstLetter(user?.first_name) +
            " " +
            capitalizeFirstLetter(user?.last_name),
        },
        new_board._id
      );

      const member_send_mail = payload?.members?.filter(
        (item) => item !== user?._id
      );
      const board_template = boardTemplate({
        project_name: project_name,
        description: description,
        added_by:
          capitalizeFirstLetter(user?.first_name) +
          " " +
          capitalizeFirstLetter(user?.last_name),
      });
      member_send_mail.map(async (member) => {
        const member_data = await Authentication.findOne({
          _id: member,
        });
        sendEmail({
          email: member_data?.email,
          subject: returnMessage("emailTemplate", "memberAddedBoard"),
          message: board_template,
        });
      });
      // ------------- Notifications -------------

      return;
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

      // const member_role_id = await Team_Agency.findById(
      //   user?.reference_id
      // ).lean();
      // const member_role_type = await Team_Role_Master.findById(
      //   member_role_id?.role
      // ).lean();

      // if (member_role_type?.name === "admin") {
      //   const is_include = existing_board?.members
      //     .map((member) => member?.member_id.toString())
      //     .includes(user?.reference_id.toString());
      //   if (!is_include)
      //     return throwError(returnMessage("auth", "insufficientPermission"));
      // }

      if (existing_board) {
        payload.members?.push(existing_board?.agency_id);
      }
      if (!payload.members?.includes(user?._id)) {
        payload.members?.push(user?._id);
      }

      payload.members = [
        ...new Set(payload.members?.map((member) => member.toString())),
      ].map((member) => new ObjectId(member));

      // Add agency_id to members if not already included
      const updated_members = payload.members?.map((member) => ({
        member_id: member,
      }));
      const agency_member = { member_id: user?._id };

      if (!payload.members?.map((member) => member === user?._id)) {
        updated_members?.push(agency_member);
      }

      // check board name already exists
      const board = await Board.findOne({ project_name: project_name }).lean();
      if (
        board &&
        board?._id.toString() !== new ObjectId(board_id).toString()
      ) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      const new_member = [];
      const removed_member = [];

      // Check new member added
      for (const member of payload.members) {
        const is_include = existing_board?.members
          .map((existingMember) => String(existingMember.member_id))
          .includes(String(member));
        if (!is_include) {
          new_member.push(member);
        }
      }

      // Check task assigned
      for (const member of existing_board?.members) {
        const is_include = payload.members
          .map(String)
          .includes(String(member?.member_id));
        if (!is_include) {
          removed_member.push(member?.member_id);
          const task = await Activity.findOne({
            $or: [
              {
                $and: [
                  { assign_by: member?.member_id },
                  {
                    board_id: board_id,
                  },
                ],
              },
              {
                $and: [
                  { client_id: member?.member_id },
                  {
                    board_id: board_id,
                  },
                ],
              },
              {
                $and: [
                  { assign_to: member?.member_id },
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
          image_path = "uploads/" + image?.filename;
        } else if (image === "") {
          image_path = "";
        }
        const existing_image = await Board.findById(board_id).lean();
        existing_image &&
          fs.unlink(`./src/public/${existing_image?.board_image}`, (err) => {
            if (err) {
              logger.error(`Error while unlinking the documents: ${err}`);
            }
          });

        await Board.findByIdAndUpdate(
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
      } else {
        await Board.findByIdAndUpdate(
          board_id,
          {
            members: updated_members,
          },
          { new: true }
        );
      }

      // ------------- Notifications -------------
      // const elementsToRemove = [existing_board?.agency_id, user?._id];
      // const actions = ["updated", "memberRemoved"];
      // actions?.map(async (action) => {
      //   let member_list;
      //   let mail_subject;
      //   if (action === "updated") {
      //     member_list = new_member;
      //     mail_subject = "memberAddedBoard";
      //   }
      //   if (action === "memberRemoved") {
      //     member_list = removed_member;
      //     mail_subject = "memberRemovedBoard";
      //   }
      //   await notificationService.addNotification(
      //     {
      //       module_name: "board",
      //       action_name: action,
      //       members: member_list?.filter(
      //         (item) => !elementsToRemove.includes(item)
      //       ),
      //       project_name: existing_board?.project_name,
      //       added_by:
      //         capitalizeFirstLetter(user?.first_name) +
      //         " " +
      //         capitalizeFirstLetter(user?.last_name),
      //     },
      //     board_id
      //   );

      //   const member_send_mail = member_list?.filter(
      //     (item) => !elementsToRemove.includes(item)
      //   );
      //   const board_template = boardTemplate({
      //     ...existing_board,
      //     added_by:
      //       capitalizeFirstLetter(user?.first_name) +
      //       " " +
      //       capitalizeFirstLetter(user?.last_name),
      //   });
      //   member_send_mail.map(async (member) => {
      //     const member_data = await Authentication.findOne({
      //       reference_id: member,
      //     });
      //     sendEmail({
      //       email: member_data?.email,
      //       subject: returnMessage("emailTemplate", mail_subject),
      //       message: board_template,
      //     });
      //   });
      // });
      // ------------- Notifications -------------

      return;
    } catch (error) {
      logger.error(`Error while  update Board, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Boards

  listBoards = async (search_obj, user) => {
    try {
      const { skip = 0, limit = 5, all, agency_id, sort } = search_obj;

      let query = {
        ...((user?.role === "client" || user?.role === "team_client") && {
          agency_id: new ObjectId(agency_id),
        }),
      };

      if (user) {
        if (user?.role === "agency") {
          query.agency_id = user?._id;
        } else {
          query["members.member_id"] = user?._id;
        }
      }

      if (all) {
        const pipeline = [
          {
            $match: {
              ...query,
              workspace_id: new ObjectId(user.workspace),
            },
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
        const pipeline = [
          {
            $match: {
              ...query,
              workspace_id: new ObjectId(user.workspace),
            },
          },
          {
            $unwind: "$members",
          },
          {
            $match: {
              "members.member_id": user?._id,
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
              workspace_id: 1,
            },
          },
        ];
        console.log(sort);
        let sort_by = {
          is_pinned: -1,
          createdAt: -1,
        };
        if (sort === "newest") {
          sort_by = {
            is_pinned: -1,
            createdAt: -1,
          };
        } else if (sort === "oldest") {
          sort_by = {
            is_pinned: -1,
            createdAt: 1,
          };
        } else if (sort === "asc") {
          sort_by = {
            is_pinned: -1,
            project_name: 1,
          };
        } else if (sort === "desc") {
          sort_by = {
            is_pinned: -1,
            project_name: -1,
          };
        } else {
          // Default sorting if no sort option is provided
          sort_by = await Board.aggregate(pipeline).sort({
            is_pinned: -1,
            createdAt: -1,
          });
        }

        const [boards, total_board_count] = await Promise.all([
          Board.aggregate(pipeline).sort(sort_by).skip(skip).limit(limit),
          Board.aggregate(pipeline),
        ]);

        return {
          board_list: boards,
          total_board_count: Math.ceil(total_board_count.length) || 0,
        };
      }
    } catch (error) {
      logger.error(`Error while listing boards: ${error}`);
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
            foreignField: "_id",
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
            role: "$status_name.name",
            id: "$member._id",
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

  allUserList = async (user) => {
    try {
      const pipeline = [
        {
          $match: { _id: new ObjectId(user.workspace) },
        },

        {
          $lookup: {
            from: "authentications",
            localField: "members.user_id",
            foreignField: "_id",
            as: "userDetails",
          },
        },

        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: "authentications",
            localField: "members.client_id",
            foreignField: "_id",
            as: "clientDetails",
          },
        },

        {
          $unwind: {
            path: "$clientDetails",
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
          $project: {
            _id: 0,
            user_name: {
              $concat: [
                { $toUpper: { $substrCP: ["$userDetails.first_name", 0, 1] } },
                {
                  $substrCP: [
                    "$userDetails.first_name",
                    1,
                    { $strLenCP: "$userDetails.first_name" },
                  ],
                },
                " ",
                { $toUpper: { $substrCP: ["$userDetails.last_name", 0, 1] } },
                {
                  $substrCP: [
                    "$userDetails.last_name",
                    1,
                    { $strLenCP: "$userDetails.last_name" },
                  ],
                },
              ],
            },
            role: "$status_name.name",
            user_id: "$userDetails._id",
            client_id: "$clientDetails._id",
          },
        },
      ];
      const user_list = await Workspace.aggregate(pipeline);
      return user_list;
    } catch (error) {
      logger.error(`Error while member list fetch: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchBoardImages = async (user) => {
    try {
      const board_images = await Board.find({
        workspace_id: "66445f8ddd707e8e9544e01c",
      })
        .select("board_image")
        .lean();
      let images = [];
      if (board_images) {
        board_images.forEach((board) => {
          if (board?.board_image !== null && board.board_image !== undefined) {
            images.push(board.board_image);
          }
        });
      }
      return images;
    } catch (error) {
      logger.error(`Error while fetch Board Images: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  addRemoveMember = async (payload) => {
    try {
      const { board_id, member_id, action_name } = payload;

      const board_details = await Board.findById(board_id);

      if (action_name === "remove") {
        board_details.members = board_details.members.filter(
          (member) => member.member_id.toString() !== member_id
        );
      }
      if (action_name === "add") {
        board_details.members.push({ member_id: member_id, is_pinned: false });
      }

      await board_details.save();
      return;
    } catch (error) {
      logger.error(`Error while fetch Add remove member in board: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = BoardService;
