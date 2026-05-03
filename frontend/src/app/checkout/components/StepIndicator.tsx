"use client";

import React from "react";

export function StepIndicator({
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
