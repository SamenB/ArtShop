"use client";
// Gallery — CSS Grid, each painting fills column width at its natural aspect-ratio.
// Equal column widths. Height per row = tallest item. Works like Erin Hanson reference.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";

interface Artwork {
    id: string; title: string; collection: string; year: number;
    medium: string; size: string; aspectRatio: string;
    tags: string[]; gradientFrom: string; gradientTo: string; available: boolean;
}

const ARTWORKS: Artwork[] = [
    { id: "morning-tide", title: "Morning Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", aspectRatio: "4/5", tags: ["Seascape", "Light"], gradientFrom: "#6A9FB5", gradientTo: "#3A6E85", available: true },
    { id: "deep-blue", title: "Deep Blue", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "16 × 20 in", aspectRatio: "4/5", tags: ["Seascape"], gradientFrom: "#2A5F7A", gradientTo: "#1A3A55", available: true },
    { id: "coastal-evening", title: "Coastal Evening", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: "12 × 16 in", aspectRatio: "3/4", tags: ["Seascape", "Light"], gradientFrom: "#8A7AB5", gradientTo: "#4A5A8A", available: false },
    { id: "still-waters", title: "Still Waters", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "30 × 40 in", aspectRatio: "3/4", tags: ["Seascape"], gradientFrom: "#5A8A8A", gradientTo: "#2A5A5A", available: true },
    { id: "horizon-glow", title: "Horizon Glow", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "20 × 24 in", aspectRatio: "5/4", tags: ["Seascape", "Light"], gradientFrom: "#D4905A", gradientTo: "#8A5030", available: true },
    { id: "salt-air", title: "Salt Air", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: "18 × 24 in", aspectRatio: "3/4", tags: ["Seascape"], gradientFrom: "#A8C8D8", gradientTo: "#5A8A9A", available: true },
    { id: "low-tide", title: "Low Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "24 × 36 in", aspectRatio: "2/3", tags: ["Seascape"], gradientFrom: "#7A9A8A", gradientTo: "#3A5A4A", available: false },
    { id: "kelp-forest", title: "Kelp Forest", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "36 × 48 in", aspectRatio: "3/4", tags: ["Seascape"], gradientFrom: "#3A6A4A", gradientTo: "#1A3A2A", available: true },
    { id: "sea-fog", title: "Sea Fog", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: "14 × 18 in", aspectRatio: "7/9", tags: ["Seascape", "Light"], gradientFrom: "#C8D4DC", gradientTo: "#8A9AA8", available: true },
    { id: "morning-rush", title: "Morning Rush", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "20 × 24 in", aspectRatio: "5/4", tags: ["Urban"], gradientFrom: "#8A7A6A", gradientTo: "#5A4A3A", available: true },
    { id: "city-lights", title: "City Lights", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "24 × 36 in", aspectRatio: "2/3", tags: ["Urban", "Light"], gradientFrom: "#3A3A5A", gradientTo: "#1A1A3A", available: false },
    { id: "rainy-street", title: "Rainy Street", collection: "Urban Studies", year: 2023, medium: "Watercolor", size: "14 × 18 in", aspectRatio: "7/9", tags: ["Urban"], gradientFrom: "#6A7A8A", gradientTo: "#3A4A5A", available: true },
    { id: "ethereal-dreams", title: "Ethereal Dreams", collection: "Golden Fields", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", aspectRatio: "4/5", tags: ["Landscape", "Light"], gradientFrom: "#C4B882", gradientTo: "#8A8040", available: true },
    { id: "golden-hour", title: "Golden Hour", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "30 × 40 in", aspectRatio: "3/4", tags: ["Landscape"], gradientFrom: "#D4B86A", gradientTo: "#C8965A", available: false },
    { id: "summer-meadow", title: "Summer Meadow", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "18 × 24 in", aspectRatio: "3/4", tags: ["Landscape"], gradientFrom: "#B8C870", gradientTo: "#8A9840", available: true },
    { id: "inner-light", title: "Inner Light", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "16 × 20 in", aspectRatio: "4/5", tags: ["Portrait"], gradientFrom: "#C4A882", gradientTo: "#8A6840", available: true },
    { id: "contemplation", title: "Contemplation", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "20 × 24 in", aspectRatio: "5/6", tags: ["Portrait"], gradientFrom: "#9A8870", gradientTo: "#6A5840", available: true },
];

const COLLECTIONS = ARTWORKS.reduce<Record<string, Artwork[]>>((acc, a) => { (acc[a.collection] ??= []).push(a); return acc; }, {});

type SortKey = "default" | "year" | "title" | "available";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "default", label: "Collection" }, { key: "year", label: "Newest" },
    { key: "title", label: "Title A–Z" }, { key: "available", label: "Available" },
];
const sortWorks = (works: Artwork[], key: SortKey) => {
    const c = [...works];
    if (key === "year") c.sort((a, b) => b.year - a.year);
    if (key === "title") c.sort((a, b) => a.title.localeCompare(b.title));
    if (key === "available") c.sort((a, b) => (+b.available) - (+a.available));
    return c;
};

