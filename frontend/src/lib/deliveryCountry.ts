"use client";

import { countries, detectUserCountry } from "@/countries";
import { apiFetch, apiJson, getApiUrl } from "@/utils";

const DELIVERY_COUNTRY_STORAGE_KEY = "artshop_delivery_country";

function normalizeCountryCode(value: unknown): string {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && countries.some((country) => country.code === code)
    ? code
    : "";
}

export function getStoredDeliveryCountry(): string {
  if (typeof window === "undefined") {
    return "";
  }
  return normalizeCountryCode(window.localStorage.getItem(DELIVERY_COUNTRY_STORAGE_KEY));
}

export function storeDeliveryCountry(countryCode: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) {
    return;
  }
  window.localStorage.setItem(DELIVERY_COUNTRY_STORAGE_KEY, normalized);
}

export async function detectDeliveryCountry(): Promise<string> {
  const stored = getStoredDeliveryCountry();
  if (stored) {
    return stored;
  }

  try {
    const response = await apiFetch(`${getApiUrl()}/geo/country`);
    const data = await apiJson<{ country_code?: string }>(response);
    const detected = normalizeCountryCode(data.country_code);
    if (detected) {
      storeDeliveryCountry(detected);
      return detected;
    }
  } catch {
    // Browser locale fallback below keeps the UI usable if geo detection is unavailable.
  }

  const fallback = normalizeCountryCode(detectUserCountry()) || "US";
  storeDeliveryCountry(fallback);
  return fallback;
}
