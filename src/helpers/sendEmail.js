const nodemailer = require("nodemailer");
require("dotenv").config();

// this function is used for the send email
const sendEmail = async (payload) => {
  const transporter = nodemailer.createTransport({
    host: "smtpout.secureserver.net",
    secure: true,
    secureConnection: false, // TLS requires secureConnection to be false
    tls: { ciphers: "SSLv3" },
    requireTLS: true,
    debug: true,
    port: 465,
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
        content: payload?.icsContent?.toString(), // Content of the iCalendar file
        encoding: "utf8", // Encoding type of the attachment content
        method: "request",
        contentType: "text/calendar",
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  return;
};

module.exports = sendEmail;
