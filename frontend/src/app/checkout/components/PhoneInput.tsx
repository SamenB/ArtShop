"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { countries, countryCodeToFlag } from "@/countries";
import { errorStyle, inputBase, labelStyle } from "../styles";

export function PhoneInput({
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
