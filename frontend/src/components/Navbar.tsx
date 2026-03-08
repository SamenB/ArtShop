"use client";
// Navbar — clean pill navigation.
// Mobile: hamburger → full-screen menu.
// Desktop: pill bar with nav links.
// Navbar itself has frosted glass blur on scroll.

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
    { href: "/gallery", label: "Gallery" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
];

export default function Navbar() {
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const pathname = usePathname();

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
                    backgroundColor: scrolled ? "rgba(247, 243, 236, 0.90)" : "transparent",
                    backdropFilter: scrolled ? "blur(20px) saturate(160%)" : "none",
                    WebkitBackdropFilter: scrolled ? "blur(20px) saturate(160%)" : "none",
                    borderBottom: scrolled ? "1px solid rgba(28,25,22,0.10)" : "1px solid transparent",
                    transition: "background-color 0.3s ease, border-color 0.3s ease",
                }}
            >
                <nav
                    style={{
                        maxWidth: "1280px",
                        margin: "0 auto",
                        padding: "0 1.25rem",
                        height: "68px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                    }}
                >
                    {/* Logo — DM Serif Display italic */}
                    <Link
                        href="/"
                        style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "1.25rem",
                            fontWeight: 400,
                            fontStyle: "italic",
                            color: "var(--color-charcoal)",
                            textDecoration: "none",
                            flexShrink: 0,
                            letterSpacing: "-0.01em",
                        }}
                    >
                        ArtShop
                    </Link>

                    {/* ── DESKTOP: minimalistic links ── */}
                    {!isMobile && (
                        <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
                            {NAV_LINKS.map((link) => {
                                const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        style={{
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.7rem",
                                            fontWeight: isActive ? 500 : 300,
                                            letterSpacing: "0.14em",
                                            textTransform: "uppercase",
                                            textDecoration: "none",
                                            color: isActive ? "var(--color-charcoal)" : "var(--color-charcoal-mid)",
                                            borderBottom: isActive ? "1px solid rgba(28,25,22,0.5)" : "1px solid transparent",
                                            paddingBottom: "3px",
                                            transition: "color 0.2s ease, border-color 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--color-charcoal)"; e.currentTarget.style.borderColor = "rgba(28,25,22,0.2)"; } }}
                                        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = "var(--color-charcoal-mid)"; e.currentTarget.style.borderColor = "transparent"; } }}
                                    >
                                        {link.label}
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {/* ── MOBILE: Minimalist Menu Button ── */}
                    {isMobile && (
                        <button
                            onClick={() => setMenuOpen((p) => !p)}
                            aria-label={menuOpen ? "Close menu" : "Open menu"}
                            style={{
                                display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.4rem",
                                background: "none", border: "none", color: "var(--color-charcoal)", cursor: "pointer",
                            }}
                        >
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 400, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                                {menuOpen ? "Close" : "Menu"}
                            </span>
                            {/* Animated line icon */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px", width: "18px" }}>
                                {[0, 1, 2].map((i) => (
                                    <span
                                        key={i}
                                        style={{
                                            display: "block",
                                            width: i === 1 ? (menuOpen ? "18px" : "12px") : "18px",
                                            height: "1px", // Extremely thin lines
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
                    top: "68px", left: 0, right: 0, bottom: 0,
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
                                color: isActive ? "#F7F3EC" : "rgba(247,243,236,0.55)",
                                borderBottom: isActive ? "1px solid rgba(247,243,236,0.3)" : "1px solid transparent",
                                opacity: menuOpen ? 1 : 0,
                                transform: menuOpen ? "translateY(0)" : "translateY(10px)",
                                transition: `opacity 0.4s ease ${i * 0.08}s, transform 0.4s ease ${i * 0.08}s`,
                            }}
                        >
                            {link.label}
                        </Link>
                    );
                })}

                <div style={{ height: "2rem" }} />

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
                    Original Paintings & Fine Art Prints
                </p>
            </div>

            {/* Spacer */}
            <div style={{ height: "68px" }} />
        </>
    );
}
