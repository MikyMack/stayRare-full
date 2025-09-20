// services/notificationService.js
const webpush = require("web-push");
const Subscription = require("../models/Subscription"); // adjust path

// Send notification to a single user
async function sendNotificationToUser(userId, title, message, url = "/") {
  const subscriptions = await Subscription.find({ user: userId });
  const payload = JSON.stringify({ title, message, url });

  const promises = subscriptions.map(sub =>
    webpush.sendNotification(sub.subscription, payload).catch(console.error)
  );

  await Promise.all(promises);
}

// Send notification to all users
async function sendNotificationToAllUsers(title, message, url) {
  const subscriptions = await Subscription.find({});
  const payload = JSON.stringify({ title, message, url });

  const promises = subscriptions.map(sub =>
    webpush.sendNotification(sub.subscription, payload).catch(console.error)
  );

  await Promise.all(promises);
}

module.exports = { sendNotificationToUser, sendNotificationToAllUsers };
