const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const img_dir = "src/public/uploads";
    if (!fs.existsSync(img_dir)) {
      fs.mkdirSync(img_dir, { recursive: true });
    }
    if (file.mimetype.startsWith("image/")) {
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
    fileSize: 1024 * 1024 * 1, // 1MB
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = [".jpg", ".jpeg", ".png"];
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

module.exports = { upload };
