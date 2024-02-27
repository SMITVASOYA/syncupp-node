const { throwError } = require("../helpers/errorUtil");
const engMessage = require("../messages/english.json");
const notificationMessage = require("../messages/notification.json");
const cheerio = require("cheerio");

exports.returnMessage = (module, key, language = "en") => {
  return engMessage[module][key];
};

exports.returnNotification = (module, key, subKey) => {
  const moduleData = notificationMessage[module];

  if (moduleData) {
    const keyData = moduleData[key];

    if (keyData) {
      if (subKey !== undefined && keyData.hasOwnProperty(subKey)) {
        return keyData[subKey];
      } else {
        return keyData;
      }
    }
  }
  return undefined;
};

exports.replaceFields = (inputString, replacements) => {
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`\\$\\{${key}\\}`, "g");
    inputString = inputString.replace(pattern, value);
  }
  return inputString;
};

exports.extractTextFromHtml = (htmlString) => {
  const $ = cheerio.load(htmlString);
  return $("body").text();
};

exports.validateEmail = (email) => {
  // email validator from https://github.com/manishsaraan/email-validator/blob/master/index.js
  const regex =
    /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

  if (!email) return false;
  const email_parts = email.split("@");

  if (email_parts.length !== 2) return false;

  const account = email_parts[0];
  const address = email_parts[1];

  if (account.length > 64) return false;
  else if (address.length > 255) return false;

  const domainParts = address.split(".");

  if (
    domainParts.some((part) => {
      return part.length > 63;
    })
  )
    return false;

  return regex.test(email);
};

exports.passwordValidation = (password) => {
  const passwordRegex =
    /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]).{8,}$/;

  return passwordRegex.test(password);
};

exports.capitalizeFirstLetter = (string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};

exports.validateRequestFields = (payload, fields) => {
  for (const field of fields) {
    if (!payload[field]) {
      switch (field) {
        case "title":
          return throwError(`Title is required.`);
          break;
        case "agenda":
          return throwError(`Agencda is required.`);
          break;
        case "due_time":
          return throwError(`Due time is required.`);
          break;
        case "client_id":
          return throwError(`Client detail is required.`);
          break;
        case "due_date":
          return throwError(`Due date is required.`);
          break;
        case "assign_to":
          return throwError(`Assignee is required.`);
          break;
        case "activity_type":
          return throwError(`Activity type is required.`);
          break;
        case "contact_number":
          return throwError(`Contact number is required.`);
          break;
        case "token":
          return throwError(`Token is required.`);
          break;
        case "first_name":
          return throwError(`First name is required.`);
          break;
        case "last_name":
          return throwError(`Last name is required.`);
          break;
        case "company_name":
          return throwError(`Company name is required.`);
          break;
        case "password":
          return throwError(`Password is required.`);
          break;
        case "email":
          return throwError(`Email is required.`);
          break;
        case "agency_id":
          return throwError(`Agency detail is required.`);
          break;
      }
    }
  }
  return;
};

// exports.forgotPasswordEmailTemplate = (link) => {
//   const html = `
//   <html>
//     <head>
//       <style>
//         /* Styles for the email template */
//         body {
//           font-family: Arial, sans-serif;
//           background-color: #f4f4f4;
//           margin: 0;
//           padding: 0;
//         }
//         .container {
//           max-width: 600px;
//           margin: 0 auto;
//           padding: 20px;
//           background-color: #ffffff;
//           border-radius: 10px;
//           box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
//         }
//         .header {
//           background-color: #4caf50;
//           color: white;
//           text-align: center;
//           padding: 10px;
//           border-radius: 10px 10px 0 0;
//         }
//         .content {
//           padding: 20px;
//         }
//         .button {
//           background-color: #4caf50;
//           color: white;
//           border: none;
//           padding: 10px 20px;
//           text-decoration: none;
//           border-radius: 5px;
//           cursor: pointer;
//         }
//       </style>
//     </head>
//     <body>
//       <div class="container">
//         <div class="header">
//           <h1>Reset Password</h1>
//         </div>
//         <div class="content">
//           <p>We received a request to verify your email. Click the button below to reset it:</p>
//           <a class="button" href="${link}">Reset Password</a>
//           <p>If you didn't request a password reset, please ignore this email.</p>
//           <p>Best regards,<br>Your Company Name</p>
//         </div>
//       </div>
//     </body>
//   </html>`;
//   return html;
// };

// exports.invitationEmail = (link, name) => {
//   return `<html>
//   <head>
//     <style>
//       /* Styles for the email template */
//       body {
//         font-family: Arial, sans-serif;
//         background-color: #f4f4f4;
//         margin: 0;
//         padding: 0;
//       }
//       .container {
//         max-width: 600px;
//         margin: 0 auto;
//         padding: 20px;
//         background-color: #ffffff;
//         border-radius: 10px;
//         box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
//       }
//       .header {
//         background-color: #4caf50;
//         color: white;
//         text-align: center;
//         padding: 10px;
//         border-radius: 10px 10px 0 0;
//       }
//       .content {
//         padding: 20px;
//       }
//       .button {
//         background-color: #4caf50;
//         color: white;
//         border: none;
//         padding: 10px 20px;
//         text-decoration: none;
//         border-radius: 5px;
//         cursor: pointer;
//       }
//     </style>
//   </head>
//   <body>
//     <div class="container">
//       <div class="header">
//         <h1>Invitation to the SyncUpp</h1>
//       </div>
//       <div class="content">
//       <p>hi, ${name}.</p>
//         <p>Click the button below to join SyncUpp:</p>
//         <a class="button" href="${link}">Join SyncUpp</a>
//         <p>Best regards,<br>SyncUpp</p>
//       </div>
//     </div>
//   </body>
// </html>`;
// };

