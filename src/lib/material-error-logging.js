/**
 * Return only stable error metadata that is safe to write to server logs.
 * Error messages and arbitrary properties are intentionally omitted.
 * @param {string} stage
 * @param {unknown} error
 */
export function getSafeMaterialErrorDetails(stage, error) {
  const details = { stage };
  if (typeof error !== "object" || error === null) {
    return details;
  }

  const safeLabel = (value) =>
    typeof value === "string" && /^[A-Za-z0-9_.:-]{1,120}$/.test(value)
      ? value
      : undefined;

  const name = safeLabel("name" in error ? error.name : undefined);
  const code = safeLabel("code" in error ? error.code : undefined);
  if (name) details.name = name;
  if (code) details.code = code;

  const metadata = "$metadata" in error ? error.$metadata : undefined;
  if (typeof metadata === "object" && metadata !== null) {
    const statusCode =
      "httpStatusCode" in metadata ? metadata.httpStatusCode : undefined;
    const requestId = safeLabel(
      "requestId" in metadata ? metadata.requestId : undefined,
    );

    if (typeof statusCode === "number" && Number.isInteger(statusCode)) {
      details.httpStatusCode = statusCode;
    }
    if (requestId) details.requestId = requestId;
  }

  return details;
}

/**
 * @param {string} stage
 * @param {unknown} error
 */
export function logMaterialError(stage, error) {
  console.error(
    "Material operation failed.",
    getSafeMaterialErrorDetails(stage, error),
  );
}
