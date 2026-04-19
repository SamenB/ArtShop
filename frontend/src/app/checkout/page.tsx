"use client";

/**
 * Premium Two-Step Checkout Flow
 * 
 * Features:
 * - Google Places Autocomplete for address (auto-fills city, state, postal, country)
 * - Emoji country flags in country dropdown and phone input
 * - Phone input with country flag + dial code prefix
 * - Real-time inline validation
 * - Searchable country dropdown with flags
 * - Browser locale auto-detection
 * - Google OAuth pre-fill for returning customers
 * - Sticky order summary on desktop
 * - Mobile-first responsive design
 * - Smooth step transitions
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { usePreferences } from "@/context/PreferencesContext";
import { GoogleLogin } from "@react-oauth/google";
import { useUser } from "@/context/UserContext";
import { getApiUrl, apiFetch } from "@/utils";
import {
    countries,
    getStateLabel,
    getPostalLabel,
    detectUserCountry,
    countryCodeToFlag,
} from "@/countries";
import type { Country } from "@/countries";

/* ------------------------------------------------------------------ */
/*  Google Places API (New) types                                     */
/* ------------------------------------------------------------------ */

declare global {
    interface Window {
        google?: {
            maps: {
                importLibrary: (lib: string) => Promise<any>;
                places: any;
            };
        };
        _googlePlacesLoaded?: boolean;
    }
}

interface PlaceSuggestion {
    placePrediction: {
        placeId: string;
        text: { text: string };
        structuredFormat?: {
            mainText: { text: string };
            secondaryText: { text: string };
        };
        toPlace: () => any;
    };
}

/* ------------------------------------------------------------------ */
/*  Shared inline style constants                                     */
/* ------------------------------------------------------------------ */

const inputBase: React.CSSProperties = {
    paddingTop: "0.85rem",
    paddingBottom: "0.85rem",
    paddingLeft: "1rem",
    paddingRight: "1rem",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "rgba(17,17,17,0.18)",
    borderRadius: "8px",
    fontFamily: "var(--font-sans)",
    fontSize: "0.9rem",
    backgroundColor: "#fff",
    width: "100%",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
};

const inputFocus: React.CSSProperties = {
    borderColor: "#ec4899",
    boxShadow: "0 0 0 3px rgba(236,72,153,0.10)",
};

const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#555",
    marginBottom: "0.35rem",
    display: "block",
};

const errorStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)",
    fontSize: "0.75rem",
    color: "#E53E3E",
    marginTop: "0.25rem",
};

const sectionTitle: React.CSSProperties = {
    fontFamily: "var(--font-serif)",
    fontSize: "1.5rem",
    fontWeight: 500,
    fontStyle: "italic",
    marginBottom: "1.5rem",
};

/* ------------------------------------------------------------------ */
/*  Green checkmark style for validated fields                        */
/* ------------------------------------------------------------------ */

const validCheckStyle: React.CSSProperties = {
    position: "absolute",
    right: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#22c55e",
    fontSize: "1rem",
    fontWeight: 700,
    lineHeight: 1,
    pointerEvents: "none",
    animation: "fadeIn 0.3s ease",
};

/* ------------------------------------------------------------------ */
/*  Helper: smart input component with focus glow + validation ✓      */
/* ------------------------------------------------------------------ */