exports.agrementEmail = (data) => {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html
    xmlns="http://www.w3.org/1999/xhtml"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    style="font-family: arial, 'helvetica neue', helvetica, sans-serif"
  >
    <head>
      <meta charset="UTF-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <meta name="x-apple-disable-message-reformatting" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta content="telephone=no" name="format-detection" />
      <title>Syncupp Invoice</title>
      <!--[if (mso 16)]>
        <style type="text/css">
          a {
            text-decoration: none;
          }
        </style>
      <![endif]-->
      <!--[if gte mso 9
        ]><style>
          sup {
            font-size: 100% !important;
          }
        </style><!
      [endif]-->
      <!--[if gte mso 9]>
        <xml>
          <o:OfficeDocumentSettings>
            <o:AllowPNG></o:AllowPNG>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <link
        href="https://fonts.googleapis.com/css2?family=Imprima&display=swap"
        rel="stylesheet"
      />
      <!--<![endif]-->
      <style type="text/css">
        #outlook a {
          padding: 0;
        }
  
        .es-button {
          mso-style-priority: 100 !important;
          text-decoration: none !important;
        }
  
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }
  
        .es-desk-hidden {
          display: none;
          float: left;
          overflow: hidden;
          width: 0;
          max-height: 0;
          line-height: 0;
          mso-hide: all;
        }
  
        [data-ogsb] .es-button {
          border-width: 0 !important;
          padding: 15px 20px 15px 20px !important;
        }
  
        @media only screen and (max-width: 600px) {
          p,
          ul li,
          ol li,
          a {
            line-height: 150% !important;
          }
  
          h1,
          h2,
          h3,
          h1 a,
          h2 a,
          h3 a {
            line-height: 120%;
          }
  
          h1 {
            font-size: 30px !important;
            text-align: left;
          }
  
          h2 {
            font-size: 24px !important;
            text-align: left;
          }
  
          h3 {
            font-size: 20px !important;
            text-align: left;
          }
  
          .es-header-body h1 a,
          .es-content-body h1 a,
          .es-footer-body h1 a {
            font-size: 30px !important;
            text-align: left;
          }
  
          .es-header-body h2 a,
          .es-content-body h2 a,
          .es-footer-body h2 a {
            font-size: 24px !important;
            text-align: left;
          }
  
          .es-header-body h3 a,
          .es-content-body h3 a,
          .es-footer-body h3 a {
            font-size: 20px !important;
            text-align: left;
          }
  
          .es-menu td a {
            font-size: 14px !important;
          }
  
          .es-header-body p,
          .es-header-body ul li,
          .es-header-body ol li,
          .es-header-body a {
            font-size: 14px !important;
          }
  
          .es-content-body p,
          .es-content-body ul li,
          .es-content-body ol li,
          .es-content-body a {
            font-size: 14px !important;
          }
  
          .es-footer-body p,
          .es-footer-body ul li,
          .es-footer-body ol li,
          .es-footer-body a {
            font-size: 14px !important;
          }
  
          .es-infoblock p,
          .es-infoblock ul li,
          .es-infoblock ol li,
          .es-infoblock a {
            font-size: 12px !important;
          }
  
          *[class="gmail-fix"] {
            display: none !important;
          }
  
          .es-m-txt-c,
          .es-m-txt-c h1,
          .es-m-txt-c h2,
          .es-m-txt-c h3 {
            text-align: center !important;
          }
  
          .es-m-txt-r,
          .es-m-txt-r h1,
          .es-m-txt-r h2,
          .es-m-txt-r h3 {
            text-align: right !important;
          }
  
          .es-m-txt-l,
          .es-m-txt-l h1,
          .es-m-txt-l h2,
          .es-m-txt-l h3 {
            text-align: left !important;
          }
  
          .es-m-txt-r img,
          .es-m-txt-c img,
          .es-m-txt-l img {
            display: inline !important;
          }
  
          .es-button-border {
            display: block !important;
          }
  
          a.es-button,
          button.es-button {
            font-size: 18px !important;
            display: block !important;
            border-right-width: 0px !important;
            border-left-width: 0px !important;
            border-top-width: 15px !important;
            border-bottom-width: 15px !important;
          }
  
          .es-adaptive table,
          .es-left,
          .es-right {
            width: 100% !important;
          }
  
          .es-content table,
          .es-header table,
          .es-footer table,
          .es-content,
          .es-footer,
          .es-header {
            width: 100% !important;
            max-width: 600px !important;
          }
  
          .es-adapt-td {
            display: block !important;
            width: 100% !important;
          }
  
          .adapt-img {
            width: 100% !important;
            height: auto !important;
          }
  
          .es-m-p0 {
            padding: 0px !important;
          }
  
          .es-m-p0r {
            padding-right: 0px !important;
          }
  
          .es-m-p0l {
            padding-left: 0px !important;
          }
  
          .es-m-p0t {
            padding-top: 0px !important;
          }
  
          .es-m-p0b {
            padding-bottom: 0 !important;
          }
  
          .es-m-p20b {
            padding-bottom: 20px !important;
          }
  
          .es-mobile-hidden,
          .es-hidden {
            display: none !important;
          }
  
          tr.es-desk-hidden,
          td.es-desk-hidden,
          table.es-desk-hidden {
            width: auto !important;
            overflow: visible !important;
            float: none !important;
            max-height: inherit !important;
            line-height: inherit !important;
          }
  
          tr.es-desk-hidden {
            display: table-row !important;
          }
  
          table.es-desk-hidden {
            display: table !important;
          }
  
          td.es-desk-menu-hidden {
            display: table-cell !important;
          }
  
          .es-menu td {
            width: 1% !important;
          }
  
          table.es-table-not-adapt,
          .esd-block-html table {
            width: auto !important;
          }
  
          table.es-social {
            display: inline-block !important;
          }
  
          table.es-social td {
            display: inline-block !important;
          }
  
          .es-desk-hidden {
            display: table-row !important;
            width: auto !important;
            overflow: visible !important;
            max-height: inherit !important;
          }
        }
      </style>
    </head>
  
    <body
      data-new-gr-c-s-loaded="14.1098.0"
      style="
        width: 100%;
        font-family: arial, 'helvetica neue', helvetica, sans-serif;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        padding: 0;
        margin: 0;
      "
    >
      <div class="es-wrapper-color" style="background-color: #ffffff">
        <!--[if gte mso 9]>
          <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
            <v:fill type="tile" color="#ffffff"></v:fill>
          </v:background>
        <![endif]-->
        <table
          class="es-wrapper"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          style="
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            border-collapse: collapse;
            border-spacing: 0px;
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100%;
            background-repeat: repeat;
            background-position: center top;
            background-color: #ffffff;
          "
        >
          <tr>
            <td valign="top" style="padding: 0; margin: 0">
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#560082"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        border-radius: 20px;
                        width: 600px;
  
                        margin-top: 20px;
                      "
                    >
                      <tr>
                        <td align="left" style="padding: 0; margin: 0">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  bgcolor="#fafafa"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: separate;
                                    border-spacing: 0px;
                                    background-color: #fafafa;
                                    border-radius: 10px;
                                  "
                                  role="presentation"
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 0px; margin: 0"
                                    >
                                      <table
                                        bgcolor="#ffefc4"
                                        class="es-content-body"
                                        align="center"
                                        cellpadding="0"
                                        cellspacing="0"
                                        style="
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: collapse;
                                          border-spacing: 0px;
                                          background-color: #f7f0fb;
                                          border-radius: 20px 20px 0px 0px;
                                          width: 600px;
                                          padding: 20px;
                                          text-align: center;
                                          margin-bottom: 10px;
                                        "
                                      >
                                        <tr>
                                          <td
                                            align="center"
                                            style="padding: 10px"
                                          >
                                            <a
                                              target="_blank"
                                              href="https://www.tridhyatech.com"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="logo.png"
                                                alt="Logo"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                                height="60"
                                                title="Logo"
                                            /></a>
                                          </td>
                                        </tr>
                                      </table>
  
                                      <h3
                                        style="
                                          margin: 0;
                                          line-height: 34px;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          font-size: 24px;
                                          font-style: normal;
                                          font-weight: bold;
                                          color: #560082;
                                          text-align: left;
                                          padding: 0 20px;
                                        "
                                      >
                                        ${data.title}
                                      </h3>
                                      <table
                                        cellpadding="0"
                                        cellspacing="0"
                                        width="100%"
                                        bgcolor="#fafafa"
                                        style="
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: separate;
                                          border-spacing: 0px;
                                          background-color: #fafafa;
                                          border-radius: 10px;
                                          padding: 0 20px;
                                        "
                                        role="presentation"
                                      >
                                        <tr>
                                          <td
                                            align="left"
                                            style="
                                              padding-top: 10px;
                                              font-weight: 600;
                                              font-size: 14px;
                                            "
                                          >
                                            ${data.dueDate}
                                          </td>
                                        </tr>
                                      </table>
                                      <table
                                        cellpadding="0"
                                        cellspacing="0"
                                        width="100%"
                                        style="
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: separate;
                                          border-spacing: 0px;
  
                                          border-radius: 10px;
                                          padding: 10px;
                                          margin-top: 20px;
                                        "
                                        role="presentation"
                                      >
                                        <tr
                                          style="
                                            border-bottom: 1px solid #fafafa;
                                            padding: 0 20px;
                                          "
                                        >
                                          <td
                                            align="left"
                                            style="
                                              padding-top: 10px;
                                              font-weight: 400;
                                              font-size: 12px;
                                              text-overflow: ellipsis;
                                              vertical-align: top;
                                              padding: 0 10px;
                                            "
                                          >
                                            <p>${data.content}</p>
                                            <!-- <p>
                                              Lorem ipsum dolor sit, amet
                                              consectetur adipisicing elit. Quia
                                              incidunt sit in laborum error
                                              aperiam numquam porro veniam
                                              deserunt sint, dolorem, animi quae
                                              illum a qui, ipsum possimus.
                                              Praesentium, veritatis.
                                            </p> -->
                                          </td>
                                          <td
                                            align="left"
                                            style="
                                              padding-top: 10px;
                                              font-weight: 400;
                                              font-size: 12px;
                                              text-overflow: ellipsis;
                                              vertical-align: top;
                                            "
                                          ></td>
                                        </tr>
                                      </table>
  
                                      <table
                                        cellpadding="0"
                                        cellspacing="0"
                                        width="100%"
                                        bgcolor="#fafafa"
                                        style="
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: separate;
                                          border-spacing: 0px;
                                          background-color: #f3f3f3;
  
                                          padding: 10px;
                                          margin-top: 20px;
                                          font-size: 14px;
                                        "
                                        role="presentation"
                                      >
                                        <tr>
                                          <th style="text-align: left">
                                            Reciver
                                          </th>
                                          <th
                                            style="border-left: 1px solid black"
                                          ></th>
                                          <th
                                            style="text-align: left; float: right"
                                          >
                                            Sender
                                          </th>
                                        </tr>
                                        <tr>
                                          <td>
                                            <ul
                                              style="
                                                list-style: none;
                                                padding-left: 0;
                                              "
                                            >
                                              <li>${data.receiverName}</li>
                                              <li>${data.receiverEmail}</li>
                                              <li>${data.receiverNumber}</li>
                                            </ul>
                                          </td>
                                          <td
                                            style="border-left: 1px solid black"
                                          ></td>
                                          <td
                                            style="
                                              float: right;
                                              text-align: right;
                                            "
                                          >
                                            <ul
                                              style="
                                                list-style: none;
                                                padding-left: 0;
                                              "
                                            >
                                              <li>${data.senderName}</li>
                                              <li>${data.senderEmail}</li>
                                              <li>${data.receiverNumber}</li>
                                            </ul>
                                          </td>
                                        </tr>
                                      </table>
  
                                      <p
                                        style="
                                          margin-top: 30px;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 16px;
                                        "
                                      >
                                        We appreciate your business. <br />
                                        If you have question please feel free to
                                        contact us!
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#ffefc4"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ecc8ff;
                        border-radius: 0px 0px 20px 20px;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          class="esdev-adapt-off"
                          align="left"
                          style="
                            margin: 0;
                            padding-top: 20px;
                            padding-bottom: 20px;
                            padding-left: 40px;
                            padding-right: 40px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 520px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 0; margin: 0"
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 24px;
                                          color: #2d3142;
                                          font-size: 16px;
                                        "
                                      >
                                        Thanks and Best Regards,<br />Have a great
                                        day!<br />Syncupp Team<a
                                          target="_blank"
                                          style="
                                            -webkit-text-size-adjust: none;
                                            -ms-text-size-adjust: none;
                                            mso-line-height-rule: exactly;
                                            text-decoration: underline;
                                            color: #2d3142;
                                            font-size: 16px;
                                          "
                                          href="https://www.tridhyatech.com"
                                        ></a>
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-footer"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                  background-color: transparent;
                  background-repeat: repeat;
                  background-position: center top;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#bcb8b1"
                      class="es-footer-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td align="left" style="padding: 20px; margin: 0">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="left"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        padding-top: 20px;
                                      "
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 21px;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                      >
                                        Copyright &copy; 2023 Syncupp
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
  </html>
  `;
};

exports.inquiryEmail = (inquiry) => {
  return `<html>
    <head>
      <style>
        /* Styles for the email template */
        body {
          font-family: Arial, sans-serif;
          background-color: #f4f4f4;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 10px;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .header {
          background-color: #4caf50;
          color: white;
          text-align: center;
          padding: 10px;
          border-radius: 10px 10px 0 0;
        }
        .content {
          padding: 20px;
        }
        .button {
          background-color: #4caf50;
          color: white;
          border: none;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Inquiry Received</h1>
        </div>
        <div class="content">
          <p><strong>Name:</strong> ${inquiry.name}</p>
          <p><strong>Contact Number:</strong> ${inquiry.contact_number}</p>
          <p><strong>Email:</strong> ${inquiry.email}</p>
          <p><strong>Message:</strong> ${inquiry.message}</p>
          <p><strong>Received At:</strong> ${inquiry.createdAt}</p>
          <hr>
          <p>Thank you for your attention!</p>
        </div>
      </div>
    </body>
  </html>`;
};

exports.paginationObject = (paginationObject) => {
  const page = paginationObject.page || 1;
  const result_per_page = paginationObject.items_per_page || 5;
  const skip = result_per_page * (page - 1);
  const sort_order = paginationObject.sort_order === "asc" ? 1 : -1;
  const sortField =
    paginationObject.sort_field && paginationObject.sort_field !== ""
      ? paginationObject.sort_field
      : "createdAt";
  const sort = {};
  sort[sortField] = sort_order;

  return { page, skip, result_per_page, sort };
};

exports.getKeywordType = (keyword) => {
  if (!isNaN(keyword)) {
    return "number";
  } else if (Date.parse(keyword)) {
    return "date";
  } else {
    return "string";
  }
};

exports.invitationEmail = (link, username, invitation_text) => {
  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif"
>
  <head>
    <meta charset="UTF-8" />
    <meta content="width=device-width, initial-scale=1" name="viewport" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta content="telephone=no" name="format-detection" />
    <title>New message</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Imprima&display=swap"
      rel="stylesheet"
    />
    <style type="text/css">
      #outlook a {
        padding: 0;
      }
      .es-button {
        mso-style-priority: 100 !important;
        text-decoration: none !important;
      }
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
      }
      .es-desk-hidden {
        display: none;
        float: left;
        overflow: hidden;
        width: 0;
        max-height: 0;
        line-height: 0;
        mso-hide: all;
      }
      [data-ogsb] .es-button {
        border-width: 0 !important;
        padding: 15px 20px 15px 20px !important;
      }
      @media only screen and (max-width: 600px) {
        p,
        ul li,
        ol li,
        a {
          line-height: 150% !important;
        }
        h1,
        h2,
        h3,
        h1 a,
        h2 a,
        h3 a {
          line-height: 120%;
        }
        h1 {
          font-size: 30px !important;
          text-align: left;
        }
        h2 {
          font-size: 24px !important;
          text-align: left;
        }
        h3 {
          font-size: 20px !important;
          text-align: left;
        }
        .es-header-body h1 a,
        .es-content-body h1 a,
        .es-footer-body h1 a {
          font-size: 30px !important;
          text-align: left;
        }
        .es-header-body h2 a,
        .es-content-body h2 a,
        .es-footer-body h2 a {
          font-size: 24px !important;
          text-align: left;
        }
        .es-header-body h3 a,
        .es-content-body h3 a,
        .es-footer-body h3 a {
          font-size: 20px !important;
          text-align: left;
        }
        .es-menu td a {
          font-size: 14px !important;
        }
        .es-header-body p,
        .es-header-body ul li,
        .es-header-body ol li,
        .es-header-body a {
          font-size: 14px !important;
        }
        .es-content-body p,
        .es-content-body ul li,
        .es-content-body ol li,
        .es-content-body a {
          font-size: 14px !important;
        }
        .es-footer-body p,
        .es-footer-body ul li,
        .es-footer-body ol li,
        .es-footer-body a {
          font-size: 14px !important;
        }
        .es-infoblock p,
        .es-infoblock ul li,
        .es-infoblock ol li,
        .es-infoblock a {
          font-size: 12px !important;
        }
        *[class="gmail-fix"] {
          display: none !important;
        }
        .es-m-txt-c,
        .es-m-txt-c h1,
        .es-m-txt-c h2,
        .es-m-txt-c h3 {
          text-align: center !important;
        }
        .es-m-txt-r,
        .es-m-txt-r h1,
        .es-m-txt-r h2,
        .es-m-txt-r h3 {
          text-align: right !important;
        }
        .es-m-txt-l,
        .es-m-txt-l h1,
        .es-m-txt-l h2,
        .es-m-txt-l h3 {
          text-align: left !important;
        }
        .es-m-txt-r img,
        .es-m-txt-c img,
        .es-m-txt-l img {
          display: inline !important;
        }
        .es-button-border {
          display: block !important;
        }
        a.es-button,
        button.es-button {
          font-size: 18px !important;
          display: block !important;
          border-right-width: 0px !important;
          border-left-width: 0px !important;
          border-top-width: 15px !important;
          border-bottom-width: 15px !important;
        }
        .es-adaptive table,
        .es-left,
        .es-right {
          width: 100% !important;
        }
        .es-content table,
        .es-header table,
        .es-footer table,
        .es-content,
        .es-footer,
        .es-header {
          width: 100% !important;
          max-width: 600px !important;
        }
        .es-adapt-td {
          display: block !important;
          width: 100% !important;
        }
        .adapt-img {
          width: 100% !important;
          height: auto !important;
        }
        .es-m-p0 {
          padding: 0px !important;
        }
        .es-m-p0r {
          padding-right: 0px !important;
        }

        .es-m-p0l {
          padding-left: 0px !important;
        }

        .es-m-p0t {
          padding-top: 0px !important;
        }

        .es-m-p0b {
          padding-bottom: 0 !important;
        }

        .es-m-p20b {
          padding-bottom: 20px !important;
        }

        .es-mobile-hidden,
        .es-hidden {
          display: none !important;
        }

        tr.es-desk-hidden,
        td.es-desk-hidden,
        table.es-desk-hidden {
          width: auto !important;
          overflow: visible !important;
          float: none !important;
          max-height: inherit !important;
          line-height: inherit !important;
        }

        tr.es-desk-hidden {
          display: table-row !important;
        }

        table.es-desk-hidden {
          display: table !important;
        }

        td.es-desk-menu-hidden {
          display: table-cell !important;
        }

        .es-menu td {
          width: 1% !important;
        }

        table.es-table-not-adapt,
        .esd-block-html table {
          width: auto !important;
        }

        table.es-social {
          display: inline-block !important;
        }

        table.es-social td {
          display: inline-block !important;
        }

        .es-desk-hidden {
          display: table-row !important;
          width: auto !important;
          overflow: visible !important;
          max-height: inherit !important;
        }
      }
    </style>
  </head>

  <body
    data-new-gr-c-s-loaded="14.1098.0"
    style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    "
  >
    <div class="es-wrapper-color" style="background-color: #ffffff">
      <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
      <table
        class="es-wrapper"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        "
      >
        <tr>
          <td valign="top" style="padding: 0; margin: 0">
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-footer"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#560082"
                    class="es-footer-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        align="left"
                        style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 520px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    "
                                  >
                                    <a
                                      target="_blank"
                                      href="${process.env.REACT_APP_URL}"
                                      style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "
                                      ><img
                                        src="${process.env.SERVER_URL}/template/logo.png"
                                        alt="Logo"
                                        style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        "
                                        height="60"
                                        title="Logo"
                                    /></a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-content"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#560082"
                    class="es-content-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ecc8ff;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        align="left"
                        style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 560px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                bgcolor="#fafafa"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                "
                                role="presentation"
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 20px; margin: 0"
                                  >
                                    <h3
                                      style="
                                        margin: 0;
                                        line-height: 34px;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        font-size: 24px;
                                        font-style: normal;
                                        font-weight: bold;
                                        color: #111318;
                                        text-align: center;
                                      "
                                    >
                                      Hi <span>${username}</span>,&nbsp;
                                    </h3>
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 18px;
                                      "
                                    >
                                      <br />
                                    </p>
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 30px;
                                      "
                                    >
                                      ${invitation_text}
                                    </p>
                                    <img
                                      src="${process.env.SERVER_URL}/template/fp-image.png"
                                    />
                                    <a
                                      target="_blank"
                                      href="${link}"
                                      style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: none;
                                        background-color: #560082;
                                        padding: 10px 20px;
                                        width: 170px;
                                        display: block;
                                        font-weight: 600;
                                        color: #fff;
                                        font-size: 16px;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        margin-top: 30px;
                                        margin-bottom: 30px;
                                      "
                                      >Join Syncupp</a
                                    >
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-content"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#ffefc4"
                    class="es-content-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ecc8ff;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        class="esdev-adapt-off"
                        align="left"
                        style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 520px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 0; margin: 0"
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      "
                                    >
                                      Thanks and Best Regards,<br />Have a great
                                      day!<br />Syncupp Team<a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        "
                                        href="${process.env.REACT_APP_URL}"
                                      ></a>
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-footer"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#bcb8b1"
                    class="es-footer-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td align="left" style="padding: 20px; margin: 0">
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="left"
                              style="padding: 0; margin: 0; width: 560px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    class="es-m-txt-c"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                      padding-bottom: 20px;
                                      font-size: 0;
                                    "
                                  >
                                    <table
                                      cellpadding="0"
                                      cellspacing="0"
                                      class="es-table-not-adapt es-social"
                                      role="presentation"
                                      style="
                                        mso-table-lspace: 0pt;
                                        mso-table-rspace: 0pt;
                                        border-collapse: collapse;
                                        border-spacing: 0px;
                                      "
                                    >
                                      <tr>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/linkedin.png"
                                              alt="In"
                                              title="Linkedin"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/twitter.png"
                                              alt="Tw"
                                              title="Twitter"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/instagram.png"
                                              alt="Ig"
                                              title="Instagram"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/yoututbe.png"
                                              alt="Yt"
                                              title="Youtube"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="padding: 0; margin: 0"
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="https://drive.google.com/file/d/1bp06sP-7PS-4feFZdPi-AW_WrqQhCen6/view?usp=drive_link"
                                              alt="Fb"
                                              title="Facebook"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 0; margin: 0"
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 20px;
                                        color: #2d3142;
                                        font-size: 13px;
                                      "
                                    >
                                      <a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                        href=""
                                      ></a
                                      ><a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 13px;
                                        "
                                        href="#"
                                        >Privacy Policy</a
                                      >
                                    </p>
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    align="center"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 20px;
                                    "
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "
                                    >
                                      Copyright &copy; 2024 Syncupp
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `;
};

