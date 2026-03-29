"use client";
// Gallery — CSS Grid, each painting fills column width at its natural aspect-ratio.
// Equal column widths. Height per row = tallest item. Works like Erin Hanson reference.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl } from "@/utils";
import { useUser } from "@/context/UserContext";

type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

// ARTWORKS will be fetched from API
interface Artwork {
    id: number;
    title: string;
    description: string;
    medium: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    prints_total: number;
    prints_available: number;
    collection_id?: number;
    images?: (string | { thumb: string; medium: string; original: string })[];
    // UI fallbacks
    aspectRatio?: string;
    gradientFrom?: string;
    gradientTo?: string;
}

const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"],
    ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"],
    ["#5A8A8A", "#2A5A5A"],
    ["#D4905A", "#8A5030"],
];

interface CollectionData {
    id: number;
    title: string;
    bg_color?: string;
}

type SortKey = "default" | "year" | "title" | "available";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "default", label: "Collection" }, { key: "year", label: "Newest" },
    { key: "title", label: "Title A–Z" }, { key: "available", label: "Available" },
];
const sortWorks = (works: Artwork[], key: SortKey) => {
    const c = [...works];
    if (key === "year") c.sort((a, b) => b.id - a.id);
    if (key === "title") c.sort((a, b) => a.title.localeCompare(b.title));
    if (key === "available") c.sort((a, b) => (a.original_status === "available" ? 0 : 1) - (b.original_status === "available" ? 0 : 1));
    return c;
};



