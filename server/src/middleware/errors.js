export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === "ValidationError") {
    const details = Object.values(error.errors).map((item) => item.message);
    return res.status(400).json({ message: details.join(" ") });
  }
  if (error.name === "CastError") return res.status(400).json({ message: "A supplied identifier or value is invalid." });
  if (error.code === 11000) return res.status(409).json({ message: "A record with the same unique value already exists." });
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: "An unexpected server error occurred." });
}