exports.welcomeMail = (username) => {
  return `
    <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html
    xmlns="http://www.w3.org/1999/xhtml"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    style="font-family: arial, 'helvetica neue', helvetica, sans-serif"
  >
    <head>
      <meta charset="UTF-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <meta name="x-apple-disable-message-reformatting" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta content="telephone=no" name="format-detection" />
      <title>New message</title>
      <link
        href="https://fonts.googleapis.com/css2?family=Imprima&display=swap"
        rel="stylesheet"
      />
      <style type="text/css">
        #outlook a {
          padding: 0;
        }
        .es-button {
          mso-style-priority: 100 !important;
          text-decoration: none !important;
        }
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }
        .es-desk-hidden {
          display: none;
          float: left;
          overflow: hidden;
          width: 0;
          max-height: 0;
          line-height: 0;
          mso-hide: all;
        }
        [data-ogsb] .es-button {
          border-width: 0 !important;
          padding: 15px 20px 15px 20px !important;
        }
        @media only screen and (max-width: 600px) {
          p,
          ul li,
          ol li,
          a {
            line-height: 150% !important;
          }
          h1,
          h2,
          h3,
          h1 a,
          h2 a,
          h3 a {
            line-height: 120%;
          }
          h1 {
            font-size: 30px !important;
            text-align: left;
          }
          h2 {
            font-size: 24px !important;
            text-align: left;
          }
          h3 {
            font-size: 20px !important;
            text-align: left;
          }
          .es-header-body h1 a,
          .es-content-body h1 a,
          .es-footer-body h1 a {
            font-size: 30px !important;
            text-align: left;
          }
          .es-header-body h2 a,
          .es-content-body h2 a,
          .es-footer-body h2 a {
            font-size: 24px !important;
            text-align: left;
          }
          .es-header-body h3 a,
          .es-content-body h3 a,
          .es-footer-body h3 a {
            font-size: 20px !important;
            text-align: left;
          }
          .es-menu td a {
            font-size: 14px !important;
          }
          .es-header-body p,
          .es-header-body ul li,
          .es-header-body ol li,
          .es-header-body a {
            font-size: 14px !important;
          }
          .es-content-body p,
          .es-content-body ul li,
          .es-content-body ol li,
          .es-content-body a {
            font-size: 14px !important;
          }
          .es-footer-body p,
          .es-footer-body ul li,
          .es-footer-body ol li,
          .es-footer-body a {
            font-size: 14px !important;
          }
          .es-infoblock p,
          .es-infoblock ul li,
          .es-infoblock ol li,
          .es-infoblock a {
            font-size: 12px !important;
          }
          *[class="gmail-fix"] {
            display: none !important;
          }
          .es-m-txt-c,
          .es-m-txt-c h1,
          .es-m-txt-c h2,
          .es-m-txt-c h3 {
            text-align: center !important;
          }
          .es-m-txt-r,
          .es-m-txt-r h1,
          .es-m-txt-r h2,
          .es-m-txt-r h3 {
            text-align: right !important;
          }
          .es-m-txt-l,
          .es-m-txt-l h1,
          .es-m-txt-l h2,
          .es-m-txt-l h3 {
            text-align: left !important;
          }
          .es-m-txt-r img,
          .es-m-txt-c img,
          .es-m-txt-l img {
            display: inline !important;
          }
          .es-button-border {
            display: block !important;
          }
          a.es-button,
          button.es-button {
            font-size: 18px !important;
            display: block !important;
            border-right-width: 0px !important;
            border-left-width: 0px !important;
            border-top-width: 15px !important;
            border-bottom-width: 15px !important;
          }
          .es-adaptive table,
          .es-left,
          .es-right {
            width: 100% !important;
          }
          .es-content table,
          .es-header table,
          .es-footer table,
          .es-content,
          .es-footer,
          .es-header {
            width: 100% !important;
            max-width: 600px !important;
          }
          .es-adapt-td {
            display: block !important;
            width: 100% !important;
          }
          .adapt-img {
            width: 100% !important;
            height: auto !important;
          }
          .es-m-p0 {
            padding: 0px !important;
          }
          .es-m-p0r {
            padding-right: 0px !important;
          }
  
          .es-m-p0l {
            padding-left: 0px !important;
          }
  
          .es-m-p0t {
            padding-top: 0px !important;
          }
  
          .es-m-p0b {
            padding-bottom: 0 !important;
          }
  
          .es-m-p20b {
            padding-bottom: 20px !important;
          }
  
          .es-mobile-hidden,
          .es-hidden {
            display: none !important;
          }
  
          tr.es-desk-hidden,
          td.es-desk-hidden,
          table.es-desk-hidden {
            width: auto !important;
            overflow: visible !important;
            float: none !important;
            max-height: inherit !important;
            line-height: inherit !important;
          }
  
          tr.es-desk-hidden {
            display: table-row !important;
          }
  
          table.es-desk-hidden {
            display: table !important;
          }
  
          td.es-desk-menu-hidden {
            display: table-cell !important;
          }
  
          .es-menu td {
            width: 1% !important;
          }
  
          table.es-table-not-adapt,
          .esd-block-html table {
            width: auto !important;
          }
  
          table.es-social {
            display: inline-block !important;
          }
  
          table.es-social td {
            display: inline-block !important;
          }
  
          .es-desk-hidden {
            display: table-row !important;
            width: auto !important;
            overflow: visible !important;
            max-height: inherit !important;
          }
        }
      </style>
    </head>
  
    <body
      data-new-gr-c-s-loaded="14.1098.0"
      style="
        width: 100%;
        font-family: arial, 'helvetica neue', helvetica, sans-serif;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        padding: 0;
        margin: 0;
      "
    >
      <div class="es-wrapper-color" style="background-color: #ffffff">
        <!--[if gte mso 9]>
          <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
            <v:fill type="tile" color="#ffffff"></v:fill>
          </v:background>
        <![endif]-->
        <table
          class="es-wrapper"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          style="
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            border-collapse: collapse;
            border-spacing: 0px;
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100%;
            background-repeat: repeat;
            background-position: center top;
            background-color: #ffffff;
          "
        >
          <tr>
            <td valign="top" style="padding: 0; margin: 0">
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-footer"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                  background-color: transparent;
                  background-repeat: repeat;
                  background-position: center top;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#560082"
                      class="es-footer-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          align="left"
                          style="
                            margin: 0;
                            padding-top: 20px;
                            padding-bottom: 20px;
                            padding-left: 40px;
                            padding-right: 40px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 520px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        font-size: 0px;
                                      "
                                    >
                                      <a
                                        target="_blank"
                                        href="${process.env.REACT_APP_URL}"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                        ><img
                                          src="${process.env.SERVER_URL}/template/logo.png"
                                          alt="Logo"
                                          style="
                                            display: block;
                                            border: 0;
                                            outline: none;
                                            text-decoration: none;
                                            -ms-interpolation-mode: bicubic;
                                          "
                                          height="60"
                                          title="Logo"
                                      /></a>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#560082"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ecc8ff;
                        border-radius: 20px 20px 0px 0px;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          align="left"
                          style="
                            padding: 0;
                            margin: 0;
                            padding-top: 20px;
                            padding-left: 20px;
                            padding-right: 20px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  bgcolor="#fafafa"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: separate;
                                    border-spacing: 0px;
                                    background-color: #fafafa;
                                    border-radius: 10px;
                                  "
                                  role="presentation"
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 20px; margin: 0"
                                    >
                                      <h3
                                        style="
                                          margin: 0;
                                          line-height: 34px;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          font-size: 24px;
                                          font-style: normal;
                                          font-weight: bold;
                                          color: #111318;
                                          text-align: center;
                                        "
                                      >
                                        Hi <span>${username}</span>,&nbsp;
                                      </h3>
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 18px;
                                        "
                                      >
                                        <br />
                                      </p>
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 16px;
                                          margin-bottom: 30px;
                                        "
                                      >
                                        Welcome to the Syncupp. you have succcessfully joined with the SyncUpp.
                                      </p>
                                      <img
                                        src="${process.env.SERVER_URL}/template/fp-image.png"
                                      />
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#ffefc4"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ecc8ff;
                        border-radius: 0px 0px 20px 20px;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          class="esdev-adapt-off"
                          align="left"
                          style="
                            margin: 0;
                            padding-top: 20px;
                            padding-bottom: 20px;
                            padding-left: 40px;
                            padding-right: 40px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 520px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 0; margin: 0"
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 24px;
                                          color: #2d3142;
                                          font-size: 16px;
                                        "
                                      >
                                        Thanks and Best Regards,<br />Have a great
                                        day!<br />Syncupp Team<a
                                          target="_blank"
                                          style="
                                            -webkit-text-size-adjust: none;
                                            -ms-text-size-adjust: none;
                                            mso-line-height-rule: exactly;
                                            text-decoration: underline;
                                            color: #2d3142;
                                            font-size: 16px;
                                          "
                                          href="${process.env.REACT_APP_URL}"
                                        ></a>
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-footer"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                  background-color: transparent;
                  background-repeat: repeat;
                  background-position: center top;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#bcb8b1"
                      class="es-footer-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td align="left" style="padding: 20px; margin: 0">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="left"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      class="es-m-txt-c"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        padding-top: 10px;
                                        padding-bottom: 20px;
                                        font-size: 0;
                                      "
                                    >
                                      <table
                                        cellpadding="0"
                                        cellspacing="0"
                                        class="es-table-not-adapt es-social"
                                        role="presentation"
                                        style="
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: collapse;
                                          border-spacing: 0px;
                                        "
                                      >
                                        <tr>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="
                                              padding: 0;
                                              margin: 0;
                                              padding-right: 5px;
                                            "
                                          >
                                            <a
                                              target="_blank"
                                              href="#"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="${process.env.SERVER_URL}/template/linkedin.png"
                                                alt="In"
                                                title="Linkedin"
                                                height="24"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                            /></a>
                                          </td>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="
                                              padding: 0;
                                              margin: 0;
                                              padding-right: 5px;
                                            "
                                          >
                                            <a
                                              target="_blank"
                                              href="#"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="${process.env.SERVER_URL}/template/twitter.png"
                                                alt="Tw"
                                                title="Twitter"
                                                height="24"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                            /></a>
                                          </td>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="
                                              padding: 0;
                                              margin: 0;
                                              padding-right: 5px;
                                            "
                                          >
                                            <a
                                              target="_blank"
                                              href="#"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="${process.env.SERVER_URL}/template/instagram.png"
                                                alt="Ig"
                                                title="Instagram"
                                                height="24"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                            /></a>
                                          </td>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="
                                              padding: 0;
                                              margin: 0;
                                              padding-right: 5px;
                                            "
                                          >
                                            <a
                                              target="_blank"
                                              href="#"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="${process.env.SERVER_URL}/template/yoututbe.png"
                                                alt="Yt"
                                                title="Youtube"
                                                height="24"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                            /></a>
                                          </td>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="padding: 0; margin: 0"
                                          >
                                            <a
                                              target="_blank"
                                              href="#"
                                              style="
                                                -webkit-text-size-adjust: none;
                                                -ms-text-size-adjust: none;
                                                mso-line-height-rule: exactly;
                                                text-decoration: underline;
                                                color: #2d3142;
                                                font-size: 14px;
                                              "
                                              ><img
                                                src="https://drive.google.com/file/d/1bp06sP-7PS-4feFZdPi-AW_WrqQhCen6/view?usp=drive_link"
                                                alt="Fb"
                                                title="Facebook"
                                                height="24"
                                                style="
                                                  display: block;
                                                  border: 0;
                                                  outline: none;
                                                  text-decoration: none;
                                                  -ms-interpolation-mode: bicubic;
                                                "
                                            /></a>
                                          </td>
                                        </tr>
                                      </table>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 0; margin: 0"
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 20px;
                                          color: #2d3142;
                                          font-size: 13px;
                                        "
                                      >
                                        <a
                                          target="_blank"
                                          style="
                                            -webkit-text-size-adjust: none;
                                            -ms-text-size-adjust: none;
                                            mso-line-height-rule: exactly;
                                            text-decoration: none;
                                            color: #2d3142;
                                            font-size: 14px;
                                          "
                                          href=""
                                        ></a
                                        ><a
                                          target="_blank"
                                          style="
                                            -webkit-text-size-adjust: none;
                                            -ms-text-size-adjust: none;
                                            mso-line-height-rule: exactly;
                                            text-decoration: none;
                                            color: #2d3142;
                                            font-size: 13px;
                                          "
                                          href="#"
                                          >Privacy Policy</a
                                        >
                                      </p>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td
                                      align="center"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        padding-top: 20px;
                                      "
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 21px;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                      >
                                        Copyright &copy; 2024 Syncupp
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
  </html>
    `;
};

