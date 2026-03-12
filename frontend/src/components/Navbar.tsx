"use client";
// Navbar — clean pill navigation + preference switchers (language, currency, units).
// Mobile: hamburger → full-screen menu with preferences at the bottom.
// Desktop: pill bar with nav links + compact preference pills.

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    usePreferences,
    LANGUAGE_LABELS,
    CURRENCY_LABELS,
    UNITS_LABELS,
    type Language,
    type Currency,
    type Units,
} from "@/context/PreferencesContext";

const NAV_LINKS = [
    { href: "/gallery", label: "Gallery" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
];

// Reusable segmented pill switcher
// Renders a group of buttons side-by-side in a rounded container.
// Light theme switcher — minimal text with underline indicator on active option.
// No backgrounds, no borders — just clean typography.
function SegmentedPill<T extends string>({
    options,
    labels,
    value,
    onChange,
}: {
    options: T[];
    labels: Record<T, string>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "12px", // Increased gap for better touch/click targets
        }}>
            {options.map((opt) => {
                const active = opt === value;
                return (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        style={{
                            padding: "4px 0",
                            border: "none",
                            backgroundColor: "transparent",
                            color: active ? "var(--color-charcoal)" : "var(--color-muted)",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem", // Slightly larger
                            fontWeight: active ? 500 : 300,
                            letterSpacing: "0.08em",
                            cursor: "pointer",
                            position: "relative",
                            transition: "color 0.2s ease",
                            lineHeight: 1.3,
                        }}
                    >
                        {labels[opt]}
                        {/* More elegant indicator: a small dot or thin bar below */}
                        <span style={{
                            position: "absolute",
                            bottom: 0,
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: active ? "100%" : "0%",
                            height: "1px",
                            backgroundColor: "var(--color-charcoal)",
                            transition: "width 0.3s ease",
                        }} />
                    </button>
                );
            })}
        </div>
    );
}

// Dark variant — used in the mobile fullscreen menu (dark background)
function SegmentedPillDark<T extends string>({
    options,
    labels,
    value,
    onChange,
}: {
    options: T[];
    labels: Record<T, string>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div style={{
            display: "inline-flex",
            borderRadius: "20px",
            border: "1px solid rgba(247,243,236,0.15)",
            overflow: "hidden",
            backgroundColor: "rgba(247,243,236,0.05)",
        }}>
            {options.map((opt) => {
                const active = opt === value;
                return (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        style={{
                            padding: "5px 14px",
                            border: "none",
                            backgroundColor: active ? "rgba(247,243,236,0.15)" : "transparent",
                            color: active ? "#F7F3EC" : "rgba(247,243,236,0.4)",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.65rem",
                            fontWeight: active ? 500 : 400,
                            letterSpacing: "0.1em",
                            cursor: "pointer",
                            transition: "background-color 0.2s ease, color 0.2s ease",
                        }}
                    >
                        {labels[opt]}
                    </button>
                );
            })}
        </div>
    );
}

