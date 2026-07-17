function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWeekend(date: Date): boolean {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Return the Nth future weekday as a local ISO date.
 *
 * This helper prevents the frontend from suggesting Saturdays and Sundays.
 * Exchange holidays remain the backend's responsibility because the API uses
 * the market calendar for the selected ticker.
 */
export function futureWeekdayIsoDate(
  position: number,
  fromDate: Date = new Date(),
): string {
  if (!Number.isInteger(position) || position < 1) {
    throw new Error("The future weekday position must be a positive integer.");
  }

  const date = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate(),
  );

  let weekdaysFound = 0;

  while (weekdaysFound < position) {
    date.setDate(date.getDate() + 1);

    if (!isWeekend(date)) {
      weekdaysFound += 1;
    }
  }

  return toLocalIsoDate(date);
}

export function localIsoDate(dayOffset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return toLocalIsoDate(date);
}

export function languageToLocale(language: string | undefined) {
  return language?.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";
}

export function formatDate(value: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatShortDate(value: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatPercentage(value: number, locale = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMoney(value: number, currency: string, locale = "en-US") {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (normalizedCurrency) {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: normalizedCurrency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      // Fall back to the API-provided currency text when it is not an ISO code.
    }
  }

  const formattedValue = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return normalizedCurrency ? `${normalizedCurrency} ${formattedValue}` : formattedValue;
}

export function formatClassName(name: string | null) {
  if (!name) return "Pending";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function actionClass(action: string) {
  return action.toLowerCase().replaceAll("_", "-");
}
