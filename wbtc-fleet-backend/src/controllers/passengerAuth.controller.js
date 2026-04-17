const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const PassengerUser = require("../models/PassengerUser");
const OtpRecord = require("../models/OtpRecord");
const ApiError = require("../utils/ApiError");

const QFARE_LOGO_PATH = path.resolve(__dirname, "../../../qfare1/assets/qfare-logo.png");
const QFARE_LOGO_CID = "qfare-logo";

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    family: 4,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const serializePassenger = (passenger) => ({
  id: passenger._id,
  email: passenger.email,
  name: passenger.name,
  phone: passenger.phone,
  address1: passenger.address1,
  address2: passenger.address2,
  profileComplete: passenger.profileComplete,
});

const signPassengerToken = (passenger) =>
  jwt.sign(
    { passengerId: passenger._id, role: "PASSENGER" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );

function getOtpEmailText(otp) {
  return `Your qfare OTP is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`;
}

function getOtpEmailHtml(otp, includeLogo) {
  const logoBlock = includeLogo
    ? `
      <div style="margin-bottom: 28px;">
        <img
          src="cid:${QFARE_LOGO_CID}"
          alt="qfare"
          style="display:block;width:140px;max-width:100%;height:auto;border:0;"
        />
      </div>
    `
    : `
      <div style="margin-bottom: 28px;font-size:32px;font-weight:800;letter-spacing:-0.03em;color:#1f2937;">
        qfare
      </div>
    `;

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Your qfare login code</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#111827;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8fafc;">
          <tr>
            <td align="center" style="padding:40px 20px;">
              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="max-width:760px;background-color:#ffffff;border-radius:20px;padding:42px 48px;"
              >
                <tr>
                  <td>
                    ${logoBlock}
                    <div style="font-size:28px;line-height:1.25;font-weight:700;color:#1f2937;margin-bottom:22px;">
                      Verify your session
                    </div>
                    <div style="font-size:18px;line-height:1.6;color:#374151;max-width:560px;margin-bottom:48px;">
                      Your qfare OTP is: ${otp}<br /><br />
                      This code expires in 10 minutes. Do not share it with anyone.
                    </div>
                    <div style="text-align:center;margin-bottom:12px;">
                      <span
                        style="display:inline-block;font-size:72px;line-height:1;font-weight:800;letter-spacing:0.12em;color:#111827;"
                      >
                        ${otp}
                      </span>
                    </div>
                    <div style="text-align:center;font-size:16px;line-height:1.5;color:#6b7280;">
                      This code expires in 10 minutes
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

exports.directLogin = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new ApiError(400, "Valid email is required"));
    }

    let passenger = await PassengerUser.findOne({ email });
    if (!passenger) {
      passenger = await PassengerUser.create({ email });
    }

    res.json({
      ok: true,
      token: signPassengerToken(passenger),
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

exports.sendOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return next(new ApiError(400, "Valid email is required"));
    }

    const otp = String(crypto.randomInt(100000, 999999));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OtpRecord.updateMany({ email, used: false }, { used: true });
    await OtpRecord.create({ email, otp, expiresAt });

    const transport = getTransport();
    const hasEmbeddedLogo = fs.existsSync(QFARE_LOGO_PATH);
    await transport.sendMail({
      from: process.env.SMTP_FROM || `"qfare" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your qfare login code",
      text: getOtpEmailText(otp),
      html: getOtpEmailHtml(otp, hasEmbeddedLogo),
      attachments: hasEmbeddedLogo
        ? [
            {
              filename: "qfare-logo.png",
              path: QFARE_LOGO_PATH,
              cid: QFARE_LOGO_CID,
            },
          ]
        : [],
    });

    res.json({ ok: true, message: "OTP sent to your email" });
  } catch (err) {
    next(err);
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
      return next(new ApiError(400, "Email and OTP are required"));
    }

    const record = await OtpRecord.findOne({
      email,
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return next(new ApiError(400, "OTP expired or not found. Please request a new one."));
    }

    if (record.otp !== otp) {
      return next(new ApiError(400, "Incorrect OTP. Please try again."));
    }

    record.used = true;
    await record.save();

    let passenger = await PassengerUser.findOne({ email });
    if (!passenger) {
      passenger = await PassengerUser.create({ email });
    }

    res.json({
      ok: true,
      token: signPassengerToken(passenger),
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

exports.completeProfile = async (req, res, next) => {
  try {
    const { name, phone, address1, address2 } = req.body;

    if (!name || !name.trim()) {
      return next(new ApiError(400, "Name is required"));
    }

    const passenger = await PassengerUser.findByIdAndUpdate(
      req.passenger.passengerId,
      {
        name: name.trim(),
        phone: (phone || "").trim() || null,
        address1: (address1 || "").trim() || null,
        address2: (address2 || "").trim() || null,
        profileComplete: true,
      },
      { new: true }
    );

    if (!passenger) return next(new ApiError(404, "Passenger not found"));

    res.json({
      ok: true,
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const passenger = await PassengerUser.findById(req.passenger.passengerId);
    if (!passenger) return next(new ApiError(404, "Passenger not found"));

    res.json({
      ok: true,
      user: serializePassenger(passenger),
    });
  } catch (err) {
    next(err);
  }
};
