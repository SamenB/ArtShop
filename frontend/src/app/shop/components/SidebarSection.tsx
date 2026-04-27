"use client";

import { useState } from "react";

export function SidebarSection({ title, children, defaultOpen = true, isMobile }: { title: string; children: React.ReactNode; defaultOpen?: boolean; isMobile?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
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
                }}>{title}</span>
                <svg className="filter-section-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transition: "transform 0.22s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M1 1L5 5L9 1" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
