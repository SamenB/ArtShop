"use client";

/**
 * Gallery module for the ArtShop.
 * Implements a sophisticated CSS Grid exhibition layout where artworks are 
 * grouped by collection and fill columns at their natural aspect ratios.
 * Supports infinite scrolling, dynamic grid density switching, and collection-based filtering.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";
import { usePreferences } from "@/context/PreferencesContext";
import GoogleLoginButton from "@/components/GoogleLoginButton";
import { useUser } from "@/context/UserContext";

/** Exhaustive list of physical and digital availability states for an artwork. */
type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

/** Detailed artwork data representing a catalog entry. */
interface Artwork {
    id: number;
    slug?: string;
    title: string;
    description: string;
    medium?: string;
    style?: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    has_prints: boolean;
    orientation?: string;
    base_print_price?: number;
    width_cm?: number;
    height_cm?: number;
    width_in?: number;
    height_in?: number;
    images?: (string | { thumb: string; medium: string; original: string })[];
    /** UI fallback gradient start color. */
    gradientFrom?: string;
    /** UI fallback gradient end color. */
    gradientTo?: string;
    labels?: Array<{ title: string; category_id?: number; id: number }>;
}

/** 
 * Predefined aesthetic color pairs for artwork card backgrounds.
 * Used when specific image gradients are not provided.
 */
const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"],
    ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"],
    ["#5A8A8A", "#2A5A5A"],
    ["#D4905A", "#8A5030"],
];

/** Collection metadata for grouping artworks. */
interface CollectionData {
    id: number;
    title: string;
}

/** Supported sorting strategies for the gallery exhibition. */
type SortKey = "default" | "year" | "title" | "available";

/** Human-readable labels for the sort selector. */
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "default", label: "Collection" },
    { key: "year", label: "Newest" },
    { key: "title", label: "Title A–Z" },
    { key: "available", label: "Available" },
];

/**
 * Pure utility function to sort an array of artworks based on the specified key.
 */
const sortWorks = (works: Artwork[], key: SortKey): Artwork[] => {
    const c = [...works];
    if (key === "year") c.sort((a, b) => b.id - a.id);
    if (key === "title") c.sort((a, b) => a.title.localeCompare(b.title));
    if (key === "available") c.sort((a, b) => (a.original_status === "available" ? 0 : 1) - (b.original_status === "available" ? 0 : 1));
    return c;
};

/** Image viewing area heights mapped to the grid density mode. */
const IMAGE_ZONE: Record<string, number> = { "1": 480, "2": 380, "3": 260 };

/** Visual styling and labeling for artwork status indicators. */
const STATUS: Record<string, { label: string; badgeBg: string; badgeText: string; textColor: string }> = {
    available:     { label: "AVAILABLE",    badgeBg: "rgba(100,185,120,0.13)", badgeText: "#3a7a4a",  textColor: "#6DB87E" },
    sold:          { label: "SOLD",          badgeBg: "rgba(180,60,60,0.11)",   badgeText: "#9b2c2c",  textColor: "#C05050" },
    reserved:      { label: "RESERVED",      badgeBg: "rgba(200,160,50,0.13)",  badgeText: "#836a1a",  textColor: "#C8A32A" },
    not_for_sale:  { label: "NOT FOR SALE",  badgeBg: "rgba(120,120,120,0.11)", badgeText: "#555",     textColor: "#999" },
    on_exhibition: { label: "ON EXHIBITION", badgeBg: "rgba(50,130,200,0.11)",  badgeText: "#20527a",  textColor: "#4A90BE" },
    archived:      { label: "ARCHIVED",      badgeBg: "rgba(100,100,100,0.10)", badgeText: "#666",     textColor: "#7f8c8d" },
    digital:       { label: "DIGITAL ONLY",  badgeBg: "rgba(120,90,200,0.12)",  badgeText: "#5a3a9a",  textColor: "#8E44AD" },
};

/** Properties for the individual artwork exhibition card. */
interface ArtCardProps {
    work: Artwork;
    onClick: () => void;
    zoneH: number;
    gridMode: string;
    isMobile: boolean;
    liked?: boolean;
    onLike?: (id: number, newState: boolean) => void;
    onAuthRequired?: (id: number, newState: boolean) => void;
}