exports.forgotPasswordEmailTemplate = (link, username) => {
  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html
  xmlns="http://www.w3.org/1999/xhtml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif"
>
  <head>
    <meta charset="UTF-8" />
    <meta content="width=device-width, initial-scale=1" name="viewport" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta content="telephone=no" name="format-detection" />
    <title>New message</title>
    <link
      href="https://fonts.googleapis.com/css2?family=Imprima&display=swap"
      rel="stylesheet"
    />
    <style type="text/css">
      #outlook a {
        padding: 0;
      }
      .es-button {
        mso-style-priority: 100 !important;
        text-decoration: none !important;
      }
      a[x-apple-data-detectors] {
        color: inherit !important;
        text-decoration: none !important;
        font-size: inherit !important;
        font-family: inherit !important;
        font-weight: inherit !important;
        line-height: inherit !important;
      }
      .es-desk-hidden {
        display: none;
        float: left;
        overflow: hidden;
        width: 0;
        max-height: 0;
        line-height: 0;
        mso-hide: all;
      }
      [data-ogsb] .es-button {
        border-width: 0 !important;
        padding: 15px 20px 15px 20px !important;
      }
      @media only screen and (max-width: 600px) {
        p,
        ul li,
        ol li,
        a {
          line-height: 150% !important;
        }
        h1,
        h2,
        h3,
        h1 a,
        h2 a,
        h3 a {
          line-height: 120%;
        }
        h1 {
          font-size: 30px !important;
          text-align: left;
        }
        h2 {
          font-size: 24px !important;
          text-align: left;
        }
        h3 {
          font-size: 20px !important;
          text-align: left;
        }
        .es-header-body h1 a,
        .es-content-body h1 a,
        .es-footer-body h1 a {
          font-size: 30px !important;
          text-align: left;
        }
        .es-header-body h2 a,
        .es-content-body h2 a,
        .es-footer-body h2 a {
          font-size: 24px !important;
          text-align: left;
        }
        .es-header-body h3 a,
        .es-content-body h3 a,
        .es-footer-body h3 a {
          font-size: 20px !important;
          text-align: left;
        }
        .es-menu td a {
          font-size: 14px !important;
        }
        .es-header-body p,
        .es-header-body ul li,
        .es-header-body ol li,
        .es-header-body a {
          font-size: 14px !important;
        }
        .es-content-body p,
        .es-content-body ul li,
        .es-content-body ol li,
        .es-content-body a {
          font-size: 14px !important;
        }
        .es-footer-body p,
        .es-footer-body ul li,
        .es-footer-body ol li,
        .es-footer-body a {
          font-size: 14px !important;
        }
        .es-infoblock p,
        .es-infoblock ul li,
        .es-infoblock ol li,
        .es-infoblock a {
          font-size: 12px !important;
        }
        *[class="gmail-fix"] {
          display: none !important;
        }
        .es-m-txt-c,
        .es-m-txt-c h1,
        .es-m-txt-c h2,
        .es-m-txt-c h3 {
          text-align: center !important;
        }
        .es-m-txt-r,
        .es-m-txt-r h1,
        .es-m-txt-r h2,
        .es-m-txt-r h3 {
          text-align: right !important;
        }
        .es-m-txt-l,
        .es-m-txt-l h1,
        .es-m-txt-l h2,
        .es-m-txt-l h3 {
          text-align: left !important;
        }
        .es-m-txt-r img,
        .es-m-txt-c img,
        .es-m-txt-l img {
          display: inline !important;
        }
        .es-button-border {
          display: block !important;
        }
        a.es-button,
        button.es-button {
          font-size: 18px !important;
          display: block !important;
          border-right-width: 0px !important;
          border-left-width: 0px !important;
          border-top-width: 15px !important;
          border-bottom-width: 15px !important;
        }
        .es-adaptive table,
        .es-left,
        .es-right {
          width: 100% !important;
        }
        .es-content table,
        .es-header table,
        .es-footer table,
        .es-content,
        .es-footer,
        .es-header {
          width: 100% !important;
          max-width: 600px !important;
        }
        .es-adapt-td {
          display: block !important;
          width: 100% !important;
        }
        .adapt-img {
          width: 100% !important;
          height: auto !important;
        }
        .es-m-p0 {
          padding: 0px !important;
        }
        .es-m-p0r {
          padding-right: 0px !important;
        }

        .es-m-p0l {
          padding-left: 0px !important;
        }

        .es-m-p0t {
          padding-top: 0px !important;
        }

        .es-m-p0b {
          padding-bottom: 0 !important;
        }

        .es-m-p20b {
          padding-bottom: 20px !important;
        }

        .es-mobile-hidden,
        .es-hidden {
          display: none !important;
        }

        tr.es-desk-hidden,
        td.es-desk-hidden,
        table.es-desk-hidden {
          width: auto !important;
          overflow: visible !important;
          float: none !important;
          max-height: inherit !important;
          line-height: inherit !important;
        }

        tr.es-desk-hidden {
          display: table-row !important;
        }

        table.es-desk-hidden {
          display: table !important;
        }

        td.es-desk-menu-hidden {
          display: table-cell !important;
        }

        .es-menu td {
          width: 1% !important;
        }

        table.es-table-not-adapt,
        .esd-block-html table {
          width: auto !important;
        }

        table.es-social {
          display: inline-block !important;
        }

        table.es-social td {
          display: inline-block !important;
        }

        .es-desk-hidden {
          display: table-row !important;
          width: auto !important;
          overflow: visible !important;
          max-height: inherit !important;
        }
      }
    </style>
  </head>

  <body
    data-new-gr-c-s-loaded="14.1098.0"
    style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    "
  >
    <div class="es-wrapper-color" style="background-color: #ffffff">
      <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
      <table
        class="es-wrapper"
        width="100%"
        cellspacing="0"
        cellpadding="0"
        style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        "
      >
        <tr>
          <td valign="top" style="padding: 0; margin: 0">
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-footer"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#560082"
                    class="es-footer-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        align="left"
                        style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 520px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    "
                                  >
                                    <a
                                      target="_blank"
                                      href="${process.env.REACT_APP_URL}"
                                      style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "
                                      ><img
                                        src="${process.env.SERVER_URL}/template/logo.png"
                                        alt="Logo"
                                        style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        "
                                        height="60"
                                        title="Logo"
                                    /></a>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-content"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#560082"
                    class="es-content-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ecc8ff;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        align="left"
                        style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 560px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                bgcolor="#fafafa"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                "
                                role="presentation"
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 20px; margin: 0"
                                  >
                                    <h3
                                      style="
                                        margin: 0;
                                        line-height: 34px;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        font-size: 24px;
                                        font-style: normal;
                                        font-weight: bold;
                                        color: #111318;
                                        text-align: center;
                                      "
                                    >
                                      Hi <span>${username}</span>,&nbsp;
                                    </h3>
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 18px;
                                      "
                                    >
                                      <br />
                                    </p>
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 30px;
                                      "
                                    >
                                    We’re Sending you this email because You requested a password reset. click on this link to create a new password: 
                                    </p>
                                    <img
                                      src="${process.env.SERVER_URL}/template/fp-image.png"
                                    />
                                    <a
                                      target="_blank"
                                      href="${link}"
                                      style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: none;
                                        background-color: #560082;
                                        padding: 10px 20px;
                                        width: 170px;
                                        display: block;
                                        font-weight: 600;
                                        color: #fff;
                                        font-size: 16px;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        margin-top: 30px;
                                        margin-bottom: 30px;
                                      "
                                      >Password Reset</a
                                    >
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-content"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#ffefc4"
                    class="es-content-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ecc8ff;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td
                        class="esdev-adapt-off"
                        align="left"
                        style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        "
                      >
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="center"
                              valign="top"
                              style="padding: 0; margin: 0; width: 520px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 0; margin: 0"
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      "
                                    >
                                      Thanks and Best Regards,<br />Have a great
                                      day!<br />Syncupp Team<a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        "
                                        href="${process.env.REACT_APP_URL}"
                                      ></a>
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <table
              cellpadding="0"
              cellspacing="0"
              class="es-footer"
              align="center"
              style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              "
            >
              <tr>
                <td align="center" style="padding: 0; margin: 0">
                  <table
                    bgcolor="#bcb8b1"
                    class="es-footer-body"
                    align="center"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    "
                  >
                    <tr>
                      <td align="left" style="padding: 20px; margin: 0">
                        <table
                          cellpadding="0"
                          cellspacing="0"
                          width="100%"
                          style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          "
                        >
                          <tr>
                            <td
                              align="left"
                              style="padding: 0; margin: 0; width: 560px"
                            >
                              <table
                                cellpadding="0"
                                cellspacing="0"
                                width="100%"
                                role="presentation"
                                style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                "
                              >
                                <tr>
                                  <td
                                    align="center"
                                    class="es-m-txt-c"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                      padding-bottom: 20px;
                                      font-size: 0;
                                    "
                                  >
                                    <table
                                      cellpadding="0"
                                      cellspacing="0"
                                      class="es-table-not-adapt es-social"
                                      role="presentation"
                                      style="
                                        mso-table-lspace: 0pt;
                                        mso-table-rspace: 0pt;
                                        border-collapse: collapse;
                                        border-spacing: 0px;
                                      "
                                    >
                                      <tr>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/linkedin.png"
                                              alt="In"
                                              title="Linkedin"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/twitter.png"
                                              alt="Tw"
                                              title="Twitter"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/instagram.png"
                                              alt="Ig"
                                              title="Instagram"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          "
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="${process.env.SERVER_URL}/template/yoututbe.png"
                                              alt="Yt"
                                              title="Youtube"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                        <td
                                          align="center"
                                          valign="top"
                                          style="padding: 0; margin: 0"
                                        >
                                          <a
                                            target="_blank"
                                            href="#"
                                            style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "
                                            ><img
                                              src="https://drive.google.com/file/d/1bp06sP-7PS-4feFZdPi-AW_WrqQhCen6/view?usp=drive_link"
                                              alt="Fb"
                                              title="Facebook"
                                              height="24"
                                              style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              "
                                          /></a>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    align="center"
                                    style="padding: 0; margin: 0"
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 20px;
                                        color: #2d3142;
                                        font-size: 13px;
                                      "
                                    >
                                      <a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                        href=""
                                      ></a
                                      ><a
                                        target="_blank"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 13px;
                                        "
                                        href="#"
                                        >Privacy Policy</a
                                      >
                                    </p>
                                  </td>
                                </tr>
                                <tr>
                                  <td
                                    align="center"
                                    style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 20px;
                                    "
                                  >
                                    <p
                                      style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "
                                    >
                                      Copyright &copy; 2024 Syncupp
                                    </p>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>
  `;
};

exports.invoiceTemplate = (invoiceData) => {
  return `
  <!DOCTYPE html
  PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif">

<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta content="telephone=no" name="format-detection" />
  <title>Syncupp Invoice</title>
  <!--[if (mso 16)]>
      <style type="text/css">
        a {
          text-decoration: none;
        }
      </style>
    <![endif]-->
  <!--[if gte mso 9
      ]><style>
        sup {
          font-size: 100% !important;
        }
      </style><!
    [endif]-->
  <!--[if gte mso 9]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG></o:AllowPNG>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    <![endif]-->
  <!--[if !mso]><!-- -->
  <link href="https://fonts.googleapis.com/css2?family=Imprima&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    .es-button {
      mso-style-priority: 100 !important;
      text-decoration: none !important;
    }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    .es-desk-hidden {
      display: none;
      float: left;
      overflow: hidden;
      width: 0;
      max-height: 0;
      line-height: 0;
      mso-hide: all;
    }

    [data-ogsb] .es-button {
      border-width: 0 !important;
      padding: 15px 20px 15px 20px !important;
    }

    @media only screen and (max-width: 600px) {

      p,
      ul li,
      ol li,
      a {
        line-height: 150% !important;
      }

      h1,
      h2,
      h3,
      h1 a,
      h2 a,
      h3 a {
        line-height: 120%;
      }

      h1 {
        font-size: 30px !important;
        text-align: left;
      }

      h2 {
        font-size: 24px !important;
        text-align: left;
      }

      h3 {
        font-size: 20px !important;
        text-align: left;
      }

      .es-header-body h1 a,
      .es-content-body h1 a,
      .es-footer-body h1 a {
        font-size: 30px !important;
        text-align: left;
      }

      .es-header-body h2 a,
      .es-content-body h2 a,
      .es-footer-body h2 a {
        font-size: 24px !important;
        text-align: left;
      }

      .es-header-body h3 a,
      .es-content-body h3 a,
      .es-footer-body h3 a {
        font-size: 20px !important;
        text-align: left;
      }

      .es-menu td a {
        font-size: 14px !important;
      }

      .es-header-body p,
      .es-header-body ul li,
      .es-header-body ol li,
      .es-header-body a {
        font-size: 14px !important;
      }

      .es-content-body p,
      .es-content-body ul li,
      .es-content-body ol li,
      .es-content-body a {
        font-size: 14px !important;
      }

      .es-footer-body p,
      .es-footer-body ul li,
      .es-footer-body ol li,
      .es-footer-body a {
        font-size: 14px !important;
      }

      .es-infoblock p,
      .es-infoblock ul li,
      .es-infoblock ol li,
      .es-infoblock a {
        font-size: 12px !important;
      }

      *[class="gmail-fix"] {
        display: none !important;
      }

      .es-m-txt-c,
      .es-m-txt-c h1,
      .es-m-txt-c h2,
      .es-m-txt-c h3 {
        text-align: center !important;
      }

      .es-m-txt-r,
      .es-m-txt-r h1,
      .es-m-txt-r h2,
      .es-m-txt-r h3 {
        text-align: right !important;
      }

      .es-m-txt-l,
      .es-m-txt-l h1,
      .es-m-txt-l h2,
      .es-m-txt-l h3 {
        text-align: left !important;
      }

      .es-m-txt-r img,
      .es-m-txt-c img,
      .es-m-txt-l img {
        display: inline !important;
      }

      .es-button-border {
        display: block !important;
      }

      a.es-button,
      button.es-button {
        font-size: 18px !important;
        display: block !important;
        border-right-width: 0px !important;
        border-left-width: 0px !important;
        border-top-width: 15px !important;
        border-bottom-width: 15px !important;
      }

      .es-adaptive table,
      .es-left,
      .es-right {
        width: 100% !important;
      }

      .es-content table,
      .es-header table,
      .es-footer table,
      .es-content,
      .es-footer,
      .es-header {
        width: 100% !important;
        max-width: 600px !important;
      }

      .es-adapt-td {
        display: block !important;
        width: 100% !important;
      }

      .adapt-img {
        width: 100% !important;
        height: auto !important;
      }

      .es-m-p0 {
        padding: 0px !important;
      }

      .es-m-p0r {
        padding-right: 0px !important;
      }

      .es-m-p0l {
        padding-left: 0px !important;
      }

      .es-m-p0t {
        padding-top: 0px !important;
      }

      .es-m-p0b {
        padding-bottom: 0 !important;
      }

      .es-m-p20b {
        padding-bottom: 20px !important;
      }

      .es-mobile-hidden,
      .es-hidden {
        display: none !important;
      }

      tr.es-desk-hidden,
      td.es-desk-hidden,
      table.es-desk-hidden {
        width: auto !important;
        overflow: visible !important;
        float: none !important;
        max-height: inherit !important;
        line-height: inherit !important;
      }

      tr.es-desk-hidden {
        display: table-row !important;
      }

      table.es-desk-hidden {
        display: table !important;
      }

      td.es-desk-menu-hidden {
        display: table-cell !important;
      }

      .es-menu td {
        width: 1% !important;
      }

      table.es-table-not-adapt,
      .esd-block-html table {
        width: auto !important;
      }

      table.es-social {
        display: inline-block !important;
      }

      table.es-social td {
        display: inline-block !important;
      }

      .es-desk-hidden {
        display: table-row !important;
        width: auto !important;
        overflow: visible !important;
        max-height: inherit !important;
      }
    }
  </style>
</head>

