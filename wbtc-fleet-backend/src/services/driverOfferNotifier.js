const Driver = require("../models/Driver");
const TripOffer = require("../models/TripOffer");
const { getOpsDate } = require("../utils/opsTime");
const { collectEligibleTripOffersForDriver } = require("../controllers/driverTrip.controller");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const DEFAULT_INTERVAL_MS = 30000;

let intervalHandle = null;
let syncInProgress = false;

const uniqueTokens = (items = []) =>
  Array.from(
    new Set(
      items
        .map((item) => String(item?.token || "").trim())
        .filter(Boolean)
    )
  );

const buildNotificationText = (offers) => {
  const count = offers.length;
  const firstOffer = offers[0];
  const routeCode = firstOffer?.route?.routeCode || "Trip";
  const routeLabel = [firstOffer?.route?.source, firstOffer?.route?.destination].filter(Boolean).join(" - ");
  const startTime = firstOffer?.startTime || "";

  if (count === 1) {
    return {
      title: "New trip offer",
      body: [routeCode, routeLabel, startTime].filter(Boolean).join(" • "),
    };
  }

  return {
    title: `${count} trip offers available`,
    body: [routeCode, routeLabel, startTime].filter(Boolean).join(" • "),
  };
};

const sendExpoPushNotifications = async (messages) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.errors?.[0]?.message || data?.message || "Failed to send push notification";
    throw new Error(message);
  }
  return data;
};

const pruneInvalidTokens = async (driver, invalidTokens) => {
  if (!invalidTokens.length) return;
  driver.pushTokens = (driver.pushTokens || []).filter(
    (item) => !invalidTokens.includes(String(item?.token || "").trim())
  );
  await driver.save();
};

const notifyDriverForOffers = async (driver, date) => {
  const tokenList = uniqueTokens(driver.pushTokens);
  if (!tokenList.length) return;

  const result = await collectEligibleTripOffersForDriver({ driverId: driver._id, date, debug: false });
  const offers = Array.isArray(result?.offers) ? result.offers : [];
  if (!offers.length) return;

  const tripIds = offers.map((offer) => offer.tripInstanceId).filter(Boolean);
  if (!tripIds.length) return;

  const existingOffers = await TripOffer.find({
    driverId: driver._id,
    tripInstanceId: { $in: tripIds },
  }).select("tripInstanceId status notifiedAt");
  const existingByTripId = new Map(existingOffers.map((item) => [String(item.tripInstanceId), item]));

  const newOffers = offers.filter((offer) => {
    const existing = existingByTripId.get(String(offer.tripInstanceId));
    if (!existing) return true;
    return existing.status === "Pending" && !existing.notifiedAt;
  });
  if (!newOffers.length) return;

  const { title, body } = buildNotificationText(newOffers);
  const messages = tokenList.map((token) => ({
    to: token,
    title,
    body,
    data: {
      screen: "driver-offers",
      tripInstanceId: String(newOffers[0].tripInstanceId || ""),
    },
    priority: "high",
    channelId: "trip-offers",
    sound: "qfare_bus_jingle.wav",
  }));

  const pushResult = await sendExpoPushNotifications(messages);
  const tickets = Array.isArray(pushResult?.data) ? pushResult.data : [];
  const invalidTokens = [];
  let delivered = false;

  tickets.forEach((ticket, index) => {
    if (ticket?.status === "ok") {
      delivered = true;
      return;
    }
    if (ticket?.details?.error === "DeviceNotRegistered") {
      invalidTokens.push(tokenList[index]);
    }
  });

  await pruneInvalidTokens(driver, invalidTokens);
  if (!delivered) return;

  await Promise.all(
    newOffers.map((offer) =>
      TripOffer.findOneAndUpdate(
        { tripInstanceId: offer.tripInstanceId, driverId: driver._id },
        { $set: { status: "Pending", notifiedAt: new Date() } },
        { upsert: true, new: true }
      )
    )
  );
};

const syncDriverOfferNotifications = async () => {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const date = getOpsDate();
    const drivers = await Driver.find({
      status: "Available",
      "pushTokens.0": { $exists: true },
    }).select("_id pushTokens");

    for (const driver of drivers) {
      try {
        await notifyDriverForOffers(driver, date);
      } catch (error) {
        console.error(`[driver-offer-notifier] driver=${driver._id} ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`[driver-offer-notifier] ${error.message}`);
  } finally {
    syncInProgress = false;
  }
};

const startDriverOfferNotifier = () => {
  if (process.env.DRIVER_OFFER_NOTIFICATIONS_ENABLED === "false") return;
  if (intervalHandle) return;

  const intervalMs = Math.max(
    Number(process.env.DRIVER_OFFER_NOTIFICATION_INTERVAL_MS || DEFAULT_INTERVAL_MS),
    15000
  );

  intervalHandle = setInterval(() => {
    syncDriverOfferNotifications().catch((error) => {
      console.error(`[driver-offer-notifier] ${error.message}`);
    });
  }, intervalMs);

  setTimeout(() => {
    syncDriverOfferNotifications().catch((error) => {
      console.error(`[driver-offer-notifier] ${error.message}`);
    });
  }, 5000);
};

module.exports = {
  startDriverOfferNotifier,
};