// ── LIGHTBOX ─────────────────────────────────────────────────────────────────
function Lightbox({ works, startIndex, onClose }: { works: Artwork[]; startIndex: number; onClose: () => void }) {
    const [idx, setIdx] = useState(startIndex);
    const w = works[idx];
    const tx = useRef<number | null>(null);
    const prev = useCallback(() => setIdx(i => (i - 1 + works.length) % works.length), [works.length]);
    const next = useCallback(() => setIdx(i => (i + 1) % works.length), [works.length]);
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); };
        window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
    }, [onClose, prev, next]);
    useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);
    return (
        <div onTouchStart={e => { tx.current = e.touches[0].clientX; }}
            onTouchEnd={e => { if (!tx.current) return; const d = tx.current - e.changedTouches[0].clientX; if (d > 40) next(); else if (d < -40) prev(); tx.current = null; }}
            style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "#080806", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", height: "52px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>{idx + 1} / {works.length}</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>{w.collection}</span>
                <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: "1.5rem", cursor: "pointer", minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "2rem 3.5rem" }}>
                {works.length > 1 && <button onClick={prev} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", zIndex: 1, width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.2s" }}>‹</button>}
                {works.length > 1 && <button onClick={next} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", zIndex: 1, width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.2s" }}>›</button>}
                {/* Contains the painting within available space, no cropping */}
                <div style={{
                    aspectRatio: w.aspectRatio,
                    maxWidth: "100%",
                    maxHeight: "100%",
                    width: "auto",
                    height: "auto",
                    background: `linear-gradient(160deg, ${w.gradientFrom} 0%, ${w.gradientTo} 100%)`,
                    borderRadius: "2px",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                }} />
            </div>
            <div style={{ flexShrink: 0, padding: "0.85rem 1.25rem 1.1rem", borderTop: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(8,8,6,0.98)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: works.length > 1 ? "0.65rem" : 0 }}>
                    <div>
                        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1rem", fontWeight: 600, color: "#FAFAF7", marginBottom: "0.2rem" }}>{w.title}</p>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "rgba(255,255,255,0.45)" }}>{w.size} · {w.medium}{w.available && <span style={{ marginLeft: "0.6rem", color: "#6DB87E" }}>● Available</span>}</p>
                    </div>
                    <Link href={`/shop?work=${w.id}`} onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "1px", flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center" }}>Shop →</Link>
                </div>
                {works.length > 1 && (
                    <div style={{ display: "flex", gap: "5px", alignItems: "center", justifyContent: "center" }}>
                        {works.map((_, i) => <button key={i} onClick={() => setIdx(i)} style={{ width: i === idx ? "18px" : "6px", height: "6px", borderRadius: "3px", backgroundColor: i === idx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)", border: "none", cursor: "pointer", padding: 0, transition: "width 0.25s ease, background-color 0.2s ease" }} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── ART CARD ─────────────────────────────────────────────────────────────────
// width: 100% fills the grid column.
// aspectRatio on the image div → height determined by painting's proportions.
// Hover: image container lifts + shadow, inner gradient zooms.
// Text sits naturally below — no overflow, no clipping.
function ArtCard({ work, onClick }: { work: Artwork; onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ all: "unset", display: "flex", flexDirection: "column", cursor: "pointer", width: "100%" }}>

            <div style={{ width: "100%" }}>
                {/* OUTER — shadow + lift, NO overflow:hidden so shadow renders */}
                <div style={{
                    width: "100%",
                    aspectRatio: work.aspectRatio,
                    borderRadius: "3px",
                    // Punchy double shadow — matches Shop card style
                    boxShadow: hovered
                        ? "0 20px 60px rgba(0,0,0,0.45), 0 6px 16px rgba(0,0,0,0.22)"
                        : "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14)",
                    transform: hovered ? "translateY(-4px)" : "translateY(0)",
                    transition: "transform 0.4s ease-out, box-shadow 0.4s ease-out",
                }}>
                    {/* INNER — clips the zoom, no shadow conflict */}
                    <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: "2px" }}>
                        <div style={{
                            width: "100%", height: "100%",
                            background: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
                            // Gentle crop/zoom
                            transform: hovered ? "scale(1.02)" : "scale(1)",
                            transition: "transform 0.5s ease",
                        }} />
                    </div>
                </div>
            </div>

            {/* Fixed-height text block: same height for all cards so grid align-items:center
                aligns painting centers (not card centers) on the same horizontal axis */}
            <div style={{ minHeight: "4rem", paddingTop: "0.8rem", display: "flex", flexDirection: "column" }}>
                <p style={{
                    fontFamily: "var(--font-sans)", fontSize: "0.85rem",
                    fontWeight: 300, letterSpacing: "0.02em",
                    color: "var(--color-charcoal)", marginBottom: "auto",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{work.title}</p>
                <div style={{ marginTop: "0.2rem" }}>
                    <p style={{
                        fontFamily: "var(--font-sans)", fontSize: "0.58rem",
                        fontWeight: 500, letterSpacing: "0.14em",
                        textTransform: "uppercase", color: "var(--color-muted)",
                    }}>
                        {work.size} &middot; {work.medium}
                        {work.available
                            ? <span style={{ color: "var(--color-available)", marginLeft: "0.4rem" }}>&#9679;</span>
                            : <span style={{ color: "var(--color-sold)", marginLeft: "0.4rem" }}>&#9679;</span>}
                    </p>
                </div>
            </div>
        </button>

    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function GalleryPage() {
    const [sortKey, setSortKey] = useState<SortKey>("default");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [lightbox, setLightbox] = useState<{ works: Artwork[]; index: number } | null>(null);
    const [cols, setCols] = useState(4);

    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            setCols(w < 480 ? 2 : w < 768 ? 3 : w < 1100 ? 4 : 5);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const sorted = useMemo(() => Object.entries(COLLECTIONS).map(([name, works]) => ({ name, works: sortWorks(works, sortKey) })), [sortKey]);

    return (
        <>
            {lightbox && <Lightbox works={lightbox.works} startIndex={lightbox.index} onClose={() => setLightbox(null)} />}
            <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 1.25rem 2rem" }}>
                {/* Sort bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", marginRight: "0.25rem" }}>Sort</span>
                        {SORT_OPTIONS.map(opt => (
                            <button key={opt.key} onClick={() => setSortKey(opt.key)} style={{ padding: "0.28rem 0.75rem", borderRadius: "999px", border: "1px solid", borderColor: sortKey === opt.key ? "var(--color-charcoal)" : "var(--color-border-dark)", backgroundColor: sortKey === opt.key ? "var(--color-charcoal)" : "transparent", color: sortKey === opt.key ? "var(--color-cream)" : "var(--color-charcoal-mid)", fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: sortKey === opt.key ? 600 : 400, cursor: "pointer", transition: "all 0.15s ease", whiteSpace: "nowrap" }}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "var(--color-muted)", flexShrink: 0 }}>{ARTWORKS.length} works</span>
                </div>
            </div>

            {/* Collections */}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {sorted.map(({ name, works }, idx) => {
                    const isCollapsed = !!collapsed[name];
                    // Subtle background variations to softly separate collections
                    const backgrounds = [
                        "transparent", // 1st: default cream
                        "radial-gradient(ellipse at top left, rgba(200, 150, 90, 0.04), transparent 70%)", // 2nd: warm hint
                        "radial-gradient(ellipse at top right, rgba(141, 180, 196, 0.05), transparent 70%)", // 3rd: cool hint
                        "radial-gradient(ellipse at bottom, rgba(26, 26, 24, 0.03), transparent 70%)", // 4th: neutral hint
                    ];
                    const bg = backgrounds[idx % backgrounds.length];

                    return (
                        <section key={name} style={{ background: bg, paddingTop: "1rem", paddingBottom: "6rem", borderTop: idx > 0 ? "1px solid rgba(26,26,24,0.04)" : "none" }}>
                            <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "0 1.25rem" }}>
                                <button onClick={() => setCollapsed(p => ({ ...p, [name]: !p[name] }))} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem 0", background: "none", border: "none", borderBottom: "1px solid rgba(26,26,24,0.12)", cursor: "pointer", marginBottom: isCollapsed ? 0 : "3rem", textAlign: "left", transition: "border-color 0.2s ease" }} onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(26,26,24,0.3)"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(26,26,24,0.12)"}>
                                    <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                                        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.5rem, 4vw, 2.2rem)", fontWeight: 400, fontStyle: "italic", color: "var(--color-charcoal)" }}>{name}</h2>
                                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-charcoal-mid)", letterSpacing: "0.05em" }}>{works.length} works</span>
                                    </div>
                                    <span style={{ color: "var(--color-charcoal-mid)", fontSize: "1rem", fontWeight: 300, transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.3s ease", display: "inline-block" }}>∨</span>
                                </button>
                                <div style={{ display: "grid", gridTemplateRows: isCollapsed ? "0fr" : "1fr", transition: "grid-template-rows 0.4s ease-out" }}>
                                    <div style={{ overflow: "hidden" }}>
                                        <div style={{
                                            display: "grid",
                                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                                            gap: "5rem 3.5rem",
                                            alignItems: "center",
                                            marginTop: "1rem"
                                        }}>
                                            {works.map((work, i) => (
                                                <ArtCard key={work.id} work={work} onClick={() => setLightbox({ works, index: i })} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>
        </>
    );
}