<body data-new-gr-c-s-loaded="14.1098.0" style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    ">
  <div class="es-wrapper-color" style="background-color: #ffffff">
    <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
    <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        ">
      <tr>
        <td valign="top" style="padding: 0; margin: 0">
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    ">
                                  <a target="_blank" href="https://www.tridhyatech.com" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "><img src="${
                                        process.env.SERVER_URL
                                      }/template/syncupp-logo.png" alt="Logo" style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        " height="60" title="Logo" /></a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                " role="presentation">
                              <tr>
                                <td align="center" style="padding: 20px; margin: 0">


                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 0px;
                                        text-align: right;
                                        font-weight: 700;
                                      ">
                                    Agency Details,
                                  </p>
                                  <ul style="list-style: none; text-align: left; padding-left: 0; margin: 0; -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 22px;
                                        color: #111318;
                                        font-size: 14px;
                                        text-align: right;
                                        ">
                                    <li></li>
                                    <li>${
                                      invoiceData?.from?.company_name
                                        ? invoiceData?.from?.company_name + ","
                                        : `&nbsp;`
                                    }</li>

                                    <li>
                                    ${
                                      invoiceData?.from?.address
                                        ? invoiceData?.from?.address + ","
                                        : `&nbsp;`
                                    }${
    invoiceData?.from?.city?.name
      ? invoiceData?.from?.city?.name + ","
      : `&nbsp;`
  }
                                    </li>
                                    <li>${
                                      invoiceData?.from?.state?.name
                                        ? invoiceData?.from?.state?.name + ","
                                        : `&nbsp;`
                                    } ${
    invoiceData?.from?.pincode ? invoiceData?.from?.pincode + "," : `&nbsp;`
  }</li>
                                    <li>${
                                      invoiceData?.from?.country?.name
                                        ? invoiceData?.from?.country?.name + ","
                                        : `&nbsp;`
                                    }</li>
                                    <li>
                                      <span style="font-weight: bold;">M :</span>
                                       ${
                                         invoiceData?.from?.contact_number
                                           ? invoiceData?.from?.contact_number +
                                             ","
                                           : `&nbsp;`
                                       }
                                    </li>
                                  </ul>
                                  <hr />
                                  <h3 style="
                                                                          margin: 0;
                                                                          line-height: 34px;
                                                                          mso-line-height-rule: exactly;
                                                                          font-family: -apple-system,
                                                                            blinkmacsystemfont, 'segoe ui', roboto,
                                                                            helvetica, arial, sans-serif,
                                                                            'apple color emoji', 'segoe ui emoji',
                                                                            'segoe ui symbol';
                                                                          font-size: 24px;
                                                                          font-style: normal;
                                                                          font-weight: bold;
                                                                          color: #560082;
                                                                          text-align: left;
                                                                        ">
                                    Invoice
                                  </h3>
                                  <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa" style="
                                                                    mso-table-lspace: 0pt;
                                                                    mso-table-rspace: 0pt;
                                                                    border-collapse: separate;
                                                                    border-spacing: 0px;
                                                                    background-color: #fafafa;
                                                                    border-radius: 10px;
                                                                  " role="presentation">
                                    <tr>
                                      <td align="left" style=" padding-top: 10px; font-weight: 600; font-size: 14px;">
                                        Recipient
                                      </td>
                                      <td align="right" style=" padding-top: 10px; font-weight: 600; font-size: 14px; ">
                                        Invoice Details
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>
                                        <ul style="list-style: none; text-align: left; padding-left: 0; margin: 0; -webkit-text-size-adjust: none;
                                                                                -ms-text-size-adjust: none;
                                                                                mso-line-height-rule: exactly;
                                                                                font-family: -apple-system,
                                                                                  blinkmacsystemfont, 'segoe ui', roboto,
                                                                                  helvetica, arial, sans-serif,
                                                                                  'apple color emoji', 'segoe ui emoji',
                                                                                  'segoe ui symbol';
                                                                                line-height: 22px;
                                                                                color: #111318;
                                                                                font-size: 14px;
                                                                                text-align: left;
                                                                                ">
                                          <li>${
                                            invoiceData?.to?.client_full_name
                                              ? invoiceData?.to
                                                  ?.client_full_name + ","
                                              : `&nbsp;`
                                          }</li>
                                         

                                          <li>
                                          ${
                                            invoiceData?.to?.address ?? `&nbsp;`
                                          }${
    invoiceData?.to?.city?.name ? invoiceData?.to?.city?.name + "," : `&nbsp;`
  }
                                          </li>
                                          <li>${
                                            invoiceData?.to?.state?.name
                                              ? invoiceData?.to?.state?.name +
                                                ","
                                              : `&nbsp;`
                                          } ${
    invoiceData?.to?.pincode ? invoiceData?.to?.pincode + "," : `&nbsp;`
  }</li>
                                          <li>${
                                            invoiceData?.to?.country?.name
                                              ? invoiceData?.to?.country?.name +
                                                ","
                                              : `&nbsp;`
                                          }</li>
                                          <li>
                                            <span style="font-weight: bold;">M :</span>
                                           ${
                                             invoiceData?.to?.contact_number
                                               ? invoiceData?.to
                                                   ?.contact_number + ","
                                               : `&nbsp;`
                                           }
                                          </li>
                                        </ul>
                                      </td>
                                      <td>
                                        <ul style="list-style: none; text-align: left; padding-left: 0; margin: 0; -webkit-text-size-adjust: none;
                                                                                -ms-text-size-adjust: none;
                                                                                mso-line-height-rule: exactly;
                                                                                font-family: -apple-system,
                                                                                  blinkmacsystemfont, 'segoe ui', roboto,
                                                                                  helvetica, arial, sans-serif,
                                                                                  'apple color emoji', 'segoe ui emoji',
                                                                                  'segoe ui symbol';
                                                                                line-height: 22px;
                                                                                color: #111318;
                                                                                font-size: 14px;
                                                                                text-align: right;
                                                                                ">
                                          <li style="font-weight: 600;">Invoice No,</li>
                                          <li style="font-size: 13px;">${
                                            invoiceData.invoice_number
                                          }</li>

                                          <li style="font-weight: 600; padding-top: 30px;">
                                            Invoice Date
                                          </li>
                                          <li>${new Date(
                                            invoiceData.invoice_date
                                          ).toLocaleDateString()}</li>

                                        </ul>
                                      </td>
                                    </tr>

                                  </table>
                                  <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa"
                                    style="
                                                 font-family: -apple-system,
                                                                            blinkmacsystemfont, 'segoe ui', roboto,
                                                                            helvetica, arial, sans-serif,
                                                                            'apple color emoji', 'segoe ui emoji',
                                                                            'segoe ui symbol';                                                                                             mso-table-lspace: 0pt;
                                                                                                                                              mso-table-rspace: 0pt;
                                                                                                                                              border-collapse: separate;
                                                                                                                                              border-spacing: 0px;
                                                                                                                                              background-color: #f3f3f3;
                                                                                                                                              border-radius: 10px;
                                                                                                                                              padding: 10px;
                                                                                                                                              margin-top:20px
                                                                                                                                            " role="presentation">
                                    <thead style="color: rgb(96, 96, 96); font-weight: 400;
                                    border-bottom: 1px solid black; text-align: left;">
                                      <th style="font-size: 14px; font-weight: 500;">Item</th>
                                      <th style="font-size: 14px; font-weight: 500;">Desctiptions</th>
                                      <th style="font-size: 14px; font-weight: 500;">Qty</th>
                                      <th style="font-size: 14px; font-weight: 500;">Rate</th>
                                      <th style="font-size: 14px; font-weight: 500;">Tax</th>
                                      <th style="font-size: 14px; font-weight: 500;">Amount</th>
                                    </thead>

                                    ${invoiceData.invoice_content
                                      .map(
                                        (item) => `
                                        <tr style="border-bottom: 1px solid #fafafa;">
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
    ${item.item}
                                        </td>
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
                                          ${item.description}
                                        </td>
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
    ${item.qty}
                                        </td>
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
    ${item.rate} $
                                        </td>
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
    ${item.tax} %
                                        </td>
                                        <td align="left" style=" padding-top: 10px; font-weight: 400; font-size: 12px; text-overflow: ellipsis;  vertical-align: top; border-bottom: 1px solid black; padding-bottom:5px;
    border-collapse: collapse;">
    ${item.amount} $
                                        </td>
                                      </tr>
                                `
                                      )
                                      .join("")}
                               

                                 
                                  </table>

                                  <ul style="width: 50%; text-align: right; float: right;
                                  list-style: none; margin-bottom: 40px; font-family: -apple-system,
                                                                            blinkmacsystemfont, 'segoe ui', roboto,
                                                                            helvetica, arial, sans-serif,
                                                                            'apple color emoji', 'segoe ui emoji',
                                                                            'segoe ui symbol'; font-size: 14px;">
                                    <li style="text-align: left;     width: 100%;
    display: inline-table;">
                                      <span style="text-align: left; width: 50%; display: inline-table;
                                      font-weight: 500;">Subtotal</span>
                                      <span style="text-align: right; width: 50%; display: inline-table;
                                      font-weight: 600;">${
                                        invoiceData.sub_total
                                      }
                                      $</span>
                                    </li>
                                    <li style="border:1px solid #111318; margin-top: 10px;"></li>
                                    <li style="text-align: left;     width: 100%;
                                        display: inline-table; margin-top: 10px;">
                                      <span style="text-align: left; width: 50%; display: inline-table;
                                                                          font-weight: 500;">Total</span>
                                      <span style="text-align: right; width: 50%; display: inline-table;
                                                                          font-weight: 600;">${
                                                                            invoiceData.total
                                                                          }
                                        $</span>
                                    </li>
                                    <li style="border:1px solid #111318; margin-top: 10px;"></li>
                                    <li style="text-align: left;     width: 100%;
                                                                            display: inline-table; margin-top: 10px;">
                                      <span
                                        style="text-align: left; width: 50%; display: inline-table;
                                                                                                              font-weight: 500;">Status</span>
                                      <span
                                        style="text-align: right; width: 50%; display: inline-table;
                                                                                                              font-weight: 600;">${
                                                                                                                invoiceData.status
                                                                                                              }</span>
                                    </li>
                                  </ul>

                                  <p style="
                                                                          margin: 0;
                                                                          -webkit-text-size-adjust: none;
                                                                          -ms-text-size-adjust: none;
                                                                          mso-line-height-rule: exactly;
                                                                          font-family: -apple-system,
                                                                            blinkmacsystemfont, 'segoe ui', roboto,
                                                                            helvetica, arial, sans-serif,
                                                                            'apple color emoji', 'segoe ui emoji',
                                                                            'segoe ui symbol';
                                                                          line-height: 27px;
                                                                          color: #111318;
                                                                          font-size: 16px;
                                                                          width: 100%;
                                                                        ">
                                    <br />
                                  </p>



                                  <p style="
                                        margin-top: 150px;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                      ">
                                    We appreciate your business. Should you need us to add VAT or extra notes let us
                                    know!
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#ffefc4" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    ">
                  <tr>
                    <td class="esdev-adapt-off" align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      ">
                                    Thanks and Best Regards,<br />Have a great
                                    day!<br />Syncupp Team<a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        " href="https://www.tridhyatech.com"></a>
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#bcb8b1" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="padding: 20px; margin: 0">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="left" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" class="es-m-txt-c" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                      padding-bottom: 20px;
                                      font-size: 0;
                                    ">
                                  <table cellpadding="0" cellspacing="0" class="es-table-not-adapt es-social"
                                    role="presentation" style="
                                        mso-table-lspace: 0pt;
                                        mso-table-rspace: 0pt;
                                        border-collapse: collapse;
                                        border-spacing: 0px;
                                      ">
                                    <tr>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="${
                                              process.env.SERVER_URL
                                            }/template/linkedin.png" alt="In" title="Linkedin" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="${
                                              process.env.SERVER_URL
                                            }/template/twitter.png" alt="Tw" title="Twitter" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="${
                                              process.env.SERVER_URL
                                            }/template/instagram.png" alt="Ig" title="Instagram" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="${
                                              process.env.SERVER_URL
                                            }/template/yoututbe.png" alt="Yt" title="Youtube" height="24" style="


                        
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="padding: 0; margin: 0">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="${
                                              process.env.SERVER_URL
                                            }/template/facebook.png" alt="Fb" title="Facebook" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 20px;
                                        color: #2d3142;
                                        font-size: 13px;
                                      ">
                                    <a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 14px;
                                        " href=""></a><a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 13px;
                                        " href="#">Privacy Policy</a>
                                  </p>
                                </td>
                              </tr>
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 20px;
                                    ">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      ">
                                    Copyright &copy; 2023 Syncupp
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>

  
</body>

