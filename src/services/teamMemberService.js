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
const { ObjectId } = require("mongodb");
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

class TeamMemberService {
  // Add Team Member by agency or client
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
  };

  // Add the team member by the Agency it self
  addAgencyTeam = async (payload, user) => {
    try {
      const { email, first_name, last_name, contact_number, role } = payload;
      if (!role || role === "")
        return throwError(returnMessage("teamMember", "roleRequired"));
      let check_agency;
      // removed team member of admin role can add the team member
      // if (user?.role?.name === "team_agency") {
      //   check_agency = await Team_Agency.findById(user?.reference_id)
      //     .populate("role", "name")
      //     .lean();
      // }

      const [team_member_exist, team_role, role_for_auth, plan] =
        await Promise.all([
          Authentication.findOne({
            email,
            is_deleted: false,
          }).lean(),
          Team_Role_Master.findOne({ name: role }).select("_id").lean(),
          Role_Master.findOne({ name: "team_agency" }).lean(),
          SubscriptionPlan.findById(user?.purchased_plan).lean(),
        ]);

      if (plan?.plan_type === "unlimited") {
        const sheets = await SheetManagement.findOne({
          agency_id: user?.reference_id,
        }).lean();

        if (sheets?.occupied_sheets?.length >= sheets?.total_sheets - 1)
          return throwError(returnMessage("payment", "maxSheetsAllocated"));
      }

      let team_member_create_query = {
        agency_id: user?.reference_id,
        role: team_role?._id,
      };
      if (check_agency?.role?.name === "admin") {
        team_member_create_query = {
          ...team_member_create_query,
          created_by: check_agency?.agency_id,
        };
      }

      if (team_member_exist)
        return throwError(returnMessage("teamMember", "emailExist"));

      let invitation_token = crypto.randomBytes(32).toString("hex");

      const team_agency = await Team_Agency.create(team_member_create_query);

      await Authentication.create({
        first_name,
        last_name,
        name:
          capitalizeFirstLetter(first_name) +
          " " +
          capitalizeFirstLetter(last_name),
        status: "payment_pending",
        email: email?.toLowerCase(),
        reference_id: team_agency?._id,
        contact_number,
        invitation_token,
        role: role_for_auth?._id,
      });

      if (user?.status === "free_trial") {
        await this.freeTrialMemberAdd(user?.reference_id, team_agency?._id);
      }
      return {
        reference_id: team_agency?._id,
        referral_points: 0, // this wil be change in future when the referral point will be integrate
      };
    } catch (error) {
      logger.error(`Error While adding the Team member by agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Add the team member for the particular agency by client
  addClientTeam = async (payload, user) => {
    try {
      const { email, first_name, last_name, agency_id, contact_number, role } =
        payload;
      if (!agency_id || agency_id === "")
        return throwError(returnMessage("teamMember", "agencyIdRequired"));

      if (!role || role === "")
        return throwError(returnMessage("teamMember", "roleRequired"));

      const agency_exist = await Agency.findById(agency_id).lean();
      if (!agency_exist)
        return throwError(
          returnMessage("agency", "agencyNotFound"),
          statusCode?.notFound
        );

      const [team_client_exist, team_role, team_auth_role] = await Promise.all([
        Authentication.findOne({
          email,
          is_deleted: false,
        })
          .populate("role", "name")
          .lean(),
        Team_Role_Master.findOne({ name: "team_client" }).lean(),
        Role_Master.findOne({ name: "team_client" }).lean(),
      ]);

      if (!team_client_exist) {
        const new_team_client = await Team_Client.create({
          client_id: user?.reference_id,
          agency_ids: [
            { agency_id, status: "requested", created_by: user?.created_by },
          ],
          role: team_role?._id,
        });

        const newMember = await Authentication.create({
          first_name,
          last_name,
          name:
            capitalizeFirstLetter(first_name) +
            " " +
            capitalizeFirstLetter(last_name),
          email: email?.toLowerCase(),
          contact_number,
          role: team_auth_role?._id,
          reference_id: new_team_client?._id,
          status: "confirm_pending",
        });

        // ------------------  Notifications ----------------

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

        return;
      } else {
        if (team_client_exist?.role?.name !== "team_client")
          return throwError(returnMessage("auth", "emailExist"));

        const team_member = await Team_Client.findById(
          team_client_exist?.reference_id
        ).lean();

        team_member?.agency_ids?.forEach((agency, index) => {
          if (
            agency?.agency_id.toString() === agency_id &&
            (agency?.status === "requested" || agency?.status === "confirmed")
          ) {
            return throwError(
              returnMessage("teamMember", "agencyIdAlreadyExists")
            );
          } else {
            team_member?.agency_ids.splice(index, 1);
          }
        });

        const agency_ids = [
          ...team_member.agency_ids,
          { agency_id, status: "requested", created_by: user?.created_by },
        ];

        await Team_Client.findByIdAndUpdate(
          team_client_exist?.reference_id,
          {
            agency_ids,
          },
          { new: true }
        );
      }

      return;
    } catch (error) {
      logger.error(`Error While adding the Team member by client: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Verify Team Member
  verify = async (payload) => {
    try {
      const {
        first_name,
        last_name,
        email,
        password,
        token,
        agency_id,
        client_id,
        redirect,
      } = payload;

      if (token && !redirect) {
        // removed because of the payment
        // const hash_token = crypto
        //   .createHash("sha256")
        //   .update(token)
        //   .digest("hex");
        const teamMember = await Authentication.findOne({
          email: email,
          invitation_token: token,
          is_deleted: false,
        });

        if (!teamMember) {
          return throwError(returnMessage("teamMember", "invalidToken"));
        }
        const hash_password = await authService.passwordEncryption({
          password,
        });

        const referral_code = await this.referralCodeGenerator();
        let affiliate_referral_code = await this.referralCodeGenerator();

        teamMember.email = email;
        teamMember.invitation_token = undefined;
        teamMember.password = hash_password;
        teamMember.status = "confirmed";
        teamMember.referral_code = referral_code;
        teamMember.affiliate_referral_code = affiliate_referral_code;

        await teamMember.save();
        const company_urls = await Configuration.find().lean();
        let privacy_policy = company_urls[0]?.urls?.privacy_policy;

        let facebook = company_urls[0]?.urls?.facebook;

        let instagram = company_urls[0]?.urls?.instagram;
        const welcome_mail = welcomeMail(
          teamMember?.name,
          privacy_policy,
          instagram,
          facebook
        );

        await sendEmail({
          email: teamMember?.email,
          subject: returnMessage("emailTemplate", "welcomeMailSubject"),
          message: welcome_mail,
        });
        return;
      } else if (client_id && client_id !== "") {
        if (!validateEmail(email))
          return throwError(returnMessage("auth", "invalidEmail"));

        const team_auth_role = await Role_Master.findOne({
          name: "team_client",
        }).lean();

        const client_team_member = await Authentication.findOne({
          email,
          role: team_auth_role?._id,
        }).lean();

        if (!client_team_member)
          return throwError(
            returnMessage("auth", "userNotFound"),
            statusCode.notFound
          );

        const team_client = await Team_Client.findById(
          client_team_member?.reference_id
        ).lean();

        if (!team_client)
          return throwError(
            returnMessage("auth", "userNotFound"),
            statusCode.notFound
          );

        const agency_id_exist = team_client?.agency_ids.filter(
          (agency) =>
            agency?.agency_id.toString() === agency_id &&
            agency?.status === "pending"
        );

        if (agency_id_exist.length === 0)
          return throwError(returnMessage("agency", "agencyNotFound"));

        if (redirect && !(client_team_member && client_team_member?.password)) {
          await Team_Client.updateOne(
            { _id: team_client?._id, "agency_ids.agency_id": agency_id },
            { $set: { "agency_ids.$.status": "confirmed" } },
            { new: true }
          );
          return authService.tokenGenerator(client_team_member);
        } else {
          if (client_team_member && client_team_member?.password)
            return throwError(
              returnMessage("teamMember", "alreadyVerified"),
              statusCode.unprocessableEntity
            );

          const hash_password = await authService.passwordEncryption({
            password,
          });
          await Authentication.findByIdAndUpdate(client_team_member?._id, {
            first_name,
            last_name,
            password: hash_password,
            status: "confirmed",
          });

          await Team_Client.updateOne(
            { _id: team_client?._id, "agency_ids.agency_id": agency_id },
            { $set: { "agency_ids.$.status": "confirmed" } },
            { new: true }
          );
          const company_urls = await Configuration.find().lean();
          let privacy_policy = company_urls[0]?.urls?.privacy_policy;

          let facebook = company_urls[0]?.urls?.facebook;

          let instagram = company_urls[0]?.urls?.instagram;
          const welcome_mail = welcomeMail(
            client_team_member?.name,
            privacy_policy,
            instagram,
            facebook
          );

          await sendEmail({
            email: client_team_member?.email,
            subject: returnMessage("emailTemplate", "welcomeMailSubject"),
            message: welcome_mail,
          });

          // ------------------  Notifications ----------------
          const clientData = await Authentication.findOne({
            reference_id: client_id,
          }).lean();

          const agencyData = await Authentication.findOne({
            reference_id: agency_id,
          }).lean();

          await notificationService.addNotification({
            module_name: "general",
            action_name: "teamClientPasswordSet",
            member_name: client_team_member?.name,
            client_name: clientData?.first_name + " " + clientData?.last_name,
            receiver_id: agency_id,
            client_id: client_id,
          });

          const teamMemberJoinedTemp = teamMemberPasswordSet({
            ...client_team_member,
            member_name:
              client_team_member.first_name +
              " " +
              client_team_member.last_name,
            client_name: clientData?.first_name + " " + clientData?.last_name,
          });
          sendEmail({
            email: agencyData?.email,
            subject: returnMessage("emailTemplate", "teamMemberPasswordSet"),
            message: teamMemberJoinedTemp,
          });

          // ------------------  Notifications ----------------
          return authService.tokenGenerator(client_team_member);
        }
      }
      return throwError(
        returnMessage("teamMember", "invalidVerificationLink"),
        statusCode.unprocessableEntity
      );
    } catch (error) {
      logger.error(`Error while Team Member verify , ${error}`);
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

  getMember = async (user_id, memberId) => {
    try {
      const teamMemberInfo = await Authentication.findOne(
        {
          _id: user_id,
          is_deleted: false,
        },
        { password: 0 }
      )
        .populate({
          path: "role",
          model: "role_master",
          select: "-createdAt -updatedAt",
        })
        .lean();

      let memberOf;
      let teamMemberSchemaName;
      if (teamMemberInfo.role.name === "agency") {
        memberOf = "agency_id";
        teamMemberSchemaName = "team_agencies";
      }
      if (
        teamMemberInfo.role.name === "client" ||
        teamMemberInfo.role.name === "team_client" // this will use for the team cleint to provide the same access as a client
      ) {
        memberOf = "client_id";
        teamMemberSchemaName = "team_clients";
      }
      if (teamMemberInfo.role.name === "team_agency") {
        memberOf = "agency_id";
        teamMemberSchemaName = "team_agencies";
      }

      const pipeLine = [
        {
          $match: {
            _id: new ObjectId(memberId),
            is_deleted: false,
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
          $addFields: {
            log_after_match: "$$ROOT", // Create a new field for logging
          },
        },
        {
          $unwind: { path: "$user_type", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: teamMemberSchemaName,
            localField: "reference_id",
            foreignField: "_id",
            as: "member_data",
            pipeline: [{ $project: { role: 1, [memberOf]: 1 } }],
          },
        },
        {
          $unwind: { path: "$member_data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "team_role_masters",
            localField: "member_data.role",
            foreignField: "_id",
            as: "member_role",
            pipeline: [{ $project: { name: 1 } }],
          },
        },

        {
          $project: {
            _id: 1,
            email: 1,
            user_type: "$user_type.name",
            [memberOf]: "$member_data." + memberOf,
            reference_id: 1,
            createdAt: 1,
            updatedAt: 1,
            first_name: 1,
            last_name: 1,
            contact_number: 1,
            image_url: 1,
            status: 1,
            name: { $concat: ["$first_name", " ", "$last_name"] },
            contact_number: 1,
            member_role: {
              $cond: {
                if: { $eq: [{ $size: "$member_role" }, 0] },
                then: "$$REMOVE",
                else: { $arrayElemAt: ["$member_role", 0] },
              },
            },
          },
        },
      ];

      const teamMember = await Authentication.aggregate(pipeLine);
      if (!teamMember) {
        return throwError(returnMessage("teamMember", "invalidId"));
      }
      return teamMember;
    } catch (error) {
      logger.error(`Error while get team member, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function will used for the delete team member only for the agency
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
  };

  // Edit Team Member

  editMember = async (payload, team_member_id, user) => {
    try {
      const team_member_exist = await Authentication.findById(team_member_id)
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
      }
    } catch (error) {
      logger.error(`Error while Team member Edit, ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // Get all team members by Agency and by client
  getAllTeam = async (payload, user) => {
    try {
      if (!payload?.pagination) {
        return await this.teamListWithoutPagination(user);
      }
      const pagination = paginationObject(payload);
      let search_obj = {};
      if (payload?.search && payload?.search !== "") {
        search_obj["$or"] = [
          { name: { $regex: payload.search, $options: "i" } },
          { first_name: { $regex: payload.search, $options: "i" } },
          { last_name: { $regex: payload.search, $options: "i" } },
          { email: { $regex: payload.search, $options: "i" } },
          { contact_number: { $regex: payload.search, $options: "i" } },
          { status: { $regex: payload.search, $options: "i" } },
        ];
      }
      if (user?.role?.name === "agency" || user?.role?.name === "team_agency") {
        if (user?.role?.name === "team_agency") {
          const team_agency_detail = await Team_Agency.findById(
            user?.reference_id
          )
            .populate("role", "name")
            .lean();
          if (team_agency_detail?.role?.name === "admin") {
            user = await Authentication.findOne({
              reference_id: team_agency_detail?.agency_id,
            })
              .populate("role", "name")
              .lean();
          }
        }
        if (payload?.client_team) {
          const query_obj = {
            "agency_ids.agency_id": user?.reference_id,
            client_id: payload?.client_id,
            "agency_ids.status": { $ne: "deleted" },
          };

          const team_clients_ids = await Team_Client.distinct("_id", query_obj);

          const [teams, total_teams] = await Promise.all([
            Authentication.find({
              reference_id: { $in: team_clients_ids },
              is_deleted: false,
              ...search_obj,
            })
              .select(
                "name first_name last_name email contact_number status createdAt reference_id"
              )
              .populate({ path: "reference_id", model: "team_client" })
              .sort(pagination.sort)
              .skip(pagination.skip)
              .limit(pagination.result_per_page)
              .lean(),
            Authentication.countDocuments({
              reference_id: { $in: team_clients_ids },
              is_deleted: false,
              ...search_obj,
            }),
          ]);

          teams.forEach((team) => {
            team.name = team?.first_name + " " + team?.last_name;
            const agency_exists = team?.reference_id?.agency_ids?.find(
              (ag) => ag?.agency_id?.toString() == user?.reference_id
            );
            if (agency_exists) {
              team["status"] = agency_exists?.status;
            }
            delete team?.reference_id?.agency_ids;
          });

          return {
            teamMemberList: teams,
            page_count:
              Math.ceil(total_teams / pagination.result_per_page) || 0,
          };
        }
        // const team_agency_ids = await Team_Agency.distinct("_id", {
        //   agency_id: user?.reference_id
        // });
        const team_agency_ids = await Team_Agency.distinct("_id", {
          $or: [
            { agency_id: user?.reference_id },
            { created_by: user?.reference_id },
          ],
        });
        const [teams, total_teams] = await Promise.all([
          Authentication.find({
            reference_id: { $in: team_agency_ids },
            is_deleted: false,
            ...search_obj,
          })
            .select(
              "name first_name last_name email contact_number status createdAt reference_id"
            )
            .populate({
              path: "reference_id",
              model: "team_agency",
              populate: {
                path: "role",
                model: "team_role_master",
                select: "name",
              },
            })
            .sort(pagination.sort)
            .skip(pagination.skip)
            .limit(pagination.result_per_page)
            .lean(),
          Authentication.countDocuments({
            reference_id: { $in: team_agency_ids },
            is_deleted: false,
            ...search_obj,
          }),
        ]);

        teams.forEach((team) => {
          team.name = team?.first_name + " " + team?.last_name;
        });
        return {
          teamMemberList: teams,
          page_count: Math.ceil(total_teams / pagination.result_per_page) || 0,
          referral_points: 0, // this wil be change in future when the referral point will be integrate
        };
      } else if (
        user?.role?.name === "client" ||
        user?.role?.name === "team_client"
      ) {
        // this condition will used to give access to team-client as a client
        if (user?.role?.name === "team_client") {
          const team_client_detail = await Team_Client.findById(
            user?.reference_id
          ).lean();
          user = await Authentication.findOne({
            reference_id: team_client_detail.client_id,
          })
            .populate("role", "name")
            .lean();
        }
        const team_client_ids = await Team_Client.distinct("_id", {
          client_id: user?.reference_id,
          "agency_ids.agency_id": payload?.agency_id,
        });

        const [teams, total_teams] = await Promise.all([
          Authentication.find({
            reference_id: { $in: team_client_ids },
            is_deleted: false,
            ...search_obj,
          })
            .populate({
              path: "reference_id",
              model: "team_client",
              match: { "agency_ids.agency_id": payload?.agency_id },
            })
            .sort(pagination.sort)
            .skip(pagination.skip)
            .limit(pagination.result_per_page)
            .lean(),
          Authentication.countDocuments({
            reference_id: { $in: team_client_ids },
            is_deleted: false,
            ...search_obj,
          }),
        ]);

        teams.forEach((team) => {
          team.name =
            capitalizeFirstLetter(team?.first_name) +
            " " +
            capitalizeFirstLetter(team?.last_name);
          if (team?.reference_id?.agency_ids) {
            return team?.reference_id?.agency_ids.forEach((t) => {
              if (t?.agency_id?.toString() == payload?.agency_id)
                return (team.status = t?.status);
            });
          }
        });
        return {
          teamMemberList: teams,
          page_count: Math.ceil(total_teams / pagination.result_per_page) || 0,
          referral_points: 0, // this wil be change in future when the referral point will be integrate
        };
      }
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
            status: "confirmed",
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
      const {
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

      let imagePath = false;
      if (image) {
        imagePath = "uploads/" + image.filename;
      } else if (image === "") {
        imagePath = "";
      }

      const existingImage = await Authentication.findById(user_id);
      existingImage &&
        fs.unlink(`./src/public/${existingImage.profile_image}`, (err) => {
          if (err) {
            logger.error(`Error while unlinking the documents: ${err}`);
          }
        });

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

  // reject the client team member
  rejectTeamMember = async (payload, agency) => {
    try {
      if (agency?.role?.name !== "agency")
        return throwError(returnMessage("auth", "insufficientPermission"), 403);

      let team_member_exist,
        status = "rejected";

      if (payload?.status === "accept") status = "confirmed";

      // if (agency?.role?.name === "team_agency") {
      //   const team_agency_detail = await Team_Agency.findById(
      //     agency?.reference_id
      //   )
      //     .populate("role", "name")
      //     .lean();
      //   if (team_agency_detail?.role?.name === "admin") {
      //     agency = await Authentication.findOne({
      //       reference_id: team_agency_detail.agency_id,
      //     }).lean();
      //   }
      // }

      team_member_exist = await Team_Client.findOne({
        _id: payload?.id,
        "agency_ids.agency_id": agency?.reference_id,
        "agency_ids.status": "requested",
      }).lean();

      if (!team_member_exist)
        return throwError(
          returnMessage("teamMember", "teamMemberNotFound"),
          statusCode?.notFound
        );

      await Team_Client.updateOne(
        { _id: payload?.id, "agency_ids.agency_id": agency?.reference_id },
        { $set: { "agency_ids.$.status": status } },
        { new: true }
      );

      if (payload?.status === "accept") {
        await this.freeTrialMemberAdd(agency?.reference_id, payload?.id);
      }

      return;
    } catch (error) {
      logger.error(`Error while rejecting the team member by agency: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

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
      let search_id;
      let admin_id;
      const memberRole = await Team_Agency.findOne({
        _id: user.reference_id,
      }).populate("role");
      if (memberRole.role.name === "team_member") {
        search_id = "assign_to";
      }
      if (memberRole.role.name === "admin") {
        search_id = "agency_id";
        admin_id = memberRole.agency_id;
      }

      const currentDate = moment();
      const startOfToday = moment(currentDate).startOf("day");
      const endOfToday = moment(currentDate).endOf("day");

      const [
        taskCount,
        pendingTask,
        completedTask,
        inprogressTask,
        overdueTask,
        todaysCallMeeting,
      ] = await Promise.all([
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              is_deleted: false,
              "statusName.name": { $ne: "cancel" }, // Fix: Change $nq to $ne
              "typeName.name": "task",
            },
          },
          {
            $count: "totalTaskCount",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              is_deleted: false,
              "statusName.name": { $eq: "pending" }, // Fix: Change $nq to $ne
              "typeName.name": "task",
            },
          },
          {
            $count: "pendingTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              is_deleted: false,

              "statusName.name": { $eq: "completed" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "completedTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              is_deleted: false,
              "typeName.name": "task",
              "statusName.name": { $eq: "in_progress" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "inprogressTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_status_masters",
              localField: "activity_status",
              foreignField: "_id",
              as: "statusName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$statusName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "typeName",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$typeName",
              preserveNullAndEmptyArrays: true,
            },
          },

          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              is_deleted: false,
              "typeName.name": "task",
              "statusName.name": { $eq: "overdue" }, // Fix: Change $nq to $ne
            },
          },
          {
            $count: "overdueTask",
          },
        ]),
        Activity.aggregate([
          {
            $lookup: {
              from: "activity_type_masters",
              localField: "activity_type",
              foreignField: "_id",
              as: "activityType",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          {
            $unwind: {
              path: "$activityType",
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $match: {
              [search_id]: admin_id ? admin_id : user.reference_id,
              "activityType.name": { $eq: "call_meeting" },
              is_deleted: false,
              meeting_start_time: {
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
        SheetManagement.findOne({ agency_id }).lean(),
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
        )} has sent an invitation to you. please click on below button to join SyncUpp.`;
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
        )} has sent an invitation to you. please click on below button to join SyncUpp.`;
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
        )} has sent an invitation to you. please click on below button to join SyncUpp.`;
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
}

module.exports = TeamMemberService;
