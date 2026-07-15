const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error(
    "VITE_API_URL is not configured. Add it to the Railway frontend variables.",
  );
}

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, "");