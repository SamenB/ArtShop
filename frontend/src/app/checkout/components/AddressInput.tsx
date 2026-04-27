"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { PlaceSuggestion } from "../types";
import { errorStyle, inputBase, inputFocus, labelStyle, validCheckStyle } from "../styles";

export function AddressInput({
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
        if ((window as any)._googlePlacesLoaded || document.getElementById("google-places-script")) return;

        const script = document.createElement("script");
        script.id = "google-places-script";
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=Function.prototype`;
        script.async = true;
        script.defer = true;
        script.onload = () => { (window as any)._googlePlacesLoaded = true; };
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
        if (!(window as any).google?.maps) return;

        try {
            setLoading(true);
            const { AutocompleteSuggestion } = await (window as any).google.maps.importLibrary("places");

            const request: any = {
                input,
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
    );
}
