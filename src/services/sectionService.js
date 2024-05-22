const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage } = require("../utils/utils");
const Section = require("../models/sectionSchema");
const colorsData = require("../messages/colorsCombinations.json");
const Activity = require("../models/activitySchema");
const colors = colorsData;

class sectionService {
  // Add   Section
  addSection = async (payload) => {
    try {
      const { section_name, board_id, sort_order } = payload;
      const is_exist = await Section.findOne({
        board_id: board_id,
        section_name: section_name,
      }).lean();

      if (is_exist) {
        return throwError(returnMessage("section", "canNotBeCreated"));
      }
      // const get_random_color = async () => {
      //   const color_keys = Object.keys(colors);
      //   let random_color_key;
      //   let is_color = false;

      //   do {
      //     random_color_key =
      //       color_keys[Math.floor(Math.random() * color_keys.length)];
      //     const is_color_exist = await Section.findOne({
      //       board_id: board_id,
      //       color: ,
      //       text_color:,
      //     }).lean();

      //     if (!is_color_exist) {
      //       is_color = true;
      //     }
      //   } while (!is_color);

      //   return colors[random_color_key];
      // };

      const get_random_color = async () => {
        try {
          // Get an array of color keys
          const color_keys = Object.keys(colors);

          let random_color_key;
          let is_color = false;

          do {
            // Select a random color key
            random_color_key =
              color_keys[Math.floor(Math.random() * color_keys.length)];

            // Check if the selected color combination exists in the database
            const is_color_exist = await Section.findOne({
              board_id: board_id,
              color: colors[random_color_key].color,
              text_color: colors[random_color_key].test_color,
            }).lean();

            // If the color combination doesn't exist, set is_color to true to exit the loop
            if (!is_color_exist) {
              is_color = true;
            }
          } while (!is_color);
          console.log(colors[random_color_key]);
          // Return the selected color combination
          return colors[random_color_key];
        } catch (error) {
          console.error("Error occurred while fetching random color:", error);
          return null;
        }
      };

      const resolved_color = await get_random_color();
      await Section.create({
        section_name,
        board_id,
        sort_order,
        color: resolved_color?.color,
        test_color: resolved_color?.test_color,
        is_deletable: true,
      });

      return;
    } catch (error) {
      logger.error(`Error while section create, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update   Section
  updateSection = async (payload, section_data) => {
    try {
      const { section_name, board_id, sort_order } = payload;
      const { section_id } = section_data;
      const is_exist = await Section.findOne({
        board_id: board_id,
        section_name: section_name,
      }).lean();

      if (is_exist) {
        return throwError(returnMessage("section", "nameAlreadyExists"));
      }

      await Section.findOneAndUpdate(
        { _id: section_id },
        {
          $set: {
            section_name,
            sort_order,
          },
        }
      );

      return;
    } catch (error) {
      logger.error(`Error while update section, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All Sections
  getAllSections = async (payload) => {
    try {
      const { board_id } = payload;
      const sections = await Section.find({ board_id: board_id }).select(
        "-is_deleted"
      );
      return sections;
    } catch (error) {
      logger.error(`Error while get all section, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET  Section
  getSection = async (payload) => {
    try {
      const { section_id } = payload;
      const section = await Section.findById(section_id).select("-is_deleted");
      return section;
    } catch (error) {
      logger.error(`Error while  get section, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Delete Section

  deleteSection = async (payload) => {
    try {
      const { id } = payload;

      const is_task_available = await Activity.findOne({ status: id }).lean();

      if (is_task_available) {
        return throwError(returnMessage("section", "canNotBeDeleted"));
      }
      await Section.updateOne({ _id: id }, { $set: { is_deleted: true } });
      return true;
    } catch (error) {
      logger.error(`Error while Delete Section, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = sectionService;
