"use client";
// Artwork detail page — /gallery/[slug]
// [slug] is a dynamic segment: /gallery/morning-tide, /gallery/golden-hour, etc.
// Next.js automatically captures the URL part after /gallery/ into params.slug

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";

// ─────────────────────────────────────────────
// We reuse the same data. In production this
// would be fetched from API: GET /api/artworks/:slug
// ─────────────────────────────────────────────
type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface Artwork {
    id: string;
    title: string;
    collection: string;
    year: number;
    medium: string;
    size: string;
    price: number;
    originalStatus: OriginalStatus;
    tags: string[];
    gradientFrom: string;
    gradientTo: string;
    printAvailable: boolean;
    description?: string;
}

const ARTWORKS: Artwork[] = [
    { id: "morning-tide", title: "Morning Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '24"×30"', price: 1800, originalStatus: "available", tags: ["Seascape", "Light"], gradientFrom: "#6A9FB5", gradientTo: "#3A6E85", printAvailable: true, description: "The ocean at dawn, before the world wakes. Light fractures across still water in shades of steel and gold. Painted en plein air over three mornings." },
    { id: "deep-blue", title: "Deep Blue", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '16"×20"', price: 1200, originalStatus: "sold", tags: ["Seascape"], gradientFrom: "#2A5F7A", gradientTo: "#1A3A55", printAvailable: true, description: "A study in depth and distance. The sea as a meditation — unending, patient, indifferent to time." },
    { id: "coastal-evening", title: "Coastal Evening", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: '12"×16"', price: 750, originalStatus: "reserved", tags: ["Seascape", "Light"], gradientFrom: "#8A7AB5", gradientTo: "#4A5A8A", printAvailable: true, description: "Watercolor captures what oil cannot — the translucency of late light. The coast at the hour when day hesitates before becoming night." },
    { id: "still-waters", title: "Still Waters", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '30"×40"', price: 2800, originalStatus: "available", tags: ["Seascape"], gradientFrom: "#5A8A8A", gradientTo: "#2A5A5A", printAvailable: false, description: "The largest piece in the Sea Cycles collection. A harbour in absolute stillness, reflecting a sky that has forgotten how to storm." },
    { id: "horizon-glow", title: "Horizon Glow", collection: "Sea Cycles 2024", year: 2024, medium: "Oil", size: '20"×24"', price: 1600, originalStatus: "not_for_sale", tags: ["Seascape", "Light"], gradientFrom: "#D4905A", gradientTo: "#8A5030", printAvailable: true, description: "Sunset over the Pacific coast. The horizon becomes a band of molten copper and amber." },
    { id: "morning-rush", title: "Morning Rush", collection: "Urban Studies", year: 2023, medium: "Oil", size: '20"×24"', price: 1500, originalStatus: "on_exhibition", tags: ["Urban"], gradientFrom: "#8A7A6A", gradientTo: "#5A4A3A", printAvailable: true, description: "The city waking up. Commuters, coffee steam, the particular urgency of 8am. Painted from life at a street corner in the financial district." },
    { id: "city-lights", title: "City Lights", collection: "Urban Studies", year: 2023, medium: "Oil", size: '24"×36"', price: 2100, originalStatus: "archived", tags: ["Urban", "Light"], gradientFrom: "#3A3A5A", gradientTo: "#1A1A3A", printAvailable: true, description: "Night in the city is its own world. Sodium lamps turn rain into gold. This is a painting about electricity and loneliness." },
    { id: "rainy-street", title: "Rainy Street", collection: "Urban Studies", year: 2023, medium: "Watercolor", size: '14"×18"', price: 680, originalStatus: "digital", tags: ["Urban"], gradientFrom: "#6A7A8A", gradientTo: "#3A4A5A", printAvailable: true, description: "Rain as a medium for reflection. Puddles become mirrors, streets become rivers. A small painting with a great deal of sky." },
    { id: "ethereal-dreams", title: "Ethereal Dreams", collection: "Golden Fields", year: 2024, medium: "Oil", size: '24"×30"', price: 1200, originalStatus: "available", tags: ["Landscape", "Light"], gradientFrom: "#C4B882", gradientTo: "#8A8040", printAvailable: true, description: "A summer field at midday, heat-haze above the wheat. The painting attempts to hold the feeling of being warm." },
    { id: "golden-hour", title: "Golden Hour", collection: "Golden Fields", year: 2023, medium: "Oil", size: '30"×40"', price: 2100, originalStatus: "sold", tags: ["Landscape"], gradientFrom: "#D4B86A", gradientTo: "#C8965A", printAvailable: true, description: "The hour before sunset when everything turns gold and it becomes impossible not to be grateful. My most exhibited piece." },
    { id: "summer-meadow", title: "Summer Meadow", collection: "Golden Fields", year: 2023, medium: "Oil", size: '18"×24"', price: 1350, originalStatus: "available", tags: ["Landscape"], gradientFrom: "#B8C870", gradientTo: "#8A9840", printAvailable: false, description: "Wildflowers, insects, the smell of dry grass. Painted in one afternoon in a field I couldn't find again." },
    { id: "inner-light", title: "Inner Light", collection: "Portraits & Figures", year: 2022, medium: "Oil", size: '16"×20"', price: 1600, originalStatus: "not_for_sale", tags: ["Portrait"], gradientFrom: "#C4A882", gradientTo: "#8A6840", printAvailable: true, description: "A portrait study of a woman reading. Light from above, her face completely absorbed in another world." },
    { id: "contemplation", title: "Contemplation", collection: "Portraits & Figures", year: 2022, medium: "Oil", size: '20"×24"', price: 1900, originalStatus: "available", tags: ["Portrait"], gradientFrom: "#9A8870", gradientTo: "#6A5840", printAvailable: false, description: "Silence as a subject. The figure is secondary to the quality of stillness that fills the room." },
];

const PRINT_SIZES = [
    { labelCm: "20 × 30 cm", labelIn: "8 × 12 in", price: 80 },
    { labelCm: "30 × 40 cm", labelIn: "12 × 16 in", price: 120 },
    { labelCm: "40 × 60 cm", labelIn: "16 × 24 in", price: 180 },
    { labelCm: "50 × 70 cm", labelIn: "20 × 28 in", price: 220 },
    { labelCm: "70 × 100 cm", labelIn: "28 × 40 in", price: 320 },
];

// Status badge config — maps originalStatus to label + color
const STATUS_BADGE: Record<OriginalStatus, { label: string; bg: string } | null> = {
    available: { label: "Available", bg: "#6DB87E" },
    sold: { label: "Sold", bg: "#D48A8A" },
    reserved: { label: "Reserved", bg: "#C8B478" },
    not_for_sale: { label: "Not for Sale", bg: "#b0b0b0" },
    on_exhibition: { label: "On Exhibition", bg: "#8AACC8" },
    archived: null,
    digital: { label: "Digital", bg: "#B8A0D8" },
};

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
    const [fullSizeOpen, setFullSizeOpen] = useState(false);
    // Zoom + pan state for full-size viewer
    const [zoomPoint, setZoomPoint] = useState<{ x: number; y: number } | null>(null);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);
    // Unit toggle for print sizes: now from global context
    const { units } = usePreferences();
    // Detect touch device for hint
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [showHint, setShowHint] = useState(false);

    useEffect(() => {
        setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
    }, []);

    // Lock body scroll when fullsize viewer or inquire modal is open
    useEffect(() => {
        if (fullSizeOpen || inquireOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [fullSizeOpen, inquireOpen]);

    // Show hint on mobile when fullsize viewer opens
    useEffect(() => {
        if (fullSizeOpen && isTouchDevice) {
            setShowHint(true);
            const t = setTimeout(() => setShowHint(false), 3000);
            return () => clearTimeout(t);
        } else {
            setShowHint(false);
        }
    }, [fullSizeOpen, isTouchDevice]);

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

    // Parse aspect ratio from size string like '24"×30"' → "24/30"
    const sizeMatch = work.size.match(/(\d+)"×(\d+)"/);
    const artW = sizeMatch ? Number(sizeMatch[1]) : 4;
    const artH = sizeMatch ? Number(sizeMatch[2]) : 5;
    const artAspect = `${artW}/${artH}`;
    const artRatio = artW / artH; // numeric ratio for CSS min() calculations

    return (
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 2rem 6rem" }}>

            {/* Top back link */}
            <Link
                href="/shop"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-muted)",
                    textDecoration: "none",
                    marginBottom: "2rem",
                    transition: "color 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--color-charcoal)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--color-muted)")}
            >
                ← Back to Shop
            </Link>
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
                    {/* Main image — gradient placeholder, uses real painting proportions */}
                    <div
                        style={{
                            aspectRatio: artAspect,
                            background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                            position: "relative",
                            border: "1px solid var(--color-border)",
                        }}
                    >
                        {/* Status badge */}
                        {STATUS_BADGE[work.originalStatus] && (
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
                                    color: "#fff",
                                    backgroundColor: STATUS_BADGE[work.originalStatus]!.bg,
                                }}
                            >
                                {STATUS_BADGE[work.originalStatus]!.label}
                            </span>
                        )}
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
                    {work.originalStatus === "available" && (
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
                            <div style={{
                                display: "flex", alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: "1rem",
                            }}>
                                <p
                                    style={{
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.7rem",
                                        fontWeight: 600,
                                        letterSpacing: "0.15em",
                                        textTransform: "uppercase",
                                        color: "var(--color-muted)",
                                        margin: 0,
                                    }}
                                >
                                    Fine Art Prints
                                </p>

                            </div>

                            {/* Print size selector */}
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                                {PRINT_SIZES.map((ps) => {
                                    const label = units === "cm" ? ps.labelCm : ps.labelIn;
                                    const isActive = selectedPrint === ps;
                                    return (
                                        <button
                                            key={ps.labelCm}
                                            onClick={() => setSelectedPrint(ps)}
                                            style={{
                                                padding: "0.4rem 0.8rem",
                                                fontSize: "0.75rem",
                                                fontFamily: "var(--font-sans)",
                                                border: "1px solid",
                                                borderColor: isActive ? "var(--color-charcoal)" : "var(--color-border-dark)",
                                                backgroundColor: isActive ? "var(--color-charcoal)" : "transparent",
                                                color: isActive ? "var(--color-cream)" : "var(--color-charcoal-mid)",
                                                cursor: "pointer",
                                                transition: "all 0.2s ease",
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "var(--color-muted)" }}>
                                    {units === "cm" ? selectedPrint.labelCm : selectedPrint.labelIn}
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
                        href="/shop"
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
                        ← Back to Shop
                    </Link>
                </div>
            </div>

            {/* ── Full Size Viewer ── */}
            {fullSizeOpen && (
                <div
                    onClick={() => { if (!zoomPoint) { setFullSizeOpen(false); } else { setZoomPoint(null); setPanOffset({ x: 0, y: 0 }); } }}
                    style={{
                        position: "fixed", inset: 0, zIndex: 200,
                        backgroundColor: "rgba(0,0,0,0.95)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: zoomPoint ? "default" : "default",
                        overflow: "hidden",
                    }}
                >
                    {/* Painting — wheel zoom (PC) + double-tap zoom (mobile) + drag pan */}
                    <div
                        onWheel={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (e.deltaY < 0 && !zoomPoint) {
                                // Scroll up → zoom in at cursor position
                                const x = ((e.clientX - rect.left) / rect.width) * 100;
                                const y = ((e.clientY - rect.top) / rect.height) * 100;
                                setZoomPoint({ x, y });
                                setPanOffset({ x: 0, y: 0 });
                            } else if (e.deltaY > 0 && zoomPoint) {
                                // Scroll down → zoom out
                                setZoomPoint(null);
                                setPanOffset({ x: 0, y: 0 });
                            }
                        }}
                        onDoubleClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            if (zoomPoint) {
                                setZoomPoint(null);
                                setPanOffset({ x: 0, y: 0 });
                            } else {
                                const x = ((e.clientX - rect.left) / rect.width) * 100;
                                const y = ((e.clientY - rect.top) / rect.height) * 100;
                                setZoomPoint({ x, y });
                                setPanOffset({ x: 0, y: 0 });
                            }
                        }}
                        onMouseDown={(e) => {
                            if (!zoomPoint) return;
                            e.preventDefault();
                            dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                        }}
                        onMouseMove={(e) => {
                            if (!dragRef.current) return;
                            const dx = e.clientX - dragRef.current.startX;
                            const dy = e.clientY - dragRef.current.startY;
                            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                            setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                        }}
                        onMouseUp={() => {
                            if (!dragRef.current) return;
                            dragRef.current = null;
                        }}
                        onMouseLeave={() => { dragRef.current = null; }}
                        onTouchStart={(e) => {
                            if (!zoomPoint || e.touches.length !== 1) return;
                            dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                        }}
                        onTouchMove={(e) => {
                            if (!dragRef.current || e.touches.length !== 1) return;
                            e.preventDefault();
                            const dx = e.touches[0].clientX - dragRef.current.startX;
                            const dy = e.touches[0].clientY - dragRef.current.startY;
                            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                            setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                        }}
                        onTouchEnd={() => { dragRef.current = null; }}
                        onClick={(e) => { e.stopPropagation(); }}
                        style={{
                            width: `min(94vw, calc(94vh * ${artRatio}))`,
                            height: `min(94vh, calc(94vw / ${artRatio}))`,
                            aspectRatio: artAspect,
                            background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                            boxShadow: "0 20px 80px rgba(0,0,0,0.6)",
                            cursor: zoomPoint ? (dragRef.current ? "grabbing" : "grab") : "default",
                            transition: dragRef.current ? "none" : "transform 0.3s ease",
                            transform: zoomPoint
                                ? `scale(2) translate(${panOffset.x / 2}px, ${panOffset.y / 2}px)`
                                : "scale(1)",
                            transformOrigin: zoomPoint ? `${zoomPoint.x}% ${zoomPoint.y}%` : "center center",
                            userSelect: "none",
                        }}
                    />
                    {/* Close button — always visible */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setFullSizeOpen(false); setZoomPoint(null); setPanOffset({ x: 0, y: 0 }); }}
                        style={{
                            position: "fixed", top: "1.5rem", right: "1.5rem",
                            background: "rgba(255,255,255,0.1)", border: "none",
                            color: "#fff", fontSize: "1.5rem", width: "44px", height: "44px",
                            borderRadius: "50%", cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            transition: "background 0.2s",
                            zIndex: 201,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
                    >✕</button>
                    {/* Mobile hint — bottom, fades out */}
                    {isTouchDevice && !zoomPoint && (
                        <div style={{
                            position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
                            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                            padding: "0.5rem 1.25rem", borderRadius: "24px",
                            backdropFilter: "blur(8px)", zIndex: 201, pointerEvents: "none",
                            opacity: showHint ? 1 : 0, transition: "opacity 0.8s ease",
                        }}>
                            <span style={{
                                fontFamily: "var(--font-sans)", fontSize: "0.7rem",
                                fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
                                color: "rgba(255,255,255,0.7)",
                            }}>
                                Double tap to zoom
                            </span>
                        </div>
                    )}

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
