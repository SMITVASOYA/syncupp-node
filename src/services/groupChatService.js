const { throwError } = require("../helpers/errorUtil");
const logger = require("../logger");
const Authentication = require("../models/authenticationSchema");
const Client = require("../models/clientSchema");
const Team_Agency = require("../models/teamAgencySchema");
const Team_Client = require("../models/teamClientSchema");
const { returnMessage } = require("../utils/utils");
const Group_Chat = require("../models/groupChatSchema");

class GroupChatService {
  // this function is used to fetch the users list to create the group
  // Agency can create Group with Client and Agency Team member
  // Client can create Group with Agency and Client Team member
  // Agency can create Group internally with Agency Team member
  // Client can create Group internally with Client Team member

  usersList = async (user) => {
    try {
      let member_ids;
      if (user?.role?.name === "agency") {
        const [clients, agency_teams] = await Promise.all([
          Client.distinct("_id", {
            "agency_ids.agency_id": user?.reference_id,
            "agency_ids.status": "active",
          }),
          Team_Agency.distinct("_id", {
            agency_id: user?.reference_id,
            is_deleted: false,
          }),
        ]);

        member_ids = [...clients, ...agency_teams];
      } else if (user?.role?.name === "client") {
        const [client_details, client_teams] = await Promise.all([
          Client.findById(user?.reference_id).lean(),
          Team_Client.distinct("_id", { client_id: user?.reference_id }),
        ]);

        const agency_ids = [];

        client_details?.agency_ids?.forEach((agency) => {
          if (agency?.status === "active") {
            agency_ids.push(agency?.agency_id);
            return;
          }
          return;
        });

        member_ids = [...agency_ids, ...client_teams];
      }

      return await Authentication.find({
        reference_id: { $in: member_ids },
        is_deleted: false,
      })
        .populate("role", "name")
        .select("first_name last_name email role")
        .lean();
    } catch (error) {
      logger.error(
        `Error While fetching the users list for the Group: ${error?.message}`
      );
      return throwError(error?.message, error?.statusCode);
    }
  };

  //   this is used for the create the group
  createGroupChat = async (payload, user) => {
    try {
      if (user?.role !== "agency" || user?.role !== "client")
        return throwError(returnMessage("chat", "insufficientPermission"));
      let { group_name, members } = payload;
      if (members.length === 0)
        return throwError(returnMessage("chat", "membersRequired"));

      if (!group_name || group_name === "")
        return throwError(returnMessage("chat", "groupNameRequired"));
      members.push(user.reference_id.toString());
      members = [...new Set(members)];

      await Group_Chat.create({
        created_by: user?.reference_id,
        members,
        group_name,
      });
    } catch (error) {
      logger.error(`Error while creating the group: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  // this function is used to convert the array of users object ids to string type object id so we can
  // send socket event to that array of users id
  objectIdToString = (ids) => {
    return ids.map((id) => id.toString());
  };
}

module.exports = GroupChatService;