function SmartInput({
    label,
    error,
    required,
    valid,
    style,
    "data-error": dataError,
    ...props
}: {
    label: string;
    error?: string;
    required?: boolean;
    valid?: boolean;
    "data-error"?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
    const [focused, setFocused] = useState(false);
    const showCheck = valid && !error;
    return (
        <div style={{ display: "flex", flexDirection: "column", ...style }} data-error={dataError ? "true" : undefined}>
            <label style={labelStyle}>
                {label}
                {required && <span style={{ color: "#ec4899", marginLeft: "3px" }}>*</span>}
            </label>
            <div style={{ position: "relative" }}>
                <input
                    {...props}
                    required={required}
                    onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
                    onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
                    style={{
                        ...inputBase,
                        ...(focused ? inputFocus : {}),
                        ...(error ? { borderColor: "#E53E3E" } : {}),
                        ...(showCheck && !focused ? { borderColor: "#22c55e" } : {}),
                        ...(showCheck ? { paddingRight: "2.5rem" } : {}),
                    }}
                />
                {showCheck && <span style={validCheckStyle}>✓</span>}
            </div>
            {error && <span style={errorStyle}>{error}</span>}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Phone input with country flag + dial code                         */
/* ------------------------------------------------------------------ */

function PhoneInput({
    label,
    value,
    onChange,
    countryCode,
    onChangeCountry,
    error,
    required,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    countryCode: string;
    onChangeCountry: (code: string) => void;
    error?: string;
    required?: boolean;
    placeholder?: string;
}) {
    const [focused, setFocused] = useState(false);
    const [dropOpen, setDropOpen] = useState(false);
    const [search, setSearch] = useState("");
    const ref = useRef<HTMLDivElement>(null);

    const selected = useMemo(() => countries.find((c) => c.code === countryCode), [countryCode]);
    const flag = countryCodeToFlag(countryCode);

    const filtered = useMemo(() => {
        if (!search) return countries;
        const q = search.toLowerCase();
        return countries.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q) ||
                c.phone.includes(q)
        );
    }, [search]);

    // Close on outside click
    useEffect(() => {
        if (!dropOpen) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setDropOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [dropOpen]);

    return (
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }} ref={ref}>
            <label style={labelStyle}>
                {label}
                {required && <span style={{ color: "#ec4899", marginLeft: "3px" }}>*</span>}
            </label>
            <div
                style={{
                    display: "flex",
                    alignItems: "stretch",
                    border: `1px solid ${error ? "#E53E3E" : focused ? "#ec4899" : "rgba(17,17,17,0.18)"}`,
                    borderRadius: "8px",
                    overflow: "hidden",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                    boxShadow: focused ? "0 0 0 3px rgba(236,72,153,0.10)" : "none",
                    backgroundColor: "#fff",
                }}
            >
                {/* Flag + code button */}
                <button
                    type="button"
                    onClick={() => setDropOpen(!dropOpen)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        padding: "0 0.75rem",
                        border: "none",
                        borderRight: "1px solid rgba(17,17,17,0.1)",
                        background: "rgba(17,17,17,0.02)",
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.85rem",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>{flag}</span>
                    <span style={{ color: "#666", fontSize: "0.8rem" }}>{selected?.phone || ""}</span>
                    <span style={{ fontSize: "0.55rem", color: "#bbb", transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                </button>

                {/* Phone number input */}
                <input
                    type="tel"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={placeholder || "Phone number"}
                    required={required}
                    style={{
                        flex: 1,
                        padding: "0.85rem 0.75rem",
                        border: "none",
                        outline: "none",
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.9rem",
                        minWidth: 0,
                    }}
                />
            </div>
            {error && <span style={errorStyle}>{error}</span>}

            {/* Dropdown */}
            {dropOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        maxHeight: "280px",
                        backgroundColor: "#fff",
                        border: "1px solid rgba(17,17,17,0.12)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        zIndex: 100,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div style={{ padding: "0.5rem", borderBottom: "1px solid rgba(17,17,17,0.06)" }}>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search country..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ ...inputBase, padding: "0.6rem 0.8rem", fontSize: "0.85rem", borderColor: "rgba(17,17,17,0.1)" }}
                        />
                    </div>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        {filtered.map((c) => (
                            <button
                                key={c.code}
                                type="button"
                                onClick={() => { onChangeCountry(c.code); setDropOpen(false); setSearch(""); }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    width: "100%",
                                    padding: "0.55rem 1rem",
                                    border: "none",
                                    background: c.code === countryCode ? "rgba(236,72,153,0.06)" : "transparent",
                                    cursor: "pointer",
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "0.85rem",
                                    textAlign: "left",
                                    transition: "background-color 0.1s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(236,72,153,0.06)")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = c.code === countryCode ? "rgba(236,72,153,0.06)" : "transparent")}
                            >
                                <span style={{ fontSize: "1.1rem" }}>{countryCodeToFlag(c.code)}</span>
                                <span style={{ flex: 1 }}>{c.name}</span>
                                <span style={{ color: "#999", fontSize: "0.75rem" }}>{c.phone}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Country dropdown with emoji flags                                 */
/* ------------------------------------------------------------------ */

function CountrySelect({
    value,
    onChange,
    error,
}: {
    value: string;
    onChange: (code: string) => void;
    error?: string;
}) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [focused, setFocused] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const selected = useMemo(() => countries.find((c) => c.code === value), [value]);
    const flag = countryCodeToFlag(value);

    const filtered = useMemo(() => {
        if (!search) return countries;
        const q = search.toLowerCase();
        return countries.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q) ||
                c.phone.includes(q)
        );
    }, [search]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }} ref={ref}>
            <label style={labelStyle}>
                Country <span style={{ color: "#ec4899", marginLeft: "3px" }}>*</span>
            </label>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                    ...inputBase,
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    justifyContent: "space-between",
                    ...(focused ? inputFocus : {}),
                    ...(error ? { borderColor: "#E53E3E" } : {}),
                }}
            >
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {flag && <span style={{ fontSize: "1.3rem", lineHeight: 1 }}>{flag}</span>}
                    <span>{selected ? selected.name : "Select a country..."}</span>
                </span>
                <span style={{ fontSize: "0.7rem", color: "#999", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
            </button>
            {error && <span style={errorStyle}>{error}</span>}

            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        right: 0,
                        maxHeight: "300px",
                        overflowY: "auto",
                        backgroundColor: "#fff",
                        border: "1px solid rgba(17,17,17,0.12)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        zIndex: 100,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <div style={{ padding: "0.5rem", borderBottom: "1px solid rgba(17,17,17,0.06)", position: "sticky", top: 0, backgroundColor: "#fff", zIndex: 1 }}>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search countries..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ ...inputBase, padding: "0.6rem 0.8rem", fontSize: "0.85rem", borderColor: "rgba(17,17,17,0.1)" }}
                        />
                    </div>
                    <div style={{ overflowY: "auto", flex: 1 }}>
                        {filtered.length === 0 ? (
                            <div style={{ padding: "1rem", textAlign: "center", color: "#999", fontSize: "0.85rem" }}>
                                No countries found
                            </div>
                        ) : (
                            filtered.map((c: Country) => (
                                <button
                                    key={c.code}
                                    type="button"
                                    onClick={() => { onChange(c.code); setOpen(false); setSearch(""); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "0.6rem",
                                        width: "100%",
                                        padding: "0.55rem 1rem",
                                        border: "none",
                                        background: c.code === value ? "rgba(236,72,153,0.06)" : "transparent",
                                        cursor: "pointer",
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.85rem",
                                        textAlign: "left",
                                        transition: "background-color 0.1s",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(236,72,153,0.06)")}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = c.code === value ? "rgba(236,72,153,0.06)" : "transparent")}
                                >
                                    <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>{countryCodeToFlag(c.code)}</span>
                                    <span style={{ flex: 1 }}>{c.name}</span>
                                    <span style={{ color: "#999", fontSize: "0.75rem" }}>{c.code}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Address input with new Places API autocomplete                    */
/* ------------------------------------------------------------------ */

function AddressInput({
    label,
    value,
    onChange,
    onPlaceSelect,
    countryCode,
    error,
    required,
    valid,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onPlaceSelect: (place: { address: string; city: string; state: string; postalCode: string; countryCode: string }) => void;
    countryCode: string;
    error?: string;
    required?: boolean;
    valid?: boolean;
    placeholder?: string;
}) {
    const [focused, setFocused] = useState(false);
    const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasApiKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const showCheck = valid && !error && !loading && !focused;

    // Load Google Maps script
    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (!apiKey || typeof window === "undefined") return;
        if (window._googlePlacesLoaded || document.getElementById("google-places-script")) return;

        const script = document.createElement("script");
        script.id = "google-places-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
        script.async = true;
        script.defer = true;
        script.onload = () => { window._googlePlacesLoaded = true; };
        document.head.appendChild(script);
    }, []);

    // Close dropdown on outside click
    useEffect(() => {
        if (!showDropdown) return;
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showDropdown]);

    // Fetch suggestions from new Places API
    const fetchSuggestions = useCallback(async (input: string) => {
        if (!input || input.length < 3) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        // Wait for Google Maps to load
        if (!window.google?.maps) return;

        try {
            setLoading(true);
            const { AutocompleteSuggestion } = await window.google.maps.importLibrary("places");

            const request: any = {
                input,
                // Use precise address types instead of "geocode" for better
                // street-level results; omit language so the API accepts
                // both Cyrillic and Latin transliterations
                includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
            };

            if (countryCode) {
                request.includedRegionCodes = [countryCode.toLowerCase()];
            }

            const { suggestions: results } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
            setSuggestions(results || []);
            setShowDropdown((results || []).length > 0);
        } catch (err) {
            console.error("Places autocomplete error:", err);
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    }, [countryCode]);

    // Debounced input handler
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(e);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSuggestions(e.target.value), 300);
    };

    // Handle place selection
    const handleSelect = useCallback(async (suggestion: PlaceSuggestion) => {
        try {
            const place = suggestion.placePrediction.toPlace();
            await place.fetchFields({ fields: ["addressComponents", "formattedAddress"] });

            const components = place.addressComponents || [];
            let streetNumber = "";
            let route = "";
            let city = "";
            let state = "";
            let postalCode = "";
            let placeCountry = "";

            for (const comp of components) {
                const types: string[] = comp.types || [];
                if (types.includes("street_number")) streetNumber = comp.longText || comp.long_name || "";
                else if (types.includes("route")) route = comp.longText || comp.long_name || "";
                else if (types.includes("locality")) city = comp.longText || comp.long_name || "";
                else if (types.includes("postal_town") && !city) city = comp.longText || comp.long_name || "";
                else if (types.includes("sublocality_level_1") && !city) city = comp.longText || comp.long_name || "";
                else if (types.includes("administrative_area_level_1")) state = comp.longText || comp.long_name || "";
                else if (types.includes("postal_code")) postalCode = comp.longText || comp.long_name || "";
                else if (types.includes("country")) placeCountry = comp.shortText || comp.short_name || "";
            }

            const address = [route, streetNumber].filter(Boolean).join(", ");
            onPlaceSelect({ address, city, state, postalCode, countryCode: placeCountry });
        } catch (err) {
            console.error("Place fetch error:", err);
        }
        setShowDropdown(false);
        setSuggestions([]);
    }, [onPlaceSelect]);

    return (
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }} ref={containerRef}>
            <label style={labelStyle}>
                {label}
                {required && <span style={{ color: "#ec4899", marginLeft: "3px" }}>*</span>}
                {hasApiKey && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.6rem", color: "#999", fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>
                        ✨ Powered by Google
                    </span>
                )}
            </label>
            <div style={{ position: "relative" }}>
                <input
                    ref={inputRef}
                    type="text"
                    name="addressLine1"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={() => { setFocused(true); if (suggestions.length > 0) setShowDropdown(true); }}
                    onBlur={() => setFocused(false)}
                    required={required}
                    placeholder={placeholder}
                    autoComplete="off"
                    style={{
                        ...inputBase,
                        ...(focused ? inputFocus : {}),
                        ...(error ? { borderColor: "#E53E3E" } : {}),
                        ...(showCheck ? { borderColor: "#22c55e", paddingRight: "2.5rem" } : {}),
                    }}
                />
                {loading && (
                    <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "0.75rem", color: "#bbb" }}>
                        ⏳
                    </span>
                )}
                {showCheck && !loading && (
                    <span style={validCheckStyle}>✓</span>
                )}
            </div>
            {error && <span style={errorStyle}>{error}</span>}

            {/* Suggestions dropdown */}
            {showDropdown && suggestions.length > 0 && (
                <div style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    backgroundColor: "#fff",
                    borderWidth: "1px",
                    borderStyle: "solid",
                    borderColor: "rgba(17,17,17,0.12)",
                    borderRadius: "8px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    zIndex: 100,
                    overflow: "hidden",
                    maxHeight: "280px",
                    overflowY: "auto",
                }}>
                    {suggestions.map((s, i) => {
                        const main = s.placePrediction.structuredFormat?.mainText?.text || s.placePrediction.text?.text || "";
                        const secondary = s.placePrediction.structuredFormat?.secondaryText?.text || "";
                        return (
                            <button
                                key={i}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.1rem",
                                    width: "100%",
                                    padding: "0.65rem 1rem",
                                    border: "none",
                                    borderBottom: i < suggestions.length - 1 ? "1px solid rgba(17,17,17,0.04)" : "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    fontFamily: "var(--font-sans)",
                                    transition: "background-color 0.1s",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(236,72,153,0.06)")}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                            >
                                <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#111" }}>{main}</span>
                                {secondary && <span style={{ fontSize: "0.72rem", color: "#888" }}>{secondary}</span>}
                            </button>
                        );
                    })}
                    <div style={{ padding: "0.4rem 1rem", borderTop: "1px solid rgba(17,17,17,0.04)", textAlign: "right" }}>
                        <span style={{ fontSize: "0.6rem", color: "#bbb" }}>Powered by Google</span>
                    </div>
                </div>
            )}
        </div>
    );}


