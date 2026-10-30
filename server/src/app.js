import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.js";
import hrRoutes from "./routes/hr.js";
import employeePortalRoutes from "./routes/employeePortal.js";
import operationsRoutes from "./routes/operations.js";
import { requireAuth, requireRole } from "./middleware/auth.js";
import { auditChanges } from "./middleware/audit.js";
import { errorHandler, notFound } from "./middleware/errors.js";

const app = express();
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, "../..");

const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
// Behind a hosting proxy (Render, Railway, Fly, Heroku...) the client IP arrives in
// X-Forwarded-For. Without this, every visitor shares the proxy's IP and therefore ONE
// login rate-limit bucket. Override with TRUST_PROXY (number of hops, or "false").
const trustProxy = process.env.TRUST_PROXY ?? (isProduction ? "1" : "false");
app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === "false" ? false : trustProxy);
app.use(compression());
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(",").map((origin) => origin.trim()) : "http://localhost:5173",
}));
app.use(express.json({ limit: "100kb" }));
// API responses contain personal HR data: never let browsers or proxies cache them.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});
app.use("/api/auth", authRoutes);
app.use("/api/operations", requireAuth, auditChanges, operationsRoutes);
app.use("/api/employee-portal", requireAuth, requireRole("employee"), auditChanges, employeePortalRoutes);
app.use("/api", requireAuth, requireRole("admin", "hr"), auditChanges, hrRoutes);

const productionAssets = path.join(projectRoot, "dist");
if (isProduction) {
  if (!fs.existsSync(path.join(productionAssets, "index.html"))) {
    console.warn("dist/index.html not found. Run `npm run build` before starting in production.");
  }
  // Vite fingerprints everything in /assets, so it can be cached for a year. index.html must
  // always be revalidated so users pick up new deployments.
  app.use(express.static(productionAssets, {
    index: false,
    setHeaders(res, filePath) {
      const isFingerprinted = filePath.includes(`${path.sep}assets${path.sep}`);
      res.setHeader("Cache-Control", isFingerprinted ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    },
  }));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-cache");
    return res.sendFile(path.join(productionAssets, "index.html"));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
