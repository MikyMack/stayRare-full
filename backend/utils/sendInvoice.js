const nodemailer = require("nodemailer");
const ejs = require("ejs");
const pdf = require("html-pdf");
const path = require("path");

const sendInvoiceEmail = async (order, userEmail) => {
  try {
    const templatePath = path.join(__dirname, "../views/user/invoice.ejs");
    const html = await ejs.renderFile(templatePath, { order });

    pdf.create(html).toBuffer(async (err, buffer) => {
      if (err) throw err;
  
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: userEmail,
        subject: `Invoice for Order ${order._id}`,
        text: "Thank you for your order. Please find your invoice attached.",
        attachments: [{
          filename: `Invoice-${order._id}.pdf`,
          content: buffer,
        }],
      };

      await transporter.sendMail(mailOptions);
    });
  } catch (err) {
    console.error("Error sending invoice email:", err);
  }
};

module.exports = sendInvoiceEmail;
