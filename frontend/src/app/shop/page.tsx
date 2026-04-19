"use client";

/**
 * Shop module for the ArtShop.
 * Provides a comprehensive catalog of artworks with multi-layered sidebar filters,
 * including categories, price ranges, dimensions, orientation, and more.
 */

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import { usePreferences } from "@/context/PreferencesContext";
import { useUser } from "@/context/UserContext";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";
import GoogleLoginButton from "@/components/GoogleLoginButton";

/** Availability states for artworks and prints. */
type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

/** Represents an artwork entry in the shop. */
interface Product {
    id: number;
    slug?: string;
    title: string;
    description: string;
    medium: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    images?: (string | { thumb: string; medium: string; original: string })[];
    width_cm?: number;
    height_cm?: number;
    width_in?: number;
    height_in?: number;
    year?: number;
    has_prints?: boolean;
    orientation?: string;
    base_print_price?: number;
    aspectRatio?: string;
    gradientFrom?: string;
    gradientTo?: string;
    labels?: { id: number; title: string; category_id?: number }[];
}

/** Collection metadata. */


/** Label and Category metadata. */
interface Label { id: number; title: string; category_id?: number; }
interface LabelCategory { id: number; title: string; }

/** Aesthetic fallback color pairs. */
const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"], ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"], ["#5A8A8A", "#2A5A5A"], ["#D4905A", "#8A5030"],
];

/** Sort options for the shop catalog. */
type SortKey = "newest" | "price-low" | "price-high" | "size-small" | "size-large";
const SORT_OPTIONS: { label: string; key: SortKey }[] = [
    { label: "Newest", key: "newest" },
    { label: "Price ↑", key: "price-low" },
    { label: "Price ↓", key: "price-high" },
    { label: "Size ↑", key: "size-small" },
    { label: "Size ↓", key: "size-large" },
];

/** Calculates the longest dimension of an artwork in cm. */
const getLongestSide = (p: Product): number => Math.max(p.width_cm || 0, p.height_cm || 0);

/** Calculates the surface area of an artwork in square cm. */
const getArea = (p: Product) => (p.width_cm || 0) * (p.height_cm || 0);

/** Determines calculated orientation if not explicitly provided by metadata. */
const getOrientation = (p: Product): "horizontal" | "vertical" | "square" | null => {
    if (p.orientation) return p.orientation.toLowerCase() as any;
    if (!p.width_cm || !p.height_cm) return null;
    const ratio = p.width_cm / p.height_cm;
    if (ratio >= 1.1) return "horizontal";
    if (ratio <= 0.9) return "vertical";
    return "square";
};

/** Groups artworks into broad size categories for filter logic. */
const getSizeCategory = (p: Product): "small" | "medium" | "large" | null => {
    const area = getArea(p);
    if (!area) return null;
    if (area < 900) return "small";
    if (area <= 3600) return "medium";
    return "large";
};

/**
 * Sorts products based on selected strategy.
 * For prints, uses the global print base price if original price is not relevant.
 */
function sortProducts(products: Product[], key: SortKey, globalPrintPrice: number) {
    const c = [...products];
    switch (key) {
        case "newest": c.sort((a, b) => b.id - a.id); break;
        case "price-low": c.sort((a, b) => (a.original_price || globalPrintPrice) - (b.original_price || globalPrintPrice)); break;
        case "price-high": c.sort((a, b) => (b.original_price || globalPrintPrice) - (a.original_price || globalPrintPrice)); break;
        case "size-small": c.sort((a, b) => getArea(a) - getArea(b)); break;
        case "size-large": c.sort((a, b) => getArea(b) - getArea(a)); break;
    }
    return c;
}

/** Height presets for the image exhibition zone based on grid density. */
const IMAGE_ZONE: Record<string, number> = { "1": 560, "2": 440, "3": 300 };

/**
 * Status config for availability badges.
 * `available` has no badge — focus stays on the CTA.
 * For all others, a small pill is overlaid on the image corner.
 * Colors use soft semantic palette: muted reds/ambers/blues/greys.
 */
const STATUS: Record<string, { label: string; badgeBg: string; badgeText: string; textColor: string }> = {
    available: { label: "AVAILABLE", badgeBg: "rgba(100,185,120,0.13)", badgeText: "#3a7a4a", textColor: "#6DB87E" },
    sold: { label: "SOLD", badgeBg: "rgba(180,60,60,0.11)", badgeText: "#9b2c2c", textColor: "#C05050" },
    reserved: { label: "RESERVED", badgeBg: "rgba(200,160,50,0.13)", badgeText: "#836a1a", textColor: "#C8A32A" },
    not_for_sale: { label: "NOT FOR SALE", badgeBg: "rgba(120,120,120,0.11)", badgeText: "#555", textColor: "#999" },
    on_exhibition: { label: "ON EXHIBITION", badgeBg: "rgba(50,130,200,0.11)", badgeText: "#20527a", textColor: "#4A90BE" },
    archived: { label: "ARCHIVED", badgeBg: "rgba(100,100,100,0.10)", badgeText: "#666", textColor: "#7f8c8d" },
    digital: { label: "DIGITAL ONLY", badgeBg: "rgba(120,90,200,0.12)", badgeText: "#5a3a9a", textColor: "#8E44AD" },
};

/**
 * Individual product card for the shop catalog.
 * Features dynamic aspect-ratio calculation to align metadata perfectly with
 * the image's left edge. Displays original status and print pricing.
 */
