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
          name: workspace_name.trim(),
          is_deleted: false,
        }).lean(),
        Configuration.findOne({}).lean(),
        Role_Master.findOne({ name: "agency" }).lean(),
      ]);

      if (workspace_name_exist)
        return throwError(returnMessage("workspace", "duplicateWorkspaceName"));

      const workspace_obj = {
        name: workspace_name.trim(),
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

  updateWorkspace = async (payload, user) => {
    try {
      const { workspace_id, agency_id } = payload;
      const member_obj = {
        user_id: user?._id,
        status: "confirm_pending",
        role: user?.role,
        joining_date: moment.utc().startOf("day"),
      };

      // Add in workspace and Increse the sheet count
      Promise.all([
        await Workspace.findByIdAndUpdate(
          {
            _id: workspace_id,
          },
          {
            $push: {
              members: member_obj,
            },
          },
          {
            new: true,
          }
        ),
        await SheetManagement.findOneAndUpdate(
          { agency_id: agency_id },
          {
            $inc: { total_sheets: 1 },
            $push: {
              occupied_sheets: {
                user_id: user?._id,
                role: user?.role, // Assuming total_sheets should be based on workspace members count
              },
            },
          },
          { new: true }
        ),
      ]);
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
          members: {
            $elemMatch: { user_id: user?._id, status: { $ne: "deleted" } },
          },
          is_deleted: false,
          created_by: { $ne: user?._id },
        })
          .sort({ "members.joining_date": -1 })
          .lean(),
      ]);
      const workspaces = [...created, ...invited];
      if (workspaces.length > 0) workspaces[0].default_workspace = true;
      return workspaces;
    } catch (error) {
      logger.error(`Error while fetching the workspaces: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  updateTrialEndDate = async (payload, agency_id) => {
    try {
      const { trial_end_date } = payload;
      const today = moment.utc().startOf("day");
      const trial_extend_date = moment
        .utc(trial_end_date, "DD-MM-YYYY")
        .startOf("day");
      if (trial_extend_date.isSameOrAfter(today))
        return throwError(returnMessage("workspace", "invalidTrailExtendDate"));

      const workspace = await Workspace.findOne({
        created_by: agency_id,
        free_trial_end: { $exists: true },
        is_deleted: false,
      }).lean();

      if (!workspace)
        return throwError(returnMessage("workspace", "workspaceNotFound"), 404);

      await Workspace.findByIdAndUpdate(workspace?._id, {
        trial_end_date: trial_extend_date,
      });

      return;
    } catch (error) {
      logger.error(`Error while updating the trial end date: ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = WorkspaceService;
