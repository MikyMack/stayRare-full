// shiprocketStatusMapper.js
module.exports = function mapShiprocketStatus(status, trackingData = {}) {
  if (!status) return 'Processing';

  // First check tracking history for current_status if available
  if (trackingData.trackingHistory && trackingData.trackingHistory[0]?.current_status) {
    const currentStatus = String(trackingData.trackingHistory[0].current_status).toLowerCase();
    
    if (/delivered|delivery completed/i.test(currentStatus)) return 'Delivered';
    if (/shipped|picked up|pickup completed/i.test(currentStatus)) return 'Shipped';
    if (/in transit|on the way/i.test(currentStatus)) return 'In Transit';
    if (/out for delivery|ofd/i.test(currentStatus)) return 'Out for Delivery';
  }

  // Then handle numeric status codes
  if (typeof status === 'number' || !isNaN(status)) {
    const statusCode = parseInt(status);
    switch (statusCode) {
      case 1: return 'Pending';
      case 2: return 'Processing';
      case 3: return 'Shipped';
      case 4: return 'In Transit';
      case 5: return 'Out for Delivery';
      case 6: return 'Delivered';
      case 7: return 'Returned';
      case 8: return 'Cancelled';
      case 9: return 'Failed';
      default: return 'Processing';
    }
  }

  return 'Processing';
};