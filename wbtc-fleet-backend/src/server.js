require("dotenv").config();
const app = require("./app");
const connectDB = require("./config/db");
const { startDriverOfferNotifier } = require("./services/driverOfferNotifier");

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  startDriverOfferNotifier();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
