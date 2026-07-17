import type { TFunction } from "i18next";

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

type ApiBusinessError = {
  error?: {
    code?: unknown;
    message?: unknown;
    context?: unknown;
  };
};

function interpolationContext(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (typeof item === "string" || typeof item === "number") {
        return [[key, item]];
      }

      if (typeof item === "boolean") {
        return [[key, String(item)]];
      }

      return [];
    }),
  );
}

export function apiErrorMessage(
  data: unknown,
  status: number,
  t: TFunction,
): string {
  if (data && typeof data === "object" && "error" in data) {
    const businessError = (data as ApiBusinessError).error;

    if (businessError && typeof businessError === "object") {
      const code = typeof businessError.code === "string"
        ? businessError.code
        : null;
      const backendMessage = typeof businessError.message === "string"
        ? businessError.message
        : "";
      const context = interpolationContext(businessError.context);

      if (code) {
        return t(`apiErrors.${code}`, {
          ...context,
          defaultValue: backendMessage || t("errors.apiStatus", { status }),
        });
      }

      if (backendMessage) {
        return backendMessage;
      }
    }
  }

  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const message = "msg" in item && typeof item.msg === "string"
            ? item.msg
            : null;
          const location = "loc" in item && Array.isArray(item.loc)
            ? item.loc.filter((part: unknown) => part !== "body").join(".")
            : "";

          if (location === "model" && message?.toLowerCase().includes("extra")) {
            return t("errors.modelUnsupported");
          }

          return message
            ? `${location ? `${location}: ` : ""}${message}`
            : null;
        })
        .filter((message): message is string => Boolean(message));

      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
  }

  return t("errors.apiStatus", { status });
}
