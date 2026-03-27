const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI missing in environment");

  mongoose.set("strictQuery", true);
  const connection = await mongoose.connect(uri);
  const dbName = connection.connection?.name || "unknown";

  console.log(`MongoDB connected (${dbName})`);
};

module.exports = connectDB;
