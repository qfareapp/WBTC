const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const app = require("./app");
const connectDB = require("./config/db");
const { startDriverOfferNotifier } = require("./services/driverOfferNotifier");

const envPath = path.resolve(process.cwd(), ".env");
const localEnvPath = path.resolve(process.cwd(), ".env.local");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (process.env.NODE_ENV !== "production" && fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, override: true });
}

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  startDriverOfferNotifier();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
