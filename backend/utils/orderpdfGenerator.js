// utils/pdfGenerator.js
const PDFDocument = require("pdfkit");

function generateAdminOrderPDF(order) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: "A4" });
            let buffers = [];
            doc.on("data", buffers.push.bind(buffers));
            doc.on("end", () => resolve(Buffer.concat(buffers)));

            // --- HEADER ---
            doc.fontSize(20).text("Order Report", { align: "center" });
            doc.moveDown();

            doc.fontSize(12).text(`Order ID: ${order._id}`);
            doc.text(`Created At: ${new Date(order.createdAt).toLocaleString()}`);
            doc.text(`Updated At: ${new Date(order.updatedAt).toLocaleString()}`);
            doc.text(`Order Status: ${order.orderStatus}`);
            doc.text(`Is Replacement: ${order.isReplacement ? "Yes" : "No"}`);
            if (order.replacementReason)
                doc.text(`Replacement Reason: ${order.replacementReason}`);
            doc.moveDown();

            // --- USER INFO ---
            if (order.user) {
                doc.fontSize(14).text("User Info:", { underline: true });
                doc.fontSize(12).text(`User ID: ${order.user}`);
                doc.moveDown();
            }

            // --- BILLING ADDRESS ---
            doc.fontSize(14).text("Billing Address:", { underline: true });
            const b = order.billingAddress || {};
            doc.fontSize(12)
                .text(`Name: ${b.name || "-"}`)
                .text(`Phone: ${b.phone || "-"}`)
                .text(`Address: ${b.addressLine1 || ""}, ${b.addressLine2 || ""}`)
                .text(`Landmark: ${b.landmark || "-"}`)
                .text(`City: ${b.city || "-"}, District: ${b.district || "-"}, State: ${b.state || "-"}, Pincode: ${b.pincode || "-"}`)
                .text(`Address Type: ${b.addressType || "-"}`);
            doc.moveDown();

            // --- SHIPPING ADDRESS ---
            doc.fontSize(14).text("Shipping Address:", { underline: true });
            const s = order.shippingAddress || {};
            doc.fontSize(12)
                .text(`Name: ${s.name || "-"}`)
                .text(`Phone: ${s.phone || "-"}`)
                .text(`Address: ${s.addressLine1 || ""}, ${s.addressLine2 || ""}`)
                .text(`Landmark: ${s.landmark || "-"}`)
                .text(`City: ${s.city || "-"}, District: ${s.district || "-"}, State: ${s.state || "-"}, Pincode: ${s.pincode || "-"}`)
                .text(`Address Type: ${s.addressType || "-"}`);
            doc.moveDown();

            // --- COUPON INFO ---
            if (order.couponUsed?.code) {
                doc.fontSize(14).text("Coupon Info:", { underline: true });
                doc.fontSize(12)
                    .text(`Code: ${order.couponUsed.code}`)
                    .text(`Type: ${order.couponUsed.discountType || "-"}`)
                    .text(`Value: ${order.couponUsed.discountValue || "-"}`)
                    .text(`Discount Amount: ₹${order.couponUsed.discountAmount || 0}`);
                doc.moveDown();
            }

            // --- PAYMENT INFO ---
            doc.fontSize(14).text("Payment Info:", { underline: true });
            const p = order.paymentInfo || {};
            doc.fontSize(12)
                .text(`Razorpay Order ID: ${p.razorpayOrderId || "-"}`)
                .text(`Razorpay Payment ID: ${p.razorpayPaymentId || "-"}`)
                .text(`Status: ${p.status || "Pending"}`);
            doc.moveDown();

            // --- DELIVERY INFO ---
            doc.fontSize(14).text("Delivery Info:", { underline: true });
            const d = order.deliveryInfo || {};
            doc.fontSize(12)
                .text(`Courier: ${d.courier || "-"}`)
                .text(`Shipment ID: ${d.shipmentId || "-"}`)
                .text(`Tracking ID: ${d.trackingId || "-"}`)
                .text(`AWB Code: ${d.awbCode || "-"}`)
                .text(`Label URL: ${d.labelUrl || "-"}`)
                .text(`Status: ${d.status || "-"}`)
                .text(`Estimated Delivery: ${d.estimatedDelivery ? new Date(d.estimatedDelivery).toLocaleString() : "-"}`)
                .text(`Error: ${d.error || "-"}`)
                .text(`Last Updated: ${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : "-"}`);
            doc.moveDown();

            // --- TRACKING HISTORY ---
            if (d.trackingHistory?.length) {
                doc.fontSize(14).text("Tracking History:", { underline: true });
                d.trackingHistory.forEach((t, i) => {
                    doc.fontSize(12).text(
                        `${i + 1}. ${t.status} (${t.original_status}) - ${t.location || "Unknown"} - ${t.remark || ""} - Updated: ${t.updated_date || ""}`
                    );
                });
                doc.moveDown();
            }

            // --- ITEMS ---
            doc.fontSize(14).text("Order Items:", { underline: true });
            order.items.forEach((item, i) => {
                doc.fontSize(12).text(
                    `${i + 1}. ${item.name} | Qty: ${item.quantity} | Price: ₹${item.price} | Color: ${item.selectedColor || "-"} | Size: ${item.selectedSize || "-"}`
                );
            });
            doc.moveDown();

            // --- TOTALS ---
            doc.fontSize(14).text("Totals:", { underline: true });
            doc.fontSize(12).text(`Total Amount: ₹${order.totalAmount || 0}`);
            doc.moveDown();

            // --- FOOTER ---
            doc.fontSize(10).text("Generated by Admin Dashboard", { align: "center" });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = generateAdminOrderPDF;