</html>
  `;
};

exports.inquiryTemplate = (data) => {
  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html
    xmlns="http://www.w3.org/1999/xhtml"
    xmlns:o="urn:schemas-microsoft-com:office:office"
    style="font-family: arial, 'helvetica neue', helvetica, sans-serif"
  >
    <head>
      <meta charset="UTF-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <meta name="x-apple-disable-message-reformatting" />
      <meta http-equiv="X-UA-Compatible" content="IE=edge" />
      <meta content="telephone=no" name="format-detection" />
      <title>Syncupp Admin Inquiry</title>
      <!--[if (mso 16)]>
        <style type="text/css">
          a {
            text-decoration: none;
          }
        </style>
      <![endif]-->
      <!--[if gte mso 9
        ]><style>
          sup {
            font-size: 100% !important;
          }
        </style><!
      [endif]-->
      <!--[if gte mso 9]>
        <xml>
          <o:OfficeDocumentSettings>
            <o:AllowPNG></o:AllowPNG>
            <o:PixelsPerInch>96</o:PixelsPerInch>
          </o:OfficeDocumentSettings>
        </xml>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <link
        href="https://fonts.googleapis.com/css2?family=Imprima&display=swap"
        rel="stylesheet"
      />
      <!--<![endif]-->
      <style type="text/css">
        #outlook a {
          padding: 0;
        }
  
        .es-button {
          mso-style-priority: 100 !important;
          text-decoration: none !important;
        }
  
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: none !important;
          font-size: inherit !important;
          font-family: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }
  
        .es-desk-hidden {
          display: none;
          float: left;
          overflow: hidden;
          width: 0;
          max-height: 0;
          line-height: 0;
          mso-hide: all;
        }
  
        [data-ogsb] .es-button {
          border-width: 0 !important;
          padding: 15px 20px 15px 20px !important;
        }
  
        @media only screen and (max-width: 600px) {
          p,
          ul li,
          ol li,
          a {
            line-height: 150% !important;
          }
  
          h1,
          h2,
          h3,
          h1 a,
          h2 a,
          h3 a {
            line-height: 120%;
          }
  
          h1 {
            font-size: 30px !important;
            text-align: left;
          }
  
          h2 {
            font-size: 24px !important;
            text-align: left;
          }
  
          h3 {
            font-size: 20px !important;
            text-align: left;
          }
  
          .es-header-body h1 a,
          .es-content-body h1 a,
          .es-footer-body h1 a {
            font-size: 30px !important;
            text-align: left;
          }
  
          .es-header-body h2 a,
          .es-content-body h2 a,
          .es-footer-body h2 a {
            font-size: 24px !important;
            text-align: left;
          }
  
          .es-header-body h3 a,
          .es-content-body h3 a,
          .es-footer-body h3 a {
            font-size: 20px !important;
            text-align: left;
          }
  
          .es-menu td a {
            font-size: 14px !important;
          }
  
          .es-header-body p,
          .es-header-body ul li,
          .es-header-body ol li,
          .es-header-body a {
            font-size: 14px !important;
          }
  
          .es-content-body p,
          .es-content-body ul li,
          .es-content-body ol li,
          .es-content-body a {
            font-size: 14px !important;
          }
  
          .es-footer-body p,
          .es-footer-body ul li,
          .es-footer-body ol li,
          .es-footer-body a {
            font-size: 14px !important;
          }
  
          .es-infoblock p,
          .es-infoblock ul li,
          .es-infoblock ol li,
          .es-infoblock a {
            font-size: 12px !important;
          }
  
          *[class="gmail-fix"] {
            display: none !important;
          }
  
          .es-m-txt-c,
          .es-m-txt-c h1,
          .es-m-txt-c h2,
          .es-m-txt-c h3 {
            text-align: center !important;
          }
  
          .es-m-txt-r,
          .es-m-txt-r h1,
          .es-m-txt-r h2,
          .es-m-txt-r h3 {
            text-align: right !important;
          }
  
          .es-m-txt-l,
          .es-m-txt-l h1,
          .es-m-txt-l h2,
          .es-m-txt-l h3 {
            text-align: left !important;
          }
  
          .es-m-txt-r img,
          .es-m-txt-c img,
          .es-m-txt-l img {
            display: inline !important;
          }
  
          .es-button-border {
            display: block !important;
          }
  
          a.es-button,
          button.es-button {
            font-size: 18px !important;
            display: block !important;
            border-right-width: 0px !important;
            border-left-width: 0px !important;
            border-top-width: 15px !important;
            border-bottom-width: 15px !important;
          }
  
          .es-adaptive table,
          .es-left,
          .es-right {
            width: 100% !important;
          }
  
          .es-content table,
          .es-header table,
          .es-footer table,
          .es-content,
          .es-footer,
          .es-header {
            width: 100% !important;
            max-width: 600px !important;
          }
  
          .es-adapt-td {
            display: block !important;
            width: 100% !important;
          }
  
          .adapt-img {
            width: 100% !important;
            height: auto !important;
          }
  
          .es-m-p0 {
            padding: 0px !important;
          }
  
          .es-m-p0r {
            padding-right: 0px !important;
          }
  
          .es-m-p0l {
            padding-left: 0px !important;
          }
  
          .es-m-p0t {
            padding-top: 0px !important;
          }
  
          .es-m-p0b {
            padding-bottom: 0 !important;
          }
  
          .es-m-p20b {
            padding-bottom: 20px !important;
          }
  
          .es-mobile-hidden,
          .es-hidden {
            display: none !important;
          }
  
          tr.es-desk-hidden,
          td.es-desk-hidden,
          table.es-desk-hidden {
            width: auto !important;
            overflow: visible !important;
            float: none !important;
            max-height: inherit !important;
            line-height: inherit !important;
          }
  
          tr.es-desk-hidden {
            display: table-row !important;
          }
  
          table.es-desk-hidden {
            display: table !important;
          }
  
          td.es-desk-menu-hidden {
            display: table-cell !important;
          }
  
          .es-menu td {
            width: 1% !important;
          }
  
          table.es-table-not-adapt,
          .esd-block-html table {
            width: auto !important;
          }
  
          table.es-social {
            display: inline-block !important;
          }
  
          table.es-social td {
            display: inline-block !important;
          }
  
          .es-desk-hidden {
            display: table-row !important;
            width: auto !important;
            overflow: visible !important;
            max-height: inherit !important;
          }
        }
      </style>
    </head>
  
    <body
      data-new-gr-c-s-loaded="14.1098.0"
      style="
        width: 100%;
        font-family: arial, 'helvetica neue', helvetica, sans-serif;
        -webkit-text-size-adjust: 100%;
        -ms-text-size-adjust: 100%;
        padding: 0;
        margin: 0;
      "
    >
      <div class="es-wrapper-color" style="background-color: #ffffff">
        <!--[if gte mso 9]>
          <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
            <v:fill type="tile" color="#ffffff"></v:fill>
          </v:background>
        <![endif]-->
        <table
          class="es-wrapper"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          style="
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            border-collapse: collapse;
            border-spacing: 0px;
            padding: 0;
            margin: 0;
            width: 100%;
            height: 100%;
            background-repeat: repeat;
            background-position: center top;
            background-color: #ffffff;
          "
        >
          <tr>
            <td valign="top" style="padding: 0; margin: 0">
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-footer"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                  background-color: transparent;
                  background-repeat: repeat;
                  background-position: center top;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#560082"
                      class="es-footer-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          align="left"
                          style="
                            margin: 0;
                            padding-top: 20px;
                            padding-bottom: 20px;
                            padding-left: 40px;
                            padding-right: 40px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 520px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        font-size: 0px;
                                      "
                                    >
                                      <a
                                        target="_blank"
                                        href="https://www.tridhyatech.com"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                        ><img
                                          src="logo.png"
                                          alt="Logo"
                                          style="
                                            display: block;
                                            border: 0;
                                            outline: none;
                                            text-decoration: none;
                                            -ms-interpolation-mode: bicubic;
                                          "
                                          height="60"
                                          title="Logo"
                                      /></a>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#560082"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ecc8ff;
                        border-radius: 20px 20px 0px 0px;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          align="left"
                          style="
                            padding: 0;
                            margin: 0;
                            padding-top: 20px;
                            padding-left: 20px;
                            padding-right: 20px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  bgcolor="#fafafa"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: separate;
                                    border-spacing: 0px;
                                    background-color: #fafafa;
                                    border-radius: 10px;
                                  "
                                  role="presentation"
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 20px; margin: 0"
                                    >
                                      <h3
                                        style="
                                          margin: 0;
                                          line-height: 34px;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          font-size: 24px;
                                          font-style: normal;
                                          font-weight: bold;
                                          color: #111318;
                                          text-align: center;
                                        "
                                      >
                                        Hi <span>(Name)</span>,&nbsp;
                                      </h3>
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 18px;
                                        "
                                      >
                                        <br />
                                      </p>
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 16px;
                                          margin-bottom: 30px;
                                        "
                                      >
                                        We've received recent inquiry and below
                                        are the deails.
                                      </p>
                                      <table
                                        cellpadding="0"
                                        cellspacing="0"
                                        width="70%"
                                        style="
                                          mso-table-lspace: 0pt;
                                          mso-table-rspace: 0pt;
                                          border-collapse: collapse;
                                          border-spacing: 0px;
                                        "
                                      >
                                        <tr>
                                          <td
                                            align="center"
                                            valign="top"
                                            style="
                                              padding: 0;
                                              margin: 0;
                                              width: 400px;
                                            "
                                          >
                                            <table
                                              cellpadding="10"
                                              cellspacing="5"
                                              width="100%"
                                              align="center"
                                              bgcolor="#fafafa"
                                              valign="top"
                                              style="
                                                mso-table-lspace: 0pt;
                                                mso-table-rspace: 0pt;
                                                border-collapse: collapse;
                                                border-spacing: 0px;
                                                background-color: #f1f1f1;
                                                padding: 10px;
                                                border-radius: 5px;
                                                font-size: 14px;
                                              "
                                            >
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  First Name :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.first_name}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  Last Name :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.last_name}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  Email :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.email}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  Contact Number :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.contact_number}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  Country :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.country}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  No. of People :
                                                </td>
                                                <td
                                                  style="
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.no_of_people}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td
                                                  style="
                                                    border-top-left-radius: 5px;
                                                    border-collapse: collapse;
                                                  "
                                                >
                                                  Comment :
                                                </td>
                                                <td
                                                  style="
                                                    max-width: 100px;
                                                    overflow: hidden;
                                                    text-overflow: ellipsis;
                                                    white-space: nowrap;
                                                    border-collapse: collapse;
                                                    font-weight: 600;
                                                  "
                                                >
                                                  ${data.thoughts}
                                                </td>
                                              </tr>
                                            </table>
                                          </td>
                                        </tr>
                                      </table>
                                      <a
                                        target="_blank"
                                        href="#"
                                        style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          background-color: #560082;
                                          padding: 10px 20px;
                                          width: 170px;
                                          display: block;
                                          font-weight: 600;
                                          color: #fff;
                                          font-size: 16px;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          margin-top: 30px;
                                          margin-bottom: 30px;
                                        "
                                        >Review Now</a
                                      >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: -apple-system,
                                            blinkmacsystemfont, 'segoe ui', roboto,
                                            helvetica, arial, sans-serif,
                                            'apple color emoji', 'segoe ui emoji',
                                            'segoe ui symbol';
                                          line-height: 27px;
                                          color: #111318;
                                          font-size: 16px;
                                        "
                                      >
                                        An autogenerated alert by the system.
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-content"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#ffefc4"
                      class="es-content-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ecc8ff;
                        border-radius: 0px 0px 20px 20px;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td
                          class="esdev-adapt-off"
                          align="left"
                          style="
                            margin: 0;
                            padding-top: 20px;
                            padding-bottom: 20px;
                            padding-left: 40px;
                            padding-right: 40px;
                          "
                        >
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="center"
                                valign="top"
                                style="padding: 0; margin: 0; width: 520px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="padding: 0; margin: 0"
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 24px;
                                          color: #2d3142;
                                          font-size: 16px;
                                        "
                                      >
                                        Thanks and Best Regards,<br />Have a great
                                        day!<br />Syncupp Team<a
                                          target="_blank"
                                          style="
                                            -webkit-text-size-adjust: none;
                                            -ms-text-size-adjust: none;
                                            mso-line-height-rule: exactly;
                                            text-decoration: underline;
                                            color: #2d3142;
                                            font-size: 16px;
                                          "
                                          href="https://www.tridhyatech.com"
                                        ></a>
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table
                cellpadding="0"
                cellspacing="0"
                class="es-footer"
                align="center"
                style="
                  mso-table-lspace: 0pt;
                  mso-table-rspace: 0pt;
                  border-collapse: collapse;
                  border-spacing: 0px;
                  table-layout: fixed !important;
                  width: 100%;
                  background-color: transparent;
                  background-repeat: repeat;
                  background-position: center top;
                "
              >
                <tr>
                  <td align="center" style="padding: 0; margin: 0">
                    <table
                      bgcolor="#bcb8b1"
                      class="es-footer-body"
                      align="center"
                      cellpadding="0"
                      cellspacing="0"
                      style="
                        mso-table-lspace: 0pt;
                        mso-table-rspace: 0pt;
                        border-collapse: collapse;
                        border-spacing: 0px;
                        background-color: #ffffff;
                        width: 600px;
                      "
                    >
                      <tr>
                        <td align="left" style="padding: 20px; margin: 0">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            width="100%"
                            style="
                              mso-table-lspace: 0pt;
                              mso-table-rspace: 0pt;
                              border-collapse: collapse;
                              border-spacing: 0px;
                            "
                          >
                            <tr>
                              <td
                                align="left"
                                style="padding: 0; margin: 0; width: 560px"
                              >
                                <table
                                  cellpadding="0"
                                  cellspacing="0"
                                  width="100%"
                                  role="presentation"
                                  style="
                                    mso-table-lspace: 0pt;
                                    mso-table-rspace: 0pt;
                                    border-collapse: collapse;
                                    border-spacing: 0px;
                                  "
                                >
                                  <tr>
                                    <td
                                      align="center"
                                      style="
                                        padding: 0;
                                        margin: 0;
                                        padding-top: 10px;
                                      "
                                    >
                                      <p
                                        style="
                                          margin: 0;
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          font-family: Imprima, Arial, sans-serif;
                                          line-height: 21px;
                                          color: #2d3142;
                                          font-size: 14px;
                                        "
                                      >
                                        Copyright &copy; 2023 Syncupp
                                      </p>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    </body>
  </html>
  

`;
};

