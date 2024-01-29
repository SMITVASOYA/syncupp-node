const Activity = require("../models/activitySchema");
const ActivityStatus = require("../models/masters/activityStatusMasterSchema");
const ActivityType = require("../models/masters/activityTypeMasterSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const {
  returnMessage,
  paginationObject,
  getKeywordType,
} = require("../utils/utils");
const moment = require("moment");
class ActivityService {
  createTask = async (payload, id) => {
    try {
      const {
        internal_info,
        due_date,
        due_time,
        assign_to,
        assign_by,
        client_id,
        mark_as_done,
      } = payload;
      const dueDateObject = moment(due_date);

      dueDateObject.startOf("day");

      const currentDate = moment().startOf("day");

      if (dueDateObject.isSameOrBefore(currentDate)) {
        return returnMessage("activity", "dateinvalid");
      }
      let status;
      if (mark_as_done === true) {
        status = await ActivityStatus.findOne({ name: "completed" }).lean();
      } else {
        status = await ActivityStatus.findOne({ name: "pending" }).lean();
      }

      const type = await ActivityType.findOne({ name: "task" }).lean();

      const newTask = new Activity({
        internal_info,
        due_date: dueDateObject.toDate(),
        due_time,
        assign_to,
        assign_by,
        client_id,
        activity_status: status._id,
        activity_type: type._id,
      });
      return newTask.save();
    } catch (error) {
      logger.error(`Error while creating task : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  activityStatus = async () => {
    try {
      return await ActivityStatus.find();
    } catch (error) {
      logger.error(`Error while fetch list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };

  taskList = async () => {
    try {
      const queryObj = { is_deleted: false };
      const pagination = paginationObject(searchObj);

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            receiver: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            status: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];

        const keywordType = getKeywordType(searchObj.search);
        if (keywordType === "number") {
          const numericKeyword = parseInt(searchObj.search);

          queryObj["$or"].push({
            revenue_made: numericKeyword,
          });
        } else if (keywordType === "date") {
          const dateKeyword = new Date(searchObj.search);
          queryObj["$or"].push({ due_date: dateKeyword });
          queryObj["$or"].push({ updatedAt: dateKeyword });
        }
      }
      const aggregationPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "receiver",
            foreignField: "_id",
            as: "agreement_Data",
          },
        },
        {
          $unwind: "$agreement_Data",
        },
        {
          $match: queryObj,
        },
        {
          $project: {
            first_name: "$agreement_Data.first_name",
            last_name: "$agreement_Data.last_name",
            email: "$agreement_Data.email",
            receiver: "$agreement_Data.name",
            contact_number: 1,
            title: 1,
            status: 1,
            agreement_content: 1,
            due_date: 1,
          },
        },
      ];
      const agreements = await Agreement.aggregate(aggregationPipeline)
        .skip(pagination.skip)
        .limit(pagination.result_per_page)
        .sort(pagination.sort);

      const totalAgreementsCount = await Agreement.countDocuments(queryObj);

      // Calculating total pages
      const pages = Math.ceil(
        totalAgreementsCount / pagination.result_per_page
      );

      return {
        agreements,
        page_count: pages,
      };
    } catch (error) {
      logger.error(`Error while fetch list : ${error}`);
      return throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ActivityService;
