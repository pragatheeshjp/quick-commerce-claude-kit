import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Route not found" } });
};

// Centralized error handler: never leak stack traces or DB details to clients.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.issues },
    });
    return;
  }
  // body-parser errors (malformed JSON, payload too large) carry a 4xx status.
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ success: false, error: { code: "BAD_REQUEST", message: "Bad request" } });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ success: false, error: { code: "INTERNAL", message: "Internal server error" } });
};
