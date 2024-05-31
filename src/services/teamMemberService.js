const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  validateEmail,
  validateRequestFields,
  paginationObject,
  welcomeMail,
  capitalizeFirstLetter,
  memberDeletedTemplate,
  memberDeletedClient,
  clientMemberAdded,
  teamMemberPasswordSet,
  invitationEmail,
  templateMaker,
} = require("../utils/utils");
const statusCode = require("../messages/statusCodes.json");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendEmail = require("../helpers/sendEmail");
const Authentication = require("../models/authenticationSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Role_Master = require("../models/masters/teamRoleSchema");
const Team_Client = require("../models/teamClientSchema");
const { ObjectId } = require("mongoose");
const Agency = require("../models/agencySchema");
const AuthService = require("./authService");
const authService = new AuthService();
const Activity_Status = require("../models/masters/activityStatusMasterSchema");
const Activity = require("../models/activitySchema");
const SheetManagement = require("../models/sheetManagementSchema");
const NotificationService = require("./notificationService");
const notificationService = new NotificationService();
const moment = require("moment");
const Client = require("../models/clientSchema");
const Configuration = require("../models/configurationSchema");
const fs = require("fs");
const SubscriptionPlan = require("../models/subscriptionplanSchema");
const paymentService = require("../services/paymentService");
const Workspace = require("../models/workspaceSchema");
const PaymentService = new paymentService();
const mongoose = require("mongoose");
const Activity_Status_Master = require("../models/masters/activityStatusMasterSchema");
const Task = require("../models/taskSchema");
const Section = require("../models/sectionSchema");

class TeamMemberService {
  // removed the code to create the team member for the agency
  /*// Add Team Member by agency or client
   addTeamMember = async (payload, user) => {
    try {
      validateRequestFields(payload, ["email", "first_name", "last_name"]);

      if (user?.role?.name == "agency") {
        return await this.addAgencyTeam(payload, user);
      } else if (user?.role?.name == "client") {
        return await this.addClientTeam(payload, user);
      } else if (user?.role?.name == "team_client") {
        const team_client_detail = await Team_Client.findById(
          user?.reference_id
        ).lean();
        const client_detail = await Authentication.findOne({
          reference_id: team_client_detail.client_id,
        })
          .populate("role", "name")
          .lean();
        return await this.addClientTeam(payload, {
          ...client_detail,
          created_by: user?.reference_id,
        });
      }
    } catch (error) {
      logger.error(`Error While adding the Team member: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  }; */

  // Add the team member by the Agency it self
  addAgencyTeam = async (payload, user) => {
    try {
      const { email, first_name, last_name, contact_number, role } = payload;
      if (!role || role === "")
        return throwError(returnMessage("teamMember", "roleRequired"));

      const workspace_exist = await Workspace.findById(user?.workspace)
        .where("is_deleted")
        .equals(false)
        .lean();

      if (!workspace_exist)
        return throwError(
          returnMessage("workspace", "workspaceNotFound"),
          statusCode.notFound
        );

      const [
        team_member_exist,
        team_role,
        role_for_auth,
        configuration,
        plan,
        sheets,
      ] = await Promise.all([
        Authentication.findOne({ email, is_deleted: false }).lean(),
        Team_Role_Master.findOne({ name: role }).select("_id").lean(),
        Role_Master.findOne({ name: "team_agency" }).lean(),
        Configuration.findOne({}).lean(),
        SubscriptionPlan.findById(user?.purchased_plan).lean(),
        SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean(),
      ]);

      if (
        plan?.plan_type === "unlimited" &&
        sheets?.occupied_sheets?.length >= sheets?.total_sheets - 1
      )
        return throwError(returnMessage("payment", "maxSheetsAllocated"));

      if (team_member_exist) {
        // check for the user already exist in the workspace
        const exist_in_workspace = workspace_exist?.members?.find(
          (member) =>
            member?.user_id?.toString() ===
              team_member_exist?._id?.toString() && member?.status !== "deleted"
        );

        if (exist_in_workspace)
          return throwError(
            returnMessage("workspace", "alreadyExistInWorkspace")
          );
        let invitation_token;
        if (
          sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
          workspace_exist?.trial_end_date
        ) {
          invitation_token = crypto.randomBytes(16).toString("hex");
          const link = `${process.env.REACT_APP_URL}/verify?workspace=${
            workspace_exist?._id
          }&email=${encodeURIComponent(
            team_member_exist?.email
          )}&token=${invitation_token}&workspace_name=${
            workspace_exist?.name
          }&first_name=${team_member_exist?.first_name}&last_name=${
            team_member_exist?.last_name
          }`;

          const email_template = templateMaker("teamInvitation.html", {
            REACT_APP_URL: process.env.REACT_APP_URL,
            SERVER_URL: process.env.SERVER_URL,
            username:
              capitalizeFirstLetter(team_member_exist?.first_name) +
              " " +
              capitalizeFirstLetter(team_member_exist?.last_name),
            invitation_text: `You are invited to the ${
              workspace_exist?.name
            } workspace by ${
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name)
            }. Click on the below link to join the workspace.`,
            link: link,
            instagram: configuration?.urls?.instagram,
            facebook: configuration?.urls?.facebook,
            privacy_policy: configuration?.urls?.privacy_policy,
          });

          sendEmail({
            email: team_member_exist?.email,
            subject: returnMessage("auth", "invitationEmailSubject"),
            message: email_template,
          });
        }
        // need to remove the user if the user is added before and deleted
        workspace_exist.members = workspace_exist?.members?.filter(
          (member) =>
            member?.user_id?.toString() !== team_member_exist?._id?.toString()
        );

        const members = [...workspace_exist.members];
        members.push({
          user_id: team_member_exist?._id,
          role: role_for_auth?._id,
          sub_role: team_role?._id,
          invitation_token: invitation_token,
          status:
            sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
            !workspace_exist?.trial_end_date
              ? "confirm_pending"
              : "payment_pending",
        });

        await Workspace.findByIdAndUpdate(
          workspace_exist?._id,
          { members: members },
          { new: true }
        );

        const occupied_sheets = [...sheets.occupied_sheets];

        occupied_sheets.push({
          user_id: team_member_exist?._id,
          role: role_for_auth?._id,
          workspace: workspace_exist?._id,
        });

        await SheetManagement.findByIdAndUpdate(sheets?._id, {
          occupied_sheets: occupied_sheets,
          total_sheets: sheets?.total_sheets + 1,
        });
        return {
          message:
            sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
            workspace_exist?.trial_end_date
              ? returnMessage("workspace", "invitationSend")
              : returnMessage("teamMember", "teamMemberCreated"),
        };
      } else {
        if (contact_number) {
          const unique_contact = await Authentication.findOne({
            contact_number,
            is_deleted: false,
          }).lean();
          if (unique_contact)
            return throwError(returnMessage("user", "contactNumberExist"));
        }

        const new_user = await Authentication.create({
          email,
          first_name: first_name?.toLowerCase(),
          last_name: last_name?.toLowerCase(),
          contact_number,
        });

        let invitation_token;
        if (sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length) {
          invitation_token = crypto.randomBytes(16).toString("hex");
          const link = `${process.env.REACT_APP_URL}/verify?workspace=${
            workspace_exist?._id
          }&email=${encodeURIComponent(
            email
          )}&token=${invitation_token}&workspace_name=${
            workspace_exist?.name
          }&first_name=${first_name}&last_name=${last_name}`;

          const email_template = templateMaker("teamInvitation.html", {
            REACT_APP_URL: process.env.REACT_APP_URL,
            SERVER_URL: process.env.SERVER_URL,
            username:
              capitalizeFirstLetter(first_name) +
              " " +
              capitalizeFirstLetter(last_name),
            invitation_text: `You are invited to the ${
              workspace_exist?.name
            } workspace by ${
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name)
            }. Click on the below link to join the workspace.`,
            link: link,
            instagram: configuration?.urls?.instagram,
            facebook: configuration?.urls?.facebook,
            privacy_policy: configuration?.urls?.privacy_policy,
          });

          sendEmail({
            email: email,
            subject: returnMessage("auth", "invitationEmailSubject"),
            message: email_template,
          });
        }
        // need to remove the user if the user is added before and deleted
        workspace_exist.members = workspace_exist?.members?.filter(
          (member) => member?.user_id?.toString() !== new_user?._id?.toString()
        );
        const members = [...workspace_exist.members];
        members.push({
          user_id: new_user?._id,
          role: role_for_auth?._id,
          sub_role: team_role?._id,
          invitation_token: invitation_token,
          status:
            sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
            workspace_exist?.trial_end_date
              ? "confirm_pending"
              : "payment_pending",
        });

        await Workspace.findByIdAndUpdate(
          workspace_exist?._id,
          { members: members },
          { new: true }
        );

        const occupied_sheets = [...sheets.occupied_sheets];

        occupied_sheets.push({
          user_id: new_user?._id,
          role: role_for_auth?._id,
          workspace: workspace_exist?._id,
        });

        await SheetManagement.findByIdAndUpdate(sheets?._id, {
          occupied_sheets: occupied_sheets,
          total_sheets: sheets?.total_sheets + 1,
        });
        return {
          message:
            sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
            workspace_exist?.trial_end_date
              ? returnMessage("workspace", "invitationSend")
              : returnMessage("teamMember", "teamMemberCreated"),
        };
      }
    } catch (error) {
      logger.error(`Error While adding the Team member by agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Add the team member for the particular agency by client
  addClientTeam = async (payload, user) => {
    try {
      const { email, first_name, last_name, contact_number } = payload;

      const workspace_exist = await Workspace.findById(user?.workspace)
        .where("is_deleted")
        .equals(false)
        .lean();

      if (!workspace_exist)
        return throwError(
          returnMessage("workspace", "workspaceNotFound"),
          statusCode.notFound
        );

      const member_details = workspace_exist?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );
      const user_role = await Role_Master.findById(member_details?.role).lean();

      if (user_role?.name !== "client")
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode?.forbidden
        );

      const [client_team_exist, role, plan] = await Promise.all([
        Authentication.findOne({ email, is_deleted: false }).lean(),
        Role_Master.findOne({ name: "team_client" }).lean(),
        // SubscriptionPlan.findById(user?.purchased_plan).lean(),
      ]);

      // need to work on this later
      /* if (plan?.plan_type === "unlimited") {
        const sheets = await SheetManagement.findOne({
          agency_id: user?.reference_id,
        }).lean();

        if (sheets?.occupied_sheets?.length >= sheets?.total_sheets - 1)
          return throwError(returnMessage("payment", "maxSheetsAllocated"));
      } */

      if (client_team_exist) {
        // check for the user already exist in the workspace
        const exist_in_workspace = workspace_exist?.members?.find(
          (member) =>
            member?.user_id?.toString() ===
              client_team_exist?._id?.toString() &&
            member?.status !== "deleted" &&
            member?.status !== "rejected"
        );

        if (exist_in_workspace)
          return throwError(returnMessage("workspace", "teamMemeberExist"));

        // as client can create the team member only invitation will be sent later
        /* let invitation_token = crypto.randomBytes(16).toString("hex");
        const link = `${process.env.REACT_APP_URL}/verify?workspace=${
          workspace_exist?._id
        }&email=${encodeURIComponent(
          client_exist?.email
        )}&token=${invitation_token}&workspace_name=${
          workspace_exist?.name
        }&first_name=${client_exist?.first_name}&last_name=${
          client_exist?.last_name
        }`;

        const email_template = templateMaker("teamInvitaion.html", {
          REACT_APP_URL: process.env.REACT_APP_URL,
          SERVER_URL: process.env.SERVER_URL,
          username:
            capitalizeFirstLetter(client_exist?.first_name) +
            " " +
            capitalizeFirstLetter(client_exist?.last_name),
          invitation_text: `You are invited to the ${
            workspace_exist?.name
          } workspace by ${
            capitalizeFirstLetter(user?.first_name) +
            " " +
            capitalizeFirstLetter(user?.last_name)
          }. Click on the below link to join the workspace.`,
          link: link,
          instagram: configuration?.urls?.instagram,
          facebook: configuration?.urls?.facebook,
          privacy_policy: configuration?.urls?.privacy_policy,
        });

        sendEmail({
          email: client_exist?.email,
          subject: returnMessage("auth", "invitationEmailSubject"),
          message: email_template,
        }); */
        // need to remove the user if the user is added before and deleted
        workspace_exist.members = workspace_exist?.members?.filter(
          (member) =>
            member?.user_id?.toString() !== client_team_exist?._id?.toString()
        );
        const members = [...workspace_exist.members];
        members.push({
          user_id: client_team_exist?._id,
          role: role?._id,
          client_id: user?._id,
          status: "requested",
        });

        await Workspace.findByIdAndUpdate(
          workspace_exist?._id,
          { members: members },
          { new: true }
        );
        return;
      } else {
        if (contact_number) {
          const unique_contact = await Authentication.findOne({
            contact_number,
            is_deleted: false,
          }).lean();
          if (unique_contact)
            return throwError(returnMessage("user", "contactNumberExist"));
        }

        const new_user = await Authentication.create({
          email,
          first_name: first_name?.toLowerCase(),
          last_name: last_name?.toLowerCase(),
          contact_number,
        });

        // as client can create the team member only
        /* let invitation_token = crypto.randomBytes(16).toString("hex");
        const link = `${process.env.REACT_APP_URL}/verify?workspace=${
          workspace_exist?._id
        }&email=${encodeURIComponent(
          email
        )}&token=${invitation_token}&workspace_name=${
          workspace_exist?.name
        }&first_name=${first_name}&last_name=${last_name}`;

        const email_template = templateMaker("teamInvitation.html", {
          REACT_APP_URL: process.env.REACT_APP_URL,
          SERVER_URL: process.env.SERVER_URL,
          username:
            capitalizeFirstLetter(first_name) +
            " " +
            capitalizeFirstLetter(last_name),
          invitation_text: `You are invited to the ${
            workspace_exist?.name
          } workspace by ${
            capitalizeFirstLetter(user?.first_name) +
            " " +
            capitalizeFirstLetter(user?.last_name)
          }. Click on the below link to join the workspace.`,
          link: link,
          instagram: configuration?.urls?.instagram,
          facebook: configuration?.urls?.facebook,
          privacy_policy: configuration?.urls?.privacy_policy,
        });

        sendEmail({
          email: email,
          subject: returnMessage("auth", "invitationEmailSubject"),
          message: email_template,
        }); */

        workspace_exist.members = workspace_exist?.members?.filter(
          (member) => member?.user_id?.toString() !== new_user?._id?.toString()
        );
        const members = [...workspace_exist.members];
        members.push({
          user_id: new_user?._id,
          role: role?._id,
          client_id: user?._id,
          status: "requested",
        });

        await Workspace.findByIdAndUpdate(
          workspace_exist?._id,
          { members: members },
          { new: true }
        );
        return;
      }
      // notification is pending to integrate and we will do it later
      /*         // ------------------  Notifications ----------------

        await notificationService.addNotification({
          module_name: "general",
          action_name: "agencyAdded",
          member_name: first_name + " " + last_name,
          client_name: user?.first_name + " " + user?.last_name, // notification
          receiver_id: agency_id,
        });

        const agencyData = await Authentication.findOne({
          reference_id: agency_id,
        });

        const createdMember = clientMemberAdded({
          created_by: user?.first_name + " " + user?.last_name, // Mail
          member_name: first_name + " " + last_name,
          email: email,
          contact_number: contact_number,
          member_id: newMember._id,
        });

        sendEmail({
          email: agencyData?.email,
          subject: returnMessage("emailTemplate", "memberAdded"),
          message: createdMember,
        });

        // ------------------  Notifications ----------------
 */
    } catch (error) {
      logger.error(`Error While adding the Team member by client: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // verify the workspace invitation and accept or reject
  verify = async (payload) => {
    try {
      validateRequestFields(payload, ["workspace", "email", "token", "accept"]);
      const { workspace, email, token, accept } = payload;

      const user_exist = await Authentication.findOne({
        email,
        is_deleted: false,
      }).lean();
      if (!user_exist)
        return throwError(
          returnMessage("user", "userDoesNotExist"),
          statusCode.notFound
        );

      const workspace_exist = await Workspace.findById(workspace)
        .where("is_deleted")
        .ne(true)
        .lean();

      if (!workspace_exist)
        return throwError(returnMessage("workspace", "workspaceNotFound"));

      const member_exist = workspace_exist?.members?.find(
        (member) =>
          member?.user_id?.toString() === user_exist?._id?.toString() &&
          member?.invitation_token === token
      );

      if (!member_exist)
        return throwError(returnMessage("workspace", "invitationExpired"));
      const status = accept ? "confirmed" : "rejected";

      await Workspace.findOneAndUpdate(
        { _id: workspace_exist?._id, "members.user_id": member_exist?.user_id },
        {
          $set: {
            "members.$.invitation_token": null,
            "members.$.joining_date": new Date(),
            "members.$.status": status,
          },
        },
        { new: true }
      );
      return;
    } catch (error) {
      logger.error(`Error while verify the workspace invitation: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Login Team Member
  login = async (payload) => {
    try {
      const { email, password } = payload;

      if (!email || !password)
        return throwError(
          returnMessage("auth", "emailPassNotFound"),
          statusCode.badRequest
        );

      const member_exist = await Authentication.findOne(
        { email: email, is_deleted: false },
        { invitation_token: 0 }
      ).lean();

      if (!member_exist)
        return throwError(
          returnMessage("teamMember", "memberNotFound"),
          statusCode.notFound
        );

      const correct_password = await bcrypt.compare(
        password,
        member_exist?.password
      );
      if (!correct_password)
        return throwError(
          returnMessage("auth", "incorrectPassword"),
          statusCode.badRequest
        );

      return this.tokenGenerator(member_exist);
    } catch (error) {
      logger.error(`Error while Team Member  login, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // getMember Team Member

  getMember = async (member_id, user) => {
    try {
      const workspace = await Workspace.findOne({
        _id: user?.workspace,
        members: {
          $elemMatch: { user_id: member_id, status: { $ne: "deleted" } },
        },
        is_deleted: false,
      }).lean();

      if (!workspace)
        return throwError(
          returnMessage("teamMember", "teamMemberNotFound"),
          statusCode.notFound
        );

      const logged_user = workspace?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      if (workspace?.created_by?.toString() !== user?._id?.toString()) {
        const sub_role = await Team_Role_Master.findById(
          logged_user?.sub_role
        ).lean();

        if (
          sub_role?.name !== "admin" ||
          workspace?.created_by?.toString() !== user?._id?.toString()
        )
          return throwError(
            returnMessage("auth", "forbidden"),
            statusCode.forbidden
          );
      }

      const member_detail = workspace?.members?.find(
        (member) => member?.user_id?.toString() === member_id?.toString()
      );
      const [member_auth, sub_role] = await Promise.all([
        Authentication.findById(member_id)
          .select("first_name last_name email contact_number")
          .lean(),
        Team_Role_Master.findById(member_detail?.sub_role)
          .select("name")
          .lean(),
      ]);

      return { ...member_auth, role: sub_role?.name };
    } catch (error) {
      logger.error(`Error while get team member, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // removed the delete team member as of now
  /* // this function will used for the delete team member only for the agency
  deleteMember = async (payload, agency) => {
    try {
      const { teamMemberIds } = payload;
      const activity_status = await Activity_Status.findOne({
        name: "pending",
      })
        .select("_id")
        .lean();

      if (agency?.role?.name === "team_agency") {
        const team_agency_detail = await Team_Agency.findById(
          agency?.reference_id
        )
          .populate("role", "name")
          .lean();

        if (team_agency_detail?.role?.name === "admin") {
          agency = await Authentication.findOne({
            reference_id: team_agency_detail?.agency_id,
          })
            .populate("role", "name")
            .lean();
        }
      }

      if (agency?.role?.name === "agency" && !payload?.client_team) {
        // check for the clients are assined to any activity that are in pending state

        const activity_assigned = await Activity.findOne({
          agency_id: agency?.reference_id,
          assign_to: { $in: teamMemberIds },
          activity_status: activity_status?._id,
        }).lean();

        if (activity_assigned && !payload?.force_fully_remove)
          return { force_fully_remove: true };

        if (
          (activity_assigned && payload?.force_fully_remove) ||
          !activity_assigned
        ) {
          // Delete from Authentication collection
          await Authentication.updateMany(
            { reference_id: { $in: teamMemberIds } },
            { $set: { is_deleted: true } }
          );

          const sheets = await SheetManagement.findOne({
            agency_id: agency?.reference_id,
          }).lean();

          const available_sheets = sheets?.occupied_sheets?.filter(
            (sheet) => !teamMemberIds.includes(sheet?.user_id.toString())
          );

          await SheetManagement.findByIdAndUpdate(sheets._id, {
            occupied_sheets: available_sheets,
          });
        }
      } else if (agency?.role?.name === "agency" && payload?.client_team) {
        // check for the clients are assined to any activity that are in pending state

        const activity_assigned = await Activity.findOne({
          agency_id: agency?.reference_id,
          client_id: { $in: teamMemberIds },
          activity_status: activity_status?._id,
        }).lean();

        if (activity_assigned && !payload?.force_fully_remove)
          return { force_fully_remove: true };

        if (
          (activity_assigned && payload?.force_fully_remove) ||
          !activity_assigned
        ) {
          // Delete from Authentication collection
          await Team_Client.updateOne(
            {
              _id: { $in: teamMemberIds },
              "agency_ids.agency_id": agency?.reference_id,
            },
            { $set: { "agency_ids.$.status": "deleted" } },
            { new: true }
          );

          const sheets = await SheetManagement.findOne({
            agency_id: agency?.reference_id,
          }).lean();

          let teams_ids = [];

          teams_ids.forEach((id) => teams_ids.push(id.toString()));

          const available_sheets = sheets?.occupied_sheets?.filter(
            (sheet) => !teamMemberIds.includes(sheet?.user_id.toString())
          );

          await SheetManagement.findByIdAndUpdate(sheets._id, {
            occupied_sheets: available_sheets,
          });
        }

        // ------------------------------- Notification------------------------

        // Function to handle member deletion for client
        const handleMemberDeletionForClient = async (
          memberData,
          clientData,
          agencyData,
          teamMemberIds
        ) => {
          await notificationService.addNotification({
            module_name: "general",
            action_name: "memberDeletedAgency",
            receiver_id: payload?.client_id,
            agency_name: `${agency?.first_name} ${agency?.last_name}`,
            member_name: `${memberData?.first_name} ${memberData?.last_name}`,
          });

          const deleteMember = memberDeletedTemplate({
            deleted_by: `${agency?.first_name} ${agency?.last_name}`,
            member_name: `${memberData?.first_name} ${memberData?.last_name}`,
            email: memberData?.email,
            contact_number: memberData?.contact_number,
            member_id: teamMemberIds,
          });

          sendEmail({
            email: clientData?.email,
            subject: returnMessage("emailTemplate", "memberDeleted"),
            message: deleteMember,
          });
        };

        // Main logic
        const clientData = await Authentication.findOne({
          reference_id: payload?.client_id,
        });

        const agencyData = await Authentication.findOne({
          reference_id: payload?.agency_id,
        });

        if (Array.isArray(teamMemberIds)) {
          const memberDataPromises = teamMemberIds.map(async (item) => {
            return Authentication.findOne({ reference_id: item });
          });
          const memberDataList = await Promise.all(memberDataPromises);

          memberDataList.forEach(async (memberData, index) => {
            await handleMemberDeletionForClient(
              memberData,
              clientData,
              agencyData,
              teamMemberIds[index]
            );
          });
        } else {
          const memberData = await Authentication.findOne({
            reference_id: teamMemberIds,
          });

          await handleMemberDeletionForClient(
            memberData,
            clientData,
            agencyData,
            teamMemberIds
          );
        }

        // ------------------------------- Notification------------------------
      } else if (agency?.role?.name === "client" && payload?.agency_id) {
        // check for the clients are assined to any activity that are in pending state

        const activity_assigned = await Activity.findOne({
          agency_id: payload?.agency_id,
          client_id: { $in: teamMemberIds },
          activity_status: activity_status?._id,
        }).lean();

        if (activity_assigned && !payload?.force_fully_remove)
          return { force_fully_remove: true };

        if (
          (activity_assigned && payload?.force_fully_remove) ||
          !activity_assigned
        ) {
          // Delete from Authentication collection
          await Team_Client.updateMany(
            {
              _id: { $in: teamMemberIds },
              "agency_ids.agency_id": payload?.agency_id,
            },
            { $set: { "agency_ids.$.status": "deleted" } },
            { new: true }
          );

          const sheets = await SheetManagement.findOne({
            agency_id: payload?.agency_id,
          }).lean();

          let teams_ids = [];

          teams_ids.forEach((id) => teams_ids.push(id.toString()));

          const available_sheets = sheets?.occupied_sheets?.filter(
            (sheet) => !teamMemberIds.includes(sheet?.user_id.toString())
          );

          await SheetManagement.findByIdAndUpdate(sheets._id, {
            occupied_sheets: available_sheets,
          });
        }

        // ------------------------------- Notification------------------------
        // Function to handle member deletion
        const handleMemberDeletion = async (
          memberData,
          agencyData,
          teamMemberIds
        ) => {
          await notificationService.addNotification({
            module_name: "general",
            action_name: "memberDeleted",
            receiver_id: payload?.agency_id,
            client_name: `${agency?.first_name} ${agency?.last_name}`,
            member_name: `${memberData?.first_name} ${memberData?.last_name}`,
          });
          const deleteMember = memberDeletedClient({
            deleted_by: `${agency?.first_name} ${agency?.last_name}`,
            member_name: `${memberData?.first_name} ${memberData?.last_name}`,
            email: memberData?.email,
            contact_number: memberData?.contact_number,
            member_id: teamMemberIds,
          });

          sendEmail({
            email: agencyData?.email,
            subject: returnMessage("emailTemplate", "memberDeleted"),
            message: deleteMember,
          });
        };

        const agencyData = await Authentication.findOne({
          reference_id: payload?.agency_id,
        }).lean();

        if (Array.isArray(teamMemberIds)) {
          const memberDataPromises = teamMemberIds.map(async (item) => {
            return Authentication.findOne({ reference_id: item }).lean();
          });
          const memberDataList = await Promise.all(memberDataPromises);

          memberDataList.forEach(async (memberData, index) => {
            await handleMemberDeletion(
              memberData,
              agencyData,
              teamMemberIds[index]
            );
          });
        } else {
          const memberData = await Authentication.findOne({
            reference_id: teamMemberIds,
          }).lean();
          await handleMemberDeletion(memberData, agencyData, teamMemberIds);
        }

        // ------------------------------- Notification------------------------
      }

      return;
    } catch (error) {
      logger.error(`Error while Team member  delete, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  }; */

  deleteMember = async (payload, user) => {
    try {
      const { teamMemberIds } = payload;
      // pending to implement when we remove the team members and the tasks are assigned and pending set
      const [workspace, sheet, activity_status] = await Promise.all([
        Workspace.findById(user?.workspace).lean(),
        SheetManagement.findOne({
          user_id: user?._id,
          is_deleted: false,
        }).lean(),
        Activity_Status_Master.findOne({ name: "pending" })
          .select("_id")
          .lean(),
      ]);

      if (!sheet) return throwError(returnMessage("default", "default"));
      const member_details = workspace?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      if (workspace?.created_by?.toString() !== user?._id?.toString()) {
        const sub_role = await Team_Role_Master.findById(
          member_details?.sub_role
        ).lean();

        if (
          sub_role?.name !== "admin" ||
          workspace?.created_by?.toString() !== user?._id?.toString()
        )
          return throwError(
            returnMessage("auth", "forbidden"),
            statusCode.forbidden
          );
      }

      const task_assigned = await Task.findOne({
        workspace_id: user.workspace,
        assign_to: { $in: teamMemberIds },
        activity_status: activity_status?._id,
        is_deleted: false,
      }).lean();

      if (task_assigned && !payload?.force_fully_remove)
        return { force_fully_remove: true };
      // remove the member from the workspace

      if ((task_assigned && payload?.force_fully_remove) || !task_assigned) {
        // remove the member from the workspace
        await Workspace.findOneAndUpdate(
          { _id: user.workspace, "members.user_id": { $in: teamMemberIds } },
          {
            $set: {
              "members.$.status": "deleted",
              "members.$.invitation_token": undefined,
            },
          },
          { new: true }
        );

        const updated_sheet = sheet?.occupied_sheets?.filter(
          (sh) => !teamMemberIds?.includes(sh?.user_id?.toString())
        );

        SheetManagement.findByIdAndUpdate(
          sheet?._id,
          {
            occupied_sheets: updated_sheet,
            total_sheets: updated_sheet?.length + 1,
          },
          { new: true }
        );
      }
      return;
    } catch (error) {
      logger.error(
        `Error while deleting the team member of the agency: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this is only used to delete the client team member
  deleteMemberByClient = async (payload, user) => {
    try {
      const { teamMemberIds } = payload;
      // pending to implement when we remove the team members and the tasks are assigned and pending set
      const workspace = await Workspace.findById(user?.workspace).lean();

      const member_details = workspace?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      const [role, sheet, activity_status] = await Promise.all([
        Role_Master.findById(member_details?.role).lean(),
        SheetManagement.findOne({
          user_id: workspace?.created_by,
          is_deleted: false,
        }).lean(),
        Activity_Status_Master.findOne({ name: "pending" })
          .select("_id")
          .lean(),
      ]);
      if (role?.name !== "client")
        return throwError(
          returnMessage("auth", "forbidden"),
          statusCode.forbidden
        );
      if (!sheet) return throwError(returnMessage("default", "default"));

      const task_assigned = await Task.findOne({
        workspace_id: user.workspace,
        assign_to: { $in: teamMemberIds },
        activity_status: activity_status?._id,
        is_deleted: false,
      }).lean();

      if (task_assigned && !payload?.force_fully_remove)
        return { force_fully_remove: true };
      // remove the member from the workspace

      if ((task_assigned && payload?.force_fully_remove) || !task_assigned) {
        await Workspace.findOneAndUpdate(
          {
            _id: user.workspace,
            "members.user_id": { $in: teamMemberIds },
            "members.client_id": user?._id,
          },
          {
            $set: {
              "members.$.status": "deleted",
              "members.$.invitation_token": undefined,
            },
          },
          { new: true }
        );

        const updated_members_id = workspace?.members?.map((member) => {
          if (member?.client_id?.toString() === user?._id?.toString())
            return member?._id;
        });
        const updated_sheet = sheet?.occupied_sheets?.filter(
          (sh) => !updated_members_id?.includes(sh?.user_id?.toString())
        );

        SheetManagement.findByIdAndUpdate(
          sheet?._id,
          {
            occupied_sheets: updated_sheet,
            total_sheets: updated_sheet?.length + 1,
          },
          { new: true }
        );
      }
      return;
    } catch (error) {
      logger.error(
        `Error while deleting the team member of the agency: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Edit Team Member

  editMember = async (payload, team_member_id, user) => {
    try {
      const { role } = payload;
      const [workspace, sub_role] = await Promise.all([
        Workspace.findById(user?.workspace).lean(),
        Team_Role_Master.findOne({ name: role }).lean(),
      ]);

      if (workspace?.created_by?.toString() !== user?._id?.toString()) {
        const sub_role = await Team_Role_Master.findById(
          member_details?.sub_role
        ).lean();

        if (
          sub_role?.name !== "admin" ||
          workspace?.created_by?.toString() !== user?._id?.toString()
        )
          return throwError(
            returnMessage("auth", "forbidden"),
            statusCode.forbidden
          );
      }

      await Workspace.findOneAndUpdate(
        {
          _id: user?.workspace,
          "members.user_id": team_member_id,
        },
        { $set: { "members.$.sub_role": sub_role } }
      );

      /* const team_member_exist = await Authentication.findById(team_member_id)
        .populate("role", "name")
        .where("is_deleted")
        .ne(true)
        .lean();
      let check_agency = await Team_Agency.findById(user?.reference_id)
        .populate("role", "name")
        .lean();
      if (
        user?.role?.name === "agency" ||
        (user.role.name === "team_agency" && check_agency.role.name === "admin")
      ) {
        if (
          !team_member_exist ||
          team_member_exist?.role?.name !== "team_agency"
        )
          return throwError(
            returnMessage("teamMember", "userNotFound"),
            statusCode.notFound
          );

        let role;
        if (payload?.role && payload?.role !== "")
          role = await Team_Role_Master.findOne({ name: payload?.role })
            .select("_id")
            .lean();

        await Authentication.findByIdAndUpdate(
          team_member_id,
          {
            name: payload?.name,
            first_name: payload?.first_name,
            last_name: payload?.last_name,
            contact_number: payload?.contact_number,
          },
          { new: true }
        );
        await Team_Agency.findByIdAndUpdate(
          team_member_exist?.reference_id,
          { role: role?._id },
          { new: true }
        );
        return;
      } else if (user?.role?.name === "client") {
        await Authentication.findByIdAndUpdate(
          team_member_id,
          {
            name: payload?.name,
            first_name: payload?.first_name,
            last_name: payload?.last_name,
            contact_number: payload?.contact_number,
          },
          { new: true }
        );
      } */
    } catch (error) {
      logger.error(`Error while Team member Edit, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // get the team members by the workspace wise only for the team member
  getAllTeam = async (payload, user) => {
    try {
      // if (!payload?.pagination) {
      //   return await this.teamListWithoutPagination(user);
      // }
      const pagination = paginationObject(payload);
      let search_obj = {},
        filter_obj = {};
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          { "user.first_name": { $regex: payload.search, $options: "i" } },
          { "user.last_name": { $regex: payload.search, $options: "i" } },
          { "user.email": { $regex: payload.search, $options: "i" } },
          { status: { $regex: payload.search, $options: "i" } },
          { sub_role: { $regex: payload.search, $options: "i" } },
        ];
      }

      if (payload?.filter) {
        const { filter } = payload;

        if (filter?.status && filter?.status !== "")
          filter_obj.status = filter.status;

        if (
          filter?.date &&
          filter?.date?.start_date &&
          filter?.date?.end_date &&
          filter?.date?.start_date !== "" &&
          filter?.date?.end_date !== ""
        ) {
          const start_date = moment
            .utc(filter?.date?.start_date, "DD-MM-YYYY")
            .startOf("day");
          const end_date = moment
            .utc(filter?.date?.end_date, "DD-MM-YYYY")
            .endOf("day");
          filter_obj["$and"] = [
            { joining_date: { $gte: new Date(start_date) } },
            { joining_date: { $lte: new Date(end_date) } },
          ];
        }
      }

      const query_obj = {};
      const { user_role, sub_role } =
        await authService.getRoleSubRoleInWorkspace(user);

      let role_name;
      if (
        user_role === "agency" ||
        (user_role === "team_agency" && sub_role === "admin")
      )
        role_name = "team_agency";
      else if (user_role === "client") {
        role_name = "team_client";
        query_obj["members.client_id"] = user?._id;
      }

      const role = await Role_Master.findOne({ name: role_name })
        .select("_id")
        .lean();

      query_obj["members.role"] = role?._id;
      query_obj["members.status"] = { $ne: "deleted" };

      const aggragate = [
        { $match: { _id: new mongoose.Types.ObjectId(user?.workspace) } },
        { $unwind: "$members" }, // Unwind the members array
        {
          $match: query_obj,
        },
        {
          $lookup: {
            from: "authentications", // The collection name of the users
            localField: "members.user_id",
            foreignField: "_id",
            as: "user",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                  email: 1,
                },
              },
            ],
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }, // Unwind the user details array
        {
          $lookup: {
            from: "team_role_masters", // The collection name of the sub_roles
            localField: "members.sub_role",
            foreignField: "_id",
            as: "sub_role",
          },
        },
        {
          $unwind: {
            path: "$sub_role",
            preserveNullAndEmptyArrays: true,
          },
        }, // Unwind the sub_role details array
        {
          $project: {
            _id: 0,
            user: "$user", // Get user details
            sub_role: "$sub_role.name",
            status: "$members.status",
            client_id: "$members.client_id",
            joining_date: "$members.joining_date",
          },
        },
        { $match: filter_obj },
        { $match: search_obj },
      ];

      const [team_members, total_members] = await Promise.all([
        Workspace.aggregate(aggragate)
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page),
        Workspace.aggregate(aggragate),
      ]);

      return {
        teamMemberList: team_members,
        page_count:
          Math.ceil(total_members.length / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error while fetching all team members: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  teamListWithoutPagination = async (user) => {
    try {
      let teams;
      if (user.role.name === "team_agency") {
        const agency = await Team_Agency.findOne(user.reference_id);

        teams = await Team_Agency.distinct("_id", {
          agency_id: agency?.agency_id,
        }).lean();
        // we need to add the agency details also for the attandees
        teams.unshift(agency?.agency_id);

        // teams = await Team_Agency.distinct("_id", {
        //   agency_id: agency_detail?.reference_id,
        // }).lean();
      } else {
        teams = await Team_Agency.distinct("_id", {
          agency_id: user?.reference_id,
        }).lean();
      }
      teams.unshift(user.reference_id);
      const aggregateArray = [
        {
          $match: {
            reference_id: { $in: teams },
            is_deleted: false,
            status: { $in: ["confirmed", "free_trial"] },
          },
        },

        {
          $lookup: {
            from: "role_masters",
            localField: "role",
            foreignField: "_id",
            as: "user_type",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: {
            path: "$user_type",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            name: {
              $concat: ["$first_name", " ", "$last_name"],
            },
            first_name: 1,
            last_name: 1,
            email: 1,
            reference_id: 1,
            createdAt: 1,
            status: 1,
            profile_image: 1,
            role: "$user_type.name",
          },
        },
      ];

      const teamData = await Authentication.aggregate(aggregateArray);

      return teamData;
    } catch (error) {
      logger.error(`Error while fetching list of teams: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  getProfile = async (team) => {
    try {
      const team_detail = await Authentication.findById(team?._id)
        .select("-password")
        .lean();
      let team_reference;
      if (team?.role?.name === "team_agency") {
        team_reference = await Team_Agency.findById(team?.reference_id).lean();
      } else if (team?.role?.name === "team_client") {
        team_reference = await Team_Client.findById(team?.reference_id).lean();
      }
      team_detail.reference_id = team_reference;
      return team_detail;
    } catch (error) {
      logger.error(`Error while getting team profile: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Update Team member profile
  updateTeamMeberProfile = async (
    payload,
    user_id,
    reference_id,
    role,
    image
  ) => {
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
          fs.unlink(`./src/public/${existingImage?.profile_image}`, (err) => {
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

      await Authentication.updateOne(
        { _id: user_id },
        {
          $set: authData,
          ...((imagePath || imagePath === "") && { profile_image: imagePath }),
        },
        { new: true }
      );
      if (role === "team_agency") {
        await Team_Agency.updateOne(
          { _id: reference_id },
          { $set: agencyData },
          { new: true }
        );
      } else if (role === "team_client") {
        await Team_Client.updateOne(
          { _id: reference_id },
          { $set: agencyData },
          { new: true }
        );
      }

      return;
    } catch (error) {
      logger.error(`Error while registering the agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // // reject the client team member
  // rejectTeamMember = async (payload, agency) => {
  //   try {
  //     if (agency?.role?.name !== "agency")
  //       return throwError(returnMessage("auth", "insufficientPermission"), 403);

  //     let team_member_exist,
  //       status = "rejected";

  //     if (payload?.status === "accept") status = "confirmed";

  //     // if (agency?.role?.name === "team_agency") {
  //     //   const team_agency_detail = await Team_Agency.findById(
  //     //     agency?.reference_id
  //     //   )
  //     //     .populate("role", "name")
  //     //     .lean();
  //     //   if (team_agency_detail?.role?.name === "admin") {
  //     //     agency = await Authentication.findOne({
  //     //       reference_id: team_agency_detail.agency_id,
  //     //     }).lean();
  //     //   }
  //     // }

  //     team_member_exist = await Team_Client.findOne({
  //       _id: payload?.id,
  //       "agency_ids.agency_id": agency?.reference_id,
  //       "agency_ids.status": "requested",
  //     }).lean();

  //     if (!team_member_exist)
  //       return throwError(
  //         returnMessage("teamMember", "teamMemberNotFound"),
  //         statusCode?.notFound
  //       );

  //     await Team_Client.updateOne(
  //       { _id: payload?.id, "agency_ids.agency_id": agency?.reference_id },
  //       { $set: { "agency_ids.$.status": status } },
  //       { new: true }
  //     );

  //     if (payload?.status === "accept") {
  //       await this.freeTrialMemberAdd(agency?.reference_id, payload?.id);
  //     }

  //     return;
  //   } catch (error) {
  //     logger.error(`Error while rejecting the team member by agency: ${error}`);
  //     return throwError(error?.message, error?.statusCode);
  //   }
  // };

  // this function will used for the delete team member only for the client team
  deleteClientMember = async (payload) => {
    try {
      const { teamMemberIds } = payload;

      const teamMember = await Authentication.find({
        _id: { $in: teamMemberIds },
        is_deleted: false,
      })
        .populate({
          path: "role",
          model: "role_master",
        })
        .populate({
          path: "reference_id",
          model: "team_agency",
          populate: {
            path: "role",
            model: "team_role_master",
          },
        })
        .lean();

      // Delete from Authentication collection
      await Authentication.updateMany(
        { _id: { $in: teamMemberIds } },
        { $set: { is_deleted: true } }
      );
      if (!teamMember) {
        return throwError(returnMessage("teamMember", "invalidId"));
      }
      return;
    } catch (error) {
      logger.error(`Error while Team member delete, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  referralCodeGenerator = async () => {
    try {
      const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let referral_code = "";

      // Generate the initial code
      for (let i = 0; i < 8; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        referral_code += characters.charAt(randomIndex);
      }

      const referral_code_exist = await Authentication.findOne({
        $or: [{ referral_code }, { affiliate_referral_code: referral_code }],
      }).lean();
      if (referral_code_exist) return this.referralCodeGenerator();

      return referral_code;
    } catch (error) {
      logger.error("Error while generating the referral code", error);
      return false;
    }
  };

  // Dashboard Data
  dashboardData = async (user) => {
    try {
      let is_member;
      if (user?.role === "team_agency") {
        if (user?.sub_role === "team_member") {
          is_member = true;
        }
        if (user?.sub_role === "admin") {
          is_member = false;
        }
      } else if (user?.role === "team_client") {
        is_member = true;
      }

      const currentDate = moment();
      const startOfToday = moment(currentDate).startOf("day").utc();
      const endOfToday = moment(currentDate).endOf("day").utc();

      const workspaceId = new mongoose.Types.ObjectId(user?.workspace);
      const userId = new mongoose.Types.ObjectId(user?._id);

      // Task Status
      const statusKeys = ["pending", "completed", "overdue", "in_progress"];
      const statusPromises = statusKeys.map((key) =>
        Section.distinct("_id", { workspace_id: workspaceId, key })
      );

      const [
        pending_status,
        completed_status,
        overdue_status,
        in_progress_status,
      ] = await Promise.all(statusPromises);

      // Task
      const taskAggregates = [
        { status: pending_status, alias: "pendingTask" },
        { status: completed_status, alias: "completedTask" },
        { status: overdue_status, alias: "overdueTask" },
        { status: in_progress_status, alias: "inprogressTask" },
      ];

      const taskPromises = taskAggregates.map(({ status, alias }) =>
        Task.aggregate([
          {
            $match: {
              workspace_id: workspaceId,
              is_deleted: false,
              activity_status: { $in: status },
              ...(is_member && { assign_to: userId }),
            },
          },
          {
            $count: alias,
          },
        ])
      );
      const [pendingTask, completedTask, overdueTask, inprogressTask] =
        await Promise.all(taskPromises);

      const [taskCount, todaysCallMeeting] = await Promise.all([
        Task.aggregate([
          {
            $match: {
              workspace_id: workspaceId,
              is_deleted: false,
              ...(is_member && { assign_to: userId }),
            },
          },
          {
            $count: "totalTaskCount",
          },
        ]),

        Activity.aggregate([
          {
            $match: {
              is_deleted: false,
              workspace_id: workspaceId,
              ...(is_member && {
                attendees: userId,
              }),
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
      ]);
      return {
        task_count: taskCount[0]?.totalTaskCount ?? 0,
        pending_task_count: pendingTask[0]?.pendingTask ?? 0,
        completed_task_count: completedTask[0]?.completedTask ?? 0,
        in_progress_task_count: inprogressTask[0]?.inprogressTask ?? 0,
        overdue_task_count: overdueTask[0]?.overdueTask ?? 0,
        todays_call_meeting: todaysCallMeeting[0]?.todaysCallMeeting ?? 0,
      };
    } catch (error) {
      logger.error(`Error while fetch dashboard data for agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used for the agency is on free trial and need to take payment after the trial period is over
  // it will only used for the agency only to send the verification mail and manage sheet
  freeTrialMemberAdd = async (agency_id, user_id) => {
    try {
      const [agency_details, user_details, sheets] = await Promise.all([
        Authentication.findOne({ reference_id: agency_id }).lean(),
        Authentication.findOne({ reference_id: user_id })
          .populate("role", "name")
          .lean(),
        SheetManagement.findOne({ agency_id, is_deleted: false }).lean(),
      ]);

      if (user_details?.role?.name === "client") {
        let link = `${
          process.env.REACT_APP_URL
        }/client/verify?name=${encodeURIComponent(
          capitalizeFirstLetter(agency_details?.first_name) +
            " " +
            capitalizeFirstLetter(agency_details?.last_name)
        )}&email=${encodeURIComponent(
          user_details?.email
        )}&agency=${encodeURIComponent(agency_details?.reference_id)}`;

        const invitation_text = `${capitalizeFirstLetter(
          agency_details?.first_name
        )} ${capitalizeFirstLetter(
          agency_details?.last_name
        )} has sent an invitation to you. please click on below button to join Syncupp.`;
        const company_urls = await Configuration.find().lean();
        let privacy_policy = company_urls[0]?.urls?.privacy_policy;

        let facebook = company_urls[0]?.urls?.facebook;

        let instagram = company_urls[0]?.urls?.instagram;
        const invitation_mail = invitationEmail(
          link,
          capitalizeFirstLetter(user_details?.first_name) +
            " " +
            capitalizeFirstLetter(user_details?.last_name),
          invitation_text,
          privacy_policy,
          facebook,
          instagram
        );

        await sendEmail({
          email: user_details?.email,
          subject: returnMessage("emailTemplate", "invitation"),
          message: invitation_mail,
        });
        await Client.updateOne(
          { _id: user_id, "agency_ids.agency_id": agency_id },
          { $set: { "agency_ids.$.status": "pending" } },
          { new: true }
        );
      } else if (user_details?.role?.name === "team_agency") {
        const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
          capitalizeFirstLetter(agency_details?.first_name) +
          " " +
          capitalizeFirstLetter(agency_details?.last_name)
        }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
          user_details?.email
        )}&token=${user_details?.invitation_token}&redirect=false`;

        const invitation_text = `${capitalizeFirstLetter(
          agency_details?.first_name
        )} ${capitalizeFirstLetter(
          agency_details?.last_name
        )} has sent an invitation to you. please click on below button to join Syncupp.`;
        const company_urls = await Configuration.find().lean();
        let privacy_policy = company_urls[0]?.urls?.privacy_policy;

        let facebook = company_urls[0]?.urls?.facebook;

        let instagram = company_urls[0]?.urls?.instagram;
        const invitation_template = invitationEmail(
          link,
          capitalizeFirstLetter(user_details?.first_name) +
            " " +
            capitalizeFirstLetter(user_details?.last_name),
          invitation_text,
          privacy_policy,
          facebook,
          instagram
        );

        await Authentication.findByIdAndUpdate(user_details?._id, {
          status: "confirm_pending",
        });

        await sendEmail({
          email: user_details?.email,
          subject: returnMessage("emailTemplate", "invitation"),
          message: invitation_template,
        });
      } else if (user_details?.role?.name === "team_client") {
        const team_client_detail = await Team_Client.findById(
          user_details.reference_id
        ).lean();

        const link = `${process.env.REACT_APP_URL}/team/verify?agency=${
          capitalizeFirstLetter(agency_details?.first_name) +
          " " +
          capitalizeFirstLetter(agency_details?.last_name)
        }&agencyId=${agency_details?.reference_id}&email=${encodeURIComponent(
          user_details?.email
        )}&clientId=${team_client_detail.client_id}`;
        const invitation_text = `${capitalizeFirstLetter(
          agency_details?.first_name
        )} ${capitalizeFirstLetter(
          agency_details?.last_name
        )} has sent an invitation to you. please click on below button to join Syncupp.`;
        const company_urls = await Configuration.find().lean();
        let privacy_policy = company_urls[0]?.urls?.privacy_policy;

        let facebook = company_urls[0]?.urls?.facebook;

        let instagram = company_urls[0]?.urls?.instagram;
        const invitation_template = invitationEmail(
          link,
          user_details?.first_name + " " + user_details?.last_name,
          invitation_text,
          privacy_policy,
          facebook,
          instagram
        );

        await sendEmail({
          email: user_details?.email,
          subject: returnMessage("emailTemplate", "invitation"),
          message: invitation_template,
        });

        await Team_Client.updateOne(
          { _id: user_id, "agency_ids.agency_id": agency_id },
          { $set: { "agency_ids.$.status": "pending" } },
          { new: true }
        );
      }

      const occupied_sheets = [
        ...sheets.occupied_sheets,
        {
          user_id,
          role: user_details?.role?.name,
        },
      ];

      const sheet_obj = {
        total_sheets: sheets?.total_sheets + 1,
        occupied_sheets,
      };
      await SheetManagement.findByIdAndUpdate(sheets._id, sheet_obj);

      return;
    } catch (error) {
      logger.error(`Error while free trial member add: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // below function is used to approve or reject the team member of the client
  approveOrReject = async (payload, user) => {
    try {
      /* We required the Notification integration if the member approves or reject
      we need to check for the user is assigned to any pending tasks or not
      we need to manage the subscription on accept or reject */
      const { status, member_id } = payload;

      const [workspace, client_member_detail, configuration, sheets, role] =
        await Promise.all([
          Workspace.findOne({
            members: {
              $elemMatch: {
                user_id: member_id,
                $and: [{ status: { $ne: "deleted" } }, { status: "requested" }],
              },
            },
            _id: user?.workspace,
            is_deleted: false,
          }).lean(),
          Authentication.findById(member_id).lean(),
          Configuration.findOne().lean(),
          SheetManagement.findOne({
            user_id: user?._id,
            is_deleted: false,
          }).lean(),
          Role_Master.findOne({ name: "team_client" }).select("_id").lean(),
        ]);

      if (!workspace || !client_member_detail)
        return throwError(returnMessage("teamMember", "teamMemberNotFound"));

      const member_details = workspace?.members?.find(
        (member) => member?.user_id?.toString() === user?._id?.toString()
      );

      if (workspace?.created_by?.toString() !== user?._id?.toString()) {
        const sub_role = await Team_Role_Master.findById(
          member_details?.sub_role
        ).lean();

        if (
          sub_role?.name !== "admin" ||
          workspace?.created_by?.toString() !== user?._id?.toString()
        )
          return throwError(
            returnMessage("auth", "forbidden"),
            statusCode.forbidden
          );
      }

      if (status === "accept") {
        let invitation_token;

        if (
          sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
          workspace?.trial_end_date
        ) {
          invitation_token = crypto.randomBytes(16).toString("hex");
          const link = `${process.env.REACT_APP_URL}/verify?workspace=${
            workspace?._id
          }&email=${encodeURIComponent(
            client_member_detail?.email
          )}&token=${invitation_token}&workspace_name=${
            workspace?.name
          }&first_name=${client_member_detail?.first_name}&last_name=${
            client_member_detail?.last_name
          }`;

          const email_template = templateMaker("teamInvitation.html", {
            REACT_APP_URL: process.env.REACT_APP_URL,
            SERVER_URL: process.env.SERVER_URL,
            username:
              capitalizeFirstLetter(client_member_detail?.first_name) +
              " " +
              capitalizeFirstLetter(client_member_detail?.last_name),
            invitation_text: `You are invited to the ${
              workspace?.name
            } workspace by ${
              capitalizeFirstLetter(user?.first_name) +
              " " +
              capitalizeFirstLetter(user?.last_name)
            }. Click on the below link to join the workspace.`,
            link: link,
            instagram: configuration?.urls?.instagram,
            facebook: configuration?.urls?.facebook,
            privacy_policy: configuration?.urls?.privacy_policy,
          });

          sendEmail({
            email: client_member_detail?.email,
            subject: returnMessage("auth", "invitationEmailSubject"),
            message: email_template,
          });
        }

        await Workspace.findOneAndUpdate(
          { _id: workspace?._id, "members.user_id": member_id },
          {
            $set: {
              "members.$.invitation_token": invitation_token,
              "members.$.status":
                sheets?.total_sheets - 1 > sheets?.occupied_sheets?.length ||
                workspace?.trial_end_date
                  ? "confirm_pending"
                  : "payment_pending",
            },
          }
        );
        const occupied_sheets = [...sheets.occupied_sheets];
        occupied_sheets.push({
          user_id: client_member_detail?._id,
          role: role?._id,
          workspace: workspace?._id,
        });

        await SheetManagement.findByIdAndUpdate(sheets?._id, {
          occupied_sheets: occupied_sheets,
          total_sheets: sheets?.total_sheets + 1,
        });
      } else if (status === "reject") {
        await Workspace.findOneAndUpdate(
          { _id: workspace?._id, "members.user_id": member_id },
          {
            $set: {
              "members.$.status": "rejected",
            },
          }
        );
      }
      return;
    } catch (error) {
      logger.error(
        `Error while approve or reject the client team member: ${error}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = TeamMemberService;
