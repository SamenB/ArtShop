"use client";

/**
 * About page for the ArtShop.
 * Displays the artist's statement, philosophy, and selected exhibitions.
 * Fetches dynamic settings (like artist photo and statement) from the backend.
 */

import { useEffect, useState } from "react";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";

/**
 * Artist profile and philosophy page.
 * Uses a responsive grid with staggered fade-in animations for a premium feel.
 */
export default function AboutPage() {
    const [isVisible, setIsVisible] = useState(false);
    const [settings, setSettings] = useState<any>(null);

    useEffect(() => {
        setIsVisible(true);
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => res.json())
            .then(data => setSettings(data))
            .catch(() => console.warn("Backend unavailable"));
    }, []);

    return (
        <div style={{ backgroundColor: "var(--color-cream)", minHeight: "100svh", paddingTop: "120px", paddingBottom: "100px" }}>
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 2rem" }}>

                {/* ── HEADER ────────────────────────────────────────────────── */}
                <header style={{ marginBottom: "80px", opacity: isVisible ? 1 : 0, transform: isVisible ? "translateY(0)" : "translateY(20px)", transition: "opacity 1s ease, transform 1s ease" }}>
                    <p style={{
                        fontFamily: "var(--font-mono)", fontSize: "0.65rem", letterSpacing: "0.2em",
                        textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "1rem"
                    }}>
                        About the Artist
                    </p>
                    <h1 style={{
                        fontFamily: "var(--font-serif)", fontSize: "clamp(3rem, 8vw, 6rem)", fontStyle: "italic",
                        fontWeight: 400, color: "var(--color-charcoal)", lineHeight: 1.1
                    }}>
                        A Dialogue with <br /> Canvas and Light
                    </h1>
                </header>

                {/* ── MAIN CONTENT ───────────────────────────────────────────── */}
                <div style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "80px", alignItems: "start"
                }}>

                    {/* Image Column */}
                    <div style={{
                        opacity: isVisible ? 1 : 0, transition: "opacity 1.2s ease 0.3s"
                    }}>
                        <div style={{
                            aspectRatio: "3/4", backgroundColor: "var(--color-cream-dark)",
                            borderRadius: "2px", overflow: "hidden", boxShadow: "0 20px 50px rgba(0,0,0,0.05)"
                        }}>
                            {/* Placeholder for generated image */}
                            <img
                                src={settings?.artist_about_photo_url ? getImageUrl(settings.artist_about_photo_url) : "/artist_studio_portrait.png"}
                                alt="Artist in Studio"
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                onError={(e) => {
                                    // Fallback to gradient if image not found yet
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    (e.currentTarget.parentElement as HTMLElement).style.background = 'linear-gradient(135deg, var(--color-cream-dark), var(--color-border))';
                                }}
                            />
                        </div>
                    </div>

                    {/* Text Column */}
                    <div style={{
                        display: "flex", flexDirection: "column", gap: "40px",
                        opacity: isVisible ? 1 : 0, transition: "opacity 1.2s ease 0.6s"
                    }}>
                        <div>
                            <h3 style={{
                                fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontStyle: "italic",
                                fontWeight: 400, color: "var(--color-charcoal)", marginBottom: "1.5rem"
                            }}>
                                The Journey
                            </h3>
                            <p style={{
                                fontFamily: "var(--font-sans)", fontSize: "1rem", color: "var(--color-charcoal-mid)",
                                lineHeight: 1.8, marginBottom: "1.5rem", fontWeight: 300, whiteSpace: "pre-wrap"
                            }}>
                                {settings?.about_text || "Based on the belief that art is a bridge between the seen and the felt, my work focuses on the subtle interplay of light and texture. Born from a fascination with the natural world, each painting is an exploration of memory and atmosphere."}
                            </p>
                            <p style={{
                                fontFamily: "var(--font-sans)", fontSize: "1rem", color: "var(--color-charcoal-mid)",
                                lineHeight: 1.8, fontWeight: 300
                            }}>
                                I work primarily with oils, enjoying the slow pace and depth that the medium allows. My process is intuitive, often starting with a singular emotion or a specific quality of light observed at dawn or dusk.
                            </p>
                        </div>

                        <div style={{ height: "1px", backgroundColor: "var(--color-border)" }} />

                        <div>
                            <h3 style={{
                                fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontStyle: "italic",
                                fontWeight: 400, color: "var(--color-charcoal)", marginBottom: "1.5rem"
                            }}>
                                Philosophy
                            </h3>
                            <p style={{
                                fontFamily: "var(--font-sans)", fontSize: "1rem", color: "var(--color-charcoal-mid)",
                                lineHeight: 1.8, fontWeight: 300
                            }}>
                                I don’t believe in perfection. I believe in the &quot;honest&quot; mark—the visible brushstroke that tells the story of its creation. My goal is not to replicate reality, but to invite the viewer into a space where they can find their own reflections.
                            </p>
                        </div>

                        {/* Awards/Exhibitions Section (Minor labels) */}
                        <div style={{ marginTop: "20px" }}>
                            <span style={{
                                fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "var(--color-muted)",
                                letterSpacing: "0.1em", textTransform: "uppercase"
                            }}>
                                Selected Exhibitions
                            </span>
                            <ul style={{
                                listStyle: "none", padding: 0, marginTop: "15px",
                                display: "flex", flexDirection: "column", gap: "10px"
                            }}>
                                {[
                                    "2024 — Ethereal Echoes, Solo Exhibition",
                                    "2023 — The Light Within, Collective Showcase",
                                    "2022 — Natural Dialogue, Modern Art Fair"
                                ].map((item, i) => (
                                    <li key={i} style={{
                                        fontFamily: "var(--font-mono)", fontSize: "0.75rem",
                                        color: "var(--color-charcoal-mid)", opacity: 0.7
                                    }}>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
