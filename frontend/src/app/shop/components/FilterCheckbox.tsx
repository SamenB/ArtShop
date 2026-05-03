"use client";

import React from "react";

export function FilterCheckbox({ label, active, onClick, isMobile }: { label: string; active: boolean; onClick: () => void; isMobile?: boolean }) {
    return (
        <label className="filter-item">
            <span
                className="filter-item-box"
                style={{
                    width: "15px", height: "15px", flexShrink: 0,
                    border: `1.5px solid ${active ? "#1a1a18" : "rgba(26,26,24,0.3)"}`,
                    borderRadius: "3px", backgroundColor: active ? "#1a1a18" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s, border-color 0.15s",
                }}
            >
                {active && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            <span
                className="filter-item-text"
                style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.85rem",
                    fontWeight: isMobile ? (active ? 500 : 400) : (active ? 600 : 500),
                    color: active ? "#1a1a18" : "#6a6a68",
                    transition: "color 0.15s",
                    lineHeight: 1.45
                }}
            >
                {label}
            </span>
            <input type="checkbox" checked={active} onChange={onClick} style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }} />
        </label>
    );
}
