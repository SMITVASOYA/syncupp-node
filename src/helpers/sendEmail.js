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
    attachments: [
      {
        filename: "event.ics", // Name of the attachment
        content: payload?.icsContent, // Content of the iCalendar file
        encoding: "base64", // Encoding type of the attachment content
        method: "request",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  return;
};

module.exports = sendEmail;
