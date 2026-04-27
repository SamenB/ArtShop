"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    type Language,
    type Currency,
    type Units,
    LANGUAGE_LABELS,
    UNITS_LABELS,
} from "@/context/PreferencesContext";
import { SegmentedPill } from "./SegmentedPill";

const LOCAL_CURRENCY_LABELS: Record<Currency, string> = {
    USD: "USD",
    UAH: "UAH",
};

export function PreferencesDropdown({
    language, setLanguage,
    currency, setCurrency,
    units, setUnits,
}: {
    language: Language; setLanguage: (v: Language) => void;
    currency: Currency; setCurrency: (v: Currency) => void;
    units: Units; setUnits: (v: Units) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    background: "none", border: "none", cursor: "pointer",
                    color: open ? "#FFFFFF" : "rgba(244,244,244,0.6)",
                    padding: "4px",
                    transition: "color 0.2s ease"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#FFFFFF"; }}
                onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = "rgba(244,244,244,0.6)"; }}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: "clamp(16px, 10px + 0.56vw, 32px)", height: "auto" }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                <span style={{
                    fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif', fontSize: "clamp(0.9rem, 0.62rem + 0.45vw, 1.8rem)",
                    fontWeight: 400, letterSpacing: "0.05em", textTransform: "uppercase", lineHeight: 1
                }}>
                    {language}
                </span>
            </button>

            <div style={{
                position: "absolute", top: "100%", right: 0, marginTop: "8px",
                backgroundColor: "var(--color-cream)", border: "1px solid rgba(26,26,24,0.06)",
                borderRadius: "10px", padding: "12px",
                display: "flex", flexDirection: "column", gap: "10px",
                minWidth: "200px",
                boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(-8px)",
                pointerEvents: open ? "auto" : "none",
                transition: "opacity 0.2s cubic-bezier(0.4,0,0.2,1), transform 0.2s cubic-bezier(0.4,0,0.2,1)",
                zIndex: 100,
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {/* Language Section */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal-mid)",
                            fontWeight: 500,
                        }}>
                            Language
                        </span>
                        <SegmentedPill<Language> options={["en", "uk"]} labels={LANGUAGE_LABELS} value={language} onChange={setLanguage} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)", opacity: 0.3 }} />

                    {/* Currency Section */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal-mid)",
                            fontWeight: 500,
                        }}>
                            Currency
                        </span>
                        <SegmentedPill<Currency> options={["USD", "UAH"]} labels={LOCAL_CURRENCY_LABELS} value={currency} onChange={setCurrency} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)", opacity: 0.3 }} />

                    {/* Units Section */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal-mid)",
                            fontWeight: 500,
                        }}>
                            Measurement
                        </span>
                        {/* Ordered 'in' before 'cm' per user request */}
                        <SegmentedPill<Units> options={["in", "cm"]} labels={UNITS_LABELS} value={units} onChange={setUnits} />
                    </div>
                </div>
            </div>
        </div>
    );
}
