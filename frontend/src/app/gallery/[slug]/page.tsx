"use client";
// Artwork detail page — /gallery/[slug]
// [slug] is a dynamic segment: /gallery/morning-tide, /gallery/golden-hour, etc.
// Next.js automatically captures the URL part after /gallery/ into params.slug

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─────────────────────────────────────────────
// We reuse the same data. In production this
// would be fetched from API: GET /api/artworks/:slug
// ─────────────────────────────────────────────
interface Artwork {
    id: string;
    title: string;
    collection: string;
    year: number;
    medium: string;
    size: string;
    price: number;
    available: boolean;
    tags: string[];
    gradientFrom: string;
    gradientTo: string;
    printAvailable: boolean;
    description?: string;
}

const ARTWORKS: Artwork[] = [
    { id: "morning-tide", title: "Morning Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '24"×30"', price: 1800, available: true, tags: ["Seascape", "Light"], gradientFrom: "#6A9FB5", gradientTo: "#3A6E85", printAvailable: true, description: "The ocean at dawn, before the world wakes. Light fractures across still water in shades of steel and gold. Painted en plein air over three mornings." },
    { id: "deep-blue", title: "Deep Blue", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '16"×20"', price: 1200, available: true, tags: ["Seascape"], gradientFrom: "#2A5F7A", gradientTo: "#1A3A55", printAvailable: true, description: "A study in depth and distance. The sea as a meditation — unending, patient, indifferent to time." },
    { id: "coastal-evening", title: "Coastal Evening", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: '12"×16"', price: 750, available: false, tags: ["Seascape", "Light"], gradientFrom: "#8A7AB5", gradientTo: "#4A5A8A", printAvailable: true, description: "Watercolor captures what oil cannot — the translucency of late light. The coast at the hour when day hesitates before becoming night." },
    { id: "still-waters", title: "Still Waters", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '30"×40"', price: 2800, available: true, tags: ["Seascape"], gradientFrom: "#5A8A8A", gradientTo: "#2A5A5A", printAvailable: false, description: "The largest piece in the Sea Cycles collection. A harbour in absolute stillness, reflecting a sky that has forgotten how to storm." },
    { id: "morning-rush", title: "Morning Rush", collection: "Urban Studies", year: 2023, medium: "Oil", size: '20"×24"', price: 1500, available: true, tags: ["Urban"], gradientFrom: "#8A7A6A", gradientTo: "#5A4A3A", printAvailable: true, description: "The city waking up. Commuters, coffee steam, the particular urgency of 8am. Painted from life at a street corner in the financial district." },
    { id: "city-lights", title: "City Lights", collection: "Urban Studies", year: 2023, medium: "Oil", size: '24"×36"', price: 2100, available: false, tags: ["Urban", "Light"], gradientFrom: "#3A3A5A", gradientTo: "#1A1A3A", printAvailable: true, description: "Night in the city is its own world. Sodium lamps turn rain into gold. This is a painting about electricity and loneliness." },
    { id: "rainy-street", title: "Rainy Street", collection: "Urban Studies", year: 2023, medium: "Watercolor", size: '14"×18"', price: 680, available: true, tags: ["Urban"], gradientFrom: "#6A7A8A", gradientTo: "#3A4A5A", printAvailable: true, description: "Rain as a medium for reflection. Puddles become mirrors, streets become rivers. A small painting with a great deal of sky." },
    { id: "ethereal-dreams", title: "Ethereal Dreams", collection: "Golden Fields", year: 2024, medium: "Oil", size: '24"×30"', price: 1200, available: true, tags: ["Landscape", "Light"], gradientFrom: "#C4B882", gradientTo: "#8A8040", printAvailable: true, description: "A summer field at midday, heat-haze above the wheat. The painting attempts to hold the feeling of being warm." },
    { id: "golden-hour", title: "Golden Hour", collection: "Golden Fields", year: 2023, medium: "Oil", size: '30"×40"', price: 2100, available: false, tags: ["Landscape"], gradientFrom: "#D4B86A", gradientTo: "#C8965A", printAvailable: true, description: "The hour before sunset when everything turns gold and it becomes impossible not to be grateful. My most exhibited piece." },
    { id: "summer-meadow", title: "Summer Meadow", collection: "Golden Fields", year: 2023, medium: "Oil", size: '18"×24"', price: 1350, available: true, tags: ["Landscape"], gradientFrom: "#B8C870", gradientTo: "#8A9840", printAvailable: false, description: "Wildflowers, insects, the smell of dry grass. Painted in one afternoon in a field I couldn't find again." },
    { id: "inner-light", title: "Inner Light", collection: "Portraits & Figures", year: 2022, medium: "Oil", size: '16"×20"', price: 1600, available: true, tags: ["Portrait"], gradientFrom: "#C4A882", gradientTo: "#8A6840", printAvailable: true, description: "A portrait study of a woman reading. Light from above, her face completely absorbed in another world." },
    { id: "contemplation", title: "Contemplation", collection: "Portraits & Figures", year: 2022, medium: "Oil", size: '20"×24"', price: 1900, available: true, tags: ["Portrait"], gradientFrom: "#9A8870", gradientTo: "#6A5840", printAvailable: false, description: "Silence as a subject. The figure is secondary to the quality of stillness that fills the room." },
];

const PRINT_SIZES = [
    { label: 'A4 (8"×12")', price: 80 },
    { label: 'A3 (12"×16")', price: 120 },
    { label: 'A2 (16"×24")', price: 180 },
    { label: '50×70 cm', price: 220 },
    { label: '70×100 cm', price: 320 },
];

export default function ArtworkDetailPage() {
    // useParams reads the URL dynamic segment
    // e.g. URL /gallery/morning-tide → params.slug = "morning-tide"
    const params = useParams();
    const slug = params?.slug as string;

    // Find the artwork in our data
    const work = ARTWORKS.find((a) => a.id === slug);

    // State for print size selector (only relevant if printAvailable)
    const [selectedPrint, setSelectedPrint] = useState(PRINT_SIZES[1]);
    const [inquireOpen, setInquireOpen] = useState(false);
    // Full-size image viewer state
    const [fullSizeOpen, setFullSizeOpen] = useState(false);

    // 404 state — artwork not found
    if (!work) {
        return (
            <div
                style={{
                    minHeight: "60vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "1rem",
                    padding: "4rem 2rem",
                }}
            >
                <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.5rem", color: "var(--color-muted)" }}>
                    Artwork not found
                </p>
                <Link
                    href="/gallery"
                    style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.8rem",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "var(--color-accent)",
                        textDecoration: "none",
                        borderBottom: "1px solid var(--color-accent)",
                    }}
                >
                    ← Back to Gallery
                </Link>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "3rem 2rem 6rem" }}>
            {/* ── Breadcrumb navigation ── */}
            <nav
                style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.75rem",
                    color: "var(--color-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: "3rem",
                }}
            >
                <Link href="/gallery" style={{ color: "var(--color-muted)", textDecoration: "none" }}>
                    Gallery
                </Link>
                <span>›</span>
                <span style={{ color: "var(--color-muted)" }}>{work.collection}</span>
                <span>›</span>
                <span style={{ color: "var(--color-charcoal)" }}>{work.title}</span>
            </nav>

            {/* ── Main layout: image left, info right ── */}
            <div
                style={{
                    display: "grid",
                    // Two columns on large screens, stacks on mobile
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "4rem",
                    alignItems: "start",
                }}
            >
                {/* ── Left: Artwork Image ── */}
                <div>
                    {/* Main image — gradient placeholder */}
                    <div
                        style={{
                            aspectRatio: "4 / 5",
                            background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                            position: "relative",
                            border: "1px solid var(--color-border)",
                        }}
                    >
                        {/* Available/Sold badge */}
                        <span
                            style={{
                                position: "absolute",
                                top: "1rem",
                                left: "1rem",
                                padding: "0.25rem 0.75rem",
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                fontFamily: "var(--font-sans)",
                                color: "var(--color-cream)",
                                backgroundColor: work.available ? "var(--color-available)" : "var(--color-sold)",
                            }}
                        >
                            {work.available ? "Available" : "Sold"}
                        </span>
                    </div>

                    {/* Tags + full-size button row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", marginTop: "1rem" }}>
                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {work.tags.map((tag) => (
                                <Link
                                    key={tag}
                                    href={`/gallery?tag=${tag}`}
                                    style={{
                                        padding: "0.25rem 0.75rem",
                                        fontSize: "0.7rem",
                                        letterSpacing: "0.08em",
                                        textTransform: "uppercase",
                                        fontFamily: "var(--font-sans)",
                                        color: "var(--color-charcoal-mid)",
                                        border: "1px solid var(--color-border-dark)",
                                        textDecoration: "none",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    {tag}
                                </Link>
                            ))}
                        </div>
                        {/* View full size button */}
                        <button
                            onClick={() => setFullSizeOpen(true)}
                            style={{
                                display: "flex", alignItems: "center", gap: "0.4rem",
                                background: "none", border: "none", cursor: "pointer",
                                fontFamily: "var(--font-sans)", fontSize: "0.7rem",
                                fontWeight: 500, letterSpacing: "0.1em",
                                textTransform: "uppercase", color: "var(--color-muted)",
                                padding: "0.25rem 0", transition: "color 0.15s",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = "var(--color-charcoal)")}
                            onMouseLeave={e => (e.currentTarget.style.color = "var(--color-muted)")}
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M9 1h4v4M5 13H1V9M13 1L8 6M1 13l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            View full size
                        </button>
                    </div>
                </div>

                {/* ── Right: Info panel ── */}
                <div>
                    {/* Collection name */}
                    <p
                        style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                            letterSpacing: "0.2em",
                            textTransform: "uppercase",
                            color: "var(--color-accent)",
                            marginBottom: "0.75rem",
                        }}
                    >
                        {work.collection}
                    </p>

                    {/* Title */}
                    <h1
                        style={{
                            fontFamily: "var(--font-serif)",
                            fontSize: "clamp(2rem, 4vw, 2.75rem)",
                            fontWeight: 600,
                            fontStyle: "italic",
                            color: "var(--color-charcoal)",
                            lineHeight: 1.1,
                            marginBottom: "1.5rem",
                        }}
                    >
                        {work.title}
                    </h1>

                    {/* Specs table */}
                    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "2rem" }}>
                        <tbody>
                            {[
                                ["Year", String(work.year)],
                                ["Medium", work.medium],
                                ["Size", work.size],
                            ].map(([label, value]) => (
                                <tr
                                    key={label}
                                    style={{
                                        borderBottom: "1px solid var(--color-border)",
                                    }}
                                >
                                    <td
                                        style={{
                                            paddingTop: "0.75rem",
                                            paddingBottom: "0.75rem",
                                            paddingRight: "1rem",
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.75rem",
                                            fontWeight: 600,
                                            letterSpacing: "0.1em",
                                            textTransform: "uppercase",
                                            color: "var(--color-muted)",
                                            width: "100px",
                                        }}
                                    >
                                        {label}
                                    </td>
                                    <td
                                        style={{
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.9rem",
                                            color: "var(--color-charcoal)",
                                        }}
                                    >
                                        {value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Description */}
                    {work.description && (
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.95rem",
                                fontWeight: 300,
                                color: "var(--color-charcoal-mid)",
                                lineHeight: 1.8,
                                marginBottom: "2.5rem",
                            }}
                        >
                            {work.description}
                        </p>
                    )}

                    {/* ── Purchase section (original) ── */}
                    {work.available && (
                        <div
                            style={{
                                padding: "1.5rem",
                                border: "1px solid var(--color-border)",
                                backgroundColor: "var(--color-cream-dark)",
                                marginBottom: "1.5rem",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    justifyContent: "space-between",
                                    marginBottom: "1rem",
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        letterSpacing: "0.15em",
                                        textTransform: "uppercase",
                                        color: "var(--color-muted)",
                                    }}
                                >
                                    Original Painting
                                </span>
                                <span
                                    style={{
                                        fontFamily: "var(--font-serif)",
                                        fontSize: "1.75rem",
                                        fontWeight: 600,
                                        color: "var(--color-charcoal)",
                                    }}
                                >
                                    ${work.price.toLocaleString()}
                                </span>
                            </div>
                            <button
                                onClick={() => setInquireOpen(true)}
                                style={{
                                    width: "100%",
                                    padding: "0.875rem",
                                    backgroundColor: "var(--color-charcoal)",
                                    color: "var(--color-cream)",
                                    border: "none",
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "0.8rem",
                                    fontWeight: 500,
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    cursor: "pointer",
                                    transition: "background-color 0.2s ease",
                                }}
                            >
                                Inquire to Purchase
                            </button>
                        </div>
                    )}

                    {/* ── Print section ── */}
                    {work.printAvailable && (
                        <div
                            style={{
                                padding: "1.5rem",
                                border: "1px solid var(--color-border)",
                                backgroundColor: "var(--color-cream-dark)",
                            }}
                        >
                            <p
                                style={{
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "0.7rem",
                                    fontWeight: 600,
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    color: "var(--color-muted)",
                                    marginBottom: "1rem",
                                }}
                            >
                                Fine Art Prints
                            </p>

                            {/* Print size selector */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                                {PRINT_SIZES.map((ps) => (
                                    <button
                                        key={ps.label}
                                        onClick={() => setSelectedPrint(ps)}
                                        style={{
                                            padding: "0.4rem 0.8rem",
                                            fontSize: "0.75rem",
                                            fontFamily: "var(--font-sans)",
                                            border: "1px solid",
                                            borderColor: selectedPrint.label === ps.label ? "var(--color-charcoal)" : "var(--color-border-dark)",
                                            backgroundColor: selectedPrint.label === ps.label ? "var(--color-charcoal)" : "transparent",
                                            color: selectedPrint.label === ps.label ? "var(--color-cream)" : "var(--color-charcoal-mid)",
                                            cursor: "pointer",
                                            transition: "all 0.2s ease",
                                        }}
                                    >
                                        {ps.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "var(--color-muted)" }}>
                                    {selectedPrint.label}
                                </span>
                                <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.4rem", fontWeight: 600, color: "var(--color-charcoal)" }}>
                                    ${selectedPrint.price}
                                </span>
                            </div>

                            <Link
                                href={`/shop/${work.id}`}
                                style={{
                                    display: "block",
                                    textAlign: "center",
                                    padding: "0.875rem",
                                    backgroundColor: "transparent",
                                    color: "var(--color-charcoal)",
                                    border: "1px solid var(--color-charcoal)",
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "0.8rem",
                                    fontWeight: 500,
                                    letterSpacing: "0.15em",
                                    textTransform: "uppercase",
                                    textDecoration: "none",
                                    transition: "all 0.2s ease",
                                }}
                            >
                                Order Print
                            </Link>
                        </div>
                    )}

                    {/* Back link */}
                    <Link
                        href="/gallery"
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            marginTop: "2rem",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.8rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: "var(--color-muted)",
                            textDecoration: "none",
                        }}
                    >
                        ← Back to Gallery
                    </Link>
                </div>
            </div>

            {/* ── Full Size Viewer ── */}
            {fullSizeOpen && (
                <div
                    onClick={() => setFullSizeOpen(false)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 200,
                        backgroundColor: "rgba(0,0,0,0.92)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "zoom-out",
                    }}
                >
                    <div style={{
                        maxWidth: "90vw", maxHeight: "90vh",
                        aspectRatio: "4/5",
                        background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                        boxShadow: "0 40px 120px rgba(0,0,0,0.8)",
                    }} />
                    <button
                        onClick={() => setFullSizeOpen(false)}
                        style={{
                            position: "fixed", top: "1.5rem", right: "1.5rem",
                            background: "rgba(255,255,255,0.1)", border: "none",
                            color: "#fff", fontSize: "1.5rem", width: "44px", height: "44px",
                            borderRadius: "50%", cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center",
                        }}
                    >✕</button>
                </div>
            )}

            {/* ── Inquire Modal ── */}
            {/*
        Simple modal that appears when user clicks "Inquire to Purchase".
        In production this would submit to API: POST /api/inquiries
      */}
            {inquireOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        onClick={() => setInquireOpen(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            backgroundColor: "rgba(26, 26, 24, 0.6)",
                            backdropFilter: "blur(4px)",
                            zIndex: 100,
                        }}
                    />
                    {/* Modal box */}
                    <div
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 101,
                            backgroundColor: "var(--color-cream)",
                            padding: "2.5rem",
                            width: "min(500px, 90vw)",
                            border: "1px solid var(--color-border)",
                        }}
                    >
                        <h2
                            style={{
                                fontFamily: "var(--font-serif)",
                                fontSize: "1.5rem",
                                fontStyle: "italic",
                                marginBottom: "0.5rem",
                                color: "var(--color-charcoal)",
                            }}
                        >
                            Inquire About "{work.title}"
                        </h2>
                        <p
                            style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: "0.85rem",
                                color: "var(--color-muted)",
                                marginBottom: "1.5rem",
                                lineHeight: 1.6,
                            }}
                        >
                            Send a message and I'll get back to you within 48 hours.
                        </p>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                alert("Your inquiry has been sent! I'll be in touch soon.");
                                setInquireOpen(false);
                            }}
                            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
                        >
                            {["Your Name", "Your Email"].map((placeholder, i) => (
                                <input
                                    key={i}
                                    type={i === 1 ? "email" : "text"}
                                    placeholder={placeholder}
                                    required
                                    style={{
                                        padding: "0.875rem 1rem",
                                        border: "1px solid var(--color-border-dark)",
                                        backgroundColor: "var(--color-cream-dark)",
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.9rem",
                                        color: "var(--color-charcoal)",
                                        outline: "none",
                                        width: "100%",
                                    }}
                                />
                            ))}
                            <textarea
                                placeholder="Your message..."
                                rows={3}
                                style={{
                                    padding: "0.875rem 1rem",
                                    border: "1px solid var(--color-border-dark)",
                                    backgroundColor: "var(--color-cream-dark)",
                                    fontFamily: "var(--font-sans)",
                                    fontSize: "0.9rem",
                                    color: "var(--color-charcoal)",
                                    outline: "none",
                                    resize: "vertical",
                                    width: "100%",
                                }}
                            />
                            <div style={{ display: "flex", gap: "1rem" }}>
                                <button
                                    type="submit"
                                    style={{
                                        flex: 1,
                                        padding: "0.875rem",
                                        backgroundColor: "var(--color-charcoal)",
                                        color: "var(--color-cream)",
                                        border: "none",
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.8rem",
                                        fontWeight: 500,
                                        letterSpacing: "0.12em",
                                        textTransform: "uppercase",
                                        cursor: "pointer",
                                    }}
                                >
                                    Send Inquiry
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setInquireOpen(false)}
                                    style={{
                                        padding: "0.875rem 1.5rem",
                                        backgroundColor: "transparent",
                                        color: "var(--color-charcoal-mid)",
                                        border: "1px solid var(--color-border-dark)",
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.8rem",
                                        cursor: "pointer",
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            )}
        </div>
    );
}
