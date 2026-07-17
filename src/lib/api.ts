const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const localDevelopmentUrl = import.meta.env.DEV
  ? "http://127.0.0.1:8000"
  : "";

if (!configuredApiUrl && !localDevelopmentUrl) {
  throw new Error(
    "VITE_API_URL is not configured. Add it to the Railway frontend variables.",
  );
}

export const API_BASE_URL = (
  configuredApiUrl || localDevelopmentUrl
).replace(/\/+$/, "");

export const JSON_HEADERS: Readonly<Record<string, string>> = {
  Accept: "application/json",
  "Content-Type": "application/json",
};
