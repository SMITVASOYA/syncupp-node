const multer = require("multer");
const fs = require("fs");
const path = require("path");
const Configuration = require("../models/configurationSchema");

let configure;
(async () => {
  configure = await Configuration.findOne().lean();
})();
function getTotalSize(files) {
  let totalSize = 0;
  for (const file of files) {
    totalSize += file.size;
  }
  return totalSize;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const img_dir = "src/public/uploads";
    if (!fs.existsSync(img_dir)) {
      fs.mkdirSync(img_dir, { recursive: true });
    }
    if (file.mimetype.startsWith("image/")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("application/pdf")) {
      cb(null, img_dir);
    } else if (
      file.mimetype.startsWith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) ||
      file.mimetype.startsWith("application/vnd.ms-excel")
    ) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("video/")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("text/")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("text/csv")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("image/svg+xml")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("image/gif")) {
      cb(null, img_dir);
    } else if (file.mimetype.startsWith("application/x-rar-compressed")) {
      cb(null, img_dir);
    } else if (
      file.mimetype.startsWith(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      ) ||
      file.mimetype.startsWith("application/vnd.ms-powerpoint")
    ) {
      cb(null, img_dir);
    } else if (file.mimetype === "application/zip") {
      cb(null, img_dir);
    } else if (
      file.mimetype.startsWith("application/msword") ||
      file.mimetype.startsWith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ) {
      cb(null, img_dir);
    }
  },

  filename: (req, file, cb) => {
    const extension = file.originalname.split(".").pop() || undefined;
    const fileName = Date.now() + "." + extension;
    req.fileName = fileName;
    cb(null, fileName);
  },
});

// Multer config
const upload = multer({
  storage: storage,
  limits: {
    fileSize: configure?.multer?.size || 200 * 1024 * 1024, // 200MB maximum file size
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".pdf",
      ".xls",
      ".xlsx",
      ".mp4",
      ".txt",
      ".ppt",
      ".pptx",
      ".zip",
      ".doc",
      ".docx",
      ".avi",
      ".mov",
      ".wmv",
      ".flv",
      ".mkv",
      ".mpg",
      ".mpeg",
      ".mp2",
      ".3gp",
      ".webm",
      ".rar",
      ".csv",
      ".svg",
      ".gif",
    ];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      const error = new Error(
        `Only ${allowedExtensions.toString()} files are allowed.`
      );
      error.status = 400;
      error.code = "FILE_FORMAT_NOT_MATCH";
      return cb(error);
    }

    cb(null, true);
  },
});
// Middleware to check total file size before uploading
const checkFileSize = async (req, res, next) => {
  const maxSize = await Configuration.findOne({}).lean();
  const limit = parseInt(maxSize?.multer?.size) * 1024 * 1024;
  if (req.files && getTotalSize(req.files) > limit) {
    const error = new Error("Total file size exceeds 200MB limit");
    error.status = 400;
    return next(error);
  }
  next();
};

module.exports = { upload, checkFileSize };
