"use client";
// Navbar — clean pill navigation + preference switchers (language, currency, units).
// Mobile: hamburger → full-screen menu with preferences at the bottom.
// Desktop: pill bar with nav links + compact preference pills.

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { UserCircle, ShoppingBag } from "lucide-react";
import AuthModal from "@/components/AuthModal";
import { useUser } from "@/context/UserContext";
import { useCart } from "@/context/CartContext";


const NAV_LINKS = [
    { href: "/gallery", label: "Gallery" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
];

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
            backgroundColor: "rgba(26,26,24,0.04)",
            borderRadius: "8px",
            padding: "4px",
            width: "fit-content",
        }}>
            {options.map((opt) => {
                const active = opt === value;
                return (
                    <button
                        key={opt}
                        onClick={() => onChange(opt)}
                        style={{
                            padding: "6px 16px",
                            border: "none",
                            backgroundColor: active ? "#ffffff" : "transparent",
                            boxShadow: active ? "0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)" : "none",
                            borderRadius: "6px",
                            color: active ? "var(--color-charcoal)" : "var(--color-muted)",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            fontWeight: active ? 500 : 400,
                            letterSpacing: "0.02em",
                            cursor: "pointer",
                            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
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
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal)",
                            fontWeight: 500,
                        }}>
                            Language
                        </span>
                        <SegmentedPill<Language> options={["en", "uk"]} labels={LANGUAGE_LABELS} value={language} onChange={setLanguage} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)", opacity: 0.5 }} />

                    {/* Currency Section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal)",
                            fontWeight: 500,
                        }}>
                            Currency
                        </span>
                        <SegmentedPill<Currency> options={["USD", "UAH"]} labels={CURRENCY_LABELS} value={currency} onChange={setCurrency} />
                    </div>

                    <div style={{ height: "1px", backgroundColor: "var(--color-border)", opacity: 0.5 }} />

                    {/* Units Section */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            color: "var(--color-charcoal)",
                            fontWeight: 500,
                        }}>
                            Measurement
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
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();
    const { language, currency, units, setLanguage, setCurrency, setUnits } = usePreferences();
    const { user, logout } = useUser();
    const { cartCount, setIsCartOpen } = useCart();

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setProfileMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);


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
                    backgroundColor: "rgba(10, 10, 10, 0.45)", // Semi-transparent to let page scroll behind it
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
                            <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
                                <Image
                                    src="/logo-v2.png"
                                    alt="Samen Bondarenko"
                                    width={600}
                                    height={200}
                                    priority
                                    style={{
                                        height: isMobile ? "52px" : "clamp(52px, 36px + 1.6vw, 95px)",
                                        width: "auto",
                                        objectFit: "contain",
                                        display: "block",
                                    }}
                                />
                            </Link>
                        </div>
                    </div>

                    {/* ── DESKTOP: nav links ── */}
                    {!isMobile && (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "clamp(1.5rem, 1rem + 0.8vw, 3rem)",
                            // removed translateY hack to restore true flex center
                        }}>
                            {NAV_LINKS.map((link) => {
                                const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        style={{
                                            fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
                                            fontSize: "clamp(0.76rem, 0.49rem + 0.43vw, 1.6rem)",
                                            fontWeight: 400,
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            textDecoration: "none",
                                            color: isActive ? "#FFFFFF" : "rgba(244,244,244,0.85)", // brighter
                                            borderBottom: isActive ? "1px solid rgba(244,244,244,0.4)" : "1px solid transparent",
                                            padding: "4px 0", // equal top/bottom padding fixes vertical alignment with icons
                                            transition: "color 0.2s ease, border-color 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "#FFFFFF"; e.currentTarget.style.borderColor = "rgba(244,244,244,0.2)"; } }}
                                        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "rgba(244,244,244,0.85)"; e.currentTarget.style.borderColor = "transparent"; } }}
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

                            <div ref={profileMenuRef} style={{ position: "relative" }}>
                                <button
                                    onClick={() => user ? setProfileMenuOpen(!profileMenuOpen) : setAuthModalOpen(true)}
                                    style={{
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        background: "none", border: "none", cursor: "pointer",
                                        color: (profileMenuOpen || user) ? "#FFFFFF" : "rgba(244,244,244,0.85)",
                                        padding: "4px",
                                        transition: "color 0.2s ease"
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = "#FFFFFF"; }}
                                    onMouseLeave={(e) => { if (!profileMenuOpen && !user) e.currentTarget.style.color = "rgba(244,244,244,0.85)"; }}
                                >
                                    <UserCircle size={22} strokeWidth={1.5} />
                                </button>

                                {profileMenuOpen && user && (
                                    <div style={{
                                        position: "absolute", top: "100%", right: 0, marginTop: "16px",
                                        backgroundColor: "var(--color-cream)", border: "1px solid var(--color-border)",
                                        borderRadius: "12px", padding: "8px", minWidth: "150px",
                                        display: "flex", flexDirection: "column", gap: "4px",
                                        boxShadow: "0 8px 30px rgba(0,0,0,0.08)", zIndex: 100
                                    }}>
                                        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--color-border)", marginBottom: "4px" }}>
                                            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "var(--color-charcoal)" }}>
                                                {user.username}
                                            </span>
                                            <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-muted)" }}>
                                                {user.email}
                                            </span>
                                        </div>
                                        <Link
                                            href="/profile"
                                            onClick={() => setProfileMenuOpen(false)}
                                            style={{ padding: "8px 12px", fontSize: "0.85rem", color: "var(--color-charcoal)", textDecoration: "none", borderRadius: "8px" }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.05)"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                        >
                                            {user.is_admin ? "Admin Dashboard" : "Dashboard"}
                                        </Link>
                                        <button
                                            onClick={() => { logout(); setProfileMenuOpen(false); }}
                                            style={{ textAlign: "left", padding: "8px 12px", fontSize: "0.85rem", color: "#E53E3E", background: "none", border: "none", cursor: "pointer", borderRadius: "8px" }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(244,0,0,0.05)"}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                        >
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Cart Button Desktop */}
                            <button
                                onClick={() => setIsCartOpen(true)}
                                style={{
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: "none", border: "none", cursor: "pointer",
                                    color: "rgba(244,244,244,0.85)", padding: "4px",
                                    transition: "color 0.2s ease", position: "relative"
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = "#FFFFFF"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(244,244,244,0.85)"; }}
                            >
                                <ShoppingBag size={20} strokeWidth={1.5} stroke="currentColor" />
                                {cartCount > 0 && (
                                    <span style={{
                                        position: "absolute", top: "0", right: "0",
                                        background: "#E53E3E", color: "#FFFFFF",
                                        fontSize: "0.6rem", fontWeight: 600, width: "16px", height: "16px",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        borderRadius: "50%", transform: "translate(30%, -30%)"
                                    }}>
                                        {cartCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                    {/* ── MOBILE: Minimalist Menu Button + Cart ── */}
                    {isMobile && (
                        <div style={{ display: "flex", alignItems: "center" }}>
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
                        </div>
                    )}
                </nav>
            </header>

            {/* ── MOBILE DRAWER MENU ─────────────────────────────── */}
            {/* Backdrop */}
            <div
                onClick={() => setMenuOpen(false)}
                style={{
                    position: "fixed",
                    top: "70px", left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(26,26,24,0.3)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    zIndex: 98,
                    opacity: menuOpen ? 1 : 0,
                    pointerEvents: menuOpen ? "auto" : "none",
                    transition: "opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
            />
            {/* Drawer */}
            <div
                style={{
                    position: "fixed",
                    top: "70px", right: 0, bottom: 0,
                    width: "75%", maxWidth: "340px",
                    zIndex: 99,
                    backgroundColor: "#FAFAF8", // Extremely light cream
                    borderLeft: "1px solid rgba(26,26,24,0.06)",
                    boxShadow: "-10px 0 40px rgba(0,0,0,0.06)",
                    transform: menuOpen ? "translateX(0)" : "translateX(100%)",
                    pointerEvents: menuOpen ? "auto" : "none",
                    transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
                    display: "flex",
                    flexDirection: "column",
                    padding: "2.5rem 2rem",
                    overflowY: "auto",
                }}
            >
                {/* Links */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {NAV_LINKS.map((link, i) => {
                        const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMenuOpen(false)}
                                style={{
                                    display: "block",
                                    padding: "0.5rem 0",
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "1.45rem",
                                    fontWeight: isActive ? 500 : 300,
                                    letterSpacing: "0.02em",
                                    textDecoration: "none",
                                    color: isActive ? "var(--color-charcoal)" : "var(--color-charcoal-mid)",
                                    transform: menuOpen ? "translateX(0)" : "translateX(20px)",
                                    opacity: menuOpen ? 1 : 0,
                                    transition: `opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05 + 0.15}s, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05 + 0.15}s`,
                                }}
                            >
                                {link.label}
                            </Link>
                        );
                    })}

                    {/* Cart in Mobile Drawer */}
                    <button
                        onClick={() => {
                            setMenuOpen(false);
                            setIsCartOpen(true);
                        }}
                        style={{
                            display: "flex", alignItems: "center", gap: "0.5rem",
                            padding: "0.5rem 0", background: "none", border: "none",
                            cursor: "pointer", fontFamily: "var(--font-sans)",
                            fontSize: "1.45rem", fontWeight: 300, letterSpacing: "0.02em",
                            color: "var(--color-charcoal)", textAlign: "left",
                            transform: menuOpen ? "translateX(0)" : "translateX(20px)",
                            opacity: menuOpen ? 1 : 0,
                            transition: `opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${NAV_LINKS.length * 0.05 + 0.15}s, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${NAV_LINKS.length * 0.05 + 0.15}s`,
                        }}
                    >
                        Cart {cartCount > 0 && `(${cartCount})`}
                    </button>
                </div>

                {/* Preferences at bottom */}
                <div style={{
                    marginTop: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "1.25rem",
                    borderTop: "1px solid rgba(26,26,24,0.08)",
                    paddingTop: "2rem",
                    opacity: menuOpen ? 1 : 0,
                    transform: menuOpen ? "translateY(0)" : "translateY(15px)",
                    transition: "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.35s, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.35s",
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-charcoal)", letterSpacing: "0.05em", fontWeight: 400 }}>Language</span>
                        <SegmentedPill<Language> options={["en", "uk"]} labels={LANGUAGE_LABELS} value={language} onChange={setLanguage} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-charcoal)", letterSpacing: "0.05em", fontWeight: 400 }}>Currency</span>
                        <SegmentedPill<Currency> options={["USD", "UAH"]} labels={CURRENCY_LABELS} value={currency} onChange={setCurrency} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-charcoal)", letterSpacing: "0.05em", fontWeight: 400 }}>Units</span>
                        <SegmentedPill<Units> options={["cm", "in"]} labels={UNITS_LABELS} value={units} onChange={setUnits} />
                    </div>
                </div>
            </div>

            {/* Auth Modal */}
            <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

            {/* 
                SPACER / TRACKING BACKGROUND
                This behaves as normal document flow. It pushes the page content down 
                so it doesn't hide behind the fixed navbar on load.
                Because it sits at y=0, the fixed Navbar overlays it perfectly.
                When the user scrolls, this spacer scrolls UP and away, revealing the 
                page content under the semi-transparent Navbar.
            */}
            <div 
                style={{ 
                    width: "100%",
                    backgroundColor: "rgba(35, 35, 35, 0.75)", // 7.5 out of 10 grey background
                }} 
                className="navbar-spacer-bg"
            />
            <style dangerouslySetInnerHTML={{__html: `
                .navbar-spacer-bg { height: clamp(70px, 47px + 2.23vw, 130px); }
                @media (max-width: 768px) { .navbar-spacer-bg { height: 70px; } }
            `}} />
        </>
    );
}
