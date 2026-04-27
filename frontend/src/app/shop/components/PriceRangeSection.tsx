"use client";

import { useState } from "react";
import { FilterCheckbox } from "./FilterCheckbox";

export function PriceRangeSection({ min, max, onChange, isMobile }: { min: number; max: number; onChange: (min: number, max: number) => void; isMobile?: boolean }) {
    const [open, setOpen] = useState(false);
    const [localMin, setLocalMin] = useState(() => min);
    const [localMax, setLocalMax] = useState(() => max);

    const presets = [
        { label: "Any Price", min: 0, max: 999999 },
        { label: "Under $500", min: 0, max: 499 },
        { label: "$500–$1k", min: 500, max: 1000 },
        { label: "$1k–$2k", min: 1000, max: 2000 },
        { label: "Over $2k", min: 2001, max: 999999 },
    ];

    return (
        <div style={{ borderBottom: "1px solid rgba(26,26,24,0.09)" }}>
            <button
                onClick={() => setOpen(!open)}
                className="filter-section-btn"
            >
                <span className="filter-section-title" style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.7rem",
                    fontWeight: isMobile ? 600 : 750,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: "#1a1a18"
                }}>Price</span>
                <svg className="filter-section-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transition: "transform 0.22s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M1 1L5 5L9 1" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", backgroundColor: "rgba(26,26,24,0.05)", border: "1px solid rgba(26,26,24,0.1)", borderRadius: "4px", padding: "0.3rem 0.55rem", marginBottom: "0.55rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 400, color: "#555", fontStyle: "italic", letterSpacing: "0.01em" }}>Prices apply to originals only</span>
                        </div>
                        {presets.map(p => (
                            <FilterCheckbox
                                key={p.label}
                                label={p.label}
                                active={localMin === p.min && localMax === p.max}
                                onClick={() => { setLocalMin(p.min); setLocalMax(p.max); onChange(p.min, p.max); }}
                                isMobile={isMobile}
                            />
                        ))}
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", alignItems: "center" }}>
                            <input
                                type="number" placeholder="Min" value={localMin === 0 ? "" : localMin}
                                onChange={e => setLocalMin(Number(e.target.value) || 0)}
                                onBlur={() => onChange(localMin, localMax)}
                                style={{ width: "60px", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "3px", padding: "3px 6px", fontFamily: "var(--font-sans)", fontSize: "0.72rem", outline: "none" }}
                            />
                            <span style={{ color: "#aaa", fontSize: "0.7rem" }}>–</span>
                            <input
                                type="number" placeholder="Max" value={localMax >= 999999 ? "" : localMax}
                                onChange={e => setLocalMax(Number(e.target.value) || 999999)}
                                onBlur={() => onChange(localMin, localMax)}
                                style={{ width: "60px", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "3px", padding: "3px 6px", fontFamily: "var(--font-sans)", fontSize: "0.72rem", outline: "none" }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
