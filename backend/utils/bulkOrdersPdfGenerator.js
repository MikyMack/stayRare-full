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

  function estimateOrderHeight(order) {

    let height = 0;
    height += 28 + 8; 
    height += 10 * 3; 
    if (order.billingAddress) height += 10 * 3;
    height += 12 + 8;
    if (order.items && order.items.length) {
      height += 16;
      height += order.items.length * 18;
      height += 8; 
    } else {
      height += 16;
    }
    if (order.totalAmount != null) height += 14;
    if (order.paymentInfo) height += 12;
    if (order.deliveryInfo) {
      height += 12;
      if (order.deliveryInfo.courier) height += 10;
      if (order.deliveryInfo.awbCode) height += 10;
    }
    height += 20; 
    return height;
  }

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // --- Professional Header ---
      doc
        .fillColor("#1a237e")
        .fontSize(28)
        .font("Helvetica-Bold")
        .text("Bulk Orders Report", { align: "center", underline: true });
      doc
        .moveDown(0.2)
        .fontSize(12)
        .fillColor("#555")
        .font("Helvetica-Oblique")
        .text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
      doc.moveDown(1.5);

      // Table column widths (used for all orders)
      const colWidths = {
        product: 220,
        color: 60,
        size: 60,
        qty: 40,
        price: 60,
      };
      const tableTotalWidth =
        colWidths.product +
        colWidths.color +
        colWidths.size +
        colWidths.qty +
        colWidths.price;
      const startX = doc.page.margins.left;

      orders.forEach((order, idx) => {
   
        const estimatedHeight = estimateOrderHeight(order);
      
        const availableHeight =
          doc.page.height - doc.y - doc.page.margins.bottom - 40; // 40 for footer
   
        if (estimatedHeight > availableHeight) {
          doc.addPage();
        }

        doc.fillColor("#263238").font("Helvetica-Bold").fontSize(15);

        // --- Order Header ---
        doc.text(`Order #${order._id}`, startX, doc.y, { underline: true });
        doc.moveDown(0.3);

        // Order Meta Info
        doc
          .fontSize(10)
          .fillColor("#333")
          .font("Helvetica")
          .text(
            `Date: ${
              order.createdAt ? new Date(order.createdAt).toLocaleString() : "N/A"
            }`,
            startX
          )
          .text(`Status: ${order.orderStatus || "N/A"}`, startX);

        if (order.user) {
          doc
            .text(
              `Customer: ${order.user.name || "N/A"} (${order.user.email || "N/A"})`,
              startX
            );
        }

        doc.moveDown(0.7);

        // --- Billing Address ---
        if (order.billingAddress) {
          doc
            .font("Helvetica-Bold")
            .fillColor("#1565c0")
            .text("Billing Address:", startX);
          doc
            .font("Helvetica")
            .fillColor("#333")
            .text(
              `${order.billingAddress.name || ""}, ${order.billingAddress.phone || ""}`,
              startX
            )
            .text(
              `${order.billingAddress.addressLine1 || ""}, ${order.billingAddress.city || ""}, ${order.billingAddress.state || ""}, ${order.billingAddress.pincode || ""}`,
              startX
            );
          doc.moveDown(0.7);
        }

        // --- Product Table ---
        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .fillColor("#1b5e20")
          .text("Order Items", startX, doc.y, { underline: true });
        doc.moveDown(0.3);

        if (order.items && order.items.length) {
          doc.fontSize(11);

          // Table header
          let x = startX;
          const y = doc.y;

          doc
            .fillColor("#263238")
            .text("Product", x, y, { width: colWidths.product, continued: false });
          x += colWidths.product;
          doc.text("Color", x, y, { width: colWidths.color, align: "center", continued: false });
          x += colWidths.color;
          doc.text("Size", x, y, { width: colWidths.size, align: "center", continued: false });
          x += colWidths.size;
          doc.text("Qty", x, y, { width: colWidths.qty, align: "center", continued: false });
          x += colWidths.qty;
          doc.text("Price", x, y, { width: colWidths.price, align: "right", continued: false });
          doc.moveDown(0.3);

          // Header underline
          const tableStartY = doc.y;
          doc
            .moveTo(startX, tableStartY)
            .lineTo(startX + tableTotalWidth, tableStartY)
            .strokeColor("#bdbdbd")
            .lineWidth(1)
            .stroke();
          doc.moveDown(0.2);

          doc.font("Helvetica").fillColor("#222");

          // Table rows
          order.items.forEach((item, i) => {
        
            const rowHeight = 18;
            const minSpace = rowHeight + 40; // 40 for footer
            if (
              doc.y + minSpace >
              doc.page.height - doc.page.margins.bottom
            ) {
              doc.addPage();
              // Redraw table header on new page
              let x = startX;
              const y = doc.y;
              doc
                .font("Helvetica-Bold")
                .fontSize(12)
                .fillColor("#1b5e20")
                .text("Order Items (contd.)", startX, doc.y, { underline: true });
              doc.moveDown(0.3);
              doc
                .font("Helvetica")
                .fontSize(11)
                .fillColor("#263238")
                .text("Product", x, doc.y, { width: colWidths.product, continued: false });
              x += colWidths.product;
              doc.text("Color", x, doc.y, { width: colWidths.color, align: "center", continued: false });
              x += colWidths.color;
              doc.text("Size", x, doc.y, { width: colWidths.size, align: "center", continued: false });
              x += colWidths.size;
              doc.text("Qty", x, doc.y, { width: colWidths.qty, align: "center", continued: false });
              x += colWidths.qty;
              doc.text("Price", x, doc.y, { width: colWidths.price, align: "right", continued: false });
              doc.moveDown(0.3);
              // Header underline
              const tableStartY = doc.y;
              doc
                .moveTo(startX, tableStartY)
                .lineTo(startX + tableTotalWidth, tableStartY)
                .strokeColor("#bdbdbd")
                .lineWidth(1)
                .stroke();
              doc.moveDown(0.2);
              doc.font("Helvetica").fillColor("#222");
            }

            let x = startX;
            const rowY = doc.y;
            const productName =
              (item.product && item.product.name) || item.name || "N/A";
            const price =
              (item.product && item.product.price) || item.price || 0;

            // Alternate row background for readability
            if (i % 2 === 1) {
              doc
                .save()
                .rect(startX, rowY - 1, tableTotalWidth, 18)
                .fillOpacity(0.07)
                .fillAndStroke("#e3f2fd", "#e3f2fd")
                .restore();
              doc.y = rowY; // Reset y after fill
            }

            // Product Name
            doc
              .fillColor("#222")
              .text(productName, x, rowY, { width: colWidths.product, continued: false });
            x += colWidths.product;
            // Color
            doc.text(item.selectedColor || "-", x, rowY, {
              width: colWidths.color,
              align: "center",
              continued: false,
            });
            x += colWidths.color;
            // Size
            doc.text(item.selectedSize || "-", x, rowY, {
              width: colWidths.size,
              align: "center",
              continued: false,
            });
            x += colWidths.size;
            // Quantity
            doc.text(item.quantity || 1, x, rowY, {
              width: colWidths.qty,
              align: "center",
              continued: false,
            });
            x += colWidths.qty;
            // Price
            doc
              .fillColor("#1b5e20")
              .text(`₹${price}`, x, rowY, {
                width: colWidths.price,
                align: "right",
                continued: false,
              });
            doc.fillColor("#222");

            doc.moveDown(0.5);
          });

          doc.moveDown(0.5);
        } else {
          doc
            .font("Helvetica-Oblique")
            .fillColor("#b71c1c")
            .text("No items found.", startX);
          doc.moveDown(1);
        }

        // --- Order Total ---
        if (order.totalAmount != null) {
          // Check if enough space for total, else add page
          const minSpace = 18 + 40;
          if (
            doc.y + minSpace >
            doc.page.height - doc.page.margins.bottom
          ) {
            doc.addPage();
          }
          doc
            .font("Helvetica-Bold")
            .fontSize(12)
            .fillColor("#0d47a1")
            .text(`Total: ₹${order.totalAmount}`, startX + colWidths.product + colWidths.color + colWidths.size, doc.y, {
              width: colWidths.qty + colWidths.price,
              align: "right",
            });
          doc.font("Helvetica").fillColor("#222");
          doc.moveDown(0.7);
        }

        // --- Payment & Delivery Info ---
        doc.fontSize(10).fillColor("#333");
        if (order.paymentInfo) {
          doc
            .font("Helvetica-Bold")
            .fillColor("#2e7d32")
            .text(`Payment Status: `, startX, doc.y, { continued: true })
            .font("Helvetica")
            .fillColor("#333")
            .text(`${order.paymentInfo.status || "N/A"}`);
        }
        if (order.deliveryInfo) {
          doc
            .font("Helvetica-Bold")
            .fillColor("#1565c0")
            .text(`Delivery Status: `, startX, doc.y, { continued: true })
            .font("Helvetica")
            .fillColor("#333")
            .text(`${order.deliveryInfo.status || "N/A"}`);
          if (order.deliveryInfo.courier) {
            doc
              .font("Helvetica-Bold")
              .fillColor("#1565c0")
              .text(`Courier: `, startX, doc.y, { continued: true })
              .font("Helvetica")
              .fillColor("#333")
              .text(`${order.deliveryInfo.courier}`);
          }
          if (order.deliveryInfo.awbCode) {
            doc
              .font("Helvetica-Bold")
              .fillColor("#1565c0")
              .text(`AWB: `, startX, doc.y, { continued: true })
              .font("Helvetica")
              .fillColor("#333")
              .text(`${order.deliveryInfo.awbCode}`);
          }
        }

        doc.moveDown(1);

        // --- Divider ---
        if (idx < orders.length - 1) {
          // Check if enough space for divider, else add page
          const minSpace = 10 + 40;
          if (
            doc.y + minSpace >
            doc.page.height - doc.page.margins.bottom
          ) {
            doc.addPage();
          }
          doc
            .strokeColor("#bdbdbd")
            .lineWidth(1.2)
            .moveTo(startX, doc.y)
            .lineTo(startX + tableTotalWidth, doc.y)
            .stroke();
          doc.moveDown(2);
        }
      });

      // --- Footer ---
      // Always print footer on the last page, not on a blank page
      // If the current page is empty (no content), don't print footer
      if (doc.y < doc.page.height - doc.page.margins.bottom - 20) {
        doc
          .fontSize(9)
          .fillColor("#888")
          .font("Helvetica-Oblique")
          .text(
            "Thank you for choosing us! For any queries, contact support@example.com",
            doc.page.margins.left,
            doc.page.height - doc.page.margins.bottom - 20,
            { align: "center" }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateBulkOrdersPDF;
