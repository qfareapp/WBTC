const fs = require("fs");
const path = require("path");

let messagingInstance = null;
let initAttempted = false;
let loggedInitFailure = false;

const parseServiceAccount = () => {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!rawPath) return null;

  const resolvedPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
};

const getFirebaseMessaging = () => {
  if (messagingInstance) return messagingInstance;
  if (initAttempted) return null;

  initAttempted = true;

  try {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) return null;

    const admin = require("firebase-admin");
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });

    messagingInstance = app.messaging();
    return messagingInstance;
  } catch (error) {
    if (!loggedInitFailure) {
      console.error(`[firebase] init_failed ${error.message}`);
      loggedInitFailure = true;
    }
    return null;
  }
};

module.exports = {
  getFirebaseMessaging,
};