exports.activityTemplate = (data) => {
  return `
  <!DOCTYPE html
  PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif">

<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta content="telephone=no" name="format-detection" />
  <title>Syncupp Create Task</title>
  <!--[if (mso 16)]>
      <style type="text/css">
        a {
          text-decoration: none;
        }
      </style>
    <![endif]-->
  <!--[if gte mso 9
      ]><style>
        sup {
          font-size: 100% !important;
        }
      </style><!
    [endif]-->
  <!--[if gte mso 9]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG></o:AllowPNG>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    <![endif]-->
  <!--[if !mso]><!-- -->
  <link href="https://fonts.googleapis.com/css2?family=Imprima&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    .es-button {
      mso-style-priority: 100 !important;
      text-decoration: none !important;
    }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    .es-desk-hidden {
      display: none;
      float: left;
      overflow: hidden;
      width: 0;
      max-height: 0;
      line-height: 0;
      mso-hide: all;
    }

    [data-ogsb] .es-button {
      border-width: 0 !important;
      padding: 15px 20px 15px 20px !important;
    }

    @media only screen and (max-width: 600px) {

      p,
      ul li,
      ol li,
      a {
        line-height: 150% !important;
      }

      h1,
      h2,
      h3,
      h1 a,
      h2 a,
      h3 a {
        line-height: 120%;
      }

      h1 {
        font-size: 30px !important;
        text-align: left;
      }

      h2 {
        font-size: 24px !important;
        text-align: left;
      }

      h3 {
        font-size: 20px !important;
        text-align: left;
      }

      .es-header-body h1 a,
      .es-content-body h1 a,
      .es-footer-body h1 a {
        font-size: 30px !important;
        text-align: left;
      }

      .es-header-body h2 a,
      .es-content-body h2 a,
      .es-footer-body h2 a {
        font-size: 24px !important;
        text-align: left;
      }

      .es-header-body h3 a,
      .es-content-body h3 a,
      .es-footer-body h3 a {
        font-size: 20px !important;
        text-align: left;
      }

      .es-menu td a {
        font-size: 14px !important;
      }

      .es-header-body p,
      .es-header-body ul li,
      .es-header-body ol li,
      .es-header-body a {
        font-size: 14px !important;
      }

      .es-content-body p,
      .es-content-body ul li,
      .es-content-body ol li,
      .es-content-body a {
        font-size: 14px !important;
      }

      .es-footer-body p,
      .es-footer-body ul li,
      .es-footer-body ol li,
      .es-footer-body a {
        font-size: 14px !important;
      }

      .es-infoblock p,
      .es-infoblock ul li,
      .es-infoblock ol li,
      .es-infoblock a {
        font-size: 12px !important;
      }

      *[class="gmail-fix"] {
        display: none !important;
      }

      .es-m-txt-c,
      .es-m-txt-c h1,
      .es-m-txt-c h2,
      .es-m-txt-c h3 {
        text-align: center !important;
      }

      .es-m-txt-r,
      .es-m-txt-r h1,
      .es-m-txt-r h2,
      .es-m-txt-r h3 {
        text-align: right !important;
      }

      .es-m-txt-l,
      .es-m-txt-l h1,
      .es-m-txt-l h2,
      .es-m-txt-l h3 {
        text-align: left !important;
      }

      .es-m-txt-r img,
      .es-m-txt-c img,
      .es-m-txt-l img {
        display: inline !important;
      }

      .es-button-border {
        display: block !important;
      }

      a.es-button,
      button.es-button {
        font-size: 18px !important;
        display: block !important;
        border-right-width: 0px !important;
        border-left-width: 0px !important;
        border-top-width: 15px !important;
        border-bottom-width: 15px !important;
      }

      .es-adaptive table,
      .es-left,
      .es-right {
        width: 100% !important;
      }

      .es-content table,
      .es-header table,
      .es-footer table,
      .es-content,
      .es-footer,
      .es-header {
        width: 100% !important;
        max-width: 600px !important;
      }

      .es-adapt-td {
        display: block !important;
        width: 100% !important;
      }

      .adapt-img {
        width: 100% !important;
        height: auto !important;
      }

      .es-m-p0 {
        padding: 0px !important;
      }

      .es-m-p0r {
        padding-right: 0px !important;
      }

      .es-m-p0l {
        padding-left: 0px !important;
      }

      .es-m-p0t {
        padding-top: 0px !important;
      }

      .es-m-p0b {
        padding-bottom: 0 !important;
      }

      .es-m-p20b {
        padding-bottom: 20px !important;
      }

      .es-mobile-hidden,
      .es-hidden {
        display: none !important;
      }

      tr.es-desk-hidden,
      td.es-desk-hidden,
      table.es-desk-hidden {
        width: auto !important;
        overflow: visible !important;
        float: none !important;
        max-height: inherit !important;
        line-height: inherit !important;
      }

      tr.es-desk-hidden {
        display: table-row !important;
      }

      table.es-desk-hidden {
        display: table !important;
      }

      td.es-desk-menu-hidden {
        display: table-cell !important;
      }

      .es-menu td {
        width: 1% !important;
      }

      table.es-table-not-adapt,
      .esd-block-html table {
        width: auto !important;
      }

      table.es-social {
        display: inline-block !important;
      }

      table.es-social td {
        display: inline-block !important;
      }

      .es-desk-hidden {
        display: table-row !important;
        width: auto !important;
        overflow: visible !important;
        max-height: inherit !important;
      }
    }
  </style>
</head>

<body data-new-gr-c-s-loaded="14.1098.0" style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    ">
  <div class="es-wrapper-color" style="background-color: #ffffff">
    <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
    <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        ">
      <tr>
        <td valign="top" style="padding: 0; margin: 0">
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    ">
                                  <a target="_blank" href="https://www.tridhyatech.com" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "><img src="logo.png" alt="Logo" style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        " height="60" title="Logo" /></a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                " role="presentation">
                              <tr>
                                <td align="center" style="padding: 20px; margin: 0">
                              
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 18px;
                                      ">
                                    <br />
                                  </p>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 30px;
                                      ">
                                    Recent Activity :
                                    <span style="font-weight: 600;">${
                                      data?.activity_type === "call_meeting"
                                        ? "Call meeting"
                                        : "Other"
                                    }</span>

                                  </p>
                                  <table cellpadding="0" cellspacing="0" width="70%" style="
                                                              mso-table-lspace: 0pt;
                                                              mso-table-rspace: 0pt;
                                                              border-collapse: collapse;
                                                              border-spacing: 0px;
                                                              
                                                            ">
                                    <tr>
                                      <td align="center" valign="top" style="padding: 0; margin: 0; width: 400px">
                                        <table cellpadding="10" cellspacing="5" width="100%" align="center"
                                          bgcolor="#fafafa" valign="top" style="
                                                                                                      mso-table-lspace: 0pt;
                                                                                                      mso-table-rspace: 0pt;
                                                                                                      border-collapse: collapse;
                                                                                                      border-spacing: 0px;
                                                                                                      background-color: #f1f1f1;
                                                                                                      padding: 10px;
                                                                                                      border-radius: 5px;
                                                                                                      font-size: 14px;
                                                                                                    ">
                                          <tr>
                                            <td style=" border-top-left-radius: 5px;
  border-collapse: collapse;">Title :</td>
                                            <td style="
  border-collapse: collapse; font-weight: 600; max-width: 100px;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;">${data?.title ?? `&nbsp;`}</td>
                                          </tr>
                                          <tr>
                                          <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Agenda :</td>
                                          <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.agenda ?? `&nbsp;`}</td>
                                        </tr>


                                    
                                        <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Assign by :</td>
                                        <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.assigned_by_name ?? `&nbsp;`}</td>
                                      </tr>
                                      <tr>
                                      <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Client name :</td>
                                      <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.client_name ?? `&nbsp;`}</td>
                                    </tr>

                                      <tr>
                                        <tr>
                                        <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Assign to:</td>
                                        <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.assigned_to_name ?? `&nbsp;`}</td>
                                      </tr>

                                        <tr>
                                        <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Due Date :</td>
                                        <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.due_date ?? `&nbsp;`}</td>
                                      </tr>



                                      <tr>
                                      <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Meeting start time :</td>
                                      <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.meeting_start_time ?? `&nbsp;`}</td>
                                    </tr>

                                    
                                    <tr>
                                    <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Meeting end time :</td>
                                    <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.meeting_end_time ?? `&nbsp;`}</td>
                                  </tr>

                                  
                                    
                                  <tr>
                                  <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Activity type :</td>
                                  <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${
    data?.activity_type === "call_meeting" ? "call meeting" : "other"
  }</td>
                                </tr>

                                <tr>
                                <td style=" border-top-left-radius: 5px;
border-collapse: collapse;">Status :</td>
                                <td style="
border-collapse: collapse; font-weight: 600; max-width: 100px;
overflow: hidden;
text-overflow: ellipsis;
white-space: nowrap;">${data?.status}</td>
                              </tr>
                                  
                                        
                                          <tr>
                                          <td style=" border-top-left-radius: 5px;
            border-collapse: collapse;">Recurring End Date :</td>
                                          <td style="
            border-collapse: collapse; font-weight: 600; max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;">${data?.recurring_end_date ?? `-`}</td>
                                        </tr>
                                         
                                          
                                        </table>
                                      </td>
                                    </tr>
                                  </table>
                                  <a target="_blank" href="#" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: none;
                                        background-color: #560082;
                                        padding: 10px 20px;
                                        width: 170px;
                                        display: block;
                                        font-weight: 600;
                                        color: #fff;
                                        font-size: 16px;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        margin-top: 30px;
                                        margin-bottom: 30px;
                                      ">View Details</a>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                      ">
                                    An autogenerated alert by the system.
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#ffefc4" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    ">
                  <tr>
                    <td class="esdev-adapt-off" align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      ">
                                    Thanks and Best Regards,<br />Have a great
                                    day!<br />Syncupp Team<a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        " href="https://www.tridhyatech.com"></a>
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#bcb8b1" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="padding: 20px; margin: 0">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="left" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">


                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                    ">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      ">
                                    Copyright &copy; 2023 Syncupp
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>

</html>
  
  
  
  `;
};

exports.invitationEmailTemplate = (data) => {
  return `
  <!DOCTYPE html
  PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif">

<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta content="telephone=no" name="format-detection" />
  <title>Refferal</title>
  <!--[if (mso 16)]>
      <style type="text/css">
        a {
          text-decoration: none;
        }
      </style>
    <![endif]-->
  <!--[if gte mso 9
      ]><style>
        sup {
          font-size: 100% !important;
        }
      </style><!
    [endif]-->
  <!--[if gte mso 9]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG></o:AllowPNG>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    <![endif]-->
  <!--[if !mso]><!-- -->
  <link href="https://fonts.googleapis.com/css2?family=Imprima&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    .es-button {
      mso-style-priority: 100 !important;
      text-decoration: none !important;
    }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    .es-desk-hidden {
      display: none;
      float: left;
      overflow: hidden;
      width: 0;
      max-height: 0;
      line-height: 0;
      mso-hide: all;
    }

    [data-ogsb] .es-button {
      border-width: 0 !important;
      padding: 15px 20px 15px 20px !important;
    }

    @media only screen and (max-width: 600px) {

      p,
      ul li,
      ol li,
      a {
        line-height: 150% !important;
      }

      h1,
      h2,
      h3,
      h1 a,
      h2 a,
      h3 a {
        line-height: 120%;
      }

      h1 {
        font-size: 30px !important;
        text-align: left;
      }

      h2 {
        font-size: 24px !important;
        text-align: left;
      }

      h3 {
        font-size: 20px !important;
        text-align: left;
      }

      .es-header-body h1 a,
      .es-content-body h1 a,
      .es-footer-body h1 a {
        font-size: 30px !important;
        text-align: left;
      }

      .es-header-body h2 a,
      .es-content-body h2 a,
      .es-footer-body h2 a {
        font-size: 24px !important;
        text-align: left;
      }

      .es-header-body h3 a,
      .es-content-body h3 a,
      .es-footer-body h3 a {
        font-size: 20px !important;
        text-align: left;
      }

      .es-menu td a {
        font-size: 14px !important;
      }

      .es-header-body p,
      .es-header-body ul li,
      .es-header-body ol li,
      .es-header-body a {
        font-size: 14px !important;
      }

      .es-content-body p,
      .es-content-body ul li,
      .es-content-body ol li,
      .es-content-body a {
        font-size: 14px !important;
      }

      .es-footer-body p,
      .es-footer-body ul li,
      .es-footer-body ol li,
      .es-footer-body a {
        font-size: 14px !important;
      }

      .es-infoblock p,
      .es-infoblock ul li,
      .es-infoblock ol li,
      .es-infoblock a {
        font-size: 12px !important;
      }

      *[class="gmail-fix"] {
        display: none !important;
      }

      .es-m-txt-c,
      .es-m-txt-c h1,
      .es-m-txt-c h2,
      .es-m-txt-c h3 {
        text-align: center !important;
      }

      .es-m-txt-r,
      .es-m-txt-r h1,
      .es-m-txt-r h2,
      .es-m-txt-r h3 {
        text-align: right !important;
      }

      .es-m-txt-l,
      .es-m-txt-l h1,
      .es-m-txt-l h2,
      .es-m-txt-l h3 {
        text-align: left !important;
      }

      .es-m-txt-r img,
      .es-m-txt-c img,
      .es-m-txt-l img {
        display: inline !important;
      }

      .es-button-border {
        display: block !important;
      }

      a.es-button,
      button.es-button {
        font-size: 18px !important;
        display: block !important;
        border-right-width: 0px !important;
        border-left-width: 0px !important;
        border-top-width: 15px !important;
        border-bottom-width: 15px !important;
      }

      .es-adaptive table,
      .es-left,
      .es-right {
        width: 100% !important;
      }

      .es-content table,
      .es-header table,
      .es-footer table,
      .es-content,
      .es-footer,
      .es-header {
        width: 100% !important;
        max-width: 600px !important;
      }

      .es-adapt-td {
        display: block !important;
        width: 100% !important;
      }

      .adapt-img {
        width: 100% !important;
        height: auto !important;
      }

      .es-m-p0 {
        padding: 0px !important;
      }

      .es-m-p0r {
        padding-right: 0px !important;
      }

      .es-m-p0l {
        padding-left: 0px !important;
      }

      .es-m-p0t {
        padding-top: 0px !important;
      }

      .es-m-p0b {
        padding-bottom: 0 !important;
      }

      .es-m-p20b {
        padding-bottom: 20px !important;
      }

      .es-mobile-hidden,
      .es-hidden {
        display: none !important;
      }

      tr.es-desk-hidden,
      td.es-desk-hidden,
      table.es-desk-hidden {
        width: auto !important;
        overflow: visible !important;
        float: none !important;
        max-height: inherit !important;
        line-height: inherit !important;
      }

      tr.es-desk-hidden {
        display: table-row !important;
      }

      table.es-desk-hidden {
        display: table !important;
      }

      td.es-desk-menu-hidden {
        display: table-cell !important;
      }

      .es-menu td {
        width: 1% !important;
      }

      table.es-table-not-adapt,
      .esd-block-html table {
        width: auto !important;
      }

      table.es-social {
        display: inline-block !important;
      }

      table.es-social td {
        display: inline-block !important;
      }

      .es-desk-hidden {
        display: table-row !important;
        width: auto !important;
        overflow: visible !important;
        max-height: inherit !important;
      }
    }
  </style>
</head>

<body data-new-gr-c-s-loaded="14.1098.0" style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    ">
  <div class="es-wrapper-color" style="background-color: #ffffff">
    <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
    <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        ">
      <tr>
        <td valign="top" style="padding: 0; margin: 0">
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    ">
                                  <a target="_blank" href="https://www.tridhyatech.com" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "><img src="logo.png" alt="Logo" style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        " height="60" title="Logo" /></a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                " role="presentation">
                              <tr>
                                <td align="center" style="padding: 20px; margin: 0">
                                  <h3 style="
                                        margin: 0;
                                        line-height: 34px;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        font-size: 24px;
                                        font-style: normal;
                                        font-weight: bold;
                                        color: #111318;
                                        text-align: center;
                                      ">
                                    Hi <span>(Name)</span>,&nbsp;
                                  </h3>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 18px;
                                      ">
                                    <br />
                                  </p>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 30px;
                                      ">
                                    We are pleased to inform you that you have been selected to receive referral
                                    benefits. This invitation is a token of our
                                    appreciation for your continued support.
                                  </p>
                                  <img src="fp-image.png" alt="forgot password" />
                                  <a target="_blank" href="${data.link}" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: none;
                                        background-color: #560082;
                                        padding: 10px 20px;
                                        width: 170px;
                                        display: block;
                                        font-weight: 600;
                                        color: #fff;
                                        font-size: 16px;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        margin-top: 30px;
                                        margin-bottom: 30px;
                                      ">Join SyncUpp</a>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                      ">
                                    🌟 Plus, when you sign up through my referral, <span
                                      style="color: #560082; font-weight: 600;">${data.user}</span> and you, <br />both
                                    enjoy
                                    special
                                    perks!
                                    <br />
                                    It's a small token of appreciation.
                                    <br />
                                    Come on board and let's explore SyncUpp together!
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#ffefc4" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    ">
                  <tr>
                    <td class="esdev-adapt-off" align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      ">
                                    Thanks and Best Regards,<br />Have a great
                                    day!<br />SyncUpp Team<a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        " href="https://www.tridhyatech.com"></a>
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#bcb8b1" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="padding: 20px; margin: 0">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="left" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" class="es-m-txt-c" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                      padding-bottom: 20px;
                                      font-size: 0;
                                    ">
                                  <table cellpadding="0" cellspacing="0" class="es-table-not-adapt es-social"
                                    role="presentation" style="
                                        mso-table-lspace: 0pt;
                                        mso-table-rspace: 0pt;
                                        border-collapse: collapse;
                                        border-spacing: 0px;
                                      ">
                                    <tr>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="linkedin.png" alt="In" title="Linkedin" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="twitter.png" alt="Tw" title="Twitter" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="instagram.png" alt="Ig" title="Instagram" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="
                                            padding: 0;
                                            margin: 0;
                                            padding-right: 5px;
                                          ">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="yoututbe.png" alt="Yt" title="Youtube" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                      <td align="center" valign="top" style="padding: 0; margin: 0">
                                        <a target="_blank" href="#" style="
                                              -webkit-text-size-adjust: none;
                                              -ms-text-size-adjust: none;
                                              mso-line-height-rule: exactly;
                                              text-decoration: underline;
                                              color: #2d3142;
                                              font-size: 14px;
                                            "><img src="facebook.png" alt="Fb" title="Facebook" height="24" style="
                                                display: block;
                                                border: 0;
                                                outline: none;
                                                text-decoration: none;
                                                -ms-interpolation-mode: bicubic;
                                              " /></a>
                                      </td>
                                    </tr>
                                  </table>
                                </td>
                              </tr>
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 20px;
                                        color: #2d3142;
                                        font-size: 13px;
                                      ">
                                    <a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 14px;
                                        " href=""></a><a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: none;
                                          color: #2d3142;
                                          font-size: 13px;
                                        " href="#">Privacy Policy</a>
                                  </p>
                                </td>
                              </tr>
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 20px;
                                    ">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      ">
                                    Copyright &copy; 2023 Syncupp
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>

</html>`;
};

