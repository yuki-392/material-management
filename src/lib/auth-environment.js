const requiredAuthEnvironmentVariables = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
];

export function getMissingAuthEnvironmentVariables(environment = process.env) {
  return requiredAuthEnvironmentVariables.filter(
    (name) => !environment[name]?.trim(),
  );
}