/**
 * Individual gallery card component.
 * Dynamically calculates padding and positioning to anchor title boxes strictly to image edges.
 */
function ArtCard({ work, onClick, zoneH, gridMode, isMobile, liked: initialLiked, onLike, onAuthRequired }: ArtCardProps) {
    const { units } = usePreferences();
    const ori = (work.orientation || "vertical").toLowerCase();
    const isHorizontal = ori === "horizontal";
    const isSquare = ori === "square";
    const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "original") || "" : "";
    const st = STATUS[work.original_status];

    const containerRef = useRef<HTMLDivElement>(null);
    const [textPad, setTextPad] = useState(0);
    const [emptyBottom, setEmptyBottom] = useState(0);
    const [measuredImgH, setMeasuredImgH] = useState(0); // Track exact image height safely
    const [measuredImgW, setMeasuredImgW] = useState(0); // Track exact image width safely
    const [imgHovered, setImgHovered] = useState(false);
    const [liked, setLiked] = useState(initialLiked || false);
    const [likeAnimating, setLikeAnimating] = useState(false);

    // Sync on parent prop change (e.g., after DB load)
    useEffect(() => { setLiked(initialLiked || false); }, [initialLiked]);

    /** Format dimensions based on user's persistent unit preference (cm/in). */
    const sizeStr = useMemo(() => {
        const w = units === "in" ? work.width_in : work.width_cm;
        const h = units === "in" ? work.height_in : work.height_cm;
        if (w && h) return `${w} x ${h} ${units}`;
        return (work.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m: string, width: string, height: string) => {
            if (units === "cm") return `${Math.round(Number(width) * 2.54)} x ${Math.round(Number(height) * 2.54)} cm`;
            return m;
        });
    }, [work, units]);

    /**
     * Recalculates visual offsets to ensure the floating title title box 
     * aligns perfectly with the rendered image's variable aspect ratio.
     */
    const recalc = useCallback(() => {
        const c = containerRef.current;
        if (!c) return;
        const inner = c.querySelector(".art-card-inner") as HTMLElement;
        if (!inner) return;
        if (inner.tagName === "IMG") {
            const img = inner as HTMLImageElement;
            if (!img.complete || !img.naturalWidth) return;
        }
        setTextPad(Math.max(0, (c.clientWidth - inner.offsetWidth) / 2));
        setEmptyBottom(Math.max(0, (c.clientHeight - inner.offsetHeight) / 2));
        setMeasuredImgH(inner.offsetHeight);
        setMeasuredImgW(inner.offsetWidth);
    }, []);

    useEffect(() => {
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, [recalc]);

    // Recalculate whenever the viewing zone height changes (e.g., density toggle).
    useEffect(() => {
        requestAnimationFrame(recalc);
    }, [zoneH, recalc]);

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
            className="art-card magnetic-scroll"
            style={{
                display: "flex", flexDirection: "column",
                cursor: "pointer", width: "100%",
                background: "none", border: "none", margin: 0,
                textAlign: "left", pointerEvents: "auto", padding: 0,
                /* Unified scale: image + text move as one glass plate */
                transform: imgHovered && !isMobile ? "scale(1.03)" : "scale(1)",
                transformOrigin: "center center",
                transition: "transform 0.2s ease-out",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            <div
                ref={containerRef}
                className="art-card-container"
                style={{
                    position: "relative",
                    width: "100%",
                    height: `${zoneH}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    zIndex: 10,
                    pointerEvents: "none",
                }}
            >
                {imgSrc ? (
                    <img
                        src={imgSrc}
                        alt={work.title}
                        className="art-card-inner"
                        onLoad={recalc}
                        onMouseEnter={() => { if (!isMobile) setImgHovered(true); }}
                        onMouseLeave={() => { if (!isMobile) setImgHovered(false); }}
                        style={{
                            display: "block",
                            maxWidth: "76%",
                            maxHeight: isHorizontal || isSquare ? `${zoneH * 0.76}px` : `${zoneH * 0.90}px`,
                            width: "auto", height: "auto",
                            borderRadius: "4px",
                            alignSelf: "center",
                            flexShrink: 0,
                            boxShadow: imgHovered && !isMobile
                                ? "4px 16px 40px rgba(28,25,22,0.58), 0 4px 12px rgba(28,25,22,0.35)"
                                : "2px 10px 28px rgba(28,25,22,0.48), 0 3px 8px rgba(28,25,22,0.25)",
                            transition: "box-shadow 0.2s ease-out, transform 0.2s ease-out",
                            WebkitTouchCallout: "none",
                            userSelect: "none",
                            WebkitUserSelect: "none",
                            pointerEvents: "auto",
                        }}
                    />
                ) : (
                    <div className="art-card-inner" style={{
                        width: isHorizontal || isSquare ? "76%" : "55%",
                        height: isHorizontal ? "55%" : "85%",
                        backgroundImage: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
                        borderRadius: "4px",
                        alignSelf: "center",
                        flexShrink: 0,
                        boxShadow: "2px 8px 22px rgba(28,25,22,0.36), 0 2px 6px rgba(28,25,22,0.20)",
                    }} />
                )}
            </div>

            {/* Metadata overlay: sits behind the image, text below. Uses frosted glass style. */}
            {(gridMode !== "3" || !isMobile) && (
                <div style={{
                    position: "relative",
                    zIndex: 5,
                    marginTop: measuredImgH > 0
                        ? `-${emptyBottom + measuredImgH + 4}px`
                        : `-${emptyBottom - (isMobile ? 10 : 8)}px`,
                    marginLeft: `${textPad - 4}px`,
                    marginRight: `${textPad - 4}px`,
                    paddingTop: measuredImgH > 0
                        ? `${measuredImgH + (isMobile ? 10 : 8) + 4}px`
                        : "0.15rem",
                    paddingBottom: "0.5rem",
                    paddingLeft: "0.55rem",
                    paddingRight: "0.55rem",
                    backgroundColor: "rgba(235, 235, 237, 0.82)",
                    backdropFilter: "blur(12px) saturate(1.3)",
                    WebkitBackdropFilter: "blur(12px) saturate(1.3)",
                    borderTop: "1px solid rgba(255,255,255,0.75)",
                    borderLeft: "1px solid rgba(255,255,255,0.55)",
                    borderRight: "1px solid rgba(200,200,205,0.38)",
                    borderBottom: "1px solid rgba(180,180,190,0.3)",
                    borderRadius: "4px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.6) inset",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "0.3rem",
                }}>
                    {/* Left: text info */}
                    <div style={{
                        display: "flex", flexDirection: "column", gap: "0.05rem",
                        flex: 1, minWidth: 0,
                        pointerEvents: "auto",
                    }}>
                        <p style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: gridMode === "1" ? "0.90rem" : gridMode === "2" ? "0.85rem" : "0.78rem",
                            fontWeight: 400, fontStyle: "italic", letterSpacing: "0.01em",
                            color: "#333", margin: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            lineHeight: 1.2
                        }}>
                            {work.title}
                        </p>

                        <p style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem",
                            fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                        }}>
                            {sizeStr}
                        </p>
                        {st && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "1px" }}>
                                <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    backgroundColor: st.badgeBg,
                                    border: `1px solid ${st.badgeText}33`,
                                    borderRadius: "4px",
                                    padding: "2px 7px 2px 5px",
                                }}>
                                    <span style={{
                                        display: "inline-block",
                                        width: "5px",
                                        height: "5px",
                                        borderRadius: "50%",
                                        backgroundColor: st.badgeText,
                                        flexShrink: 0,
                                    }} />
                                    <span style={{
                                        fontFamily: "var(--font-sans)",
                                        fontSize: gridMode === "1" ? "0.60rem" : gridMode === "2" ? "0.58rem" : "0.55rem",
                                        fontWeight: 600,
                                        letterSpacing: "0.07em",
                                        textTransform: "uppercase",
                                        color: st.badgeText,
                                        lineHeight: 1,
                                        whiteSpace: "nowrap",
                                    }}>
                                        {st.label}
                                    </span>
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Right: Like button — prominent, stops card-hover propagation on pointer enter/leave */}
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            const newState = !liked;
                            
                            setLiked(newState);
                            setLikeAnimating(true);
                            setTimeout(() => setLikeAnimating(false), 400);

                            if (onAuthRequired) { 
                                onAuthRequired(work.id, newState); 
                                return; 
                            }
                            
                            onLike?.(work.id, newState);
                        }}
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        onTouchEnd={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            const newState = !liked;

                            setLiked(newState);
                            setLikeAnimating(true);
                            setTimeout(() => setLikeAnimating(false), 400);

                            if (onAuthRequired) {
                                onAuthRequired(work.id, newState);
                                return;
                            }

                            onLike?.(work.id, newState);
                        }}
                        aria-label={liked ? "Unlike" : "Like"}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            padding: "6px", marginTop: "-2px", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transform: likeAnimating ? "scale(1.35)" : "scale(1)",
                            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            outline: "none",
                            pointerEvents: "auto",
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        <svg
                            width={gridMode === "3" ? "18" : gridMode === "2" ? "22" : "26"}
                            height={gridMode === "3" ? "18" : gridMode === "2" ? "22" : "26"}
                            viewBox="0 0 24 24"
                            fill={liked ? "#e84057" : "none"}
                            stroke={liked ? "#e84057" : "#888"}
                            strokeWidth={liked ? "1.5" : "2"}
                            strokeLinecap="round" strokeLinejoin="round"
                            style={{
                                transition: "fill 0.25s ease, stroke 0.25s ease, filter 0.25s ease",
                                filter: liked ? "drop-shadow(0 2px 6px rgba(232,64,87,0.4))" : "none",
                                pointerEvents: "none",
                            }}
                        >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

/**
 * Main Gallery exhibition page.
 * Manages fetching of all artworks and collections, sorting state, 
 * persistent layout preferences, and infinite scroll pagination.
 */
export default function GalleryPage() {
    const { user } = useUser();
    const [allArtworks, setAllArtworks] = useState<Artwork[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey>("default");
    const [groupBy, setGroupBy] = useState<"collection" | "year" | "medium">("collection");
    const [lightbox, setLightbox] = useState<{ works: Artwork[]; index: number } | null>(null);
    const [cols, setCols] = useState(3);
    const [gridMode, setGridMode] = useState<"1" | "2" | "3">("2");
    const [gridLoaded, setGridLoaded] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const itemsPerPage = gridMode === "3" ? 36 : gridMode === "2" ? 24 : 12;
    const [visibleCount, setVisibleCount] = useState(12);

    const [error, setError] = useState<string | null>(null);

    // Initial load of grid preference for Gallery
    useEffect(() => {
        const saved = localStorage.getItem("artshop_gallery_grid");
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        }
        setGridLoaded(true);
    }, []);

    // Persist grid preference for Gallery
    useEffect(() => {
        if (gridLoaded) {
            localStorage.setItem("artshop_gallery_grid", gridMode);
        }
    }, [gridMode, gridLoaded]);

    const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    const { pendingLikes, addPendingLike, removePendingLike, unauthLikeCount, incrementUnauthLikeCount } = usePreferences();

    // Initial page load: Reset scroll to ensure consistent exhibition entry.
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "instant" });
        }
    }, []);

    /** Updates pending likes locally, and occasionally prompts the user. */
    const handleAuthRequired = (id: number, isLiked: boolean) => {
        if (isLiked) {
            addPendingLike(id);
        } else {
            removePendingLike(id);
        }
        
        incrementUnauthLikeCount();
        const nextCount = unauthLikeCount + 1;

        if ((nextCount - 1) % 3 === 0) {
            setTimeout(() => setShowAuthPrompt(true), 1000);
        }
    };

    // Initialize layout state based on device capability.
    useEffect(() => {
        const update = () => setIsMobile(window.innerWidth < 1024);
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/artworks?limit=1000`).then(res => res.json())
            .then(artworksData => {
                const rawData = artworksData.items || artworksData.data || artworksData;
                if (!Array.isArray(rawData)) {
                    setError("Unable to initialize gallery structure.");
                    setLoading(false);
                    return;
                }
                const items = rawData.map((item: any, idx: number) => ({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][1]
                }));
                setAllArtworks(items);
                setLoading(false);
            })
            .catch(err => {
                console.error("Gallery data initialization failed:", err);
                setError("Exhibition data temporarily unavailable.");
                setLoading(false);
            });
    }, []);

    // Fetch user likes
    useEffect(() => {
        if (!user) {
            setLikedIds(new Set(pendingLikes));
            return;
        }
        apiFetch(`${getApiUrl()}/users/me/likes`)
            .then(r => r.ok ? r.json() : [])
            .then((items: { id: number }[]) => {
                setLikedIds(new Set(items.map(a => a.id)));
            })
            .catch(() => setLikedIds(new Set()));
    }, [user]);

    /** 
     * Derived state: Groups artworks by their parent collections to create 
     * a logically grouped exhibition experience.
     */
    const collectionsMap = useMemo(() => {
        return allArtworks.reduce<Record<string, { id?: number, works: Artwork[] }>>((acc, a) => {
            let groupName = "Uncategorized";
            let groupId: number | undefined;

            if (groupBy === "collection") {
                groupName = "Original Paintings";
                // Look for labels that likely belong to the Collections category.
                // In this implementation, we can check for labels from a category named 'Collections'.
                const colLabel = a.labels?.find(l => (l as any).category?.title === "Collections" || (l as any).category_id === 3); // 3 was the ID in my migration but better to use title logic if available or just fallback to first label if needed
                if (colLabel) {
                    groupName = colLabel.title;
                    groupId = colLabel.id;
                }
            } else if (groupBy === "year") {
                if ((a as any).year) {
                    groupName = String((a as any).year);
                } else if ((a as any).created_at) {
                    groupName = new Date((a as any).created_at).getFullYear().toString();
                } else if (a.slug && a.slug.match(/(?:19|20)\d{2}/)) {
                    groupName = a.slug.match(/(?:19|20)\d{2}/)![0];
                } else {
                    groupName = "Unknown Year";
                }
            } else if (groupBy === "medium") {
                const firstLabel = a.labels?.[0];
                groupName = firstLabel?.title || a.medium || a.style || "Other";
                // Capitalize properly if it exists, or provide safe fallback
                if (groupName !== "Other") {
                    groupName = groupName.charAt(0).toUpperCase() + groupName.slice(1);
                }
            }

            if (!acc[groupName]) acc[groupName] = { id: groupId, works: [] };
            acc[groupName].works.push(a);
            return acc;
        }, {});
    }, [allArtworks, groupBy]);

    const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px" });

    // Grid mode persistence: Differentiates between Mobile and Desktop aspect ratios.
    useEffect(() => {
        const mob = window.innerWidth < 768;
        const storageKey = mob ? "artshop_gallery_gridMode_mobile" : "artshop_gallery_gridMode_pc";
        const saved = sessionStorage.getItem(storageKey) as "1" | "2" | "3" | null;
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        } else {
            // Default: Dense grid on mobile, comfortable middle-ground on desktop.
            setGridMode(mob ? "3" : "2");
        }
    }, [isMobile]);

    /** Updates grid density and persists the choice to session storage. */
    const handleSetGridMode = (val: "1" | "2" | "3") => {
        setGridMode(val);
        const storageKey = isMobile ? "artshop_gallery_gridMode_mobile" : "artshop_gallery_gridMode_pc";
        sessionStorage.setItem(storageKey, val);
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

    /** 
     * Derived state: Merges collections, applies sorting, and enforces 
     * pagination limits for the infinite scroll experience.
     */
    const sorted = useMemo(() => {
        const groups = Object.entries(collectionsMap).map(([name, data]) => ({
            name,
            id: data.id,
            works: sortWorks(data.works, sortKey)
        }));

        if (groupBy === "year") {
            groups.sort((a, b) => {
                if (a.name === "Unknown Year") return 1;
                if (b.name === "Unknown Year") return -1;
                const yearA = parseInt(a.name) || 0;
                const yearB = parseInt(b.name) || 0;
                return yearB - yearA;
            });
        } else if (groupBy === "medium") {
            groups.sort((a, b) => a.name.localeCompare(b.name));
        }

        let remaining = visibleCount;
        return groups.map(g => {
            if (remaining <= 0) return { name: g.name, id: g.id, works: [], totalInGroup: g.works.length };
            const toShow = g.works.slice(0, remaining);
            remaining -= toShow.length;
            return { name: g.name, id: g.id, works: toShow, totalInGroup: g.works.length };
        }).filter(g => g.works.length > 0);
    }, [sortKey, visibleCount, collectionsMap, groupBy]);

    // Ensure visible count reacts elegantly to grid density changes.
    useEffect(() => {
        setVisibleCount(prev => Math.max(prev, itemsPerPage));
    }, [itemsPerPage]);

    // Infinite scroll logic: Increments the display quota as the user reaches the end of the lists.
    useEffect(() => {
        if (inView && visibleCount < allArtworks.length) {
            setVisibleCount(prev => prev + itemsPerPage);
        }
    }, [inView, allArtworks.length, visibleCount, itemsPerPage]);

    /** Returns dynamic CSS column definitions based on current grid intensity. */
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

    /** Returns dynamic CSS gap spacing based on current grid intensity and device. */
    const getGap = () => {
        if (isMobile) {
            if (gridMode === "1") return "3.2rem 1rem";
            if (gridMode === "2") return "1.5rem 1.25rem";
            if (gridMode === "3") return "0.5rem 0.5rem";
        }
        if (gridMode === "1") return "4rem 24px";
        if (gridMode === "2") return "3rem 16px";
        return "2rem 10px";
    };

    const effectiveLikedIds = user ? likedIds : new Set(pendingLikes);

    return (
        <div style={{ overflowX: "clip", maxWidth: "100vw", width: "100%" }}>
            {lightbox && <Lightbox works={lightbox.works as any} startWorkIndex={lightbox.index} onClose={() => setLightbox(null)} />}
            <div style={{ maxWidth: "1600px", margin: "0 auto", padding: isMobile ? "1rem 1rem 2rem 1rem" : "1.5rem 2.5rem 2rem" }}>
                {/* Control Bar: Sorting and Layout density toggles. */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: isMobile ? "0.75rem" : "1rem", flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? "5px" : 0, scrollbarWidth: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.75rem" : "1.5rem", flexShrink: 0 }}>
                        {/* GROUP BY TOGGLES / SELECTOR */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", display: isMobile ? "none" : "inline" }}>Group By</span>
                            
                            {isMobile ? (
                                <div style={{ position: "relative" }}>
                                    <select
                                        value={groupBy}
                                        onChange={(e) => setGroupBy(e.target.value as any)}
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
                                        <option value="collection">Collection</option>
                                        <option value="year">Year</option>
                                        <option value="medium">Medium</option>
                                    </select>
                                    <span style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.65rem", color: "var(--color-charcoal)", fontWeight: 300 }}>∨</span>
                                </div>
                            ) : (
                                <div style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                    {[
                                        { id: "collection", label: "Collection" },
                                        { id: "year", label: "Year" },
                                        { id: "medium", label: "Medium" }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setGroupBy(opt.id as any)}
                                            style={{
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                padding: "4px 12px",
                                                fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.05em",
                                                backgroundColor: groupBy === opt.id ? "#ffffff" : "transparent",
                                                color: groupBy === opt.id ? "var(--color-charcoal)" : "var(--color-muted)",
                                                border: "none", borderRadius: "4px",
                                                boxShadow: groupBy === opt.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                                cursor: "pointer", transition: "all 0.2s"
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1.5rem", flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", display: isMobile ? "none" : "inline" }}>View</span>
                            <div className="grid-toggle-wrapper" style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                <button
                                    onClick={() => handleSetGridMode("1")}
                                    title="Exhibition View"
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
                                    title="Standard View"
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
                                    title="Dense View"
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

            {/* Rendered Exhibition Sections grouped by Collection. */}
            <div style={{ display: "flex", flexDirection: "column" }}>
                {sorted.map(({ name, id, bg, works, totalInGroup }, idx) => {
                    return (
                        <section key={name} style={{ paddingBottom: "1.25rem", marginBottom: 0 }}>
                            {/* Visual hierarchy header: Full-width ribbon styled collection title. */}
                            <div style={{ width: "100%", margin: isMobile ? "0 0 0.5rem 0" : "0 0 1rem 0" }}>
                                <div
                                    style={{
                                        maxWidth: "1600px", margin: "0 auto",
                                        width: "100%", display: "flex", alignItems: "center",
                                        justifyContent: "flex-start", padding: "0",
                                        background: "none", border: "none", textAlign: "left",
                                    }}
                                >
                                    <div style={{ 
                                        display: "flex", alignItems: "center", gap: "1rem",
                                        backgroundColor: "transparent",
                                        width: "100%",
                                        padding: isMobile ? "0.6rem 1.25rem" : "0.6rem 1.5rem",
                                        borderBottom: "1px solid rgba(26,26,24,0.35)",
                                    }}>
                                        <h2 style={{
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "1.05rem",
                                            fontWeight: 500,
                                            letterSpacing: "0.05em",
                                            textTransform: "uppercase",
                                            color: "var(--color-charcoal)",
                                            margin: 0,
                                        }}>{name}</h2>
                                        <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-muted)", position: 'relative', top: '1px' }}>
                                            {works.length} {works.length < totalInGroup ? `of ${totalInGroup}` : ""}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: "block" }}>
                                <div style={{ overflow: "hidden", padding: "20px 0 20px 0", margin: "-15px 0 0 0" }}>
                                    <div className="magnetic-scroll" style={{
                                        width: "100%",
                                        padding: isMobile ? "0 1.25rem 1rem" : "0 0 0.5rem",
                                    }}>
                                        <div className={`art-grid`} style={{
                                            maxWidth: "1600px",
                                            margin: "0 auto",
                                            padding: isMobile ? "0" : "0 2.5rem",
                                            display: "grid",
                                            gridTemplateColumns: getColumns(),
                                            justifyContent: "start",
                                            gap: getGap(),
                                            alignItems: "start",
                                        }}>
                                            {works.map((work, i) => {
                                                return (
                                                <ArtCard
                                                    key={work.id}
                                                    work={work}
                                                    onClick={() => setLightbox({ works, index: i })}
                                                    zoneH={IMAGE_ZONE[gridMode] || 380}
                                                    gridMode={gridMode}
                                                    isMobile={isMobile}
                                                    liked={effectiveLikedIds.has(work.id)}
                                                    onLike={async (id, newState) => {
                                                        try {
                                                            if (newState) {
                                                                await apiFetch(`${getApiUrl()}/users/me/likes/${id}`, { method: "POST" });
                                                                setLikedIds(prev => new Set(prev).add(id));
                                                            } else {
                                                                await apiFetch(`${getApiUrl()}/users/me/likes/${id}`, { method: "DELETE" });
                                                                setLikedIds(prev => {
                                                                    const next = new Set(prev);
                                                                    next.delete(id);
                                                                    return next;
                                                                });
                                                            }
                                                        } catch {}
                                                    }}
                                                    onAuthRequired={!user ? handleAuthRequired : undefined}
                                                />
                                            )})}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    );
                })}
            </div>

            {/* Infinite Scroll target marker. */}
            {visibleCount < allArtworks.length && (
                <div ref={loadMoreRef} style={{ height: "40px", paddingBottom: "4rem", display: "flex", justifyContent: "center" }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontFamily: "var(--font-sans)" }}>Curating more works...</span>
                </div>
            )}

            {/* Auth Prompt Modal */}
            {showAuthPrompt && (
                <div
                    onClick={() => setShowAuthPrompt(false)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 9999,
                        background: "rgba(10,10,10,0.65)",
                        backdropFilter: "blur(6px)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "1rem",
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "#fff",
                            borderRadius: "20px",
                            padding: "2.5rem 2rem",
                            maxWidth: "360px",
                            width: "100%",
                            textAlign: "center",
                            boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)",
                            position: "relative",
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setShowAuthPrompt(false)}
                            aria-label="Close"
                            style={{
                                position: "absolute",
                                top: "1rem",
                                right: "1rem",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "0.25rem",
                                color: "#999",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "color 0.2s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = "#333"}
                            onMouseLeave={e => e.currentTarget.style.color = "#999"}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>♡</div>
                        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 400, fontStyle: "italic", color: "#1a1a18", marginBottom: "0.5rem" }}>
                            Save to your collection
                        </h2>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "#777", lineHeight: 1.6, marginBottom: "1.75rem" }}>
                            Sign in to save artworks you love and revisit them anytime from your profile.
                        </p>
                        {/* Modern Google Authentication Button */}
                        <GoogleLoginButton 
                            onSuccess={() => setShowAuthPrompt(false)} 
                            containerStyle={{ marginBottom: "1rem" }}
                        />
                        <button
                            onClick={() => setShowAuthPrompt(false)}
                            style={{ marginTop: "1rem", background: "none", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "#999", cursor: "pointer", letterSpacing: "0.05em" }}
                        >
                            Continue browsing
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
