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
    slug?: string;
    title: string;
    description: string;
    medium: string;
    materials?: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    has_prints: boolean;
    orientation?: string;
    base_print_price?: number;
    collection_id?: number;
    width_cm?: number;
    height_cm?: number;
    width_in?: number;
    height_in?: number;
    images?: (string | { thumb: string; medium: string; original: string })[];
    // UI fallbacks
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



// ── IMAGE ZONE HEIGHT per grid mode ──────────────────────────────────────────────
const IMAGE_ZONE: Record<string, number> = { "1": 480, "2": 380, "3": 260 };

// ── Status labels + colours ────────────────────────────────────────────────────
const STATUS: Record<string, { label: string; color: string }> = {
    available: { label: "AVAILABLE", color: "#6DB87E" },
    sold: { label: "SOLD", color: "#C0392B" },
    reserved: { label: "RESERVED", color: "#D4A017" },
    not_for_sale: { label: "NOT FOR SALE", color: "#999" },
    on_exhibition: { label: "ON EXHIBITION", color: "#2980B9" },
    archived: { label: "ARCHIVED", color: "#7f8c8d" },
    digital: { label: "DIGITAL", color: "#8E44AD" },
};

// ── ART CARD ─────────────────────────────────────────────────────────────────
interface ArtCardProps {
    work: Artwork;
    onClick: () => void;
    zoneH: number;
    gridMode: string;
    isMobile: boolean;
}

