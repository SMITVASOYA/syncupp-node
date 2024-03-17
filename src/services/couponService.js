const AdminCoupon = require("../models/adminCouponSchema");
const logger = require("../logger");
const { throwError } = require("../helpers/errorUtil");
const { returnMessage, paginationObject } = require("../utils/utils");
const Agency = require("../models/agencySchema");
const Configuration = require("../models/configurationSchema");
const Team_Agency = require("../models/teamAgencySchema");

class CouponService {
  // Add Coupon
  addCoupon = async (payload, files) => {
    try {
      const { brand, couponCode, discountTitle, siteURL } = payload;

      let couponImageFileName;
      if (files?.fieldname === "brandLogo") {
        couponImageFileName = "uploads/" + files?.filename;
      }
      const newCoupon = new AdminCoupon({
        brand,
        couponCode,
        discountTitle,
        siteURL,
        brandLogo: couponImageFileName,
      });

      return newCoupon.save();
    } catch (error) {
      logger.error(`Error while Admin add Coupon, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET All FQA
  getAllCoupon = async (searchObj) => {
    try {
      const queryObj = { is_deleted: false };

      if (searchObj.search && searchObj.search !== "") {
        queryObj["$or"] = [
          {
            brand: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            couponCode: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            discountTitle: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
          {
            siteURL: {
              $regex: searchObj.search.toLowerCase(),
              $options: "i",
            },
          },
        ];
      }

      const pagination = paginationObject(searchObj);

      const [coupon, totalcoupon] = await Promise.all([
        AdminCoupon.find(queryObj)
          .select("brand couponCode discountTitle siteURL brandLogo")
          .sort(pagination.sort)
          .skip(pagination.skip)
          .limit(pagination.result_per_page)
          .lean(),
        AdminCoupon.countDocuments(queryObj),
      ]);

      return {
        coupon,
        page_count: Math.ceil(totalcoupon / pagination.result_per_page) || 0,
      };
    } catch (error) {
      logger.error(`Error  while fetching coupon list, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Delete Coupon
  deleteCoupon = async (payload) => {
    const { couponIdsToDelete } = payload;
    try {
      const deletedFaqs = await AdminCoupon.updateMany(
        { _id: { $in: couponIdsToDelete } },
        { $set: { is_deleted: true } }
      );
      return deletedFaqs;
    } catch (error) {
      logger.error(`Error while Deleting coupon, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // Update Coupon
  updateCoupon = async (payload, faqId, files) => {
    try {
      const { brand, couponCode, discountTitle, siteURL } = payload;
      let couponImageFileName;
      if (files?.fieldname === "brandLogo") {
        couponImageFileName = "uploads/" + files?.filename;
      }

      const faq = await AdminCoupon.findByIdAndUpdate(
        {
          _id: faqId,
        },
        {
          brand,
          couponCode,
          discountTitle,
          siteURL,
          brandLogo: couponImageFileName,
        },
        { new: true, useFindAndModify: false }
      );
      return faq;
    } catch (error) {
      logger.error(`Error while updating coupon, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  // GET Coupon
  getCoupon = async (faqId) => {
    try {
      const queryObj = { is_deleted: false };

      // if (searchObj.search && searchObj.search !== "") {
      //   queryObj["$or"] = [
      //     {
      //       brand: {
      //         $regex: searchObj.search.toLowerCase(),
      //         $options: "i",
      //       },
      //     },
      //     {
      //       discountTitle: {
      //         $regex: searchObj.search.toLowerCase(),
      //         $options: "i",
      //       },
      //     },
      //     {
      //       couponCode: {
      //         $regex: searchObj.search.toLowerCase(),
      //         $options: "i",
      //       },
      //     },
      //   ];
      // }

      const faq = await AdminCoupon.findById({
        _id: faqId,
        is_deleted: false,
      }).lean();
      return faq;
    } catch (error) {
      logger.error(`Error while Get FQA, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  getAllCouponWithOutPagination = async (user) => {
    try {
      if (user.role.name === "agency") {
        const queryObj = { is_deleted: false };
        const agency_data = await Agency.findById(user.reference_id)
          .select("total_coupon")
          .lean();

        let coupon = await AdminCoupon.find(queryObj)
          .select("-couponCode")
          .lean();

        coupon = coupon.filter(
          (couponItem) =>
            !String(agency_data.total_coupon).includes(String(couponItem._id))
        );

        const referral_data = await Configuration.findOne().lean();
        const require_points = referral_data?.coupon?.reedem_coupon;
        // Iterate over each coupon
        const totalCouponIds =
          agency_data &&
          agency_data?.total_coupon?.map((coupon) => coupon.toString());

        // Iterate over each coupon
        for (let i = 0; i < coupon.length; i++) {
          const couponId = coupon[i]._id.toString();

          // Check if the coupon ID exists in agency_data.total_coupon
          const isAvailable = totalCouponIds.includes(couponId);

          // Add a flag to the coupon object
          coupon[i].isAvailable = !isAvailable;
        }
        return { coupon, require_points };
      }

      if (user.role.name === "team_agency") {
        const queryObj = { is_deleted: false };
        const team_member = await Team_Agency.findById(user.reference_id)
          .select("total_coupon")
          .lean();

        let coupon = await AdminCoupon.find(queryObj)
          .select("-couponCode")
          .lean();

        coupon = coupon.filter(
          (couponItem) =>
            !String(team_member.total_coupon).includes(String(couponItem._id))
        );

        const referral_data = await Configuration.findOne().lean();
        const require_points = referral_data?.coupon?.reedem_coupon;
        // Iterate over each coupon
        const totalCouponIds =
          team_member &&
          team_member?.total_coupon?.map((coupon) => coupon.toString());
        // Iterate over each coupon
        for (let i = 0; i < coupon.length; i++) {
          const couponId = coupon[i]._id.toString();

          // Check if the coupon ID exists in agency_data.total_coupon
          const isAvailable = totalCouponIds.includes(couponId);
          // Add a flag to the coupon object
          coupon[i].isAvailable = !isAvailable;
        }
        return { coupon, require_points };
      }
    } catch (error) {
      logger.error(`Error whilefetching coupon list, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };

  getMyCoupons = async (user) => {
    try {
      if (user.role.name === "agency") {
        const agency_data = await Agency.findById(user.reference_id).select(
          "total_coupon"
        );
        // Query AdminCoupon model to find coupons with IDs present in the array
        const coupons = await AdminCoupon.find({
          _id: { $in: agency_data?.total_coupon },
        });
        return coupons;
      }
      if (user.role.name === "team_agency") {
        const member_data = await Team_Agency.findById(
          user.reference_id
        ).select("total_coupon");
        // Query AdminCoupon model to find coupons with IDs present in the array
        const coupons = await AdminCoupon.find({
          _id: { $in: member_data?.total_coupon },
        });
        return coupons;
      }
    } catch (error) {
      logger.error(`Error while fetching coupon list, ${error}`);
      throwError(error?.message, error?.statusCode);
    }
  };
}

module.exports = CouponService;
