import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";

const port = Number(process.env.PORT || 5000);

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith("replace-")) {
  throw new Error("JWT_SECRET must be set to a random secret with at least 32 characters.");
}

let server;

try {
  // Fail fast with a clear message instead of hanging for 30s when Atlas is unreachable.
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  server = app.listen(port, () => console.log(`PeopleDesk API listening on port ${port}`));
} catch (error) {
  console.error("Could not connect to MongoDB:", error.message);
  process.exit(1);
}

// Hosting platforms send SIGTERM on every deploy/restart. Finish in-flight requests and
// close the database connection cleanly instead of dropping them.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down gracefully.`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  try {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error.message);
    process.exit(1);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => console.error("Unhandled promise rejection:", reason));
