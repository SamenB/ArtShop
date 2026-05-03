"use client";

/**
 * Public Contact Page.
 * Renders the studio's contact information (email, social links, address) dynamically fetched from user settings,
 * alongside a standard inquiry submission form. Features staggered reveal animations on load.
 */

import { useEffect, useState } from "react";
import { getApiUrl, apiFetch } from "@/utils";

/**
 * Main component governing the layout and state of the contact interface.
 */
export default function ContactPage() {
    // Visibility state utilized purely for CSS fade-in animations on mount
    const [isVisible, setIsVisible] = useState(false);
    
    // Controlled Form State
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    
    // UI Feedback State
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [settings, setSettings] = useState<{ contact_email?: string; social_link?: string; studio_address?: string } | null>(null);

    /** Triggers mounting animations and retrieves global site settings. */
    useEffect(() => {
        setIsVisible(true);
        // Fetch public settings for dynamic contact details
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => res.json())
            .then(data => setSettings(data))
            .catch(err => console.error("Failed to fetch settings", err));
    }, []);

    /** Validates inputs and delegates the form payload to the backend messaging service. */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !message) return;
        
        setStatus("loading");
        try {
            const res = await apiFetch(`${getApiUrl()}/contact`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, message })
            });
            
            if (res.ok) {
                setStatus("success");
                setName("");
                setEmail("");
                setMessage("");
            } else {
                setStatus("error");
            }
        } catch (error) {
            console.error(error);
            setStatus("error");
        }
    };

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
                        Let&apos;s Start a <br /> Conversation
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
                                {settings?.contact_email || "hello@artshop.com"}
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
                                {settings?.social_link || "@artshop_studio"}
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
                                marginTop: "10px", lineHeight: 1.6, whiteSpace: "pre-line"
                            }}>
                                {settings?.studio_address || "Kiev, Ukraine\nBy appointment only"}
                            </p>
                        </div>
                    </div>

                    {/* ── FORM COLUMN ────────────────────────────────────────── */}
                    <div>
                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "30px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <label style={{
                                    fontFamily: "var(--font-mono)", fontSize: "0.55rem", color: "var(--color-muted)",
                                    textTransform: "uppercase", letterSpacing: "0.1em"
                                }}>
                                    Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
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
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
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
                                    required
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    style={{
                                        backgroundColor: "transparent", border: "none",
                                        borderBottom: "1px solid var(--color-border-dark)",
                                        padding: "8px 0", fontFamily: "var(--font-sans)",
                                        fontSize: "0.95rem", color: "var(--color-charcoal)", outline: "none",
                                        resize: "none"
                                    }}
                                />
                            </div>

                            {status === "success" && (
                                <p style={{ fontFamily: "var(--font-sans)", color: "green", fontSize: "0.85rem", fontStyle: "italic" }}>
                                    Thank you! Your message has been sent successfully.
                                </p>
                            )}
                            {status === "error" && (
                                <p style={{ fontFamily: "var(--font-sans)", color: "red", fontSize: "0.85rem", fontStyle: "italic" }}>
                                    Something went wrong. Please try again later.
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={status === "loading"}
                                className="premium-cta-btn"
                                style={{
                                    marginTop: "20px",
                                    opacity: status === "loading" ? 0.7 : 1,
                                }}
                            >
                                {status === "loading" ? "Sending..." : "Send Message"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
