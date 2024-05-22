const nodemailer = require("nodemailer");
require("dotenv").config();

// this function is used for the send email
const sendEmail = async (payload) => {
  const transporter = nodemailer.createTransport({
    port: 465,
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.MAILPASSWORD,
    },
  });
  const mailOptions = {
    from: process.env.EMAIL,
    to: payload.email,
    subject: payload.subject,
    html: payload.message,
  };

  await transporter.sendMail(mailOptions);
  return;
};

module.exports = sendEmail;
