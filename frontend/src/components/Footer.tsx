"use client";

/**
 * Global Application Footer.
 * Must be a Client Component to manage `onMouseEnter`/`onMouseLeave` inline hover state.
 * Renders server-side first cleanly before hydrating.
 */

import Link from "next/link";

/** Centralized dictionary for social mapping to easily update external relations. */
const SOCIAL_LINKS = [
    { href: "https://instagram.com", label: "Instagram", icon: "◈" },
    { href: "mailto:hello@artshop.com", label: "Email", icon: "◉" },
];

/** Main footer internal routing dictionary. */
const FOOTER_NAV = [
    { href: "/gallery", label: "Gallery" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
];

/** Renders standard exhibition footer containing routing, social media, and copyright text. */
export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer
            style={{
                backgroundColor: "#1C1916",
                color: "#F7F3EC",
                padding: "5rem 2rem 2.5rem",
                marginTop: "auto",
                borderTop: "none",
            }}
        >
            <div
                style={{
                    maxWidth: "1600px",
                    margin: "0 auto",
                }}
            >
                {/* ── Top row: Logo + Nav + Social ── */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "3rem",
                        paddingBottom: "3rem",
                        borderBottom: "1px solid rgba(247,243,236,0.12)",
                    }}
                >
                    {/* Brand column */}
                    <div>
                        <Link
                            href="/"
                            style={{
                                fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
                                color: "#F7F3EC",
                                textDecoration: "none",
                                display: "flex",
                                flexDirection: "column",
                                marginBottom: "1.5rem",
                                lineHeight: 0.95,
                                width: "fit-content",
                                transform: "scale(0.7)",
                                transformOrigin: "left center",
                            }}
                        >
                            <span style={{ fontSize: "1.45rem", fontWeight: 400, letterSpacing: "0.01em" }}>Samen</span>
                            <span style={{ fontSize: "1.45rem", fontWeight: 400, letterSpacing: "0.01em" }}>Bondarenko</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", width: "100%" }}>
                                <span style={{ flex: 1, minWidth: "45px", height: "1px", backgroundColor: "#F7F3EC", marginLeft: "2px" }} />
                                <span style={{ fontSize: "1rem", fontWeight: 400, transform: "translateY(-1px)", flexShrink: 0, paddingRight: "4px" }}>Gallery</span>
                            </div>
                        </Link>
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.82rem",
                                fontWeight: 300,
                                color: "rgba(247,243,236,0.5)",
                                lineHeight: 1.7,
                                maxWidth: "260px",
                                letterSpacing: "0.02em",
                            }}
                        >
                            Original paintings and fine art prints.<br />
                            Each piece tells its own story.
                        </p>
                    </div>

                    {/* Navigation column */}
                    <div>
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.65rem",
                                fontWeight: 400,
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                color: "rgba(247,243,236,0.35)",
                                marginBottom: "1.25rem",
                            }}
                        >
                            Explore
                        </p>
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                            {FOOTER_NAV.map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        style={{
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.85rem",
                                            fontWeight: 300,
                                            color: "rgba(247,243,236,0.7)",
                                            textDecoration: "none",
                                            transition: "color 0.2s ease",
                                            letterSpacing: "0.02em",
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.color = "#F7F3EC"}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.color = "rgba(247,243,236,0.7)"}
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Social / Contact column */}
                    <div>
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.65rem",
                                fontWeight: 400,
                                letterSpacing: "0.18em",
                                textTransform: "uppercase",
                                color: "rgba(247,243,236,0.35)",
                                marginBottom: "1.25rem",
                            }}
                        >
                            Connect
                        </p>
                        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                            {SOCIAL_LINKS.map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        target={link.href.startsWith("http") ? "_blank" : undefined}
                                        rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                        style={{
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.85rem",
                                            fontWeight: 300,
                                            color: "var(--color-charcoal)",
                                            textDecoration: "none",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "0.5rem",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.opacity = "0.5"}
                                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.opacity = "1"}
                                    >
                                        <span aria-hidden style={{ fontSize: "1rem", color: "var(--color-muted)" }}>{link.icon}</span>
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* ── Bottom row: copyright + tagline ── */}
                <div
                    style={{
                        paddingTop: "1.5rem",
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "1rem",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <p
                        style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.72rem",
                            fontWeight: 300,
                            color: "rgba(247,243,236,0.3)",
                            letterSpacing: "0.05em",
                        }}
                    >
                        © {currentYear} ArtShop. All rights reserved.
                    </p>
                    <p
                        style={{
                            fontFamily: "var(--font-serif)",
                            fontStyle: "italic",
                            fontSize: "0.85rem",
                            color: "rgba(247,243,236,0.3)",
                        }}
                    >
                        Art is not what you see, but what you make others see.
                    </p>
                </div>
            </div>
        </footer>
    );
}
