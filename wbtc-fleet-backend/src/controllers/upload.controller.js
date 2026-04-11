const cloudinary = require("../lib/cloudinary");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");

const DEFAULT_STOP_IMAGE_FOLDER = "Qfare/Stop Images";

exports.getStopImageUploadSignature = asyncHandler(async (_req, res) => {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new ApiError(500, "Cloudinary is not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = String(process.env.CLOUDINARY_STOP_IMAGE_FOLDER || DEFAULT_STOP_IMAGE_FOLDER).trim();
  const paramsToSign = {
    folder,
    timestamp,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    ok: true,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
    timestamp,
    signature,
  });
});