// ── ART CARD ─────────────────────────────────────────────────────────────────
// width: 100% fills the grid column.
// aspectRatio on the image div → height determined by painting's proportions.
// Hover: image container lifts + shadow, inner gradient zooms.
// Text sits naturally below — no overflow, no clipping.
function ArtCard({ work, onClick }: { work: Artwork; onClick: () => void }) {
    return (
        <button onClick={onClick} className="art-card"
            style={{
                display: "flex", flexDirection: "column", cursor: "pointer", width: "100%",
                background: "none", border: "none", margin: 0,
                textAlign: "left", pointerEvents: "auto",
                padding: 0,
            }}>

            <div className="art-card-container" style={{
                width: "100%",
                aspectRatio: work.aspectRatio || "4/5",
                borderRadius: "2px",
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                transition: "transform 0.3s ease, box-shadow 0.3s ease",
            }}>
                <div className="art-card-inner" style={{
                    width: "100%", height: "100%",
                    backgroundColor: "#ffffff",
                    backgroundImage: work.images?.[0] 
                        ? `url(${getImageUrl(work.images[0], 'original')})` 
                        : `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    position: "relative",
                    transition: "transform 0.5s ease",
                }}>
                </div>
            </div>

            {/* Compact metadata — IBM Plex Mono typewriter style */}
            {/* Fixed-height text — painting centers align across the row */}
            <div style={{ paddingTop: "1rem", height: "6.5rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                <p style={{
                    fontFamily: "var(--font-serif)", fontSize: "1.1rem",
                    fontWeight: 400, fontStyle: "italic",
                    color: "var(--color-charcoal)", marginBottom: "0",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: 1.35, paddingBottom: "0.15rem"
                }}>{work.title}</p>
                <p style={{
                    fontFamily: "var(--font-mono)", fontSize: "0.75rem",
                    fontWeight: 300, letterSpacing: "0.02em", lineHeight: 1.35,
                    color: "var(--color-muted)",
                }}>
                    {(work.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m, wd, h) => `${m} | ${Math.round(Number(wd) * 2.54)} × ${Math.round(Number(h) * 2.54)} cm`)} · {work.medium}
                    {work.original_status === "available" && <span style={{ color: "var(--color-available)", marginLeft: "0.4rem" }}>●</span>}
                    {work.original_status === "sold" && <span style={{ color: "var(--color-sold)", marginLeft: "0.4rem" }}>●</span>}
                    {work.original_status === "reserved" && <span style={{ color: "#C4963A", marginLeft: "0.4rem" }}>●</span>}
                    {work.original_status === "not_for_sale" && <span style={{ color: "var(--color-muted)", marginLeft: "0.4rem", fontStyle: "italic", fontSize: "0.65rem" }}>Not for Sale</span>}
                    {work.original_status === "on_exhibition" && <span style={{ color: "#5A7AB5", marginLeft: "0.4rem", fontStyle: "italic", fontSize: "0.65rem" }}>On Exhibition</span>}
                    {work.original_status === "digital" && <span style={{ color: "#9B7AE8", marginLeft: "0.4rem" }}>●</span>}
                </p>
            </div>
        </button>

    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function GalleryPage() {
    const { user } = useUser();
    const [allArtworks, setAllArtworks] = useState<Artwork[]>([]);
    const [allCollections, setAllCollections] = useState<CollectionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>("default");
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [lightbox, setLightbox] = useState<{ works: Artwork[]; index: number } | null>(null);
    const [cols, setCols] = useState(3);
    const [gridMode, setGridMode] = useState<"1" | "2" | "3">("2");
    const [isMobile, setIsMobile] = useState(false);

    const itemsPerPage = gridMode === "3" ? 36 : gridMode === "2" ? 24 : 12;
    const [visibleCount, setVisibleCount] = useState(12);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([
            fetch(`${getApiUrl()}/artworks?limit=1000`).then(res => res.json()),
            fetch(`${getApiUrl()}/collections`).then(res => res.json())
        ])
        .then(([artworksData, collectionsData]) => {
            const rawData = artworksData.items || artworksData.data || artworksData;
            if (!Array.isArray(rawData)) {
                console.error("Expected array but got:", artworksData);
                setError("Failed to load gallery. Please try again later.");
                setLoading(false);
                return;
            }
            const items = rawData.map((item: any, idx: number) => ({
                ...item,
                aspectRatio: "4/5", // Default
                gradientFrom: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][0],
                gradientTo: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][1]
            }));
            setAllArtworks(items);

            const cData = collectionsData.items || collectionsData.data || collectionsData;
            if (Array.isArray(cData)) {
                setAllCollections(cData);
            }
            
            setLoading(false);
        })
        .catch(err => {
            console.error(err);
            setError("A network error occurred.");
            setLoading(false);
        });
    }, []);

    const collectionsMap = useMemo(() => {
        return allArtworks.reduce<Record<string, { id?: number, bg?: string, works: Artwork[] }>>((acc, a) => { 
            let collectionName = "Original Paintings"; 
            let collId: number | undefined;
            let bgStr: string | undefined;

            if (a.collection_id) {
                const comp = allCollections.find(c => c.id === a.collection_id);
                if (comp) {
                    collectionName = comp.title;
                    collId = comp.id;
                    bgStr = comp.bg_color;
                }
            }

            if (!acc[collectionName]) acc[collectionName] = { id: collId, bg: bgStr, works: [] };
            acc[collectionName].works.push(a); 
            return acc; 
        }, {});
    }, [allArtworks, allCollections]);
    const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px" });

    useEffect(() => {
        const saved = localStorage.getItem("artshop_gridMode") as "1" | "2" | "3" | null;
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        } else {
            setGridMode("2");
        }
    }, []);

    const handleSetGridMode = (val: "1" | "2" | "3") => {
        setGridMode(val);
        localStorage.setItem("artshop_gridMode", val);
    };

    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            setIsMobile(w < 768);
            setCols(w < 480 ? 1 : w < 768 ? 2 : w < 1100 ? 3 : 4);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const sorted = useMemo(() => {
        // First group and sort all works
        const groups = Object.entries(collectionsMap).map(([name, data]) => ({ name, id: data.id, bg: data.bg, works: sortWorks(data.works, sortKey) }));
        
        // Then limit the total number of works displayed across all groups to `visibleCount`
        let remaining = visibleCount;
        return groups.map(g => {
            if (remaining <= 0) return { name: g.name, id: g.id, bg: g.bg, works: [], totalInGroup: g.works.length };
            const toShow = g.works.slice(0, remaining);
            remaining -= toShow.length;
            return { name: g.name, id: g.id, bg: g.bg, works: toShow, totalInGroup: g.works.length };
        }).filter(g => g.works.length > 0);
    }, [sortKey, visibleCount, collectionsMap]);

    const handleColorChange = async (colId: number, color: string | null) => {
        try {
            const res = await fetch(`${getApiUrl()}/collections/${colId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bg_color: color }),
                credentials: "include"
            });
            if (res.ok) {
                setAllCollections(prev => prev.map(c => c.id === colId ? { ...c, bg_color: color || undefined } : c));
            }
        } catch (e) {
            console.error("Failed to update bg_color", e);
        }
    };

    // Ensure visible count is at least enough to fill the screen if we switch to dense grid
    useEffect(() => {
        setVisibleCount(prev => Math.max(prev, itemsPerPage));
    }, [itemsPerPage]);

    // Infinite scroll trigger
    useEffect(() => {
        if (inView && visibleCount < allArtworks.length) {
            setVisibleCount(prev => prev + itemsPerPage);
        }
    }, [inView, allArtworks.length, visibleCount, itemsPerPage]);

    const getColumns = () => {
        if (isMobile) {
            if (gridMode === "1") return "1fr";
            if (gridMode === "2") return "repeat(2, 1fr)";
            if (gridMode === "3") return "repeat(3, 1fr)";
        }
        if (gridMode === "1") return "repeat(auto-fill, minmax(350px, 1fr))";
        if (gridMode === "2") return "repeat(auto-fill, minmax(240px, 1fr))";
        return "repeat(auto-fill, minmax(175px, 1fr))";
    };

    const getGap = () => {
        if (isMobile) {
            if (gridMode === "1") return "2rem";
            if (gridMode === "2") return "1rem";
            if (gridMode === "3") return "0.5rem";
        }
        if (gridMode === "1") return "4rem 180px";
        if (gridMode === "2") return "3rem 120px";
        return "2rem 90px";
    };

    return (
        <>
            {lightbox && <Lightbox works={lightbox.works as any} startWorkIndex={lightbox.index} onClose={() => setLightbox(null)} />}
            <div style={{ maxWidth: "1600px", margin: "0 auto", padding: isMobile ? "1rem 1rem 2rem 1rem" : "1.5rem 2.5rem 2rem" }}>
                {/* Sort bar */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: isMobile ? "0.75rem" : "1rem", flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? "5px" : 0, scrollbarWidth: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", display: isMobile ? "none" : "inline" }}>Sort</span>
                        <div style={{ position: "relative" }}>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value as SortKey)}
                                style={{
                                    appearance: "none",
                                    backgroundColor: "transparent",
                                    border: "1px solid rgba(26,26,24,0.2)",
                                    borderRadius: "20px",
                                    padding: "0.35rem 2.2rem 0.35rem 1rem",
                                    fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "var(--color-charcoal)",
                                    cursor: "pointer", outline: "none"
                                }}
                            >
                                {SORT_OPTIONS.map(opt => (
                                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                                ))}
                            </select>
                            <span style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.65rem", color: "var(--color-charcoal)", fontWeight: 300 }}>∨</span>
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1.5rem", flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", display: isMobile ? "none" : "inline" }}>View</span>
                            <div style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                <button
                                    onClick={() => handleSetGridMode("1")}
                                    title="1 in a row"
                                    style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                                        padding: "4px 8px",
                                        backgroundColor: gridMode === "1" ? "#ffffff" : "transparent",
                                        color: gridMode === "1" ? "var(--color-charcoal)" : "var(--color-muted)",
                                        border: "none", borderRadius: "4px",
                                        boxShadow: gridMode === "1" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                        cursor: "pointer", transition: "all 0.2s"
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <rect x="2" y="2" width="12" height="12" rx="1" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleSetGridMode("2")}
                                    title="2 in a row"
                                    style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                                        padding: "4px 8px",
                                        backgroundColor: gridMode === "2" ? "#ffffff" : "transparent",
                                        color: gridMode === "2" ? "var(--color-charcoal)" : "var(--color-muted)",
                                        border: "none", borderRadius: "4px",
                                        boxShadow: gridMode === "2" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                        cursor: "pointer", transition: "all 0.2s"
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <rect x="2" y="2" width="5" height="5" rx="1" />
                                        <rect x="9" y="2" width="5" height="5" rx="1" />
                                        <rect x="2" y="9" width="5" height="5" rx="1" />
                                        <rect x="9" y="9" width="5" height="5" rx="1" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleSetGridMode("3")}
                                    title="3 in a row"
                                    style={{
                                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                                        padding: "4px 8px",
                                        backgroundColor: gridMode === "3" ? "#ffffff" : "transparent",
                                        color: gridMode === "3" ? "var(--color-charcoal)" : "var(--color-muted)",
                                        border: "none", borderRadius: "4px",
                                        boxShadow: gridMode === "3" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                        cursor: "pointer", transition: "all 0.2s"
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                        <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                        <rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "var(--color-muted)", flexShrink: 0 }}>{allArtworks.length} works</span>
                    </div>
                </div>
            </div>

            {/* Collections */}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {sorted.map(({ name, id, bg, works, totalInGroup }, idx) => {
                    const isCollapsed = !!collapsed[name];
                    const bgStyle = bg ? `linear-gradient(180deg, ${bg}40 0%, ${bg}15 12rem, rgba(0,0,0,0) 100%)` : `linear-gradient(180deg, rgba(17, 17, 17, 0.08) 0%, rgba(17, 17, 17, 0.03) 12rem, rgba(17, 17, 17, 0) 100%)`;

                    return (
                        <section key={name} style={{ paddingBottom: "4rem", marginBottom: 0, background: bgStyle }}>
                            {/* Collection header — full width bar */}
                            <div style={{ width: "100%" }}>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setCollapsed(p => ({ ...p, [name]: !p[name] }))}
                                    style={{
                                        maxWidth: "1600px", margin: "0 auto",
                                        width: "100%", display: "flex", alignItems: "center",
                                        justifyContent: "space-between", padding: isMobile ? "1rem 1.25rem" : "1.25rem 2.5rem",
                                        background: "none", border: "none", cursor: "pointer", textAlign: "left",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "baseline", gap: "1rem" }}>
                                        <h2 style={{
                                            fontFamily: "var(--font-display)",
                                            fontSize: "clamp(1.2rem, 3vw, 1.7rem)",
                                            fontWeight: 400,
                                            fontStyle: "normal",
                                            letterSpacing: "0.06em",
                                            textTransform: "uppercase",
                                            color: "var(--color-charcoal)",
                                        }}>{name}</h2>
                                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: 300, color: "var(--color-muted)", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "10px" }}>
                                            {works.length} {works.length < totalInGroup ? `of ${totalInGroup}` : ""} works
                                            {user?.is_admin && id && (
                                                <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "8px" }}>
                                                    <input 
                                                        type="color" 
                                                        value={bg || "#404040"} 
                                                        onChange={(e) => handleColorChange(id, e.target.value)} 
                                                        style={{ 
                                                            width: "24px", height: "24px", padding: "0", border: "1px solid #ccc", 
                                                            borderRadius: "4px", cursor: "pointer", background: "none" 
                                                        }} 
                                                        title="Pick Collection Background Color"
                                                    />
                                                    <button
                                                        onClick={() => handleColorChange(id, null)}
                                                        style={{
                                                            fontFamily: "var(--font-sans)", fontSize: "0.65rem", padding: "3px 6px",
                                                            border: "1px solid rgba(26,26,24,0.2)", borderRadius: "4px", background: "transparent",
                                                            cursor: "pointer", color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em"
                                                        }}
                                                        title="Reset to default (approx 25% grey gradient)"
                                                    >
                                                        Reset
                                                    </button>
                                                </div>
                                            )}
                                        </span>
                                    </div>
                                    {/* Bold SVG chevron — clear and solid */}
                                    <svg
                                        width="20" height="12" viewBox="0 0 20 12" fill="none"
                                        style={{
                                            flexShrink: 0,
                                            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                                            transition: "transform 0.3s ease",
                                        }}
                                    >
                                        <path d="M2 2L10 10L18 2" stroke="var(--color-charcoal-mid)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>

                            <div style={{ display: "grid", gridTemplateRows: isCollapsed ? "0fr" : "1fr", transition: "grid-template-rows 0.4s ease-out" }}>
                                <div style={{ overflow: "hidden" }}>
                                    <div style={{ maxWidth: "1600px", margin: "0 auto", padding: isMobile ? "1rem 0.5rem 2rem" : "2rem 2.5rem 3rem" }}>
                                        <div className={`art-grid`} style={{
                                            display: "grid",
                                            gridTemplateColumns: getColumns(),
                                            justifyContent: "start",
                                            gap: getGap(),
                                            alignItems: "center",
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
            
            {/* Infinite Scroll target marker */}
            {visibleCount < allArtworks.length && (
                <div ref={loadMoreRef} style={{ height: "40px", paddingBottom: "4rem", display: "flex", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontFamily: "var(--font-sans)" }}>Loading more...</span>
                </div>
            )}
        </>
    );
}
