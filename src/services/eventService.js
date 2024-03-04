const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, paginationObject } = require("../utils/utils");
const sendEmail = require("../helpers/sendEmail");
const ActivityStatus = require("../models/masters/activityStatusMasterSchema");
const moment = require("moment");
const Event = require("../models/eventSchema");
const { default: mongoose } = require("mongoose");
const ActivityType = require("../models/masters/activityTypeMasterSchema");

class ScheduleEvent {
  //create event
  createEvent = async (payload, user) => {
    try {
      const {
        title,
        agenda,
        due_date,
        event_start_time,
        event_end_time,
        email,
        internal_info,
      } = payload;

      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${due_date}-${event_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${due_date}-${event_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("event", "dateinvalid"));

      if (!end_time.isAfter(start_time))
        return throwError(returnMessage("event", "invalidTime"));

      let recurring_date = moment
        .utc(payload?.recurring_end_date, "DD-MM-YYYY")
        .endOf("day");
      if (!recurring_date.isSameOrAfter(start_date))
        return throwError(returnMessage("event", "invalidRecurringDate"));

      const event_status_type = await ActivityStatus.findOne({
        name: "pending",
      })
        .select("name")
        .lean();

      // this condition is used for the check if client or team member is assined to any same time event or not
      const or_condition = [
        {
          $and: [
            { event_start_time: { $gte: start_time } },
            { event_end_time: { $lte: end_time } },
          ],
        },
        {
          $and: [
            { event_start_time: { $lte: start_time } },
            { event_end_time: { $gte: end_time } },
          ],
        },
        {
          $and: [
            { event_start_time: { $gte: start_time } },
            { event_end_time: { $lte: end_time } },
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { event_start_time: { $lte: start_time } },
            { event_end_time: { $gte: end_time } },
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
      ];

      let event_exist;
      if (
        user?.role?.name === "agency" ||
        user?.role?.name === "team_agency" ||
        user?.role?.name === "client" ||
        user?.role?.name === "team_client"
      ) {
        event_exist = await Event.findOne({
          $or: [
            { created_by: user.reference_id },
            { email: { $in: payload.email } },
          ],
          $and: or_condition,
          event_status: { $eq: event_status_type?._id },
        }).lean();
      }

      if (event_exist) {
        if (
          // email === event_exist.email &&
          payload.createEventIfEmailExists === "yes"
        ) {
          // If email exists and flag is set to "yes", create the event
          const newEvent = await Event.create({
            created_by: user?.reference_id,
            agenda,
            title,
            event_start_time: start_time,
            event_end_time: end_time,
            due_date: start_date,
            recurring_end_date: recurring_date,
            email,
            event_status: event_status_type._id,
            internal_info,
          });
          return newEvent;
        } else {
          // If email exists and flag is not set to "yes", return error
          return {
            status: 409, // Conflict status code
            message: returnMessage("event", "eventScheduledForTeam"),
          };
        }
      } else {
        // If email does not exist, create the event
        const newEvent = await Event.create({
          created_by: user?.reference_id,
          agenda,
          title,
          event_start_time: start_time,
          event_end_time: end_time,
          due_date: start_date,
          recurring_end_date: recurring_date,
          email,
          event_status: event_status_type._id,
          internal_info,
        });
        return newEvent;
      }
    } catch (error) {
      logger.error(`Error while creating event, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
  //fetch event with id
  fetchEvent = async (id) => {
    try {
      const eventPipeline = [
        {
          $lookup: {
            from: "authentications",
            localField: "created_by",
            foreignField: "reference_id",
            as: "agency_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  agency_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$agency_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "activity_status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: {
            path: "$activity_status",
            preserveNullAndEmptyArrays: true,
          },
        },

        {
          $match: {
            _id: new mongoose.Types.ObjectId(id),
            is_deleted: false,
          },
        },
        {
          $project: {
            contact_number: 1,
            title: 1,
            due_time: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            event_start_time: 1,
            event_end_time: 1,
            recurring_end_date: 1,
            internal_info: 1,
            email: 1,
            status: "$activity_status.name",
          },
        },
      ];

      const result = await Event.aggregate(eventPipeline);
      return result;
    } catch (error) {
      logger.error(`Error while fetching  event, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
  //event list with filter
  eventList = async (payload, user) => {
    try {
      let queryObj = {
        is_deleted: false,
        $or: [
          { created_by: user.reference_id }, // Match based on created_by id
          { email: user.email }, // Optionally match based on user's email
        ],
      };

      const filter = {
        $match: {},
      };
      if (payload?.filter) {
        if (payload?.filter?.date === "today") {
          filter["$match"] = {
            ...filter["$match"],
            due_date: { $eq: new Date(moment.utc().startOf("day")) },
          };
        } else if (payload?.filter?.date === "tomorrow") {
          filter["$match"] = {
            ...filter["$match"],
            due_date: {
              $eq: new Date(moment.utc().add(1, "day").startOf("day")),
            },
          };
        } else if (payload?.filter?.date === "this_week") {
          filter["$match"] = {
            ...filter["$match"],
            $and: [
              {
                due_date: { $gte: new Date(moment.utc().startOf("week")) },
              },
              {
                due_date: { $lte: new Date(moment.utc().endOf("week")) },
              },
            ],
          };
        } else if (payload?.filter?.date === "period") {
          // need the start and end date to fetch the data between 2 dates

          if (
            !(payload?.filter?.start_date && payload?.filter?.end_date) &&
            payload?.filter?.start_date !== "" &&
            payload?.filter?.end_date !== ""
          )
            return throwError(
              returnMessage("activity", "startEnddateRequired")
            );

          const start_date = moment
            .utc(payload?.filter?.start_date, "DD-MM-YYYY")
            .startOf("day");
          const end_date = moment
            .utc(payload?.filter?.end_date, "DD-MM-YYYY")
            .endOf("day");

          if (end_date.isBefore(start_date))
            return throwError(returnMessage("activity", "invalidDate"));

          filter["$match"] = {
            ...filter["$match"],
            $or: [
              {
                $and: [
                  { due_date: { $gte: new Date(start_date) } },
                  { due_date: { $lte: new Date(end_date) } },
                ],
              },
              {
                $and: [
                  { due_date: { $gte: new Date(start_date) } },
                  { recurring_end_date: { $lte: new Date(end_date) } },
                ],
              },
            ],
          };
        }
      }
      if (payload.search && payload.search !== "") {
        queryObj["$or"] = [
          {
            title: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },

          {
            status: {
              $regex: payload.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            "activity_status.name": {
              $regex: payload.search,
              $options: "i",
            },
          },
          {
            email: { $in: payload.email }, // New condition for searching emails in the array
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
          queryObj["$or"].push({ due_time: dateKeyword });
        }
      }
      const pagination = paginationObject(payload);
      const eventPipeline = [
        filter,
        {
          $lookup: {
            from: "authentications",
            localField: "created_by",
            foreignField: "reference_id",
            as: "agency_Data",
            pipeline: [
              {
                $project: {
                  name: 1,
                  first_name: 1,
                  last_name: 1,
                  agency_name: {
                    $concat: ["$first_name", " ", "$last_name"],
                  },
                },
              },
            ],
          },
        },
        {
          $unwind: { path: "$agency_Data", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "activity_status_masters",
            localField: "status",
            foreignField: "_id",
            as: "activity_status",
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $unwind: {
            path: "$activity_status",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $match: queryObj },
        {
          $project: {
            contact_number: 1,
            title: 1,
            due_time: 1,
            due_date: 1,
            createdAt: 1,
            agenda: 1,
            agency_name: "$agency_Data.agency_name",
            event_start_time: 1,
            event_end_time: 1,
            recurring_end_date: 1,
            email: 1,
            status: "$activity_status.name",
          },
        },
      ];
      const event = await Event.aggregate(eventPipeline)
        .sort(pagination.sort)
        .skip(pagination.skip)
        .limit(pagination.result_per_page);

      const totalEventCount = await Event.aggregate(eventPipeline);

      // Calculating total pages
      const pages = Math.ceil(
        totalEventCount.length / pagination.result_per_page
      );

      return {
        event,
        page_count: pages,
      };
    } catch (error) {
      logger.error(`Error while fetching  event, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
  // update event
  updateEvent = async (eventId, payload, user) => {
    try {
      const {
        title,
        agenda,
        due_date,
        event_start_time,
        event_end_time,
        email,
        internal_info,
      } = payload;

      const current_date = moment.utc().startOf("day");
      const start_date = moment.utc(due_date, "DD-MM-YYYY").startOf("day");
      const start_time = moment.utc(
        `${due_date}-${event_start_time}`,
        "DD-MM-YYYY-HH:mm"
      );
      const end_time = moment.utc(
        `${due_date}-${event_end_time}`,
        "DD-MM-YYYY-HH:mm"
      );

      if (!start_date.isSameOrAfter(current_date))
        return throwError(returnMessage("event", "dateinvalid"));

      if (!end_time.isAfter(start_time))
        return throwError(returnMessage("event", "invalidTime"));

      let recurring_date = moment
        .utc(payload?.recurring_end_date, "DD-MM-YYYY")
        .endOf("day");

      if (!recurring_date.isSameOrAfter(start_date))
        return throwError(returnMessage("event", "invalidRecurringDate"));

      const or_condition = [
        {
          $and: [
            { event_start_time: { $gte: start_time } },
            { event_end_time: { $lte: end_time } },
          ],
        },
        {
          $and: [
            { event_start_time: { $lte: start_time } },
            { event_end_time: { $gte: end_time } },
          ],
        },
        {
          $and: [
            { event_start_time: { $gte: start_time } },
            { event_end_time: { $lte: end_time } },
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
        {
          $and: [
            { event_start_time: { $lte: start_time } },
            { event_end_time: { $gte: end_time } },
            { due_date: { $gte: start_date } },
            { recurring_end_date: { $lte: recurring_date } },
          ],
        },
      ];
      let event_exist;

      if (
        user?.role?.name === "agency" ||
        user?.role?.name === "team_agency" ||
        user?.role?.name === "client" ||
        user?.role?.name === "team_client"
      ) {
        event_exist = await Event.findOne({
          $or: [{ created_by: eventId }, { email: { $in: payload.email } }],
          $and: or_condition,
        }).lean();
      }
      if (event_exist) {
        if (
          // email === event_exist.email &&
          payload.createEventIfEmailExists === "yes"
        ) {
          // If email exists and flag is set to "yes", create the event
          const updatedEvent = await Event.findOneAndUpdate(
            { _id: eventId }, // Find the event by ID
            {
              $set: {
                agenda,
                title,
                event_start_time: start_time,
                event_end_time: end_time,
                due_date: start_date,
                recurring_end_date: recurring_date,
                email,
                internal_info,
              },
            },
            { new: true } // Return the updated document
          );
          return updatedEvent;
        } else {
          // If email exists and flag is not set to "yes", return error
          return {
            status: 409, // Conflict status code
            message: returnMessage("event", "eventScheduledForTeam"),
          };
        }
      } else {
        // If email exists and flag is set to "yes", create the event
        const updatedEvent = await Event.findOneAndUpdate(
          { _id: eventId }, // Find the event by ID
          {
            $set: {
              agenda,
              title,
              event_start_time: start_time,
              event_end_time: end_time,
              due_date: start_date,
              recurring_end_date: recurring_date,
              email,
              internal_info,
            },
          },
          { new: true } // Return the updated document
        );
        return updatedEvent;
      }
    } catch (error) {
      logger.error(`Error while updating event, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = ScheduleEvent;
