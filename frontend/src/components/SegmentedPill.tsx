"use client";

import React from "react";

export function SegmentedPill<T extends string>({
    options,
    labels,
    value,
    onChange,
}: {
    options: T[];
    labels: Record<T, React.ReactNode>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div style={{
            display: "inline-flex",
            backgroundColor: "rgba(0,0,0,0.05)",
            borderRadius: "6px",
            padding: "2px",
            width: "90px",
        }}>
            {options.map((opt) => {
                const active = opt === value;
                return (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        style={{
                            flex: 1,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: "2px 0",
                            backgroundColor: active ? "#555555" : "transparent",
                            border: "none",
                            borderRadius: "4px",
                            color: active ? "#ffffff" : "rgba(17,17,17,0.7)",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            fontWeight: active ? 600 : 500,
                            letterSpacing: "0.02em",
                            cursor: "pointer",
                            transition: "all 0.15s cubic-bezier(0.16, 1, 0.3, 1)",
                            boxShadow: active ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                        }}
                    >
                        {labels[opt]}
                    </button>
                );
            })}
        </div>
    );
}