function ProductCard({ product, zoneH, gridMode, isMobile, initialLiked, likedIds, onAuthRequired, listIndex, onLikeChange }: {
    product: Product; zoneH: number; gridMode: string; isMobile: boolean;
    initialLiked?: boolean;
    likedIds?: Set<number>;
    onAuthRequired?: (id: number, newState: boolean) => void;
    listIndex?: number;
    onLikeChange?: (id: number, liked: boolean) => void;
}) {
    const { convertPrice, units } = usePreferences();
    const ori = (product.orientation || "vertical").toLowerCase();
    const isHorizontal = ori === "horizontal";
    const isSquare = ori === "square";
    const imgSrc = product.images?.[0] ? getImageUrl(product.images[0], "original") || "" : "";
    const st = STATUS[product.original_status];

    const containerRef = useRef<HTMLDivElement>(null);
    const [textPad, setTextPad] = useState(0);
    const [emptyBottom, setEmptyBottom] = useState(0);
    const [measuredImgH, setMeasuredImgH] = useState(0); // Track exact image height safely
    const [measuredImgW, setMeasuredImgW] = useState(0); // Track exact image width safely
    const [imgHovered, setImgHovered] = useState(false);
    const [localLiked, setLocalLiked] = useState(initialLiked || false);
    const [likeAnimating, setLikeAnimating] = useState(false);

    // Derived strictly from parent's Single Source of Truth
    const liked = likedIds !== undefined ? likedIds.has(product.id) : localLiked;

    /**
     * Synchronizes metadata alignment with the actual rendered bounds of 
     * the artwork image, compensating for variable aspect ratios within 
     * fixed grid columns.
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
        setMeasuredImgH(inner.offsetHeight); // Strictly save the accurate image bounding height
        setMeasuredImgW(inner.offsetWidth); // Save exact width for 5% margin logic
    }, []);

    useEffect(() => {
        recalc();
        window.addEventListener("resize", recalc);
        return () => window.removeEventListener("resize", recalc);
    }, [recalc]);

    // Re-calculate alignment when layout density (gridMode) shifts.
    useEffect(() => {
        requestAnimationFrame(recalc);
    }, [zoneH, recalc]);

    /** Format dimensions based on user's persistent unit preference (cm/in). */
    const sizeStr = useMemo(() => {
        const w = units === "in" ? product.width_in : product.width_cm;
        const h = units === "in" ? product.height_in : product.height_cm;
        if (w && h) return `${w} x ${h} ${units}`;
        return (product.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m: string, w: string, h: string) => {
            if (units === "cm") return `${Math.round(Number(w) * 2.54)} x ${Math.round(Number(h) * 2.54)} cm`;
            return m;
        });
    }, [product, units]);

    /** Like toggle: requires auth, animates, calls API with optimistic update. */
    const handleLike = async (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const newState = !liked;
        
        // Optimistically update both local and parent states instantly
        setLocalLiked(newState); 
        if (onLikeChange) onLikeChange(product.id, newState);
        
        setLikeAnimating(true);
        setTimeout(() => setLikeAnimating(false), 400);

        // If not authenticated, we handle it locally via Context and prompt conditionally
        if (onAuthRequired) { 
            onAuthRequired(product.id, newState);
            return; // Skip failing API call
        }

        
        try {
            if (newState) {
                await apiFetch(`${getApiUrl()}/users/me/likes/${product.id}`, { method: "POST" });
            } else {
                await apiFetch(`${getApiUrl()}/users/me/likes/${product.id}`, { method: "DELETE" });
            }
        } catch {
            // Revert silently on failure
            setLocalLiked(!newState);
            if (onLikeChange) onLikeChange(product.id, !newState);
        }
    };

    return (
        <div
            className={`art-card magnetic-scroll${listIndex !== undefined && listIndex < 2 ? " no-scroll-anim" : ""}`}
            style={{
                display: "flex", flexDirection: "column", width: "100%", padding: 0,
                /* Unified scale: image + text move as one glass plate */
                transform: imgHovered && !isMobile ? "scale(1.03)" : "scale(1)",
                transformOrigin: "center center",
                transition: "transform 0.2s ease-out",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            <Link href={artworkUrl(product.slug || product.id)} style={{ textDecoration: "none", display: "block", width: "100%", position: "relative", zIndex: 10, pointerEvents: "none" }}>
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
                        position: "relative",
                        pointerEvents: "none",
                    }}
                >
                    {imgSrc ? (
                        <img
                            src={imgSrc}
                            alt={product.title}
                            className="art-card-inner"
                            onLoad={recalc}
                            onMouseEnter={() => { if (!isMobile) setImgHovered(true); }}
                            onMouseLeave={() => { if (!isMobile) setImgHovered(false); }}
                            style={{
                                display: "block",
                                maxWidth: "78%",
                                maxHeight: isHorizontal ? `${zoneH * 0.78}px` : `${zoneH * 0.92}px`,
                                width: "auto", height: "auto",
                                borderRadius: "4px",
                                alignSelf: "center",
                                flexShrink: 0,
                                boxShadow: imgHovered && !isMobile
                                    ? "4px 16px 40px rgba(28,25,22,0.58), 0 4px 12px rgba(28,25,22,0.35)"
                                    : "2px 10px 28px rgba(28,25,22,0.48), 0 3px 8px rgba(28,25,22,0.25)",
                                transition: "box-shadow 0.2s ease-out, transform 0.2s ease-out",
                                cursor: "pointer",
                                WebkitTouchCallout: "none",
                                userSelect: "none",
                                WebkitUserSelect: "none",
                                pointerEvents: "auto",
                            }}
                        />
                    ) : (
                        <div className="art-card-inner" style={{
                            width: isHorizontal || isSquare ? "78%" : "55%",
                            height: isHorizontal ? "55%" : "85%",
                            backgroundImage: `linear-gradient(160deg, ${product.gradientFrom} 0%, ${product.gradientTo} 100%)`,
                            borderRadius: "4px",
                            alignSelf: "center",
                            flexShrink: 0,
                            boxShadow: "2px 8px 22px rgba(28,25,22,0.36), 0 2px 6px rgba(28,25,22,0.20)",
                        }} />
                    )}

                    {/* No badges on the image itself — they go in the metadata area below */}
                </div>
            </Link>

            {/* Metadata back-plate: sits behind the image, text below */}
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
                            {product.title}
                        </p>

                        <p style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem",
                            fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                        }}>
                            {sizeStr}
                        </p>
                        {/* Original status pill — shown for all statuses */}
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
                        {product.original_status === "available" && product.original_price && (
                            <p style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem",
                                fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                            }}>
                                Original <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(product.original_price)}</span>
                            </p>
                        )}
                        {product.has_prints && product.base_print_price && (
                            <p style={{
                                fontFamily: "var(--font-sans)",
                                fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem",
                                fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                            }}>
                                Prints starting at <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(product.base_print_price)}</span>
                            </p>
                        )}
                    </div>

                    {/* Right: Like button — prominent, stops card-hover propagation on pointer enter/leave */}
                    <button
                        onClick={handleLike}
                        onTouchEnd={handleLike}
                        onMouseEnter={() => setImgHovered(false)}
                        onMouseLeave={() => setImgHovered(false)}
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        aria-label={liked ? "Unlike artwork" : "Like artwork"}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "6px",
                            marginTop: "-2px",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
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
                            strokeLinecap="round"
                            strokeLinejoin="round"
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
 * Minimalist checkbox for sidebar filtering.
 * Uses CSS siblings for hover states and native hidden inputs for accessibility.
 */
