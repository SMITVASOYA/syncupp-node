const logger = require("../logger");
const Workspace = require("../models/workspaceSchema");
const { throwError } = require("../helpers/errorUtil");
const statusCode = require("../messages/statusCodes.json");
const moment = require("moment");
const { returnMessage, validateRequestFields } = require("../utils/utils");
const Configuration = require("../models/configurationSchema");
const Role_Master = require("../models/masters/roleMasterSchema");
const SheetManagement = require("../models/sheetManagementSchema");

class WorkspaceService {
  createWorkspace = async (payload, user) => {
    try {
      const { workspace_name } = payload;
      if (!workspace_name) return throwError("workspace", "nameMissing");
      // this is used to check that user only creates the one workspace
      const workspace_exist = await Workspace.findOne({
        created_by: user?._id,
        is_deleted: false,
      }).lean();

      if (workspace_exist)
        return throwError(
          returnMessage("workspace", "workspaceAlreadyCreated")
        );

      const [workspace_name_exist, configuration, role] = await Promise.all([
        Workspace.findOne({
          name: workspace_name,
          is_deleted: false,
        }).lean(),
        Configuration.findOne({}).lean(),
        Role_Master.findOne({ name: "agency" }).lean(),
      ]);

      if (workspace_name_exist)
        return throwError(returnMessage("workspace", "duplicateWorkspaceName"));

      const workspace_obj = {
        name: workspace_name,
        created_by: user?._id,
        members: [
          {
            user_id: user?._id,
            status: "confirmed",
            role: role?._id,
            joining_date: moment.utc().startOf("day"),
          },
        ],
      };

      if (configuration && configuration?.payment?.free_trial > 0) {
        workspace_obj.trial_end_date = moment
          .utc()
          .startOf("day")
          .add(configuration?.payment?.free_trial, "days");
      }
      const new_workspace = await Workspace.create(workspace_obj);

      if (new_workspace)
        await SheetManagement.findOneAndUpdate(
          { user_id: user?._id },
          {
            user_id: user?._id,
            total_sheets: 1,
            occupied_sheets: [],
          },
          { upsert: true }
        );

      return;
    } catch (error) {
      logger.error(`Error while creating the workspace: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  workspaces = async (user) => {
    try {
      const [created, invited] = await Promise.all([
        Workspace.find({ created_by: user?._id, is_deleted: false }).lean(),
        Workspace.find({
          "members.user_id": user?._id,
          is_deleted: false,
          created_by: { $ne: user?._id },
        })
          .sort({ "members.joining_date": -1 })
          .lean(),
      ]);
      const workspaces = [...created, ...invited];
      workspaces[0].default_workspace = true;
      return workspaces;
    } catch (error) {
      logger.error(`Error while fetching the workspaces: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = WorkspaceService;
