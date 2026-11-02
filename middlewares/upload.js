const multer = require("multer");
const path = require("path");
const cloudinary = require("../config/cloudinary");
const AppError = require("../utils/AppError");

const fileFilter = (_req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.mimetype)) {
    // AppError → errorHandler renvoie 400 + message safe, pas 500
    return cb(new AppError("Format d'image non supporte.", 400));
  }
  cb(null, true);
};

const multerUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

function uploadToCloudinary(file, folder = "dic-uploads") {
  if (!file) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ quality: "auto:good", fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
}

function deleteFromCloudinary(fileUrl) {
  if (!fileUrl || !fileUrl.includes("res.cloudinary.com")) {
    return Promise.resolve();
  }

  const match = fileUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
  if (!match) return Promise.resolve();

  const publicId = match[1];

  return cloudinary.uploader.destroy(publicId).catch(() => null);
}

module.exports = { multerUpload, uploadToCloudinary, deleteFromCloudinary };