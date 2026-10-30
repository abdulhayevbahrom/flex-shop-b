export function successResponse(res, data = {}, status = 200) {
  return res.status(status).json({ ok: true, ...data });
}

export function errorResponse(
  res,
  message,
  status = 500,
  code = "INTERNAL_ERROR",
  details,
) {
  const payload = { ok: false, error: message, code };
  if (details !== undefined) payload.details = details;
  return res.status(status).json(payload);
}
