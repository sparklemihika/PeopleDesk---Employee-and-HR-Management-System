import jwt from "jsonwebtoken";
import { RevokedToken, User } from "../models/index.js";

export async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get("authorization") || "").split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication is required." });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "peopledesk-api",
      audience: "peopledesk-client",
    });
    if (!payload.jti) return res.status(401).json({ message: "Your session is invalid. Please sign in again." });
    if (await RevokedToken.exists({ jti: payload.jti })) {
      return res.status(401).json({ message: "Your session has ended. Please sign in again." });
    }
    const user = await User.findById(payload.sub).select("name email role employee sessionVersion");
    if (!user) return res.status(401).json({ message: "Your session is no longer valid." });
    if (payload.sessionVersion !== user.sessionVersion) {
      return res.status(401).json({ message: "Your password changed. Please sign in again." });
    }
    req.user = user;
    req.authTokenId = payload.jti;
    req.authTokenExpiresAt = new Date(payload.exp * 1000);
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: "Your session is invalid or has expired." });
    }
    return next(error);
  }
}

export function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to access this resource." });
    }
    return next();
  };
}
