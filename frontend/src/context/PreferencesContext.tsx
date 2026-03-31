"use client";
// PreferencesContext — global state for user preferences:
// language, currency, and measurement units.
//
// WHY a Context?
// These settings affect MANY components across the app (Navbar, Shop, Gallery, etc.)
// Instead of passing props through every level ("prop drilling"),
// Context lets any component read/update these values directly.
//
// HOW it works:
// 1. createContext() creates a "channel" for sharing data
// 2. PreferencesProvider wraps the app and holds the actual state
// 3. usePreferences() hook lets any child component access the values
// 4. Values are saved to localStorage so they persist across page reloads

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getApiUrl } from "@/utils";

// Supported languages — extend this list as translations are added
export type Language = "en" | "uk";
// Supported currencies
export type Currency = "USD" | "UAH";
// Measurement units
export type Units = "cm" | "in";

// Shape of the context value — what every consumer gets access to
interface PreferencesContextType {
    language: Language;
    currency: Currency;
    units: Units;
    setLanguage: (lang: Language) => void;
    setCurrency: (cur: Currency) => void;
    setUnits: (u: Units) => void;
    rates: Record<Currency, number>;
    convertPrice: (usdPrice: number) => string;
    globalPrintPrice: number;
}

// Labels for display in the UI
export const LANGUAGE_LABELS: Record<Language, ReactNode> = {
    en: "EN",
    uk: "UA",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
    USD: "$",
    UAH: "₴",
};

export const UNITS_LABELS: Record<Units, string> = {
    cm: "CM",
    in: "IN",
};

// Create the context with undefined default — will be provided by PreferencesProvider
const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

// localStorage key — all preferences stored as one JSON object
const STORAGE_KEY = "artshop_preferences";

// Default values for first-time visitors
const DEFAULTS: { language: Language; currency: Currency; units: Units } = {
    language: "en",
    currency: "USD",
    units: "in",
};

// Provider component — wraps the entire app in layout.tsx
export function PreferencesProvider({ children }: { children: ReactNode }) {
    // Initialize state from localStorage (if available) or defaults
    const [language, setLanguageState] = useState<Language>(DEFAULTS.language);
    const [currency, setCurrencyState] = useState<Currency>(DEFAULTS.currency);
    const [units, setUnitsState] = useState<Units>(DEFAULTS.units);
    const [loaded, setLoaded] = useState(false);
    const [rates, setRates] = useState<Record<Currency, number>>({
        USD: 1,
        UAH: 39.5,
    });
    const [globalPrintPrice, setGlobalPrintPrice] = useState<number>(150);

    // Fetch site settings (for global print price, etc.)
    useEffect(() => {
        async function fetchSettings() {
            try {
                const res = await fetch(`${getApiUrl()}/settings`);
                if (!res.ok) return;
                const data = await res.json();
                if (data && data.global_print_price) {
                    setGlobalPrintPrice(data.global_print_price);
                }
            } catch (err) {
                console.warn("Backend unavailable, using default print prices.");
            }
        }
        fetchSettings();
    }, []);

    // Fetch live currency rates on mount
    useEffect(() => {
        async function fetchRates() {
            try {
                const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
                const data = await res.json();
                if (data && data.rates) {
                    setRates({
                        USD: 1,
                        UAH: data.rates.UAH || 39.5,
                    });
                }
            } catch (err) {
                console.error("Failed to fetch rates, using fallbacks:", err);
            }
        }
        fetchRates();
    }, []);

    // On mount: read saved preferences from localStorage
    // useEffect runs only on the client (not during SSR) — safe to access localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.language) setLanguageState(parsed.language);
                if (parsed.currency) setCurrencyState(parsed.currency);
                if (parsed.units) setUnitsState(parsed.units);
            }
        } catch {
            // localStorage not available or corrupted — use defaults
        }
        setLoaded(true);
    }, []);

    // Save to localStorage whenever any preference changes
    // Skip the initial render (before loaded) to avoid overwriting saved values with defaults
    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, currency, units }));
        } catch {
            // localStorage full or not available — silently fail
        }
    }, [language, currency, units, loaded]);

    // Setter functions that update both state and will trigger the save effect above
    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        // Automatic syncing: when language changes, update defaults appropriately
        if (lang === "uk") {
            setCurrencyState("UAH");
            setUnitsState("cm");
        } else if (lang === "en") {
            setCurrencyState("USD");
            setUnitsState("in");
        }
    };
    const setCurrency = (cur: Currency) => setCurrencyState(cur);
    const setUnits = (u: Units) => setUnitsState(u);

    // Helper to format price according to current currency and fetched rates
    const convertPrice = (usdPrice: number) => {
        const rate = rates[currency] || 1;
        const converted = usdPrice * rate;
        
        let formatted = new Intl.NumberFormat(language === "uk" ? "uk-UA" : "en-US", {
            style: "decimal",
            maximumFractionDigits: 0,
        }).format(converted);

        const symbol = CURRENCY_LABELS[currency] || "$";
        return `${symbol}${formatted}`;
    };

    return (
        <PreferencesContext.Provider value={{ language, currency, units, setLanguage, setCurrency, setUnits, rates, convertPrice, globalPrintPrice }}>
            {children}
        </PreferencesContext.Provider>
    );
}

// Custom hook — shortcut for components to access preferences
// Throws an error if used outside of PreferencesProvider (catches bugs early)
export function usePreferences() {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
    return ctx;
}