function FilterCheckbox({ label, active, onClick, isMobile }: { label: string; active: boolean; onClick: () => void; isMobile?: boolean }) {
    return (
        <label className="filter-item">
            <span
                className="filter-item-box"
                style={{
                    width: "15px", height: "15px", flexShrink: 0,
                    border: `1.5px solid ${active ? "#1a1a18" : "rgba(26,26,24,0.3)"}`,
                    borderRadius: "3px", backgroundColor: active ? "#1a1a18" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.15s, border-color 0.15s",
                }}
            >
                {active && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            <span
                className="filter-item-text"
                style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.85rem",
                    fontWeight: isMobile ? (active ? 500 : 400) : (active ? 600 : 500),
                    color: active ? "#1a1a18" : "#6a6a68",
                    transition: "color 0.15s",
                    lineHeight: 1.45
                }}
            >
                {label}
            </span>
            <input type="checkbox" checked={active} onChange={onClick} style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }} />
        </label>
    );
}

/**
 * Collapsible sidebar category with smooth CSS transitions.
 */
function SidebarSection({ title, children, defaultOpen = true, isMobile }: { title: string; children: React.ReactNode; defaultOpen?: boolean; isMobile?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: "1px solid rgba(26,26,24,0.09)" }}>
            <button
                onClick={() => setOpen(!open)}
                className="filter-section-btn"
            >
                <span className="filter-section-title" style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.7rem",
                    fontWeight: isMobile ? 600 : 750,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: "#1a1a18"
                }}>{title}</span>
                <svg className="filter-section-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transition: "transform 0.22s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M1 1L5 5L9 1" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

const THUMB_R = 9;

/**
 * Advanced range slider for dimensions (width/height).
 * Implements Pointer Events API with setPointerCapture for consistent
 * interaction across mouse, touch, and stylus (e.g., Apple Pencil).
 * Includes manual text inputs for precision filtering.
 */
