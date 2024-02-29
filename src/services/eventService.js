const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, paginationObject } = require("../utils/utils");
const sendEmail = require("../helpers/sendEmail");
const moment = require("moment");
const Event = require("../models/eventSchema");
const { default: mongoose } = require("mongoose");

class ScheduleEvent {
  createEvent = async (payload, user) => {
    try {
      const {
        title,
        agenda,
        due_date,
        event_start_time,
        event_end_time,
        email,
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
          });
          return newEvent;
        } else {
          // If email exists and flag is not set to "yes", return error
          return throwError(returnMessage("event", "eventScheduledForTeam"));
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
        });
        return newEvent;
      }
    } catch (error) {
      logger.error(`Error while creating event, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

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
            agency_name: "$agency_Data.agency_name",
            event_start_time: 1,
            event_end_time: 1,
            recurring_end_date: 1,
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

  eventList = async (searchObj, user) => {
    try {
      let queryObj = {
        is_deleted: false,
        $or: [
          { created_by: user.reference_id }, // Match based on created_by id
          { email: user.email }, // Optionally match based on user's email
        ],
      };
      const pagination = paginationObject(searchObj);
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
          $match: queryObj,
        },
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
              },
            },
            { new: true } // Return the updated document
          );
          return updatedEvent;
        } else {
          // If email exists and flag is not set to "yes", return error
          return throwError(returnMessage("event", "eventScheduledForTeam"));
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