exports.taskTemplate = (data) => {
  return `
<!DOCTYPE html
  PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"
  style="font-family: arial, 'helvetica neue', helvetica, sans-serif">

<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta content="telephone=no" name="format-detection" />
  <title>Syncupp Create Task</title>
  <!--[if (mso 16)]>
      <style type="text/css">
        a {
          text-decoration: none;
        }
      </style>
    <![endif]-->
  <!--[if gte mso 9
      ]><style>
        sup {
          font-size: 100% !important;
        }
      </style><!
    [endif]-->
  <!--[if gte mso 9]>
      <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG></o:AllowPNG>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
      </xml>
    <![endif]-->
  <!--[if !mso]><!-- -->
  <link href="https://fonts.googleapis.com/css2?family=Imprima&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style type="text/css">
    #outlook a {
      padding: 0;
    }

    .es-button {
      mso-style-priority: 100 !important;
      text-decoration: none !important;
    }

    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }

    .es-desk-hidden {
      display: none;
      float: left;
      overflow: hidden;
      width: 0;
      max-height: 0;
      line-height: 0;
      mso-hide: all;
    }

    [data-ogsb] .es-button {
      border-width: 0 !important;
      padding: 15px 20px 15px 20px !important;
    }

    @media only screen and (max-width: 600px) {

      p,
      ul li,
      ol li,
      a {
        line-height: 150% !important;
      }

      h1,
      h2,
      h3,
      h1 a,
      h2 a,
      h3 a {
        line-height: 120%;
      }

      h1 {
        font-size: 30px !important;
        text-align: left;
      }

      h2 {
        font-size: 24px !important;
        text-align: left;
      }

      h3 {
        font-size: 20px !important;
        text-align: left;
      }

      .es-header-body h1 a,
      .es-content-body h1 a,
      .es-footer-body h1 a {
        font-size: 30px !important;
        text-align: left;
      }

      .es-header-body h2 a,
      .es-content-body h2 a,
      .es-footer-body h2 a {
        font-size: 24px !important;
        text-align: left;
      }

      .es-header-body h3 a,
      .es-content-body h3 a,
      .es-footer-body h3 a {
        font-size: 20px !important;
        text-align: left;
      }

      .es-menu td a {
        font-size: 14px !important;
      }

      .es-header-body p,
      .es-header-body ul li,
      .es-header-body ol li,
      .es-header-body a {
        font-size: 14px !important;
      }

      .es-content-body p,
      .es-content-body ul li,
      .es-content-body ol li,
      .es-content-body a {
        font-size: 14px !important;
      }

      .es-footer-body p,
      .es-footer-body ul li,
      .es-footer-body ol li,
      .es-footer-body a {
        font-size: 14px !important;
      }

      .es-infoblock p,
      .es-infoblock ul li,
      .es-infoblock ol li,
      .es-infoblock a {
        font-size: 12px !important;
      }

      *[class="gmail-fix"] {
        display: none !important;
      }

      .es-m-txt-c,
      .es-m-txt-c h1,
      .es-m-txt-c h2,
      .es-m-txt-c h3 {
        text-align: center !important;
      }

      .es-m-txt-r,
      .es-m-txt-r h1,
      .es-m-txt-r h2,
      .es-m-txt-r h3 {
        text-align: right !important;
      }

      .es-m-txt-l,
      .es-m-txt-l h1,
      .es-m-txt-l h2,
      .es-m-txt-l h3 {
        text-align: left !important;
      }

      .es-m-txt-r img,
      .es-m-txt-c img,
      .es-m-txt-l img {
        display: inline !important;
      }

      .es-button-border {
        display: block !important;
      }

      a.es-button,
      button.es-button {
        font-size: 18px !important;
        display: block !important;
        border-right-width: 0px !important;
        border-left-width: 0px !important;
        border-top-width: 15px !important;
        border-bottom-width: 15px !important;
      }

      .es-adaptive table,
      .es-left,
      .es-right {
        width: 100% !important;
      }

      .es-content table,
      .es-header table,
      .es-footer table,
      .es-content,
      .es-footer,
      .es-header {
        width: 100% !important;
        max-width: 600px !important;
      }

      .es-adapt-td {
        display: block !important;
        width: 100% !important;
      }

      .adapt-img {
        width: 100% !important;
        height: auto !important;
      }

      .es-m-p0 {
        padding: 0px !important;
      }

      .es-m-p0r {
        padding-right: 0px !important;
      }

      .es-m-p0l {
        padding-left: 0px !important;
      }

      .es-m-p0t {
        padding-top: 0px !important;
      }

      .es-m-p0b {
        padding-bottom: 0 !important;
      }

      .es-m-p20b {
        padding-bottom: 20px !important;
      }

      .es-mobile-hidden,
      .es-hidden {
        display: none !important;
      }

      tr.es-desk-hidden,
      td.es-desk-hidden,
      table.es-desk-hidden {
        width: auto !important;
        overflow: visible !important;
        float: none !important;
        max-height: inherit !important;
        line-height: inherit !important;
      }

      tr.es-desk-hidden {
        display: table-row !important;
      }

      table.es-desk-hidden {
        display: table !important;
      }

      td.es-desk-menu-hidden {
        display: table-cell !important;
      }

      .es-menu td {
        width: 1% !important;
      }

      table.es-table-not-adapt,
      .esd-block-html table {
        width: auto !important;
      }

      table.es-social {
        display: inline-block !important;
      }

      table.es-social td {
        display: inline-block !important;
      }

      .es-desk-hidden {
        display: table-row !important;
        width: auto !important;
        overflow: visible !important;
        max-height: inherit !important;
      }
    }
  </style>
</head>

<body data-new-gr-c-s-loaded="14.1098.0" style="
      width: 100%;
      font-family: arial, 'helvetica neue', helvetica, sans-serif;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      padding: 0;
      margin: 0;
    ">
  <div class="es-wrapper-color" style="background-color: #ffffff">
    <!--[if gte mso 9]>
        <v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t">
          <v:fill type="tile" color="#ffffff"></v:fill>
        </v:background>
      <![endif]-->
    <table class="es-wrapper" width="100%" cellspacing="0" cellpadding="0" style="
          mso-table-lspace: 0pt;
          mso-table-rspace: 0pt;
          border-collapse: collapse;
          border-spacing: 0px;
          padding: 0;
          margin: 0;
          width: 100%;
          height: 100%;
          background-repeat: repeat;
          background-position: center top;
          background-color: #ffffff;
        ">
      <tr>
        <td valign="top" style="padding: 0; margin: 0">
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      font-size: 0px;
                                    ">
                                  <a target="_blank" href="https://www.tridhyatech.com" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: underline;
                                        color: #2d3142;
                                        font-size: 14px;
                                      "><img src="logo.png" alt="Logo" style="
                                          display: block;
                                          border: 0;
                                          outline: none;
                                          text-decoration: none;
                                          -ms-interpolation-mode: bicubic;
                                        " height="60" title="Logo" /></a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#560082" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 20px 20px 0px 0px;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="
                          padding: 0;
                          margin: 0;
                          padding-top: 20px;
                          padding-left: 20px;
                          padding-right: 20px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#fafafa" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: separate;
                                  border-spacing: 0px;
                                  background-color: #fafafa;
                                  border-radius: 10px;
                                " role="presentation">
                              <tr>
                                <td align="center" style="padding: 20px; margin: 0">
                                  <h3 style="
                                        margin: 0;
                                        line-height: 34px;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        font-size: 24px;
                                        font-style: normal;
                                        font-weight: bold;
                                        color: #111318;
                                        text-align: center;
                                      ">
                                    Hi <span>${data?.assignName}</span>,&nbsp;
                                  </h3>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 18px;
                                      ">
                                    <br />
                                  </p>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                        margin-bottom: 30px;
                                      ">
                                    Recent Activity :
                                    <span style="font-weight: 600;">${data?.TaskTitle}</span>

                                  </p>
                                  <table cellpadding="0" cellspacing="0" width="70%" style="
                                                              mso-table-lspace: 0pt;
                                                              mso-table-rspace: 0pt;
                                                              border-collapse: collapse;
                                                              border-spacing: 0px;
                                                              
                                                            ">
                                    <tr>
                                      <td align="center" valign="top" style="padding: 0; margin: 0; width: 400px">
                                        <table cellpadding="10" cellspacing="5" width="100%" align="center"
                                          bgcolor="#fafafa" valign="top" style="
                                                                                                      mso-table-lspace: 0pt;
                                                                                                      mso-table-rspace: 0pt;
                                                                                                      border-collapse: collapse;
                                                                                                      border-spacing: 0px;
                                                                                                      background-color: #f1f1f1;
                                                                                                      padding: 10px;
                                                                                                      border-radius: 5px;
                                                                                                      font-size: 14px;
                                                                                                    ">
                                          <tr>
                                            <td style=" border-top-left-radius: 5px;
  border-collapse: collapse;">Task Name :</td>
                                            <td style="
  border-collapse: collapse; font-weight: 600; max-width: 100px;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;">${data?.taskName}</td>
                                          </tr>
                                          
                                          <tr>
                                            <td style=" border-top-left-radius: 5px;
                                                                                      border-collapse: collapse;">Status
                                              :
                                            </td>
                                            <td
                                              style="
                                                                                      border-collapse: collapse; font-weight: 600;">
                                              ${data.status}</td>
                                          </tr>
                                          <tr>
                                            <td
                                              style=" border-top-left-radius: 5px;
                                                                                                                                border-collapse: collapse;">
                                              Created By :
                                            </td>
                                            <td
                                              style="
                                                                                                                                border-collapse: collapse; font-weight: 600;">
                                              ${data?.assign_by}</td>
                                          </tr>
                                          <tr>
                                            <td style=" border-top-left-radius: 5px;
                                                                                      border-collapse: collapse;">
                                              Created On :
                                            </td>
                                            <td
                                              style="
                                                                                      border-collapse: collapse; font-weight: 600;">
                                              ${data?.dueDate} | ${data?.dueTime}</td>
                                          </tr>
                                         
                                          
                                        </table>
                                      </td>
                                    </tr>
                                  </table>
                                  <a target="_blank" href="#" style="
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        text-decoration: none;
                                        background-color: #560082;
                                        padding: 10px 20px;
                                        width: 170px;
                                        display: block;
                                        font-weight: 600;
                                        color: #fff;
                                        font-size: 16px;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        margin-top: 30px;
                                        margin-bottom: 30px;
                                      ">View Details</a>
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: -apple-system,
                                          blinkmacsystemfont, 'segoe ui', roboto,
                                          helvetica, arial, sans-serif,
                                          'apple color emoji', 'segoe ui emoji',
                                          'segoe ui symbol';
                                        line-height: 27px;
                                        color: #111318;
                                        font-size: 16px;
                                      ">
                                    An autogenerated alert by the system.
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-content" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#ffefc4" class="es-content-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ECC8FF;
                      border-radius: 0px 0px 20px 20px;
                      width: 600px;
                    ">
                  <tr>
                    <td class="esdev-adapt-off" align="left" style="
                          margin: 0;
                          padding-top: 20px;
                          padding-bottom: 20px;
                          padding-left: 40px;
                          padding-right: 40px;
                        ">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="center" valign="top" style="padding: 0; margin: 0; width: 520px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">
                              <tr>
                                <td align="center" style="padding: 0; margin: 0">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 24px;
                                        color: #2d3142;
                                        font-size: 16px;
                                      ">
                                    Thanks and Best Regards,<br />Have a great
                                    day!<br />Syncupp Team<a target="_blank" style="
                                          -webkit-text-size-adjust: none;
                                          -ms-text-size-adjust: none;
                                          mso-line-height-rule: exactly;
                                          text-decoration: underline;
                                          color: #2d3142;
                                          font-size: 16px;
                                        " href="https://www.tridhyatech.com"></a>
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
          <table cellpadding="0" cellspacing="0" class="es-footer" align="center" style="
                mso-table-lspace: 0pt;
                mso-table-rspace: 0pt;
                border-collapse: collapse;
                border-spacing: 0px;
                table-layout: fixed !important;
                width: 100%;
                background-color: transparent;
                background-repeat: repeat;
                background-position: center top;
              ">
            <tr>
              <td align="center" style="padding: 0; margin: 0">
                <table bgcolor="#bcb8b1" class="es-footer-body" align="center" cellpadding="0" cellspacing="0" style="
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      border-collapse: collapse;
                      border-spacing: 0px;
                      background-color: #ffffff;
                      width: 600px;
                    ">
                  <tr>
                    <td align="left" style="padding: 20px; margin: 0">
                      <table cellpadding="0" cellspacing="0" width="100%" style="
                            mso-table-lspace: 0pt;
                            mso-table-rspace: 0pt;
                            border-collapse: collapse;
                            border-spacing: 0px;
                          ">
                        <tr>
                          <td align="left" style="padding: 0; margin: 0; width: 560px">
                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  border-collapse: collapse;
                                  border-spacing: 0px;
                                ">


                              <tr>
                                <td align="center" style="
                                      padding: 0;
                                      margin: 0;
                                      padding-top: 10px;
                                    ">
                                  <p style="
                                        margin: 0;
                                        -webkit-text-size-adjust: none;
                                        -ms-text-size-adjust: none;
                                        mso-line-height-rule: exactly;
                                        font-family: Imprima, Arial, sans-serif;
                                        line-height: 21px;
                                        color: #2d3142;
                                        font-size: 14px;
                                      ">
                                    Copyright &copy; 2023 Syncupp
                                  </p>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>

</html>`;
};
