"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { countries, countryCodeToFlag } from "@/countries";
import type { Country } from "@/countries";
import { errorStyle, inputBase, inputFocus, labelStyle } from "../styles";

export function CountrySelect({
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
