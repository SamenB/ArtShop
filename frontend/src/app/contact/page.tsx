"use client";

import { useEffect, useState } from "react";

export default function ContactPage() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
    }, []);

    return (
        <div style={{ backgroundColor: "var(--color-cream)", minHeight: "100svh", paddingTop: "120px", paddingBottom: "100px" }}>
            <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 2rem" }}>

                {/* ── HEADER ────────────────────────────────────────────────── */}
                <header style={{
                    textAlign: "center", marginBottom: "80px",
                    opacity: isVisible ? 1 : 0, transform: isVisible ? "translateY(0)" : "translateY(20px)",
                    transition: "opacity 1s ease, transform 1s ease"
                }}>
                    <p style={{
                        fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.2em",
                        textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "1rem"
                    }}>
                        Get In Touch
                    </p>
                    <h1 style={{
                        fontFamily: "var(--font-serif)", fontSize: "clamp(3rem, 8vw, 6rem)", fontStyle: "italic",
                        fontWeight: 400, color: "var(--color-charcoal)", lineHeight: 1.1
                    }}>
                        Let's Start a <br /> Conversation
                    </h1>
                </header>

                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "60px", opacity: isVisible ? 1 : 0, transition: "opacity 1.2s ease 0.4s"
                }}>

                    {/* ── INFO COLUMN ────────────────────────────────────────── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
                        <div>
                            <span style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--color-muted)",
                                letterSpacing: "0.1em", textTransform: "uppercase"
                            }}>
                                01. Inquiries
                            </span>
                            <p style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--color-charcoal)",
                                marginTop: "10px"
                            }}>
                                hello@artshop.com
                            </p>
                        </div>

                        <div>
                            <span style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--color-muted)",
                                letterSpacing: "0.1em", textTransform: "uppercase"
                            }}>
                                02. Social
                            </span>
                            <p style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--color-charcoal)",
                                marginTop: "10px"
                            }}>
                                @artshop_studio
                            </p>
                        </div>

                        <div>
                            <span style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--color-muted)",
                                letterSpacing: "0.1em", textTransform: "uppercase"
                            }}>
                                03. Studio
                            </span>
                            <p style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.9rem", color: "var(--color-charcoal)",
                                marginTop: "10px", lineHeight: 1.6
                            }}>
                                Kiev, Ukraine<br />
                                By appointment only
                            </p>
                        </div>
                    </div>

                    {/* ── FORM COLUMN ────────────────────────────────────────── */}
                    <div>
                        <form style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{
                                    fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "var(--color-muted)",
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    Name
                                </label>
                                <input
                                    type="text"
                                    style={{
                                        backgroundColor: "transparent", border: "none",
                                        borderBottom: "1px solid var(--color-border-dark)",
                                        padding: "8px 0", fontFamily: "var(--font-sans)",
                                        fontSize: "0.95rem", color: "var(--color-charcoal)", outline: "none"
                                    }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{
                                    fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "var(--color-muted)",
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    style={{
                                        backgroundColor: "transparent", border: "none",
                                        borderBottom: "1px solid var(--color-border-dark)",
                                        padding: "8px 0", fontFamily: "var(--font-sans)",
                                        fontSize: "0.95rem", color: "var(--color-charcoal)", outline: "none"
                                    }}
                                />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{
                                    fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "var(--color-muted)",
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    Message
                                </label>
                                <textarea
                                    rows={4}
                                    style={{
                                        backgroundColor: "transparent", border: "none",
                                        borderBottom: "1px solid var(--color-border-dark)",
                                        padding: "8px 0", fontFamily: "var(--font-sans)",
                                        fontSize: "0.95rem", color: "var(--color-charcoal)", outline: "none",
                                        resize: "none"
                                    }}
                                />
                            </div>

                            <button
                                type="submit"
                                style={{
                                    marginTop: "20px", padding: "12px 30px", backgroundColor: "var(--color-charcoal)",
                                    color: "var(--color-cream)", border: "none", fontFamily: "var(--font-sans)",
                                    fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.15em",
                                    textTransform: "uppercase", cursor: "pointer", borderRadius: "2px",
                                    transition: "opacity 0.2s ease"
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                                onClick={(e) => e.preventDefault()}
                            >
                                Send Message
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