function DualRangeSlider({
    label, unit, globalMin, globalMax, valueMin, valueMax, onChange
}: {
    label: string; unit: string;
    globalMin: number; globalMax: number;
    valueMin: number; valueMax: number;
    onChange: (min: number, max: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const dragging = useRef<"min" | "max" | null>(null);

    // Dynamic refs to avoid closure staleness during high-frequency pointer moves.
    const rMin = useRef(valueMin);
    const rMax = useRef(valueMax);
    const rGMin = useRef(globalMin);
    const rGMax = useRef(globalMax);
    const rOnChange = useRef(onChange);
    rMin.current = valueMin;
    rMax.current = valueMax;
    rGMin.current = globalMin;
    rGMax.current = globalMax;
    rOnChange.current = onChange;

    const valFromClientX = useCallback((clientX: number) => {
        const rect = trackRef.current!.getBoundingClientRect();
        const usable = rect.width - 2 * THUMB_R;
        const p = Math.max(0, Math.min(1, (clientX - rect.left - THUMB_R) / usable));
        return Math.round(rGMin.current + p * (rGMax.current - rGMin.current));
    }, []);

    const [localMin, setLocalMin] = useState(valueMin);
    const [localMax, setLocalMax] = useState(valueMax);
    const minFocused = useRef(false);
    const maxFocused = useRef(false);

    useEffect(() => { if (!minFocused.current) setLocalMin(valueMin); }, [valueMin]);
    useEffect(() => { if (!maxFocused.current) setLocalMax(valueMax); }, [valueMax]);

    /** Standardizes and emits a minimum boundary update. */
    const applyMin = useCallback((raw: number) => {
        const v = Math.max(rGMin.current, Math.min(raw, rMax.current - 1));
        setLocalMin(v); rOnChange.current(v, rMax.current);
    }, []);

    /** Standardizes and emits a maximum boundary update. */
    const applyMax = useCallback((raw: number) => {
        const v = Math.max(Math.min(raw, rGMax.current), rMin.current + 1);
        setLocalMax(v); rOnChange.current(rMin.current, v);
    }, []);

    /** Handles initial contact and captures the pointer for the track. */
    const handleTrackPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        const val = valFromClientX(e.clientX);
        const which = Math.abs(val - rMin.current) <= Math.abs(val - rMax.current) ? "min" : "max";
        dragging.current = which;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (which === "min") rOnChange.current(Math.max(rGMin.current, Math.min(val, rMax.current - 1)), rMax.current);
        else rOnChange.current(rMin.current, Math.max(Math.min(val, rGMax.current), rMin.current + 1));
    }, [valFromClientX]);

    /** Emits updates during pointer translation. */
    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        e.preventDefault();
        const val = valFromClientX(e.clientX);
        if (dragging.current === "min")
            rOnChange.current(Math.max(rGMin.current, Math.min(val, rMax.current - 1)), rMax.current);
        else
            rOnChange.current(rMin.current, Math.max(Math.min(val, rGMax.current), rMin.current + 1));
    }, [valFromClientX]);

    const handlePointerUp = useCallback(() => { dragging.current = null; }, []);

    const range = globalMax - globalMin || 1;
    const pct = (v: number) => Math.max(0, Math.min(100, ((v - globalMin) / range) * 100));
    const isActive = valueMin > globalMin || valueMax < globalMax;

    const thumbBase: React.CSSProperties = {
        position: "absolute", top: "50%",
        width: `${THUMB_R * 2}px`, height: `${THUMB_R * 2}px`,
        backgroundColor: "#1a1a18", borderRadius: "50%",
        border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.28)",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none", userSelect: "none", zIndex: 2,
    };
    const leftOf = (v: number) =>
        `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${pct(v) / 100})`;

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "#555" }}>
                    {label}
                </span>
                {isActive && <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "#888" }}>{valueMin}–{valueMax} {unit}</span>}
            </div>

            <div
                ref={trackRef}
                style={{ position: "relative", height: "28px", padding: `0 ${THUMB_R}px`, boxSizing: "border-box", cursor: "pointer", marginBottom: "8px", touchAction: "none", userSelect: "none" }}
                onPointerDown={handleTrackPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div style={{ position: "absolute", top: "50%", left: `${THUMB_R}px`, right: `${THUMB_R}px`, height: "3px", backgroundColor: "rgba(26,26,24,0.1)", borderRadius: "2px", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", top: "50%", left: leftOf(valueMin), right: `calc(${THUMB_R}px + (100% - ${THUMB_R * 2}px) * ${(100 - pct(valueMax)) / 100})`, height: "3px", backgroundColor: "#1a1a18", borderRadius: "2px", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <div style={{ ...thumbBase, left: leftOf(valueMin) }} />
                <div style={{ ...thumbBase, left: leftOf(valueMax) }} />
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", color: "#bbb", marginBottom: "2px" }}>Min ({unit})</div>
                    <input
                        type="number"
                        value={localMin}
                        onChange={e => setLocalMin(Number(e.target.value))}
                        onFocus={() => { minFocused.current = true; }}
                        onBlur={() => { minFocused.current = false; applyMin(localMin); }}
                        onKeyDown={e => { if (e.key === "Enter") { applyMin(localMin); (e.target as HTMLInputElement).blur(); } }}
                        style={{ width: "100%", border: "1px solid rgba(26,26,24,0.18)", borderRadius: "3px", padding: "4px 5px", fontFamily: "var(--font-sans)", fontSize: "0.75rem", outline: "none", color: "#1a1a18" }}
                    />
                </div>
                <span style={{ color: "#ddd", fontSize: "0.7rem", marginTop: "14px" }}>–</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", color: "#bbb", marginBottom: "2px" }}>Max ({unit})</div>
                    <input
                        type="number"
                        value={localMax}
                        onChange={e => setLocalMax(Number(e.target.value))}
                        onFocus={() => { maxFocused.current = true; }}
                        onBlur={() => { maxFocused.current = false; applyMax(localMax); }}
                        onKeyDown={e => { if (e.key === "Enter") { applyMax(localMax); (e.target as HTMLInputElement).blur(); } }}
                        style={{ width: "100%", border: "1px solid rgba(26,26,24,0.18)", borderRadius: "3px", padding: "4px 5px", fontFamily: "var(--font-sans)", fontSize: "0.75rem", outline: "none", color: "#1a1a18" }}
                    />
                </div>
            </div>
        </div>
    );
}

/**
 * Specialized price filtering section with common presets.
 */
function PriceRangeSection({ min, max, onChange, isMobile }: { min: number; max: number; onChange: (min: number, max: number) => void; isMobile?: boolean }) {
    const [open, setOpen] = useState(false);
    const [localMin, setLocalMin] = useState(min);
    const [localMax, setLocalMax] = useState(max);

    useEffect(() => { setLocalMin(min); setLocalMax(max); }, [min, max]);

    const presets = [
        { label: "Any Price", min: 0, max: 999999 },
        { label: "Under $500", min: 0, max: 499 },
        { label: "$500–$1k", min: 500, max: 1000 },
        { label: "$1k–$2k", min: 1000, max: 2000 },
        { label: "Over $2k", min: 2001, max: 999999 },
    ];

    return (
        <div style={{ borderBottom: "1px solid rgba(26,26,24,0.09)" }}>
            <button
                onClick={() => setOpen(!open)}
                className="filter-section-btn"
            >
                <span className="filter-section-title" style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.7rem",
                    fontWeight: isMobile ? 600 : 750,
                    letterSpacing: "0.13em",
                    textTransform: "uppercase",
                    color: "#1a1a18"
                }}>Price</span>
                <svg className="filter-section-arrow" width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transition: "transform 0.22s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M1 1L5 5L9 1" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", backgroundColor: "rgba(26,26,24,0.05)", border: "1px solid rgba(26,26,24,0.1)", borderRadius: "4px", padding: "0.3rem 0.55rem", marginBottom: "0.55rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 400, color: "#555", fontStyle: "italic", letterSpacing: "0.01em" }}>Prices apply to originals only</span>
                        </div>
                        {presets.map(p => (
                            <FilterCheckbox
                                key={p.label}
                                label={p.label}
                                active={localMin === p.min && localMax === p.max}
                                onClick={() => { setLocalMin(p.min); setLocalMax(p.max); onChange(p.min, p.max); }}
                                isMobile={isMobile}
                            />
                        ))}
                        {/* Manual entry for specific budget ranges. */}
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem", alignItems: "center" }}>
                            <input
                                type="number" placeholder="Min" value={localMin === 0 ? "" : localMin}
                                onChange={e => setLocalMin(Number(e.target.value) || 0)}
                                onBlur={() => onChange(localMin, localMax)}
                                style={{ width: "60px", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "3px", padding: "3px 6px", fontFamily: "var(--font-sans)", fontSize: "0.72rem", outline: "none" }}
                            />
                            <span style={{ color: "#aaa", fontSize: "0.7rem" }}>–</span>
                            <input
                                type="number" placeholder="Max" value={localMax >= 999999 ? "" : localMax}
                                onChange={e => setLocalMax(Number(e.target.value) || 999999)}
                                onBlur={() => onChange(localMin, localMax)}
                                style={{ width: "60px", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "3px", padding: "3px 6px", fontFamily: "var(--font-sans)", fontSize: "0.72rem", outline: "none" }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Main Shop catalog page.
 * Manages complex filtering state, multi-unit dimension handling,
 * responsive layout transitions, and dynamic data fetching for artworks and labels.
 */
export default function ShopPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
            <ShopPageContent />
        </Suspense>
    );
}

