"use client";
// Footer uses onMouseEnter/onMouseLeave for link hover effects,
// so it must be a Client Component.
// It still renders on the server first (SSR), then hydrates in the browser.

import Link from "next/link";

// Social links — easy to update
const SOCIAL_LINKS = [
    { href: "https://instagram.com", label: "Instagram", icon: "◈" },
    { href: "mailto:hello@artshop.com", label: "Email", icon: "◉" },
];

const FOOTER_NAV = [
    { href: "/gallery", label: "Gallery" },
    { href: "/shop", label: "Shop" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
];

export default function Footer() {
    const currentYear = new Date().getFullYear();

    return (
        <footer
            style={{
                backgroundColor: "var(--color-cream)", // Сделаем светлым в тон странице
                color: "var(--color-charcoal)",
                padding: "4rem 2rem 2rem",
                marginTop: "auto",
                borderTop: "1px solid rgba(26, 26, 24, 0.08)", // Тонкая линия сверху
            }}
        >
            <div
                style={{
                    maxWidth: "1280px",
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
                        borderBottom: "1px solid rgba(26, 26, 24, 0.08)",
                    }}
                >
                    {/* Brand column */}
                    <div>
                        <Link
                            href="/"
                            style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "1.75rem",
                                fontWeight: 500, // Чуть тоньше
                                fontStyle: "italic",
                                color: "var(--color-charcoal)",
                                textDecoration: "none",
                                display: "block",
                                marginBottom: "1rem",
                            }}
                        >
                            ArtShop
                        </Link>
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.85rem",
                                fontWeight: 300,
                                color: "var(--color-charcoal-mid)",
                                lineHeight: 1.7,
                                maxWidth: "260px",
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
                                fontSize: "0.7rem",
                                fontWeight: 500,
                                letterSpacing: "0.15em",
                                textTransform: "uppercase",
                                color: "var(--color-muted)",
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
                                            color: "var(--color-charcoal)",
                                            textDecoration: "none",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.target as HTMLElement).style.opacity = "0.5"}
                                        onMouseLeave={(e) => (e.target as HTMLElement).style.opacity = "1"}
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
                                fontSize: "0.7rem",
                                fontWeight: 500,
                                letterSpacing: "0.15em",
                                textTransform: "uppercase",
                                color: "var(--color-muted)",
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
                            fontSize: "0.75rem",
                            fontWeight: 300,
                            color: "var(--color-muted)",
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
                            color: "var(--color-muted)",
                        }}
                    >
                        Art is not what you see, but what you make others see.
                    </p>
                </div>
            </div>
        </footer>
    );
}
