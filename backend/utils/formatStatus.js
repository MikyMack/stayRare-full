module.exports = function formatStatus(orderStatus, deliveryStatus) {
    if (!deliveryStatus || deliveryStatus === 'Pending') {
      return orderStatus;
    }
    return `${orderStatus}, ${deliveryStatus}`;
  };