function ShopPageContent() {
    const searchParams = useSearchParams();
    const { user } = useUser();
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<LabelCategory[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /** Liked artwork IDs loaded from DB (only when user is authenticated). */
    const [likedIds, setLikedIds] = useState<Set<number> | undefined>(undefined);
    /** Controls the sign-in prompt modal for unauthenticated likes. */
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    /** Filter state: Arrays for multi-select, primitives for ranges. */
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);    // "originals" | "prints"
    const [priceMin, setPriceMin] = useState(0);
    const [priceMax, setPriceMax] = useState(999999);
    const [widthMin, setWidthMin] = useState(0);
    const [widthMax, setWidthMax] = useState(0);
    const [heightMin, setHeightMin] = useState(0);
    const [heightMax, setHeightMax] = useState(0);
    const [activeYears, setActiveYears] = useState<number[]>([]);
    const [activeOrientations, setActiveOrientations] = useState<string[]>([]);
    const [activeLabels, setActiveLabels] = useState<number[]>([]);
    const [filterLiked, setFilterLiked] = useState(searchParams.get("liked") === "true");

    useEffect(() => {
        setFilterLiked(searchParams.get("liked") === "true");
    }, [searchParams]);

    const [sortIdx, setSortIdx] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isPhone, setIsPhone] = useState(false);
    const [gridMode, setGridMode] = useState<"1" | "2" | "3">("2");
    const [gridLoaded, setGridLoaded] = useState(false);

    const { globalPrintPrice, convertPrice, units, pendingLikes, addPendingLike, removePendingLike, unauthLikeCount, incrementUnauthLikeCount } = usePreferences();
    const itemsPerPage = gridMode === "3" ? 36 : gridMode === "2" ? 24 : 12;
    const [visibleCount, setVisibleCount] = useState(12);

    // Initial load of grid preference for Shop
    useEffect(() => {
        const saved = localStorage.getItem("artshop_shop_grid");
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        }
        setGridLoaded(true);
    }, []);

    // Persist grid preference for Shop
    useEffect(() => {
        if (gridLoaded) {
            localStorage.setItem("artshop_shop_grid", gridMode);
        }
    }, [gridMode, gridLoaded]);

    /** Bootstraps the catalog data from multiple endpoints. */
    useEffect(() => {
        const apiUrl = getApiUrl();
        Promise.all([
            apiFetch(`${apiUrl}/artworks?limit=1000`).then(r => r.json()),
            apiFetch(`${apiUrl}/labels/categories`).then(r => r.json()),
            apiFetch(`${apiUrl}/labels`).then(r => r.json()),
        ]).then(([artData, catData, lblData]) => {
            const rawData = artData.items || artData.data || artData;
            if (Array.isArray(rawData)) {
                const items = rawData.map((item: any, idx: number) => ({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][1],
                }));
                setAllProducts(items);
            } else {
                setError("Failed to load artworks.");
            }
            if (Array.isArray(catData)) setCategories(catData);
            if (Array.isArray(lblData)) setLabels(lblData);
        }).catch(err => {
            console.error("Shop initialization failed:", err);
            setError("Network error.");
        }).finally(() => setLoading(false));
    }, []);

    /** Fetch the authenticated user's liked artwork IDs for UI state init. */
    useEffect(() => {
        if (!user) {
            setLikedIds(new Set(pendingLikes)); // Fallback initialization
            return;
        }
        apiFetch(`${getApiUrl()}/users/me/likes`)
            .then(r => r.ok ? r.json() : [])
            .then((items: { id: number }[]) => {
                setLikedIds(new Set(items.map(a => a.id)));
            })
            .catch(() => setLikedIds(new Set()));
    }, [user]);

    /** Monitors viewport width to toggle between desktop sidebar and mobile bottom drawer. */
    useEffect(() => {
        const update = () => {
            setIsMobile(window.innerWidth < 1024);
            setIsPhone(window.innerWidth < 768);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    /** Layout persistence: Remembers grid density preferences per device type in session storage. */
    useEffect(() => {
        const mob = window.innerWidth < 1024;
        const storageKey = mob ? "artshop_shop_gridMode_mobile" : "artshop_shop_gridMode_pc";
        const saved = sessionStorage.getItem(storageKey) as "1" | "2" | "3" | null;
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        } else {
            // Defaults: High-visibility single-column for mobile, standard for desktop.
            setGridMode(mob ? "1" : "2");
        }
    }, [isMobile]);

    const handleSetGridMode = (val: "1" | "2" | "3") => {
        setGridMode(val);
        const storageKey = isMobile ? "artshop_shop_gridMode_mobile" : "artshop_shop_gridMode_pc";
        sessionStorage.setItem(storageKey, val);
    };

    /** Unique years appearing in the current catalog for filter generation. */
    const availableYears = useMemo(() =>
        [...new Set(allProducts.map(p => p.year).filter(Boolean) as number[])].sort((a, b) => b - a),
        [allProducts]);

    /** 
     * Converts a specific dimension (width/height) to the user's preferred unit.
     * Prioritizes native unit metadata if available; otherwise performs a calculated conversion.
     */
    const getUnitVal = useCallback((p: Product, measure: "width" | "height") => {
        if (units === "in") {
            const valIn = (p as any)[`${measure}_in` as keyof Product];
            if (valIn !== undefined && valIn !== null) return valIn;
            const valCm = p[`${measure}_cm` as keyof Product] as number ?? 0;
            return Number((valCm * 0.393701).toFixed(2));
        }
        return (p[`${measure}_cm` as keyof Product] as number) ?? 0;
    }, [units]);

    /** 
     * Reset slider bounds when switching units (cm <-> in) to prevent
     * filtering collisions due to out-of-sync min/max values.
     */
    const prevUnitsRef = useRef(units);
    useEffect(() => {
        if (prevUnitsRef.current !== units) {
            prevUnitsRef.current = units;
            setWidthMin(0); setWidthMax(0);
            setHeightMin(0); setHeightMax(0);
        }
    }, [units]);

    /** Calculate the minimum width bound across the entire catalog in current units. */
    const wGlobalMin = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "width")).filter(v => v > 0);
        return vals.length ? Math.floor(Math.min(...vals)) : 0;
    }, [allProducts, getUnitVal]);

    /** Calculate the maximum width bound across the entire catalog in current units. */
    const wGlobalMax = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "width")).filter(v => v > 0);
        return vals.length ? Math.ceil(Math.max(...vals)) : (units === "in" ? 80 : 200);
    }, [allProducts, getUnitVal, units]);

    /** Calculate the minimum height bound across the entire catalog in current units. */
    const hGlobalMin = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "height")).filter(v => v > 0);
        return vals.length ? Math.floor(Math.min(...vals)) : 0;
    }, [allProducts, getUnitVal]);

    /** Calculate the maximum height bound across the entire catalog in current units. */
    const hGlobalMax = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "height")).filter(v => v > 0);
        return vals.length ? Math.ceil(Math.max(...vals)) : (units === "in" ? 80 : 200);
    }, [allProducts, getUnitVal, units]);

    /** Hydrate slider state once global bounds are calculated from API data. */
    useEffect(() => {
        if (wGlobalMin > 0 && widthMax === 0) { setWidthMin(wGlobalMin); setWidthMax(wGlobalMax); }
        if (hGlobalMin > 0 && heightMax === 0) { setHeightMin(hGlobalMin); setHeightMax(hGlobalMax); }
    }, [wGlobalMin, wGlobalMax, hGlobalMin, hGlobalMax, widthMax, heightMax]);

    /** 
     * Core filtering engine.
     * Aggregates all active UI filters (type, price, size, tech info) into a 
     * single high-performance memoized list.
     */
    const effectiveLikedIds = user ? likedIds : new Set(pendingLikes);

    const filtered = useMemo(() => {
        let list = allProducts;

        // Classification filter: Distinguishes between physical originals and reproductions.
        if (categoryFilter.includes("originals") && !categoryFilter.includes("prints")) {
            list = list.filter(p => p.original_status === "available");
        } else if (categoryFilter.includes("prints") && !categoryFilter.includes("originals")) {
            list = list.filter(p => p.has_prints);
        } else if (categoryFilter.includes("originals") && categoryFilter.includes("prints")) {
            list = list.filter(p => p.original_status === "available" || p.has_prints);
        }

        // Liked constraint
        if (filterLiked) {
            if (!effectiveLikedIds) return []; // Return empty array while loading
            list = list.filter(p => effectiveLikedIds.has(p.id));
        }

        // Budgetary constraints (Originals only).
        if (priceMin > 0 || priceMax < 999999) {
            list = list.filter(p => {
                return p.original_status === "available" && p.original_price && p.original_price >= priceMin && p.original_price <= priceMax;
            });
        }

        // Dimension constraints: Width.
        const effWMax = widthMax || wGlobalMax;
        if ((widthMin > 0 && widthMin > wGlobalMin) || effWMax < wGlobalMax) {
            list = list.filter(p => {
                const w = getUnitVal(p, "width");
                return w > 0 && w >= widthMin && w <= effWMax;
            });
        }

        // Dimension constraints: Height.
        const effHMax = heightMax || hGlobalMax;
        if ((heightMin > 0 && heightMin > hGlobalMin) || effHMax < hGlobalMax) {
            list = list.filter(p => {
                const h = getUnitVal(p, "height");
                return h > 0 && h >= heightMin && h <= effHMax;
            });
        }

        // Chronological constraints.
        if (activeYears.length > 0) {
            list = list.filter(p => p.year && activeYears.includes(p.year));
        }

        // Geometric constraints.
        if (activeOrientations.length > 0) {
            list = list.filter(p => {
                const ori = getOrientation(p);
                return ori && activeOrientations.includes(ori);
            });
        }



        if (activeLabels.length > 0) {
            list = list.filter(p => (p.labels || []).some(t => activeLabels.includes(typeof t === "number" ? t : (t as any).id)));
        }

        return list;
    }, [allProducts, categoryFilter, filterLiked, likedIds, priceMin, priceMax, widthMin, widthMax, wGlobalMax, wGlobalMin, heightMin, heightMax, hGlobalMax, hGlobalMin, activeYears, activeOrientations, activeLabels, globalPrintPrice, getUnitVal]);

    /** Updates pending likes locally, and occasionally prompts the user. */
    const handleAuthRequired = (id: number, isLiked: boolean) => {
        if (isLiked) {
            addPendingLike(id);
        } else {
            removePendingLike(id);
        }
        
        incrementUnauthLikeCount();
        const nextCount = unauthLikeCount + 1;

        // Display the auth prompt on the 1st like, and then every 3rd like (4th, 7th...)
        if ((nextCount - 1) % 3 === 0) {
            setTimeout(() => setShowAuthPrompt(true), 1000);
        }
    };

    /** Synchronizes like state from child to parent, useful for live filtering. */
    const handleLikeChange = useCallback((id: number, isLiked: boolean) => {
        setLikedIds(prev => {
            const next = new Set(prev || []);
            if (isLiked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    /** Final sorted results for exhibition, respecting pagination and display limits. */
    const displayed = useMemo(() => {
        return sortProducts(filtered, SORT_OPTIONS[sortIdx].key, globalPrintPrice).slice(0, visibleCount);
    }, [filtered, sortIdx, visibleCount, globalPrintPrice]);

    /** Calculate the total number of active filters to show count badges on mobile. */
    const widthActive = widthMin > wGlobalMin || widthMax < wGlobalMax;
    const heightActive = heightMin > hGlobalMin || heightMax < hGlobalMax;
    const afc = categoryFilter.length
        + (filterLiked ? 1 : 0)
        + (priceMin > 0 || priceMax < 999999 ? 1 : 0)
        + (widthActive ? 1 : 0) + (heightActive ? 1 : 0)
        + activeYears.length + activeOrientations.length
        + (activeLabels?.length ?? 0);

    /** Resets the entire filter matrix to the default exhibition state. */
    const clearAll = () => {
        setCategoryFilter([]); setPriceMin(0); setPriceMax(999999);
        setWidthMin(wGlobalMin); setWidthMax(wGlobalMax);
        setHeightMin(hGlobalMin); setHeightMax(hGlobalMax);
        setActiveYears([]); setActiveOrientations([]);
        setActiveLabels([]);
        setFilterLiked(false);
    };

    /** Unified string multi-select toggler. */
    const toggleStr = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

    /** Unified numeric multi-select toggler. */
    const toggleNum = (setter: React.Dispatch<React.SetStateAction<number[]>>, val: number) =>
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

    const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px" });

    // Handle initial pagination and reacts to filter changes by resetting the visible offset.
    useEffect(() => {
        setVisibleCount(itemsPerPage);
    }, [categoryFilter, priceMin, priceMax, widthMin, widthMax, heightMin, heightMax, activeYears, activeOrientations, activeLabels, sortIdx, itemsPerPage]);

    // Infinite scroll trigger: Increments display quota when the user approaches the end of the results.
    useEffect(() => {
        if (inView && visibleCount < filtered.length) setVisibleCount(prev => prev + itemsPerPage);
    }, [inView, filtered.length, visibleCount, itemsPerPage]);

    /** CSS grid column mapping for the current density mode. */
    const getColumns = () => {
        if (isMobile) {
            if (isPhone) {
                if (gridMode === "1") return "1fr";
                if (gridMode === "2") return "repeat(2, 1fr)";
                return "repeat(3, 1fr)";
            } else {
                // Tablet layout
                if (gridMode === "1") return "repeat(2, 1fr)";
                if (gridMode === "2") return "repeat(3, 1fr)";
                return "repeat(4, 1fr)";
            }
        }
        // Desktop layout (Strict grid structure)
        if (gridMode === "1") return "repeat(2, 1fr)";
        if (gridMode === "2") return "repeat(3, 1fr)"; // Strictly 3 items
        return "repeat(4, 1fr)";
    };

    /** CSS grid gap mapping for the current density mode. */
    const getGap = () => {
        if (isMobile) {
            if (isPhone) {
                if (gridMode === "1") return "2.25rem 1rem";
                if (gridMode === "2") return "1.5rem 1.25rem";
                return "0.5rem 0.5rem";
            } else {
                // Tablet gap
                if (gridMode === "1") return "3rem 1.5rem";
                if (gridMode === "2") return "2rem 1rem";
                return "1rem 0.5rem";
            }
        }
        if (gridMode === "1") return "4rem 24px";
        if (gridMode === "2") return "3rem 16px";
        return "2rem 10px";
    };

    /** 
     * Shared filter panel composition.
     * Rendered either in the desktop sidebar or the mobile bottom drawer.
     * Divided into 7 logical sections: Category, Price, Size, Year, Orientation, Collections, and Medium.
     */
    const filtersJSX = (
        <>
            {/* 0. Collection filtering. */}
            {user && (
                <SidebarSection title="My Collection" defaultOpen={true} isMobile={isMobile}>
                    <FilterCheckbox label="My Likes" active={filterLiked} onClick={() => setFilterLiked(!filterLiked)} isMobile={isMobile} />
                </SidebarSection>
            )}

            {/* 1. Classification filtering. */}
            <SidebarSection title="Category" defaultOpen={false} isMobile={isMobile}>
                <FilterCheckbox label="Available Originals" active={categoryFilter.includes("originals")} onClick={() => toggleStr(setCategoryFilter, "originals")} isMobile={isMobile} />
                <FilterCheckbox label="Prints Available" active={categoryFilter.includes("prints")} onClick={() => toggleStr(setCategoryFilter, "prints")} isMobile={isMobile} />
            </SidebarSection>

            {/* 2. Budgetary filtering. */}
            <PriceRangeSection min={priceMin} max={priceMax} onChange={(mn, mx) => { setPriceMin(mn); setPriceMax(mx); }} isMobile={isMobile} />

            {/* 3. Physical dimension filtering. */}
            <SidebarSection title="Size" defaultOpen={false} isMobile={isMobile}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.8rem", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>({units})</span>
                </div>
                {wGlobalMax > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <DualRangeSlider
                            label="Width"
                            unit={units}
                            globalMin={wGlobalMin}
                            globalMax={wGlobalMax}
                            valueMin={widthMin || wGlobalMin}
                            valueMax={widthMax || wGlobalMax}
                            onChange={(mn, mx) => { setWidthMin(mn); setWidthMax(mx); }}
                        />
                        <DualRangeSlider
                            label="Height"
                            unit={units}
                            globalMin={hGlobalMin}
                            globalMax={hGlobalMax}
                            valueMin={heightMin || hGlobalMin}
                            valueMax={heightMax || hGlobalMax}
                            onChange={(mn, mx) => { setHeightMin(mn); setHeightMax(mx); }}
                        />
                    </div>
                ) : (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#bbb", fontStyle: "italic" }}>No size data yet</span>
                )}
            </SidebarSection>

            {/* 4. Temporal filtering. */}
            <SidebarSection title="Year" defaultOpen={false} isMobile={isMobile}>
                {availableYears.length > 0 ? availableYears.map(y => (
                    <FilterCheckbox key={y} label={String(y)} active={activeYears.includes(y)} onClick={() => toggleNum(setActiveYears, y)} isMobile={isMobile} />
                )) : (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#bbb", fontStyle: "italic" }}>No year data yet</span>
                )}
            </SidebarSection>

            {/* 5. Geometric orientation filtering. */}
            <SidebarSection title="Orientation" defaultOpen={false} isMobile={isMobile}>
                <FilterCheckbox label="Horizontal" active={activeOrientations.includes("horizontal")} onClick={() => toggleStr(setActiveOrientations, "horizontal")} isMobile={isMobile} />
                <FilterCheckbox label="Vertical" active={activeOrientations.includes("vertical")} onClick={() => toggleStr(setActiveOrientations, "vertical")} isMobile={isMobile} />
                <FilterCheckbox label="Square" active={activeOrientations.includes("square")} onClick={() => toggleStr(setActiveOrientations, "square")} isMobile={isMobile} />
            </SidebarSection>



            {/* 7. Dynamic Label filtering. */}
            {categories.map(cat => {
                const catLabels = labels.filter(l => l.category_id === cat.id);
                if (catLabels.length === 0) return null;
                return (
                    <SidebarSection key={cat.id} title={cat.title} defaultOpen={false} isMobile={isMobile}>
                        {catLabels.map(l => (
                            <FilterCheckbox key={l.id} label={l.title} active={activeLabels.includes(l.id)} onClick={() => toggleNum(setActiveLabels, l.id)} isMobile={isMobile} />
                        ))}
                    </SidebarSection>
                );
            })}
        </>
    );

    // Initial page load: Reset scroll to provide a consistent entrance to the catalog.
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "instant" });
        }
    }, []);

    return (
        <div className="premium-texture-bg" style={{ color: "var(--color-charcoal)", minHeight: "100vh" }}>
            {/* Mobile Bottom Drawer Backdrop: Dims the content when filtering is active. */}
            {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(26,26,24,0.75)", zIndex: 40 }} />}

            {/* Mobile Bottom Drawer: Contains all filters for compact accessibility. */}
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: "#ffffff", borderTop: "1px solid var(--color-border)", transform: drawerOpen ? "translateY(0)" : "translateY(100%)", transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1)", maxHeight: "85vh", overflowY: "auto" }}>
                <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(26,26,24,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, backgroundColor: "#ffffff", zIndex: 1 }}>
                    <div style={{ position: "absolute", top: "0.5rem", left: "50%", transform: "translateX(-50%)", width: "32px", height: "3px", borderRadius: "2px", backgroundColor: "rgba(26,26,24,0.12)" }} />
                    <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "0.5rem", color: "var(--color-charcoal)" }}>Filters</h3>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.5rem" }}>
                        {afc > 0 && <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 300, color: "var(--color-charcoal-mid)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(26,26,24,0.2)", paddingBottom: "1px" }}>Clear all</button>}
                        <button onClick={() => setDrawerOpen(false)} style={{ fontSize: "2rem", fontWeight: 200, color: "var(--color-charcoal)", background: "none", border: "none", cursor: "pointer", minWidth: "64px", minHeight: "64px", display: "flex", alignItems: "center", justifyContent: "flex-end", lineHeight: 1, padding: "0 10px" }}>✕</button>
                    </div>
                </div>
                <div style={{ padding: "1.25rem 1.5rem 1rem" }}>{filtersJSX}</div>
                <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid rgba(26,26,24,0.06)", position: "sticky", bottom: 0, backgroundColor: "#ffffff" }}>
                    <button onClick={() => setDrawerOpen(false)} style={{ width: "100%", padding: "0.85rem", backgroundColor: "var(--color-charcoal)", color: "var(--color-cream)", borderRadius: "2px", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", minHeight: "48px" }}>
                        Show {filtered.length} work{filtered.length !== 1 ? "s" : ""}
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", gap: "0", alignItems: "flex-start" }}>
                {/* Desktop Sidebar: Static panel for persistent filtering during navigation. */}
                <aside className="shop-desktop-sidebar" style={{ width: "240px", minWidth: "240px", flexShrink: 0, paddingLeft: "1.25rem", paddingRight: "1.5rem", paddingTop: "1.25rem", borderRight: "1px solid rgba(26,26,24,0.07)" }}>
                    {/* Clear All action: Strategically reserved space to prevent layout shifts. */}
                    <button
                        onClick={clearAll}
                        disabled={afc === 0}
                        style={{
                            fontFamily: "var(--font-sans)", fontSize: "0.58rem", fontWeight: 400,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            color: afc > 0 ? "#888" : "transparent",
                            background: "none", border: "none",
                            cursor: afc > 0 ? "pointer" : "default",
                            padding: "0 0 0.6rem", display: "block",
                            transition: "color 0.18s",
                            pointerEvents: afc === 0 ? "none" : "auto",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                        }}
                        onMouseEnter={e => { if (afc > 0) e.currentTarget.style.color = "#1a1a18"; }}
                        onMouseLeave={e => { if (afc > 0) e.currentTarget.style.color = "#888"; }}
                    >Clear all</button>
                    {filtersJSX}
                </aside>

                <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "1rem 1rem 6rem 1rem" : "1rem 2.5rem 6rem 2rem" }}>
                    {/* Catalog Control Bar: Status counter and sort/grid density toggles. */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: isMobile ? "nowrap" : "wrap", gap: isMobile ? "0.75rem" : "1rem", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? "5px" : 0, scrollbarWidth: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-muted)", whiteSpace: "nowrap" }}>{filtered.length} works</span>
                            {isMobile && (
                                <button onClick={() => setDrawerOpen(true)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.8rem", backgroundColor: afc > 0 ? "rgba(26,26,24,0.03)" : "transparent", color: "var(--color-charcoal)", border: "1px solid", borderColor: afc > 0 ? "var(--color-charcoal)" : "rgba(26,26,24,0.12)", fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", borderRadius: "2px" }}>
                                    Filters{afc > 0 ? ` (${afc})` : ""}
                                </button>
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <div className="grid-toggle-wrapper" style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                {(["1", "2", "3"] as const).map(mode => (
                                    <button key={mode} onClick={() => handleSetGridMode(mode)} title={`${mode} in a row`}
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 8px", backgroundColor: gridMode === mode ? "#ffffff" : "transparent", color: gridMode === mode ? "var(--color-charcoal)" : "var(--color-muted)", border: "none", borderRadius: "4px", boxShadow: gridMode === mode ? "0 1px 3px rgba(0,0,0,0.1)" : "none", cursor: "pointer", transition: "all 0.2s" }}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            {mode === "1" && <rect x="2" y="2" width="12" height="12" rx="1" />}
                                            {mode === "2" && <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>}
                                            {mode === "3" && <><rect x="1" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" /></>}
                                        </svg>
                                    </button>
                                ))}
                            </div>
                            <div style={{ position: "relative" }}>
                                <select value={sortIdx} onChange={e => setSortIdx(Number(e.target.value))} style={{ appearance: "none", backgroundColor: "transparent", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "20px", padding: "0.4rem 2.2rem 0.4rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-charcoal)", cursor: "pointer", outline: "none" }}>
                                    {SORT_OPTIONS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                                </select>
                                <span style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.65rem", color: "var(--color-charcoal)", fontWeight: 300 }}>∨</span>
                            </div>
                        </div>
                    </div>

                    {loading && <div style={{ padding: "5rem 1rem", textAlign: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)", fontSize: "0.85rem" }}>Curating catalog...</div>}
                    {error && <div style={{ padding: "5rem 1rem", textAlign: "center", fontFamily: "var(--font-sans)", color: "#C87070" }}>{error}</div>}

                    {!loading && !error && (filtered.length > 0 ? (
                        <div className="art-grid" style={{ display: "grid", gridTemplateColumns: getColumns(), justifyContent: "start", gap: getGap(), alignItems: "start" }}>
                            {displayed.map((p, i) => <ProductCard
                                key={p.id}
                                product={p}
                                zoneH={IMAGE_ZONE[gridMode] || 380}
                                gridMode={gridMode}
                                isMobile={isMobile}
                                likedIds={effectiveLikedIds}
                                listIndex={i}
                                onAuthRequired={!user ? handleAuthRequired : undefined}
                                onLikeChange={handleLikeChange}
                            />)}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "5rem 1rem" }}>
                            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.2rem", color: "var(--color-muted)", marginBottom: "1.25rem" }}>Exhibition results remain empty for these parameters.</p>
                            <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset all parameters</button>
                        </div>
                    ))}

                    {visibleCount < filtered.length && (
                        <div ref={loadMoreRef} style={{ height: "40px", marginTop: "2rem", display: "flex", justifyContent: "center" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontFamily: "var(--font-sans)" }}>Curating more works...</span>
                        </div>
                    )}
                </div>
            </div>
            {/* Auth Prompt Modal — shown when unauthenticated user tries to like */}
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
