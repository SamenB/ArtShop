"use client";

/**
 * Context provider for managing global user preferences.
 * Handles localization (language), financial settings (currency), 
 * and measurement units (centimeters vs inches).
 * Synchronizes state with localStorage and provides live currency conversion.
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { getApiUrl, apiFetch } from "@/utils";

/** Supported application languages. */
export type Language = "en" | "uk";

/** Supported display currencies. */
export type Currency = "USD" | "UAH";

/** Supported measurement units for artwork dimensions. */
export type Units = "cm" | "in";

/** Definition of the preferences state and formatting utilities. */
interface PreferencesContextType {
    language: Language;
    currency: Currency;
    units: Units;
    setLanguage: (lang: Language) => void;
    setCurrency: (cur: Currency) => void;
    setUnits: (u: Units) => void;
    /** Current exchange rates fetch from an external API. */
    rates: Record<Currency, number>;
    /** Utility to convert and format a USD price into the user's preferred currency. */
    convertPrice: (usdPrice: number) => string;
    /** IDs of artworks liked while anonymous, waiting for login to sync. */
    pendingLikes: number[];
    addPendingLike: (id: number) => void;
    removePendingLike: (id: number) => void;
    clearPendingLikes: () => void;
    unauthLikeCount: number;
    incrementUnauthLikeCount: () => void;
}

/** UI labels for the language selector. */
export const LANGUAGE_LABELS: Record<Language, ReactNode> = {
    en: "EN",
    uk: "UA",
};

/** Symbol identifiers for supported currencies. */
export const CURRENCY_LABELS: Record<Currency, string> = {
    USD: "$",
    UAH: "₴",
};

/** Labels for the measurement unit selector. */
export const UNITS_LABELS: Record<Units, string> = {
    cm: "CM",
    in: "IN",
};

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

const STORAGE_KEY = "artshop_preferences";

/** Initial state for new visitors. */
const DEFAULTS: { language: Language; currency: Currency; units: Units } = {
    language: "en",
    currency: "USD",
    units: "in",
};

/**
 * High-level provider that manages session-persistent user settings.
 * Orchestrates external data fetching for exchange rates and site-wide settings.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(DEFAULTS.language);
    const [currency, setCurrencyState] = useState<Currency>(DEFAULTS.currency);
    const [units, setUnitsState] = useState<Units>(DEFAULTS.units);
    const [loaded, setLoaded] = useState(false);
    
    // Default fallback rates in case of API failure.
    const [rates, setRates] = useState<Record<Currency, number>>({
        USD: 1,
        UAH: 39.5,
    });
    
    const [globalPrintPrice] = useState<number>(0); // Deprecated — kept for backward compat until all call sites are removed
    const [pendingLikes, setPendingLikes] = useState<number[]>([]);
    const [unauthLikeCount, setUnauthLikeCount] = useState<number>(0);

    // Exchange rates fetch

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
                console.error("Exchange rate API inaccessible, using cached fallbacks.");
            }
        }
        fetchRates();
    }, []);

    // Load persisted preferences from the browser's local storage.
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
            // Silently ignore corrupted storage data.
        }
        setLoaded(true);

        // Load pending likes separately
        try {
            const savedLikes = localStorage.getItem("artshop_pending_likes");
            if (savedLikes) {
                setPendingLikes(JSON.parse(savedLikes));
            }
        } catch {}
    }, []);

    // Persist preference changes back to local storage.
    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, currency, units }));
        } catch {
            // Silently ignore storage quota/permission issues.
        }
    }, [language, currency, units, loaded]);

    // Persist pending likes
    useEffect(() => {
        if (!loaded) return;
        try {
            localStorage.setItem("artshop_pending_likes", JSON.stringify(pendingLikes));
        } catch {}
    }, [pendingLikes, loaded]);

    /** Updates language and applies smart defaults for currency/units. */
    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        // Smart syncing: switch defaults based on cultural territory.
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
    
    const addPendingLike = (id: number) => {
        setPendingLikes(prev => {
            if (prev.includes(id)) return prev;
            return [...prev, id];
        });
    };

    const removePendingLike = (id: number) => {
        setPendingLikes(prev => prev.filter(x => x !== id));
    };

    const clearPendingLikes = () => setPendingLikes([]);

    const incrementUnauthLikeCount = () => setUnauthLikeCount(prev => prev + 1);

    /** Converts a base USD price to the active currency and formats it for display. */
    const convertPrice = (usdPrice: number) => {
        const rate = rates[currency] || 1;
        const converted = usdPrice * rate;
        
        // Format as whole numbers for a cleaner gallery aesthetic.
        let formatted = new Intl.NumberFormat(language === "uk" ? "uk-UA" : "en-US", {
            style: "decimal",
            maximumFractionDigits: 0,
        }).format(converted);

        const symbol = CURRENCY_LABELS[currency] || "$";
        return `${symbol}${formatted}`;
    };

    return (
        <PreferencesContext.Provider value={{ 
            language, 
            currency, 
            units, 
            setLanguage, 
            setCurrency, 
            setUnits, 
            rates, 
            convertPrice, 
            globalPrintPrice,
            pendingLikes,
            addPendingLike,
            removePendingLike,
            clearPendingLikes,
            unauthLikeCount,
            incrementUnauthLikeCount
        }}>
            {children}
        </PreferencesContext.Provider>
    );
}

/**
 * Hook to access localization state and pricing utilities.
 * Throws if used outside of a PreferencesProvider.
 */
export function usePreferences() {
    const ctx = useContext(PreferencesContext);
    if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
    return ctx;
}
