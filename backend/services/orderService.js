const Order = require('../models/Order');
const { trackShipment, parseShiprocketDate } = require('./shiprocketService');
const mapShiprocketStatus = require('../utils/shiprocketStatusMapper');

async function getOrdersWithTracking(userId, { skip = 0, limit = 10 } = {}) {
  const orders = await Order.find({ user: userId })
    .populate('items.product')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const updatedOrders = await Promise.all(
    orders.map(async (order) => {
      if (!order.deliveryInfo?.awbCode) {
        return order.toObject();
      }

      try {
        const liveTracking = await trackShipment(order.deliveryInfo.awbCode);
        
        if (liveTracking?.status && liveTracking.trackingHistory?.length) {
    
          const validTrackingHistory = liveTracking.trackingHistory.map(event => ({
            status: event.current_status || 'Unknown',
            original_status: event.current_status,
            location: event.destination || event.origin || 'Unknown',
            remark: event.pod_status || 'No remarks',
            awb: event.awb_code || order.deliveryInfo.awbCode,
            updated_date: event.updated_time_stamp || event.pickup_date,
            date: parseShiprocketDate(event.updated_time_stamp || event.pickup_date) || new Date(),
            courier_name: event.courier_name,
            pod_status: event.pod_status,
            edd: event.edd
          })).filter(event => event.date instanceof Date);

          const latestEvent = validTrackingHistory.reduce((latest, current) => 
            new Date(current.date) > new Date(latest.date) ? current : latest
          );
 
          order.deliveryInfo.status = latestEvent.status; 
          order.deliveryInfo.trackingHistory = validTrackingHistory;
          order.deliveryInfo.updatedAt = new Date();

          switch(latestEvent.status) {
            case 'Shipped':
                if (order.orderStatus !== 'Delivered') {
                    order.orderStatus = 'Shipped';
                }
                break;
            case 'In Transit':
            case 'Out for Delivery':
                if (!['Delivered', 'Cancelled', 'Returned'].includes(order.orderStatus)) {
                    order.orderStatus = 'Shipped'; // or create a new status if needed
                }
                break;
            case 'Delivered':
                order.orderStatus = 'Delivered';
                break;
            case 'Returned':
                order.orderStatus = 'Returned';
                break;
            case 'Cancelled':
            case 'Failed':
                order.orderStatus = 'Cancelled';
                break;
        }
          await order.save();
        }
      } catch (error) {
        console.error(`Tracking update failed for order ${order._id}:`, error.message);
      }

      return order.toObject();
    })
  );

  return { orders: updatedOrders, needsRefresh: true };
}

module.exports = { getOrdersWithTracking };