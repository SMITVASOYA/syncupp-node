const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  capitalizeFirstLetter,
  boardTemplate,
  lowercaseFirstLetter,
} = require("../utils/utils");
const mongoose = require("mongoose");
const Authentication = require("../models/authenticationSchema");
const Board = require("../models/boardSchema");
const fs = require("fs");
const Task = require("../models/taskSchema");
const NotificationService = require("./notificationService");
const sendEmail = require("../helpers/sendEmail");
const Workspace = require("../models/workspaceSchema");
const Section = require("../models/sectionSchema");
const notificationService = new NotificationService();
const colorsData = require("../messages/colors.json");
const Role_Master = require("../models/masters/roleMasterSchema");
const AuthService = require("../services/authService");
const authService = new AuthService();

class BoardService {
  // Add   Board
  addBoard = async (payload, user, image) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;
      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }
      const { project_name, description, members } = payload;
      if (user?.role === "team_agency" && user?.sub_role !== "admin") {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      // Set agency id based on login user if user is Team member Admin role then find its agency
      let agency_id;
      if (user?.role === "team_agency" && user?.sub_role === "admin") {
        const workspace_data = await Workspace.findById(user?.workspace).lean();
        const agency_role_id = await Role_Master.findOne({
          name: "agency",
        }).lean();
        const find_agency = workspace_data?.members?.find(
          (user) => user.role.toString() === agency_role_id?._id.toString()
        );
        agency_id = find_agency?.user_id;
      } else if (user?.role === "agency") {
        agency_id = user?._id;
      }

      // Parse members data
      payload.members = JSON.parse(members);

      // If created by admin the push admin id and agency id in board
      payload.members?.push(user?._id);
      if (user?.role === "team_agency" && user?.sub_role === "admin") {
        payload.members?.push(user?._id.toString());
        payload.members?.push(agency_id.toString());
      }

      // If created by agency then push agency id in board
      if (user?.role === "agency") {
        payload.members?.push(agency_id.toString());
      }

      // Do not allow duplicate
      payload.members = [
        ...new Set(payload?.members?.map((member) => member.toString())),
      ].map((member) => new mongoose.Types.ObjectId(member));

      const member_objects = payload?.members?.map((member) => ({
        member_id: member,
      }));

      const board = await Board.findOne({
        project_name: lowercaseFirstLetter(project_name),
        workspace_id: user?.workspace,
      }).lean();
      if (board) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      // Image upload
      let image_path = false;
      if (image) {
        image_path = "uploads/" + image?.filename;
      } else if (image === "") {
        image_path = "";
      }

      if (payload?.board_image) {
        var is_image_exist = await Board.findOne({
          board_image: payload?.board_image,
        }).lean();
      }

      // Save Board
      const new_board = await Board.create({
        project_name: lowercaseFirstLetter(project_name),
        description,
        workspace_id: user.workspace,
        created_by: user?._id,
        members: member_objects,
        ...((image_path || image_path === "") && {
          board_image: image_path,
        }),
        ...(is_image_exist && {
          board_image: payload?.board_image,
        }),
        agency_id: agency_id,
      });

      await Section.create({
        section_name: "Pending",
        board_id: new_board?._id,
        is_deletable: false,
        sort_order: 1,
        color: "#FBF0DE",
        key: "pending",
        test_color: "#8C6825",
      }),
        await Section.create({
          section_name: "In Progress",
          board_id: new_board?._id,
          is_deletable: false,
          sort_order: 2,
          color: "#CBE3FB",
          key: "in_progress",
          test_color: "#43688D",
        }),
        await Section.create({
          section_name: "Overdue",
          board_id: new_board?._id,
          is_deletable: false,
          sort_order: 3,
          color: "#FFD4C6",
          key: "overdue",
          test_color: "#AC2D2D",
        }),
        await Section.create({
          section_name: "Completed",
          board_id: new_board?._id,
          is_deletable: false,
          key: "completed",
          sort_order: 4,
          color: "#E4F6D6",
          test_color: "#527C31",
        }),
        // ------------- Notifications -------------
        await notificationService.addNotification(
          {
            module_name: "board",
            // workspace_id: user?.workspace,
            members: payload?.members?.filter((item) => item !== user?._id),
            project_name: lowercaseFirstLetter(project_name),
            created_by_name:
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name),
          },
          new_board?._id
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
      // Validate board_id
      if (!mongoose.Types.ObjectId.isValid(board_id)) {
        return throwError(returnMessage("board", "invalidBoardId"));
      }
      const board_data = await Board.findById(board_id).lean();

      if (!board_data) {
        return throwError(returnMessage("board", "boardNotFound"));
      }
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
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;
      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      const { project_name, description, members, only_member_update } =
        payload;

      // Check Permission
      if (user?.role === "team_agency" && user?.sub_role !== "admin") {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      const existing_board = await Board.findById(board_id).lean();

      // Check Permission
      if (user?.role === "team_agency" && user?.sub_role === "admin") {
        const is_include = existing_board?.members
          .map((member) => member?.member_id.toString())
          .includes(user?._id.toString());
        if (!is_include)
          return throwError(returnMessage("auth", "insufficientPermission"));
      }

      // Parse members
      payload.members = JSON.parse(members);

      // If created by admin the push admin id and agency id in board
      if (user?.role === "team_agency" || user?.role === "agency") {
        payload?.members?.push(existing_board?.agency_id.toString());
        payload?.members?.push(existing_board?.created_by.toString());
      }

      // Do not allow duplicate
      payload.members = [
        ...new Set(payload?.members?.map((member) => member.toString())),
      ].map((member) => new mongoose.Types.ObjectId(member));

      // Add agency_id to members if not already included
      const updated_members = payload?.members?.map((member) => ({
        member_id: member,
      }));

      // check board name already exists
      const board = await Board.findOne({
        project_name: lowercaseFirstLetter(project_name),
        workspace_id: user?.workspace,
      }).lean();
      if (
        board &&
        board?._id.toString() !==
          new mongoose.Types.ObjectId(board_id).toString()
      ) {
        return throwError(returnMessage("board", "alreadyExist"));
      }

      const new_member = [];
      const removed_member = [];

      // Check new member added
      for (const member of payload?.members) {
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
          const task = await Task.findOne({
            board_id: board_id,
            assign_to: { $in: [member?.member_id] },
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

        // Check weather same image used in other board else do not delete
        const check_image = await Board.find({
          board_id: { $ne: board_id },
          board_image: existing_image?.board_image,
        }).lean();
        if (!check_image) {
          existing_image &&
            fs.unlink(`./src/public/${existing_image?.board_image}`, (err) => {
              if (err) {
                logger.error(`Error while unlinking the documents: ${err}`);
              }
            });
        }

        // Check weather existing image available then use the same
        if (payload?.board_image) {
          var is_image_exist = await Board.findOne({
            board_image: payload?.board_image,
          }).lean();
        }

        await Board.findByIdAndUpdate(
          board_id,
          {
            project_name: lowercaseFirstLetter(project_name),
            description,
            members: updated_members,
            ...(image_path && {
              board_image: image_path,
            }),
            ...(is_image_exist && {
              board_image: payload?.board_image,
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
      const elementsToRemove = [existing_board?.agency_id, user?._id];
      const actions = ["updated", "memberRemoved"];
      actions?.map(async (action) => {
        let member_list;
        let mail_subject;
        if (action === "updated") {
          member_list = new_member;
          mail_subject = "memberAddedBoard";
        }
        if (action === "memberRemoved") {
          member_list = removed_member;
          mail_subject = "memberRemovedBoard";
        }
        await notificationService.addNotification(
          {
            module_name: "board",
            workspace_id: user?.workspace,
            action_name: action,
            members: member_list?.filter(
              (item) => !elementsToRemove.includes(item)
            ),
            project_name: existing_board?.project_name,
            added_by:
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name),
          },
          board_id
        );

        const member_send_mail = member_list?.filter(
          (item) => !elementsToRemove.includes(item)
        );
        const board_template = boardTemplate({
          ...existing_board,
          added_by:
            capitalizeFirstLetter(user?.first_name) +
            " " +
            capitalizeFirstLetter(user?.last_name),
        });
        member_send_mail.map(async (member) => {
          const member_data = await Authentication.findOne({
            _id: member,
          }).lean();
          sendEmail({
            email: member_data?.email,
            subject: returnMessage("emailTemplate", mail_subject),
            message: board_template,
          });
        });
      });
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

      let query = {};

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
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
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
        }
        const pipeline = [
          {
            $match: {
              ...query,
              workspace_id: new mongoose.Types.ObjectId(user?.workspace),
            },
          },
          {
            $addFields: {
              members: {
                $filter: {
                  input: "$members",
                  as: "member",
                  cond: {
                    $eq: [
                      "$$member.member_id",
                      new mongoose.Types.ObjectId(user?._id),
                    ],
                  },
                },
              },
            },
          },
          {
            $unwind: { path: "$members", preserveNullAndEmptyArrays: true },
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
              created_by: 1,
            },
          },
        ];
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
        { _id: board_id, "members.member_id": user?._id },
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
          $match: { _id: new mongoose.Types.ObjectId(board_id) },
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
            from: "workspaces",
            localField: "member._id",
            foreignField: "_id",
            as: "member_workspaces",
          },
        },
        {
          $unwind: {
            path: "$member_workspaces",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $unwind: {
            path: "$member_workspaces.members",
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
            first_name: "$member.first_name",
            last_name: "$member.last_name",
            profile_image: "$member.profile_image",
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
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;
      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      const pipeline = [
        {
          $match: { _id: new mongoose.Types.ObjectId(user.workspace) },
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
            profile_image: "$userDetails.profile_image",
            first_name: "$userDetails.first_name",
            last_name: "$userDetails.last_name",
          },
        },
      ];
      const user_list = await Workspace.aggregate(pipeline);

      return user_list;
    } catch (error) {
      logger.error(`Error while user list fetch: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  fetchBoardImages = async (user) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;
      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }

      const board_images = await Board.find({
        workspace_id: user?.workspace,
      })
        .select("board_image")
        .lean();
      let images = [];
      if (board_images) {
        board_images.forEach((board) => {
          if (board?.board_image !== null && board.board_image !== undefined) {
            if (!images.includes(board.board_image)) {
              images.push(board.board_image);
            }
          }
        });
      }
      return images;
    } catch (error) {
      logger.error(`Error while fetch Board Images: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  addRemoveMember = async (payload, user) => {
    try {
      const user_role_data = await authService.getRoleSubRoleInWorkspace(user);
      user["role"] = user_role_data?.user_role;
      user["sub_role"] = user_role_data?.sub_role;
      if (
        user_role_data?.user_role !== "agency" &&
        user_role_data?.user_role !== "team_agency"
      ) {
        return throwError(returnMessage("auth", "insufficientPermission"));
      }
      const { board_id, member_id, action_name } = payload;

      const board_details = await Board.findById(board_id);

      if (action_name === "remove") {
        if (
          board_details.agency_id.toString() !== member_id.toString() &&
          board_details.created_by.toString() !== member_id.toString()
        ) {
          const task = await Task.findOne({
            board_id: board_id,
            assign_to: { $in: [member_id] },
          });
          if (task) {
            throwError(returnMessage("board", "canNotRemove"));
          }

          board_details.members = board_details.members.filter(
            (member) => member.member_id.toString() !== member_id
          );
          await board_details.save();
        }
      } else if (action_name === "add") {
        board_details.members.push({ member_id: member_id, is_pinned: false });
        await board_details.save();
      }

      return;
    } catch (error) {
      logger.error(`Error while fetch Add remove member in board: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = BoardService;