function ArtCard({ work, onClick, zoneH, gridMode, isMobile }: ArtCardProps) {
    const ori = (work.orientation || "vertical").toLowerCase();
    const isHorizontal = ori === "horizontal";
    const isSquare = ori === "square";
    const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "original") || "" : "";
    const st = STATUS[work.original_status];

    /* ref-based text alignment to painting’s left edge */
    const containerRef = useRef<HTMLDivElement>(null);
    const [textPad, setTextPad] = useState(0);
    const recalc = useCallback(() => {
        const c = containerRef.current;
        if (!c) return;
        const img = c.querySelector("img");
        if (!img || !img.complete || !img.naturalWidth) return;
        setTextPad(Math.max(0, (c.clientWidth - img.clientWidth) / 2));
    }, []);
    useEffect(() => { recalc(); window.addEventListener("resize", recalc); return () => window.removeEventListener("resize", recalc); }, [recalc]);
    // Recalc when zone height changes (grid mode switch)
    useEffect(() => { requestAnimationFrame(recalc); }, [zoneH, recalc]);

    return (
        <button
            onClick={onClick}
            className="art-card"
            style={{
                display: "flex", flexDirection: "column",
                cursor: "pointer", width: "100%",
                background: "none", border: "none", margin: 0,
                textAlign: "left", pointerEvents: "auto", padding: 0,
            }}
        >
            <div
                ref={containerRef}
                className="art-card-container"
                style={{
                    width: "100%",
                    height: `${zoneH}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                }}
            >
                {imgSrc ? (
                    <img
                        src={imgSrc}
                        alt={work.title}
                        className="art-card-inner"
                        onLoad={recalc}
                        style={{
                            display: "block",
                            maxWidth: isHorizontal || isSquare ? "78%" : "80%",
                            maxHeight: isHorizontal ? `${zoneH * 0.78}px` : `${zoneH * 0.90}px`,
                            width: "auto", height: "auto",
                            borderRadius: "1px",
                            alignSelf: "center",
                            flexShrink: 0,
                            boxShadow: "2px 10px 28px rgba(28,25,22,0.72), 0 3px 8px rgba(28,25,22,0.40)",
                        }}
                    />
                ) : (
                    <div className="art-card-inner" style={{
                        width: isHorizontal || isSquare ? "78%" : "55%",
                        height: isHorizontal ? "55%" : "85%",
                        backgroundImage: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
                        borderRadius: "1px",
                        alignSelf: "center",
                        flexShrink: 0,
                        boxShadow: "2px 8px 22px rgba(28,25,22,0.36), 0 2px 6px rgba(28,25,22,0.20)",
                    }} />
                )}
            </div>

            {/* Standard Title & Status — aligned to painting's left vertical edge */}
            {gridMode !== "3" && (
                <div style={{
                    paddingTop: "0.7rem",
                    paddingLeft: `${textPad}px`,
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.1rem"
                }}>
                    <p style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: gridMode === "1" ? "1.05rem" : "0.98rem",
                        fontWeight: 400, fontStyle: "italic",
                        color: "#666", margin: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        lineHeight: 1.35,
                    }}>{work.title}</p>
                    <p style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: gridMode === "1" ? "0.76rem" : "0.72rem",
                        fontWeight: 300, color: "#aaa", margin: 0,
                        lineHeight: 1.4,
                    }}>
                        Original
                        {st && <> — <span style={{ fontWeight: 600, color: st.color, opacity: 0.85, letterSpacing: "0.02em" }}>{st.label}</span></>}
                    </p>
                </div>
            )}

            {/* Minimal Info for Compact Mobile Grid (3-column) — Status Only */}
            {gridMode === "3" && isMobile && (
                <div style={{ paddingTop: "0.2rem", paddingLeft: `${textPad}px`, display: "flex", flexDirection: "column" }}>
                    {st && (
                        <p style={{
                            fontFamily: "var(--font-sans)", fontSize: "0.6rem",
                            fontWeight: 700, color: st.color, opacity: 0.9,
                            margin: 0, letterSpacing: "0.03em",
                            lineHeight: 1,
                        }}>
                            {st.label}
                        </p>
                    )}
                </div>
            )}
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

    // ── Scroll to top on mount ──
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "instant" });
        }
    }, []);

    // ── Responsive ──
    useEffect(() => {
        const update = () => setIsMobile(window.innerWidth < 1024);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

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
        if (gridMode === "1") return "repeat(auto-fill, minmax(460px, 1fr))";
        if (gridMode === "2") return "repeat(auto-fill, minmax(340px, 1fr))";
        return "repeat(auto-fill, minmax(220px, 1fr))";
    };

    const getGap = () => {
        if (isMobile) {
            if (gridMode === "1") return "2rem";
            if (gridMode === "2") return "1rem";
            if (gridMode === "3") return "0.5rem";
        }
        if (gridMode === "1") return "5rem 140px";
        if (gridMode === "2") return "4rem 100px";
        return "2.5rem 70px";
    };

    return (
        <div style={{ overflowX: "clip", maxWidth: "100vw", width: "100%" }}>
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

                    return (
                        <section key={name} style={{ paddingBottom: "2rem", marginBottom: 0 }}>
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
                                    <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexShrink: 0 }}>
                                        <h2 style={{
                                            fontFamily: "var(--font-artwork-title)",
                                            fontSize: "clamp(2.4rem, 4.5vw, 3.6rem)",
                                            fontWeight: 400,
                                            fontStyle: "normal",
                                            color: "var(--color-charcoal)",
                                            lineHeight: 1.2,
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

                                    {/* Thin connecting line spanning the flexible center area */}
                                    <div style={{ flexGrow: 1, minWidth: "20px", height: "1.5px", background: "rgba(17, 17, 17, 0.16)", margin: "0 1.5rem", position: "relative", top: "4px" }} />

                                    {/* Bold SVG chevron — clear and solid */}
                                    <svg
                                        width="16" height="10" viewBox="0 0 20 12" fill="none"
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

                            <div style={{ display: "grid", gridTemplateRows: isCollapsed ? "0fr" : "1fr", transition: "grid-template-rows 0.4s ease-out, opacity 0.3s ease", opacity: isCollapsed ? 0 : 1, pointerEvents: isCollapsed ? "none" : "auto" }}>
                                <div style={{ overflow: "hidden", padding: "0 40px 50px 40px", margin: "0 -40px -50px -40px" }}>
                                    <div style={{ maxWidth: "1600px", margin: "0 auto", padding: isMobile ? "1rem 0.5rem 2rem" : "2rem 2.5rem 3rem" }}>
                                        <div className={`art-grid`} style={{
                                            display: "grid",
                                            gridTemplateColumns: getColumns(),
                                            justifyContent: "start",
                                            gap: getGap(),
                                            alignItems: "start",
                                        }}>
                                            {works.map((work, i) => (
                                                <ArtCard
                                                    key={work.id}
                                                    work={work}
                                                    onClick={() => setLightbox({ works, index: i })}
                                                    zoneH={IMAGE_ZONE[gridMode] || 380}
                                                    gridMode={gridMode}
                                                    isMobile={isMobile}
                                                />
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
        </div>
    );
}
