import { AppError } from "../utils/AppError.js";

export function requireFields(...fields) {
  return (req, _res, next) => {
    const missing = fields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === "";
    });
    if (missing.length) {
      return next(
        new AppError("Required fields are missing", 400, "VALIDATION_ERROR", {
          missing,
        }),
      );
    }
    next();
  };
}