/* ------------------------------------------------------------------ */
/*  Main Checkout Component                                           */
/* ------------------------------------------------------------------ */

export default function CheckoutPage() {
    const { items, cartTotal, clearCart } = useCart();
    const { convertPrice, rates } = usePreferences();
    const { user, refreshUser } = useUser();

    // --- Form state ---
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        firstName: "",
        lastName: "",
        phone: "",
        email: "",
        // Shipping
        countryCode: "",
        state: "",
        city: "",
        addressLine1: "",
        addressLine2: "",
        postalCode: "",
        deliveryPhone: "",
        deliveryNotes: "",
        // Misc
        newsletter: "yes",
        discovery: "",
        promoCode: "",
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [promoApplied, setPromoApplied] = useState(false);
    const [promoMessage, setPromoMessage] = useState({ text: "", isError: false });
    const formRef = useRef<HTMLDivElement>(null);

    // Detect country on mount
    useEffect(() => {
        const code = detectUserCountry();
        setFormData((prev) => ({ ...prev, countryCode: prev.countryCode || code }));
    }, []);

    // Pre-fill from Google auth
    useEffect(() => {
        if (user) {
            const [first, ...rest] = (user.username || "").split(" ");
            setFormData((prev) => ({
                ...prev,
                firstName: prev.firstName || first || "",
                lastName: prev.lastName || rest.join(" ") || "",
                email: prev.email || user.email || "",
            }));
        }
    }, [user, user?.username, user?.email]);

    const handleGoogleSuccess = async (credentialResponse: any) => {
        try {
            const res = await fetch(`${getApiUrl()}/auth/google`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: credentialResponse.credential }),
                credentials: "include",
            });
            if (res.ok) await refreshUser();
        } catch (err) {
            console.error("Google Auth failed:", err);
        }
    };

    /* ---- Country-aware labels ---- */
    const selectedCountry = useMemo(() => countries.find((c) => c.code === formData.countryCode), [formData.countryCode]);
    const stateLabel = getStateLabel(formData.countryCode);
    const postalLabel = getPostalLabel(formData.countryCode);

    /* ---- Single-field validation helper ---- */
    const validateField = useCallback((name: string, data: typeof formData): string => {
        const v = (data as any)[name] as string;
        switch (name) {
            case "firstName":
                if (!v.trim()) return "First name is required";
                return "";
            case "lastName":
                if (!v.trim()) return "Last name is required";
                return "";
            case "email":
                if (!v.trim()) return "Email is required";
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return "Enter a valid email address";
                return "";
            case "phone":
                if (!v.trim()) return "Phone number is required";
                if (v.replace(/\D/g, "").length < 7) return "Enter a valid phone number (min 7 digits)";
                return "";
            case "countryCode":
                if (!v) return "Please select a country";
                return "";
            case "city":
                if (!v.trim()) return "City is required";
                return "";
            case "addressLine1":
                if (!v.trim()) return "Street address is required";
                return "";
            case "postalCode":
                if (!v.trim()) return `${postalLabel} is required`;
                if (v.trim().length < 3) return `${postalLabel} is too short`;
                return "";
            default:
                return "";
        }
    }, [postalLabel]);

    /* ---- Mark field as touched and validate on blur ---- */
    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name } = e.target;
        setTouched((prev) => ({ ...prev, [name]: true }));
        setFormData((f) => {
            const err = validateField(name, f);
            setErrors((prev) => ({ ...prev, [name]: err }));
            return f;
        });
    }, [validateField]);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            const next = { ...prev, [name]: value };
            // Re-validate already touched fields on every keystroke
            if (touched[name]) {
                const err = validateField(name, next);
                setErrors((p) => ({ ...p, [name]: err }));
            } else if (errors[name]) {
                // Legacy: clear error if field was flagged but not yet in touched mode
                setErrors((p) => ({ ...p, [name]: "" }));
            }
            return next;
        });
    };

    /* ---- Track country code changes (no phone auto-fill — prefix is shown in PhoneInput) ---- */
    const prevCountryRef = useRef(formData.countryCode);
    useEffect(() => {
        if (formData.countryCode && formData.countryCode !== prevCountryRef.current) {
            prevCountryRef.current = formData.countryCode;
        }
    }, [formData.countryCode]);

    /* ---- Google Places address auto-fill ---- */
    const handlePlaceSelect = useCallback(
        (place: { address: string; city: string; state: string; postalCode: string; countryCode: string }) => {
            setFormData((prev) => ({
                ...prev,
                addressLine1: place.address || prev.addressLine1,
                city: place.city || prev.city,
                state: place.state || prev.state,
                postalCode: place.postalCode || prev.postalCode,
                countryCode: place.countryCode || prev.countryCode,
            }));
            // Clear related errors
            setErrors((prev) => ({
                ...prev,
                addressLine1: "",
                city: "",
                postalCode: "",
                countryCode: "",
            }));
        },
        []
    );

    /* ---- Step 1 validation ---- */
    const requiredFields = ["firstName", "lastName", "email", "phone", "countryCode", "city", "addressLine1", "postalCode"];

    const validateStep1 = (): boolean => {
        // Mark all required fields as touched
        const allTouched: Record<string, boolean> = {};
        requiredFields.forEach((f) => { allTouched[f] = true; });
        setTouched((prev) => ({ ...prev, ...allTouched }));

        // Validate every required field
        const errs: Record<string, string> = {};
        requiredFields.forEach((f) => {
            const err = validateField(f, formData);
            if (err) errs[f] = err;
        });
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const goToStep2 = () => {
        if (validateStep1()) {
            setStep(2);
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            // Scroll to first error field
            requestAnimationFrame(() => {
                const firstErr = formRef.current?.querySelector('[data-error="true"]') as HTMLElement | null;
                firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
    };

    /* ---- Promo logic ---- */
    const printTotal = items.filter((i) => i.type === "print").reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmount = promoApplied ? Math.round(printTotal * 0.1) : 0;
    const currentTotal = cartTotal - discountAmount;

    const applyPromo = () => {
        if (formData.promoCode.toUpperCase() === "ART10") {
            setPromoApplied(true);
            setPromoMessage({ text: "10% discount applied to prints!", isError: false });
        } else {
            setPromoMessage({ text: "Invalid promo code.", isError: true });
        }
    };

    /* ---- Submit: Create order → Monobank payment ---- */
    const handleSubmit = async () => {
        setIsSubmitting(true);
        setSubmitError("");

        try {
            const country = countries.find((c) => c.code === formData.countryCode);

            const orderRequest = {
                first_name: formData.firstName.trim(),
                last_name: formData.lastName.trim(),
                email: formData.email.trim(),
                phone: formData.phone.trim(),
                shipping_country: country?.name || formData.countryCode,
                shipping_country_code: formData.countryCode,
                shipping_state: formData.state.trim() || null,
                shipping_city: formData.city.trim(),
                shipping_address_line1: formData.addressLine1.trim(),
                shipping_address_line2: formData.addressLine2.trim() || null,
                shipping_postal_code: formData.postalCode.trim(),
                shipping_phone: formData.deliveryPhone.trim() || null,
                shipping_notes: formData.deliveryNotes.trim() || null,
                newsletter_opt_in: formData.newsletter === "yes",
                discovery_source: formData.discovery || null,
                promo_code: promoApplied ? formData.promoCode : null,
                items: items.map((item) => ({
                    artwork_id: parseInt(item.slug) || 1,
                    edition_type: item.type === "original" ? "original" : (item.finish?.toLowerCase().includes("canvas") ? "canvas_print" : "paper_print"),
                    finish: item.finish || "Original",
                    size: item.size,
                    price: item.price,
                    prodigi_sku: item.prodigi_sku,
                    prodigi_attributes: item.prodigi_attributes,
                    prodigi_shipping_method: item.prodigi_shipping_method,
                    prodigi_wholesale_eur: item.prodigi_wholesale_eur,
                    prodigi_shipping_eur: item.prodigi_shipping_eur,
                    prodigi_retail_eur: item.prodigi_retail_eur,
                })),
            };

            const orderRes = await apiFetch(`${getApiUrl()}/orders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(orderRequest),
            });

            if (!orderRes.ok) {
                const errData = await orderRes.json();
                setSubmitError(errData.detail || "Failed to create order. Please try again.");
                return;
            }

            const orderData = await orderRes.json();
            const orderId = orderData.data?.id;

            if (!orderId) {
                setSubmitError("Order created but no ID returned. Please contact support.");
                return;
            }

            // Convert USD total to UAH kopiykas for Monobank
            const uahRate = rates?.UAH || 39.5;
            const totalUahCoins = Math.round(currentTotal * uahRate * 100);

            const paymentRes = await apiFetch(`${getApiUrl()}/payments/create`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: orderId, currency: "UAH", amount_coins: totalUahCoins }),
            });

            if (!paymentRes.ok) {
                const errData = await paymentRes.json();
                setSubmitError(errData.detail || "Payment initiation failed. Please try again.");
                return;
            }

            const paymentData = await paymentRes.json();
            clearCart();
            window.location.href = paymentData.payment_url;
        } catch {
            setSubmitError("Connection error. Please check your internet and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ---- Empty cart view ---- */
    if (items.length === 0) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
                <div>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", marginBottom: "1rem", fontStyle: "italic" }}>Your cart is empty</h2>
                    <Link href="/shop" style={{ color: "#ec4899", textDecoration: "underline", fontFamily: "var(--font-sans)" }}>
                        Back to Shop
                    </Link>
                </div>
            </div>
        );
    }

    /* ================================================================ */
    /*  RENDER                                                          */
    /* ================================================================ */

    return (
        <div style={{ minHeight: "100vh", padding: "2rem 1rem 4rem" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>

                {/* ── Progress Bar ── */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "3rem", marginTop: "1rem" }}>
                    <StepIndicator num={1} label="Information" active={step === 1} done={step > 1} onClick={() => setStep(1)} />
                    <div style={{ width: "60px", height: "2px", backgroundColor: step > 1 ? "#ec4899" : "rgba(17,17,17,0.1)", borderRadius: "1px", transition: "background-color 0.3s" }} />
                    <StepIndicator num={2} label="Review & Pay" active={step === 2} done={false} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "3rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "4rem" }} className="checkout-grid">

                        {/* ════════ LEFT COLUMN ════════ */}
                        <div>
                            {step === 1 && (
                                <div ref={formRef} style={{ display: "flex", flexDirection: "column", gap: "2.5rem", animation: "fadeIn 0.3s ease" }}>

                                    {/* Google Auth */}
                                    {!user && (
                                        <div style={{
                                            background: "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                                            padding: "1.5rem 2rem",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(236,72,153,0.12)",
                                            textAlign: "center",
                                        }}>
                                            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "0.75rem", color: "#666" }}>
                                                Quick Checkout
                                            </h2>
                                            <div style={{ display: "flex", justifyContent: "center" }}>
                                                <GoogleLogin
                                                    onSuccess={handleGoogleSuccess}
                                                    onError={() => console.log("Login Failed")}
                                                    theme="outline"
                                                    size="large"
                                                    text="signin_with"
                                                />
                                            </div>
                                            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#999" }}>
                                                Sign in to auto-fill your details
                                            </p>
                                        </div>
                                    )}

                                    {user && (
                                        <div style={{
                                            background: "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                                            padding: "1rem 1.5rem",
                                            borderRadius: "12px",
                                            border: "1px solid rgba(236,72,153,0.12)",
                                            fontSize: "0.85rem",
                                        }}>
                                            <p style={{ color: "#555" }}>
                                                ✓ Signed in as <strong>{user.email}</strong>
                                            </p>
                                        </div>
                                    )}

                                    {/* ---- Contact Info ---- */}
                                    <div>
                                        <h2 style={sectionTitle}>Contact Information</h2>
                                        <div className="checkout-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                            <SmartInput label="First Name" name="firstName" required placeholder="John" value={formData.firstName} onChange={handleInput} onBlur={handleBlur} error={touched.firstName ? errors.firstName : undefined} valid={formData.firstName.trim().length >= 1 && !errors.firstName} data-error={!!(touched.firstName && errors.firstName)} />
                                            <SmartInput label="Last Name" name="lastName" required placeholder="Doe" value={formData.lastName} onChange={handleInput} onBlur={handleBlur} error={touched.lastName ? errors.lastName : undefined} valid={formData.lastName.trim().length >= 1 && !errors.lastName} data-error={!!(touched.lastName && errors.lastName)} />
                                            <SmartInput label="Email" name="email" type="email" required placeholder="john@example.com" value={formData.email} onChange={handleInput} onBlur={handleBlur} error={touched.email ? errors.email : undefined} valid={/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email.trim()) && !errors.email} data-error={!!(touched.email && errors.email)} />
                                            <PhoneInput
                                                label="Phone"
                                                required
                                                value={formData.phone}
                                                onChange={(val) => {
                                                    setFormData((prev) => {
                                                        const next = { ...prev, phone: val };
                                                        if (touched.phone) {
                                                            const err = validateField("phone", next);
                                                            setErrors((p) => ({ ...p, phone: err }));
                                                        } else if (errors.phone) {
                                                            setErrors((p) => ({ ...p, phone: "" }));
                                                        }
                                                        return next;
                                                    });
                                                }}
                                                countryCode={formData.countryCode}
                                                onChangeCountry={(code) => {
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        countryCode: code,
                                                    }));
                                                }}
                                                error={touched.phone ? errors.phone : undefined}
                                                placeholder="Phone number"
                                            />
                                        </div>
                                    </div>

                                    {/* ---- Shipping Address ---- */}
                                    <div>
                                        <h2 style={sectionTitle}>Shipping Address</h2>
                                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                            <CountrySelect
                                                value={formData.countryCode}
                                                onChange={(code) => {
                                                    setFormData((prev) => ({ ...prev, countryCode: code }));
                                                    setTouched((prev) => ({ ...prev, countryCode: true }));
                                                    setErrors((prev) => ({ ...prev, countryCode: "" }));
                                                }}
                                                error={touched.countryCode ? errors.countryCode : undefined}
                                            />
                                            <AddressInput
                                                label="Address Line 1"
                                                value={formData.addressLine1}
                                                onChange={handleInput}
                                                onPlaceSelect={(place) => {
                                                    handlePlaceSelect(place);
                                                    // Mark auto-filled fields as touched & valid
                                                    setTouched((prev) => ({ ...prev, addressLine1: true, city: true, postalCode: true, countryCode: true }));
                                                }}
                                                countryCode={formData.countryCode}
                                                required
                                                placeholder="Start typing your address..."
                                                error={touched.addressLine1 ? errors.addressLine1 : undefined}
                                                valid={formData.addressLine1.length > 5 && !errors.addressLine1}
                                            />
                                            <SmartInput
                                                label="Address Line 2"
                                                name="addressLine2"
                                                placeholder="Apartment, suite, unit, floor (optional)"
                                                value={formData.addressLine2}
                                                onChange={handleInput}
                                                valid={formData.addressLine2.length > 0}
                                            />
                                            <div className="checkout-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                                <SmartInput label="City" name="city" required placeholder="City / Town" value={formData.city} onChange={handleInput} onBlur={handleBlur} error={touched.city ? errors.city : undefined} valid={formData.city.length > 1 && !errors.city} data-error={!!(touched.city && errors.city)} />
                                                <SmartInput label={stateLabel} name="state" placeholder={stateLabel} value={formData.state} onChange={handleInput} valid={formData.state.length > 1} />
                                            </div>
                                            <div className="checkout-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                                <SmartInput label={postalLabel} name="postalCode" required placeholder={postalLabel} value={formData.postalCode} onChange={handleInput} onBlur={handleBlur} error={touched.postalCode ? errors.postalCode : undefined} valid={formData.postalCode.length > 2 && !errors.postalCode} data-error={!!(touched.postalCode && errors.postalCode)} />
                                                <SmartInput label="Delivery Phone" name="deliveryPhone" type="tel" placeholder="If different from contact" value={formData.deliveryPhone} onChange={handleInput} valid={formData.deliveryPhone.length > 5} />
                                            </div>
                                            <div style={{ display: "flex", flexDirection: "column" }}>
                                                <label style={labelStyle}>Delivery Notes</label>
                                                <textarea
                                                    name="deliveryNotes"
                                                    placeholder="Gate code, building entrance, special instructions... (optional)"
                                                    value={formData.deliveryNotes}
                                                    onChange={handleInput}
                                                    rows={3}
                                                    style={{ ...inputBase, resize: "vertical", minHeight: "80px" }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ---- Newsletter ---- */}
                                    <div style={{
                                        background: "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                                        padding: "1.5rem 2rem",
                                        borderRadius: "12px",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: "0.75rem",
                                    }}>
                                        <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.05rem", fontStyle: "italic", color: "var(--color-charcoal)" }}>
                                            Sign up for the email newsletter?
                                        </span>
                                        <div style={{ display: "flex", gap: "2rem" }}>
                                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                                <input type="radio" name="newsletter" value="yes" checked={formData.newsletter === "yes"} onChange={handleInput} /> Yes
                                            </label>
                                            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }}>
                                                <input type="radio" name="newsletter" value="no" checked={formData.newsletter === "no"} onChange={handleInput} /> No
                                            </label>
                                        </div>
                                    </div>

                                    {/* ---- Discovery ---- */}
                                    <SmartInput label="How did you discover us?" name="discovery" placeholder="Instagram, Google, friend, gallery..." value={formData.discovery} onChange={handleInput} />

                                    {/* ---- Continue Button ---- */}
                                    <button type="button" onClick={goToStep2} className="premium-cta-btn" style={{ width: "100%", padding: "1rem", fontSize: "1rem" }}>
                                        Continue to Review →
                                    </button>
                                </div>
                            )}

                            {step === 2 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "2rem", animation: "fadeIn 0.3s ease" }}>

                                    {/* ---- Shipping Summary ---- */}
                                    <div>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                                            <h2 style={sectionTitle}>Shipping To</h2>
                                            <button type="button" onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "#ec4899", fontFamily: "var(--font-sans)", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline", padding: "0.25rem" }}>
                                                Change
                                            </button>
                                        </div>
                                        <div style={{
                                            background: "#FAFAF8",
                                            border: "1px solid rgba(17,17,17,0.08)",
                                            borderRadius: "12px",
                                            padding: "1.5rem",
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.9rem",
                                            lineHeight: 1.7,
                                            color: "#444",
                                        }}>
                                            <p style={{ fontWeight: 600, color: "#111", marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                                {formData.firstName} {formData.lastName}
                                                {formData.countryCode && (
                                                    <span style={{ fontSize: "1.1rem" }}>{countryCodeToFlag(formData.countryCode)}</span>
                                                )}
                                            </p>
                                            <p>{formData.addressLine1}</p>
                                            {formData.addressLine2 && <p>{formData.addressLine2}</p>}
                                            <p>
                                                {formData.city}{formData.state ? `, ${formData.state}` : ""} {formData.postalCode}
                                            </p>
                                            <p>{selectedCountry?.name || formData.countryCode}</p>
                                            <p style={{ color: "#888", marginTop: "0.5rem" }}>
                                                {formData.email} · {formData.phone}
                                            </p>
                                            {formData.deliveryNotes && (
                                                <p style={{ marginTop: "0.5rem", fontStyle: "italic", color: "#888" }}>
                                                    📝 {formData.deliveryNotes}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* ---- Promo Code ---- */}
                                    <div>
                                        <h2 style={sectionTitle}>Promo Code</h2>
                                        <div style={{ display: "flex", gap: "0.5rem" }}>
                                            <input type="text" name="promoCode" placeholder="Enter code" value={formData.promoCode} onChange={handleInput} style={{ ...inputBase, flex: 1 }} />
                                            <button type="button" onClick={applyPromo} className="premium-cta-btn" style={{ padding: "0.85rem 1.5rem", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                                                Apply
                                            </button>
                                        </div>
                                        {promoMessage.text && (
                                            <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", marginTop: "0.5rem", color: promoMessage.isError ? "#E53E3E" : "#38A169", fontWeight: 500 }}>
                                                {promoMessage.text}
                                            </p>
                                        )}
                                    </div>

                                    {/* ---- Submit Error ---- */}
                                    {submitError && (
                                        <div style={{ background: "rgba(229,62,62,0.06)", border: "1px solid rgba(229,62,62,0.2)", borderRadius: "8px", padding: "1rem 1.5rem", color: "#C53030", fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}>
                                            ⚠ {submitError}
                                        </div>
                                    )}

                                    {/* ---- Pay Button ---- */}
                                    <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="premium-cta-btn" style={{ width: "100%", padding: "1.1rem", fontSize: "1.05rem" }}>
                                        {isSubmitting ? "Processing..." : <>Pay <span className="font-price">{convertPrice(currentTotal)}</span></>}
                                    </button>

                                    {/* ---- Payment Method Badges ---- */}
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
                                        <span style={{ fontSize: "0.65rem", color: "#aaa", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.06em" }}>We accept</span>
                                        {/* Visa */}
                                        <svg width="34" height="22" viewBox="0 0 34 22" fill="none" style={{ opacity: 0.5 }}>
                                            <rect width="34" height="22" rx="4" fill="#1A1F71"/>
                                            <text x="17" y="14" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="Arial">VISA</text>
                                        </svg>
                                        {/* Mastercard */}
                                        <svg width="34" height="22" viewBox="0 0 34 22" fill="none" style={{ opacity: 0.5 }}>
                                            <rect width="34" height="22" rx="4" fill="#252525"/>
                                            <circle cx="14" cy="11" r="6" fill="#EB001B" opacity="0.9"/>
                                            <circle cx="20" cy="11" r="6" fill="#F79E1B" opacity="0.9"/>
                                        </svg>
                                        {/* Google Pay */}
                                        <svg width="38" height="22" viewBox="0 0 38 22" fill="none" style={{ opacity: 0.5 }}>
                                            <rect width="38" height="22" rx="4" fill="#fff" stroke="#ddd" strokeWidth="0.5"/>
                                            <text x="19" y="13.5" textAnchor="middle" fill="#5F6368" fontSize="7" fontWeight="600" fontFamily="Arial">G Pay</text>
                                        </svg>
                                        {/* Apple Pay */}
                                        <svg width="38" height="22" viewBox="0 0 38 22" fill="none" style={{ opacity: 0.5 }}>
                                            <rect width="38" height="22" rx="4" fill="#000"/>
                                            <text x="19" y="13.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="600" fontFamily="Arial"> Pay</text>
                                        </svg>
                                    </div>

                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", color: "#999", textAlign: "center", lineHeight: 1.5 }}>
                                        You will be redirected to a secure Monobank payment page.
                                        Your financial information is never stored on our servers.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ════════ RIGHT COLUMN: Order Summary ════════ */}
                        <div className="checkout-summary" style={{ position: "relative" }}>
                            <div style={{
                                position: "sticky",
                                top: "2rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "1.5rem",
                                background: "#FAFAF8",
                                borderRadius: "16px",
                                border: "1px solid rgba(17,17,17,0.06)",
                                padding: "2rem",
                            }}>
                                <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.3rem", fontWeight: 500, fontStyle: "italic" }}>
                                    Order Summary
                                </h2>

                                <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                                    {items.map((item) => {
                                        const isPrint = item.type === "print";
                                        const isDiscounted = promoApplied && isPrint;
                                        const discountedPrice = isDiscounted ? Math.round(item.price * 0.9) : item.price;

                                        return (
                                            <div key={item.id} style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                                                <div style={{
                                                    width: "64px", height: "64px", borderRadius: "8px",
                                                    background: item.imageUrl ? "none" : `linear-gradient(160deg, ${item.imageGradientFrom}, ${item.imageGradientTo})`,
                                                    flexShrink: 0, overflow: "hidden",
                                                }}>
                                                    {item.imageUrl && <img src={item.imageUrl} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontStyle: "italic", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {item.title}
                                                    </p>
                                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#999", margin: "0.15rem 0 0", textTransform: "capitalize" }}>
                                                        {item.type === "original" ? "Original painting" : "Fine Art Print"}
                                                        {item.size ? ` · ${item.size}` : ""}
                                                        {item.finish ? ` · ${item.finish}` : ""}
                                                    </p>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.3rem" }}>
                                                        {isDiscounted ? (
                                                            <>
                                                                <span className="font-price" style={{ fontSize: "0.9rem", fontWeight: 700, color: "#ec4899" }}>{convertPrice(discountedPrice)}</span>
                                                                <span className="font-price" style={{ fontSize: "0.8rem", color: "#999", textDecoration: "line-through" }}>{convertPrice(item.price)}</span>
                                                            </>
                                                        ) : (
                                                            <span className="font-price" style={{ fontSize: "0.9rem", fontWeight: 600 }}>{convertPrice(item.price)}</span>
                                                        )}
                                                        {item.quantity > 1 && <span style={{ fontSize: "0.75rem", color: "#999" }}>× {item.quantity}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(17,17,17,0.06)", paddingTop: "1rem" }}>
                                    <Link href="/gallery" style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "#ec4899", textDecoration: "underline" }}>
                                        Continue Shopping
                                    </Link>
                                </div>

                                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", borderTop: "1px solid rgba(17,17,17,0.06)", paddingTop: "1rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}>
                                        <span style={{ color: "#888" }}>Subtotal</span>
                                        <span className="font-price" style={{ fontWeight: 600, fontSize: "0.95rem", textDecoration: promoApplied ? "line-through" : "none" }}>{convertPrice(cartTotal)}</span>
                                    </div>
                                    {promoApplied && (
                                        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "#ec4899" }}>
                                            <span>Discount (10% prints)</span>
                                            <span className="font-price" style={{ fontWeight: 600, fontSize: "0.95rem" }}>−{convertPrice(discountAmount)}</span>
                                        </div>
                                    )}
                                    <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "0.85rem" }}>
                                        <span style={{ color: "#888" }}>Shipping</span>
                                        <span style={{ fontWeight: 600, color: "#38A169" }}>FREE</span>
                                    </div>
                                    <div style={{
                                        display: "flex", justifyContent: "space-between", fontFamily: "var(--font-sans)", fontSize: "1.1rem",
                                        borderTop: "1px solid rgba(17,17,17,0.08)", paddingTop: "0.75rem", marginTop: "0.25rem",
                                    }}>
                                        <span style={{ fontWeight: 500 }}>Total</span>
                                        <span className="font-price" style={{ fontWeight: 700, fontSize: "1.2rem" }}>{convertPrice(currentTotal)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .checkout-grid {
                        grid-template-columns: 1fr !important;
                        gap: 2rem !important;
                    }
                    .checkout-summary {
                        order: -1;
                    }
                }
                @media (max-width: 480px) {
                    .checkout-two-col {
                        grid-template-columns: 1fr !important;
                    }
                }
                /* Override Google Places Autocomplete dropdown styling */
                .pac-container {
                    border-radius: 8px !important;
                    border: 1px solid rgba(17,17,17,0.12) !important;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
                    font-family: var(--font-sans) !important;
                    margin-top: 4px !important;
                }
                .pac-item {
                    padding: 8px 12px !important;
                    font-size: 0.85rem !important;
                    cursor: pointer !important;
                    border-top: 1px solid rgba(17,17,17,0.04) !important;
                }
                .pac-item:hover {
                    background-color: rgba(236,72,153,0.06) !important;
                }
                .pac-item-query {
                    font-size: 0.85rem !important;
                    color: #111 !important;
                }
                .pac-matched {
                    font-weight: 600 !important;
                }
                .pac-icon {
                    display: none !important;
                }
            `}</style>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Step indicator dot                                                */
/* ------------------------------------------------------------------ */

function StepIndicator({
    num, label, active, done, onClick,
}: {
    num: number; label: string; active: boolean; done: boolean; onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                background: "none", border: "none",
                cursor: onClick ? "pointer" : "default", padding: "0.25rem",
            }}
        >
            <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 700,
                transition: "all 0.3s",
                ...(active
                    ? { background: "linear-gradient(135deg, #ec4899, #fb923c)", color: "#fff" }
                    : done
                    ? { background: "#ec4899", color: "#fff" }
                    : { background: "rgba(17,17,17,0.06)", color: "#999" }),
            }}>
                {done ? "✓" : num}
            </div>
            <span style={{
                fontFamily: "var(--font-sans)", fontSize: "0.8rem",
                fontWeight: active ? 600 : 400, color: active ? "#111" : "#999",
                transition: "color 0.3s",
            }}>
                {label}
            </span>
        </button>
    );
}
