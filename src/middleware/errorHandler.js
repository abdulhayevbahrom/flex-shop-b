import mongoose from "mongoose";
import { errorResponse } from "../utils/responses.js";

export function errorHandler(error, _req, res, _next) {
  if (error instanceof mongoose.Error.ValidationError) {
    return errorResponse(res, "Validation failed", 400, "VALIDATION_ERROR", error.errors);
  }
  if (error instanceof mongoose.Error.CastError) {
    return errorResponse(res, "Invalid resource id", 400, "INVALID_ID");
  }
  if (error?.code === 11000) {
    return errorResponse(res, "Resource already exists", 409, "DUPLICATE_RESOURCE");
  }

  const status = error.statusCode ?? 500;
  if (status >= 500) console.error(error);
  return errorResponse(
    res,
    status >= 500 ? "Internal server error" : error.message,
    status,
    error.code ?? "INTERNAL_ERROR",
    error.details,
  );
}