function PreferencesDropdown({
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
                position: "absolute", top: "100%", right: 0, marginTop: "16px",
                backgroundColor: "var(--color-cream)", border: "1px solid var(--color-border)",
                borderRadius: "12px", padding: "16px",
                display: "flex", flexDirection: "column", gap: "16px",
                minWidth: "160px",
                boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
                opacity: open ? 1 : 0,
                transform: open ? "translateY(0)" : "translateY(-8px)",
                pointerEvents: open ? "auto" : "none",
                transition: "opacity 0.2s cubic-bezier(0.4,0,0.2,1), transform 0.2s cubic-bezier(0.4,0,0.2,1)",
                zIndex: 100,
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "24px", minWidth: "200px" }}>
                    {/* Language Section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6rem",
                            color: "var(--color-muted)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            opacity: 0.8
                        }}>
                            01. Language
                        </span>
                        <SegmentedPill<Language> options={["en", "uk", "ru"]} labels={LANGUAGE_LABELS} value={language} onChange={setLanguage} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)" }} />

                    {/* Currency Section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6rem",
                            color: "var(--color-muted)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            opacity: 0.8
                        }}>
                            02. Currency
                        </span>
                        <SegmentedPill<Currency> options={["USD", "EUR", "UAH"]} labels={CURRENCY_LABELS} value={currency} onChange={setCurrency} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)" }} />

                    {/* Units Section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.6rem",
                            color: "var(--color-muted)",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            opacity: 0.8
                        }}>
                            03. Measurement
                        </span>
                        <SegmentedPill<Units> options={["cm", "in"]} labels={UNITS_LABELS} value={units} onChange={setUnits} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Navbar() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const pathname = usePathname();
    const { language, currency, units, setLanguage, setCurrency, setUnits } = usePreferences();

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        onResize();
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    useEffect(() => { setMenuOpen(false); }, [pathname]);

    useEffect(() => {
        document.body.style.overflow = menuOpen ? "hidden" : "";
        return () => { document.body.style.overflow = ""; };
    }, [menuOpen]);

    return (
        <>
            {/* ── NAVBAR ─────────────────────────────────────────────── */}
            <header
                style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0,
                    zIndex: 100,
                    backgroundColor: "rgba(17, 17, 17, 0.75)",
                    backdropFilter: "blur(20px) saturate(160%)",
                    WebkitBackdropFilter: "blur(20px) saturate(160%)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    transition: "background-color 0.3s ease, border-color 0.3s ease",
                }}
            >
                <nav
                    style={{
                        width: "100%",
                        padding: isMobile ? "0 1.25rem" : "0 clamp(2.5rem, 0.79rem + 2.68vw, 8rem)",
                        height: isMobile ? "70px" : "clamp(70px, 47px + 2.23vw, 130px)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center" }}>
                        {/* Logo */}
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <Link
                                href="/"
                                style={{
                                    fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
                                    color: "#F4F4F4",
                                    textDecoration: "none",
                                    flexShrink: 0,
                                    display: "flex",
                                    flexDirection: "column",
                                    lineHeight: 0.95,
                                    width: "fit-content",
                                    transform: "scale(0.94)",
                                    transformOrigin: "left center",
                                }}
                            >
                                <span style={{ fontSize: isMobile ? "1.45rem" : "clamp(1.45rem, 0.94rem + 0.8vw, 3rem)", fontWeight: 400, letterSpacing: "0.01em" }}>Samen</span>
                                <span style={{ fontSize: isMobile ? "1.45rem" : "clamp(1.45rem, 0.94rem + 0.8vw, 3rem)", fontWeight: 400, letterSpacing: "0.01em" }}>Bondarenko</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 3.5px + 0.25vw, 12px)", marginTop: "2px", width: "100%" }}>
                                    <span style={{ flex: 1, minWidth: "clamp(45px, 33.5px + 1.1vw, 80px)", height: "1.5px", backgroundColor: "#F4F4F4", marginLeft: "2px" }} />
                                    <span style={{ fontSize: isMobile ? "1rem" : "clamp(1rem, 0.66rem + 0.54vw, 2rem)", fontWeight: 400, transform: "translateY(-1px)", flexShrink: 0, paddingRight: "5px" }}>Gallery</span>
                                </div>
                            </Link>
                        </div>
                    </div>

                    {/* ── DESKTOP: nav links ── */}
                    {!isMobile && (
                        <div style={{ display: "flex", alignItems: "center", gap: "clamp(2rem, 1.32rem + 1.07vw, 4rem)" }}>
                            {NAV_LINKS.map((link) => {
                                const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        style={{
                                            fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
                                            fontSize: "clamp(0.95rem, 0.61rem + 0.54vw, 2rem)",
                                            fontWeight: 400,
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            textDecoration: "none",
                                            color: isActive ? "#FFFFFF" : "rgba(244,244,244,0.6)",
                                            borderBottom: isActive ? "1px solid rgba(244,244,244,0.4)" : "1px solid transparent",
                                            paddingBottom: "4px",
                                            transition: "color 0.2s ease, border-color 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "#FFFFFF"; e.currentTarget.style.borderColor = "rgba(244,244,244,0.2)"; } }}
                                        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "rgba(244,244,244,0.6)"; e.currentTarget.style.borderColor = "transparent"; } }}
                                    >
                                        {link.label}
                                    </Link>
                                );
                            })}

                            {/* Adding a subtle divider between links and the globe */}
                            <div style={{ width: "1.5px", height: "clamp(16px, 11px + 0.56vw, 30px)", backgroundColor: "rgba(244,244,244,0.15)", margin: "0 6px" }} />

                            {/* Globe / Preferences moved here */}
                            <PreferencesDropdown
                                language={language} setLanguage={setLanguage}
                                currency={currency} setCurrency={setCurrency}
                                units={units} setUnits={setUnits}
                            />
                        </div>
                    )}

                    {/* ── MOBILE: Minimalist Menu Button ── */}
                    {isMobile && (
                        <button
                            onClick={() => setMenuOpen((p) => !p)}
                            aria-label={menuOpen ? "Close menu" : "Open menu"}
                            style={{
                                display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem",
                                background: "none", border: "none", color: "#F4F4F4", cursor: "pointer",
                            }}
                        >
                            <span style={{
                                fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif', fontSize: "0.95rem",
                                fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase", transform: "translateY(-1px)"
                            }}>
                                {menuOpen ? "Close" : "Menu"}
                            </span>
                            {/* Animated hamburger icon */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "18px" }}>
                                {[0, 1, 2].map((i) => (
                                    <span
                                        key={i}
                                        style={{
                                            display: "block",
                                            width: i === 1 ? (menuOpen ? "18px" : "12px") : "18px",
                                            height: "1px",
                                            backgroundColor: "currentColor",
                                            transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease, width 0.4s ease",
                                            transform:
                                                menuOpen && i === 0 ? "translateY(6px) rotate(45deg)" :
                                                    menuOpen && i === 2 ? "translateY(-6px) rotate(-45deg)" : "none",
                                            opacity: menuOpen && i === 1 ? 0 : 1,
                                        }}
                                    />
                                ))}
                            </div>
                        </button>
                    )}
                </nav>
            </header>

            {/* ── MOBILE FULL-SCREEN MENU ─────────────────────────────── */}
            <div
                style={{
                    position: "fixed",
                    top: "70px", left: 0, right: 0, bottom: 0, // Match new height
                    zIndex: 99,
                    backgroundColor: "#1C1916",
                    opacity: menuOpen ? 1 : 0,
                    transform: menuOpen ? "translateY(0)" : "translateY(-6px)",
                    pointerEvents: menuOpen ? "auto" : "none",
                    transition: "opacity 0.3s ease, transform 0.3s ease",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "2rem",
                }}
            >
                {NAV_LINKS.map((link, i) => {
                    const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMenuOpen(false)}
                            style={{
                                display: "block",
                                textAlign: "center",
                                padding: "0.75rem 2rem",
                                fontFamily: "var(--font-serif)",
                                fontSize: "1.6rem",
                                fontWeight: 400,
                                fontStyle: "italic",
                                letterSpacing: "-0.01em",
                                textDecoration: "none",
                                color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                                borderBottom: isActive ? "1px solid rgba(255,255,255,0.3)" : "1px solid transparent",
                                opacity: menuOpen ? 1 : 0,
                                transform: menuOpen ? "translateY(0)" : "translateY(10px)",
                                transition: `opacity 0.4s ease ${i * 0.08}s, transform 0.4s ease ${i * 0.08}s`,
                            }}
                        >
                            {link.label}
                        </Link>
                    );
                })}

                {/* ── Preference switchers in mobile menu ── */}
                <div style={{
                    position: "absolute",
                    bottom: "5rem",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.6rem",
                    opacity: menuOpen ? 1 : 0,
                    transition: "opacity 0.4s ease 0.3s",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                        <SegmentedPillDark<Language>
                            options={["en", "uk", "ru"]}
                            labels={LANGUAGE_LABELS}
                            value={language}
                            onChange={setLanguage}
                        />
                        <SegmentedPillDark<Currency>
                            options={["USD", "EUR", "UAH"]}
                            labels={CURRENCY_LABELS}
                            value={currency}
                            onChange={setCurrency}
                        />
                        <SegmentedPillDark<Units>
                            options={["cm", "in"]}
                            labels={UNITS_LABELS}
                            value={units}
                            onChange={setUnits}
                        />
                    </div>
                </div>

                <p style={{
                    position: "absolute",
                    bottom: "2.5rem",
                    fontFamily: "var(--font-serif)",
                    fontStyle: "italic",
                    fontSize: "0.8rem",
                    color: "var(--color-muted)",
                    opacity: menuOpen ? 0.6 : 0,
                    transition: "opacity 0.4s ease 0.28s",
                }}>
                    Original Paintings &amp; Fine Art Prints
                </p>
            </div>

            {/* Spacer */}
            <div style={{ height: "70px" }} />
        </>
    );
}
