const PDFDocument = require("pdfkit");
const Order = require("../models/Order");

async function generateBulkOrdersPDF(orders = null, filter = {}) {
  if (!orders) {
    orders = await Order.find(filter)
      .populate("user", "name email")
      .populate("items.product", "name price")
      .sort({ createdAt: -1 })
      .lean();
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // Title
      doc.fontSize(20).text("Bulk Orders Report", { align: "center" });
      doc.moveDown();

      orders.forEach((order, idx) => {
        doc
          .fontSize(14)
          .fillColor("#333")
          .text(`Order #${order._id}`, { underline: true });

        doc.fontSize(10).fillColor("#000");
        doc.text(
          `Date: ${
            order.createdAt ? new Date(order.createdAt).toLocaleString() : "N/A"
          }`
        );
        doc.text(`Status: ${order.orderStatus || "N/A"}`);

        if (order.user) {
          doc.text(
            `Customer: ${order.user.name || "N/A"} (${order.user.email || "N/A"})`
          );
        }

        doc.moveDown(0.5);

        // Billing Address (optional)
        if (order.billingAddress) {
          doc.font("Helvetica-Bold").text("Billing Address:");
          doc.font("Helvetica").text(
            `${order.billingAddress.name || ""}, ${order.billingAddress.phone || ""}`
          );
          doc.text(
            `${order.billingAddress.addressLine1 || ""}, ${order.billingAddress.city || ""}, ${order.billingAddress.state || ""}, ${order.billingAddress.pincode || ""}`
          );
          doc.moveDown(0.5);
        }

        // Items
        doc.font("Helvetica-Bold").text("Items:");
        doc.moveDown(0.2);

        if (order.items && order.items.length) {
          doc.fontSize(10);
          doc.text("Product", { continued: true, width: 200 });
          doc.text("Qty", { continued: true, width: 50, align: "center" });
          doc.text("Price", { align: "right" });
          doc.moveDown(0.1);

          order.items.forEach((item) => {
            const productName =
              (item.product && item.product.name) || item.name || "N/A";
            const price =
              (item.product && item.product.price) || item.price || 0;

            doc.text(productName, { continued: true, width: 200 });
            doc.text(item.quantity || 1, {
              continued: true,
              width: 50,
              align: "center",
            });
            doc.text(`₹${price}`, { align: "right" });
          });
        } else {
          doc.text("No items found.");
        }

        doc.moveDown(0.5);

        // Total
        if (order.totalAmount != null) {
          doc.font("Helvetica-Bold").text(`Total: ₹${order.totalAmount}`, {
            align: "right",
          });
          doc.font("Helvetica");
        }

        // Payment + Delivery Info
        if (order.paymentInfo) {
          doc.text(`Payment Status: ${order.paymentInfo.status || "N/A"}`);
        }
        if (order.deliveryInfo) {
          doc.text(`Delivery Status: ${order.deliveryInfo.status || "N/A"}`);
          if (order.deliveryInfo.courier) {
            doc.text(`Courier: ${order.deliveryInfo.courier}`);
          }
          if (order.deliveryInfo.awbCode) {
            doc.text(`AWB: ${order.deliveryInfo.awbCode}`);
          }
        }

        // Divider
        if (idx < orders.length - 1) {
          doc.moveDown(0.5);
          doc
            .strokeColor("#cccccc")
            .lineWidth(1)
            .moveTo(doc.page.margins.left, doc.y)
            .lineTo(doc.page.width - doc.page.margins.right, doc.y)
            .stroke();
          doc.moveDown(1);
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateBulkOrdersPDF;
