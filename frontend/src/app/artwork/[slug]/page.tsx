"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";
import { useCart } from "@/context/CartContext";
import { useUser } from "@/context/UserContext";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";
import GoogleLoginButton from "@/components/GoogleLoginButton";

type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface ArtworkImage {
    thumb: string;
    medium: string;
    original: string;
}

interface Artwork {
    id: number;
    title: string;
    description: string;
    medium: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    has_prints: boolean;
    has_canvas_print: boolean;
    has_canvas_print_limited: boolean;
    has_paper_print: boolean;
    has_paper_print_limited: boolean;
    canvas_print_limited_quantity?: number | null;
    paper_print_limited_quantity?: number | null;
    print_aspect_ratio_id?: number | null;
    print_min_size_label?: string | null;
    print_max_size_label?: string | null;
    orientation?: string;
    base_print_price?: number;
    images?: (string | ArtworkImage)[];
    aspect_ratio?: string;
    gradientFrom?: string;
    gradientTo?: string;
    width_cm?: number;
    height_cm?: number;
}

const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"],
    ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"],
    ["#5A8A8A", "#2A5A5A"],
    ["#D4905A", "#8A5030"],
];

const STATUS_BADGE: Record<OriginalStatus, { label: string; bg: string; border: string; desc?: string } | null> = {
    available: { label: "AVAILABLE", bg: "#F0FDF4", border: "#166534", desc: "Ready to ship globally" },
    sold: { label: "SOLD", bg: "#FEF2F2", border: "#991B1B", desc: "This original has found a home" },
    reserved: { label: "RESERVED", bg: "#FFFBEB", border: "#92400E", desc: "Currently on hold for a collector" },
    not_for_sale: { label: "NOT FOR SALE", bg: "#F8FAFC", border: "#475569", desc: "Private collection" },
    on_exhibition: { label: "EXHIBITION", bg: "#EFF6FF", border: "#1E40AF", desc: "Currently on display at a gallery" },
    archived: null,
    digital: { label: "DIGITAL ONLY", bg: "#FAF5FF", border: "#6B21A8", desc: "Available as high-res digital file" },
};

export default function ArtworkDetailPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const { units, convertPrice, globalPrintPrice } = usePreferences();
    const { addItem } = useCart();

    const [work, setWork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    // Edition selection: "standard" = open edition, "limited" = limited/signed
    const [canvasEdition, setCanvasEdition] = useState<"standard" | "limited">("standard");
    const [paperEdition, setPaperEdition] = useState<"standard" | "limited">("standard");
    // Size selection from DB pricing rows
    const [canvasSizes, setCanvasSizes] = useState<{ size_label: string; price: number }[]>([]);
    const [paperSizes, setPaperSizes] = useState<{ size_label: string; price: number }[]>([]);
    const [selectedCanvasSize, setSelectedCanvasSize] = useState<{ size_label: string; price: number } | null>(null);
    const [selectedPaperSize, setSelectedPaperSize] = useState<{ size_label: string; price: number } | null>(null);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [fullSizeOpen, setFullSizeOpen] = useState(false);
    const [purchaseType, setPurchaseType] = useState<"original" | "canvas" | "paper">("original");
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const [allSlugs, setAllSlugs] = useState<string[]>([]); // For prev/next navigation

    const { user } = useUser();
    const [liked, setLiked] = useState(false);
    const [likeAnimating, setLikeAnimating] = useState(false);
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    // Toggle these to switch designs easily
    const mobileThumbsRound = true;


    const swipeRef = useRef<number | null>(null);
    const hasTouch = useRef(false);

    // Measure bounding box and active image directly to place thumbnails accurately
    const boxRef = useRef<HTMLDivElement>(null);
    const imgRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [layoutMetrics, setLayoutMetrics] = useState({ boxW: 0, boxH: 0, imgH: 0, winW: 0 });
    const [imageAspectRatios, setImageAspectRatios] = useState<Record<number, number>>({});

    useEffect(() => {
        const boxNode = boxRef.current;
        const imgNode = imgRefs.current[selectedImageIndex];
        if (!boxNode) return;

        const updateMetrics = () => {
            if (boxNode) {
                setLayoutMetrics({ boxW: boxNode.clientWidth, boxH: boxNode.clientHeight, imgH: imgNode ? imgNode.clientHeight : 0, winW: window.innerWidth });
            }
        };

        const observer = new ResizeObserver(updateMetrics);
        observer.observe(boxNode);
        if (imgNode) observer.observe(imgNode);

        updateMetrics(); // Initial read
        return () => observer.disconnect();
    }, [selectedImageIndex, work?.images?.length]);

    const handleImgLoad = (idx: number, e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
            setImageAspectRatios(prev => ({ ...prev, [idx]: naturalWidth / naturalHeight }));
        }
        const boxNode = boxRef.current;
        const imgNode = imgRefs.current[selectedImageIndex];
        if (boxNode) {
            setLayoutMetrics({ boxW: boxNode.clientWidth, boxH: boxNode.clientHeight, imgH: imgNode ? imgNode.clientHeight : 0, winW: window.innerWidth });
        }
    };

    // Amazon style zoom state
    const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
    const [isZooming, setIsZooming] = useState(false);

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (hasTouch.current || e.pointerType !== "mouse") return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setZoomPos({ x, y });
    };

    useEffect(() => {
        if (!slug) return;
        apiFetch(`${getApiUrl()}/artworks/${slug}`)
            .then(res => {
                if (!res.ok) throw new Error(`Artwork API ${res.status}`);
                return res.json();
            })
            .then(async data => {
                const item = data.data || data;
                setWork({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][1],
                });

                // Auto-select the most relevant tab
                if (item.original_status === "available") {
                    setPurchaseType("original");
                } else if (item.has_canvas_print || item.has_canvas_print_limited) {
                    setPurchaseType("canvas");
                } else if (item.has_paper_print || item.has_paper_print_limited) {
                    setPurchaseType("paper");
                }

                // Fetch pricing from DB if aspect ratio is set
                if (item.print_aspect_ratio_id) {
                    try {
                        const pricingRes = await apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios/with-pricing`);
                        if (!pricingRes.ok) throw new Error(`Pricing API ${pricingRes.status}`);
                        const allRatios = await pricingRes.json();
                            const ratio = allRatios.find((r: any) => r.id === item.print_aspect_ratio_id);
                            if (ratio?.pricing_rows) {
                                const rows: { size_label: string; price: number; print_type: string }[] = ratio.pricing_rows;
                                // Filter by min/max if set
                                const allLabels = [...new Set(rows.map((r: any) => r.size_label))] as string[];
                                const minIdx = item.print_min_size_label ? allLabels.indexOf(item.print_min_size_label) : 0;
                                const maxIdx = item.print_max_size_label ? allLabels.indexOf(item.print_max_size_label) : allLabels.length - 1;
                                const allowedLabels = allLabels.slice(Math.max(0, minIdx), maxIdx + 1);

                                const canvasRows = rows.filter((r: any) => r.print_type === "canvas" && allowedLabels.includes(r.size_label));
                                const canvasLtdRows = rows.filter((r: any) => r.print_type === "canvas_limited" && allowedLabels.includes(r.size_label));
                                const paperRows = rows.filter((r: any) => r.print_type === "paper" && allowedLabels.includes(r.size_label));
                                const paperLtdRows = rows.filter((r: any) => r.print_type === "paper_limited" && allowedLabels.includes(r.size_label));

                                setCanvasSizes(canvasRows.length ? canvasRows : canvasLtdRows);
                                setPaperSizes(paperRows.length ? paperRows : paperLtdRows);
                                if (canvasRows.length) setSelectedCanvasSize(canvasRows[0]);
                                if (paperRows.length) setSelectedPaperSize(paperRows[0]);
                            }
                    } catch (e) { console.warn("Pricing fetch failed", e); }
                }
            })
            .catch(() => console.warn("Backend unavailable"))
            .finally(() => setLoading(false));
    }, [slug]);

    const { pendingLikes, addPendingLike, removePendingLike, unauthLikeCount, incrementUnauthLikeCount } = usePreferences();

    // Fetch all artwork slugs for prev/next navigation
    useEffect(() => {
        apiFetch(`${getApiUrl()}/artworks?limit=500&fields=slug`)
            .then(res => res.ok ? res.json() : [])
            .then(data => {
                const items = data.data || data.items || data || [];
                const slugs = items.map((a: { slug: string }) => a.slug).filter(Boolean);
                setAllSlugs(slugs);
            })
            .catch(() => { });
    }, []);

    // Fetch initial like state if authenticated
    useEffect(() => {
        if (!user || !work) {
            setLiked(false);
            return;
        }
        apiFetch(`${getApiUrl()}/users/me/likes`)
            .then(res => res.ok ? res.json() : [])
            .then((data: { id: number }[]) => {
                setLiked(data.some(a => a.id === work.id));
            })
            .catch(() => setLiked(false));
    }, [user, work]);

    useEffect(() => {
        if (fullSizeOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [fullSizeOpen]);

    if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Loading artwork...</div>;
    if (!work) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Artwork not found.</div>;

    const images = work.images || [];
    const currentCanvasPrice = selectedCanvasSize?.price ?? globalPrintPrice;
    const currentPaperPrice = selectedPaperSize?.price ?? Math.round(globalPrintPrice * 0.8);
    const effectiveLiked = user ? liked : pendingLikes.includes(work.id);

    // Compute prev/next slugs
    const currentSlugIdx = allSlugs.indexOf(slug);
    const prevSlug = currentSlugIdx > 0 ? allSlugs[currentSlugIdx - 1] : null;
    const nextSlug = currentSlugIdx !== -1 && currentSlugIdx < allSlugs.length - 1 ? allSlugs[currentSlugIdx + 1] : null;

    // Dynamic metrics to align elements with the current image's edges
    const activeImageMetrics = (function () {
        if (!layoutMetrics.boxW || (layoutMetrics.winW >= 768 && !layoutMetrics.boxH)) return { w: 0, h: 0 };
        const idx = selectedImageIndex;
        const fallbackAspect = work.width_cm && work.height_cm ? work.width_cm / work.height_cm : (work.orientation === "horizontal" ? 1.5 : 0.75);
        const aspect = imageAspectRatios[idx] || fallbackAspect;

        if (layoutMetrics.winW < 768) {
            const w = layoutMetrics.boxW * 0.95;
            return { w, h: w / aspect };
        }

        const isVertical = aspect < 1;
        const thumbReserve = isVertical ? 280 : 200;
        const maxW = layoutMetrics.boxW - 40;
        const maxH = layoutMetrics.boxH - thumbReserve;
        let rW = maxW;
        let rH = rW / aspect;
        if (rH > maxH) {
            rH = maxH;
            rW = rH * aspect;
        }
        return { w: rW, h: rH };
    })();
    const viewFullSizeRightOffset = Math.max(0, (layoutMetrics.boxW - activeImageMetrics.w) / 2);
    const viewFullSizeTopOffset = activeImageMetrics.h + 5;

    return (
        <div className="w-full relative" style={{ maxWidth: "100%", overflowX: "clip" }}>
            <style>{`
            @keyframes subtlePulse {
                0% { box-shadow: 0 0 0 0 rgba(100, 116, 139, 0.15); border-color: rgba(100, 116, 139, 0.2); }
                50% { box-shadow: 0 0 0 4px rgba(100, 116, 139, 0); border-color: rgba(100, 116, 139, 0.4); }
                100% { box-shadow: 0 0 0 0 rgba(100, 116, 139, 0); border-color: rgba(100, 116, 139, 0.2); }
            }
        `}</style>
            <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 2rem 6rem" }}>
                {images.length > 0 && (
                    <link rel="preload" as="image" href={getImageUrl(images[selectedImageIndex], 'original')} />
                )}
                {/* ── Desktop: [LEFT 50% = image-viewer] [RIGHT 50% = purchase] ── */}
                {/* ── Mobile: single column ──────────────────────────────────── */}
                <style>{`
                .artwork-img-col { 
                    display: flex; 
                    flex-direction: column; 
                    position: relative; 
                    height: auto; /* Freedom from svh vertical clipping on mobile! */
                }
                .artwork-img-area {
                    flex: unset;
                    position: relative;
                    width: calc(100% + 4rem); /* Safe breakout that respects scrollbars unlike 100vw */
                    margin-left: -2rem;       /* Cancel out parent's 2rem horizontal padding */
                    margin-top: 2rem; /* Dropped down on mobile */
                    display: flex;
                    flex-direction: column; /* Flawless natural flow for thumbnails on mobile */
                    align-items: center;
                    justify-content: flex-start;
                }
                .artwork-frame {
                    max-width: 95vw; /* Absolute 95vw ensures infallible 2.5vw edges on mobile */
                }
                .artwork-slider-wrap {
                    display: flex;
                    flex-direction: column; /* Force vertical stacking of slider and thumbnails! */
                    align-items: center;
                    justify-content: flex-start;
                    width: 100%;
                    /* Naturally grows with image aspect */
                }
                @media (min-width: 768px) {
                    .artwork-img-col {
                        top: 10px;
                        height: calc(100vh - 40px);
                        pointer-events: none; /* Prevent invisible overflow from blocking nav bar clicks */
                    }
                    .artwork-img-col * {
                        pointer-events: auto; /* Re-enable clicks for all actual interactive children */
                    }
                    .artwork-img-area {
                        margin-left: 0;
                        margin-right: 0;
                        margin-top: -1rem; /* Lifted up significantly */
                        width: 100%;
                        height: calc(100% + 1rem); /* Space recovered */
                        align-items: flex-start;
                        flex: 1;
                    }
                    .artwork-frame {
                        /* max-width and max-height removed because explicitDimensions completely controls safe bounds in JS pixel-perfectly */
                    }
                    .artwork-slider-wrap {
                        height: calc(100% - 130px);
                    }
                }

                @media (max-width: 767px) {
                    /* Removed legacy .purchase-card break-out */
                }
                /* Show/hide like title row correctly per viewport */
                .mobile-title-row { display: flex; }
                .desktop-title-row { display: none; }
                @media (min-width: 768px) {
                    .mobile-title-row { display: none; }
                    .desktop-title-row { display: flex; }
                }
            `}</style>

                {/* ── GALLERY NAV ── */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0",
                    marginBottom: layoutMetrics.winW < 768 ? "1rem" : "2rem",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.72rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    position: "relative",
                    zIndex: 50,
                }}>
                    <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "#fff",
                        borderRadius: "40px",
                        boxShadow: "0 2px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.05)",
                        padding: "0 0.25rem",
                        gap: "0",
                    }}>
                        {/* Next — LEFT */}
                        {nextSlug ? (
                            <Link
                                href={`/artwork/${nextSlug}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.65rem 1.4rem",
                                    color: "var(--color-muted)",
                                    textDecoration: "none",
                                    transition: "color 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                            >
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="7,1 1,7 7,13" />
                                </svg>
                                Next
                            </Link>
                        ) : (
                            <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.65rem 1.4rem",
                                color: "var(--color-border)",
                                opacity: 0.35,
                                whiteSpace: "nowrap",
                                cursor: "default",
                            }}>
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="7,1 1,7 7,13" />
                                </svg>
                                Next
                            </span>
                        )}

                        {/* Divider */}
                        <span style={{ width: "1px", height: "16px", background: "var(--color-border)", opacity: 0.5, flexShrink: 0 }} />

                        {/* Center: All Works */}
                        <Link
                            href="/shop"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.65rem 1.6rem",
                                color: "var(--color-muted)",
                                textDecoration: "none",
                                transition: "color 0.2s",
                                whiteSpace: "nowrap",
                                WebkitTapHighlightColor: "transparent",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                        >
                            All Works
                        </Link>

                        {/* Divider */}
                        <span style={{ width: "1px", height: "16px", background: "var(--color-border)", opacity: 0.5, flexShrink: 0 }} />

                        {/* Prev — RIGHT */}
                        {prevSlug ? (
                            <Link
                                href={`/artwork/${prevSlug}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.65rem 1.4rem",
                                    color: "var(--color-muted)",
                                    textDecoration: "none",
                                    transition: "color 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                            >
                                Prev
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,1 7,7 1,13" />
                                </svg>
                            </Link>
                        ) : (
                            <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.65rem 1.4rem",
                                color: "var(--color-border)",
                                opacity: 0.35,
                                whiteSpace: "nowrap",
                                cursor: "default",
                            }}>
                                Prev
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,1 7,7 1,13" />
                                </svg>
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Title above the image */}
                <div className="mobile-title-row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: "0", marginTop: "1rem", textAlign: "left", gap: "1rem" }}>
                    <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2 }}>{work.title}</h1>
                    <button
                        onClick={async () => {
                            const newState = !effectiveLiked;
                            setLiked(newState); // Optimistic UI for animation
                            setLikeAnimating(true);
                            setTimeout(() => setLikeAnimating(false), 400);

                            if (!user) { 
                                if (work) {
                                    if (newState) addPendingLike(work.id);
                                    else removePendingLike(work.id);
                                }
                                incrementUnauthLikeCount();
                                const nextCount = unauthLikeCount + 1;
                                if ((nextCount - 1) % 3 === 0) {
                                    setTimeout(() => setShowAuthPrompt(true), 1000);
                                }
                                return; 
                            }
                            
                            try {
                                await apiFetch(`${getApiUrl()}/users/me/likes/${work.id}`, { method: newState ? "POST" : "DELETE" });
                            } catch {}
                        }}
                        aria-label={effectiveLiked ? "Unlike" : "Like"}
                        style={{
                            background: "rgba(255,255,255,0.88)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "50%",
                            width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", flexShrink: 0,
                            transform: likeAnimating ? "scale(1.2)" : "scale(1)",
                            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s",
                            outline: "none",
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={effectiveLiked ? "#e84057" : "none"} stroke={effectiveLiked ? "#e84057" : "#999"} strokeWidth={effectiveLiked ? "1.5" : "2"} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "fill 0.25s, stroke 0.25s", pointerEvents: "none" }}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>
                </div>

                <div className={`grid grid-cols-1 items-start gap-12 lg:gap-16 ${work.orientation === "horizontal" ? "md:grid-cols-2" : "md:grid-cols-[1.25fr_1fr]"}`}>

                    {/* LEFT CELL (50%): image viewer  */}
                    <div className="artwork-img-col">

                        {/* ── Image area: fills viewport height minus header-row ── */}
                        <div className="artwork-img-area" style={{ marginTop: layoutMetrics.winW < 768 ? "0.75rem" : "0" }}>
                            {/* Wrapper that leaves 130px safely at the bottom for thumbnails on PC, but just flows dynamically on Mobile */}
                            <div className="artwork-slider-wrap">

                                {/* ── THE MAX SPACE IMAGE BOX ──────────────────────────────────────────── */}
                                <div ref={boxRef} style={{ width: "100%", height: layoutMetrics.winW < 768 ? "auto" : "100%", position: layoutMetrics.winW < 768 ? "relative" : "absolute", inset: layoutMetrics.winW < 768 ? "auto" : 0 }}>
                                    <div
                                        className="w-full z-10"
                                        style={{
                                            position: "relative",
                                            /* Expand overflow clip: 60px vertically for deep shadow, 30px horizontally (safely less than 32px gap) */
                                            margin: "-60px -30px",
                                            padding: "60px 30px",
                                            width: "calc(100% + 60px)",
                                            height: layoutMetrics.winW < 768 ? `calc(${activeImageMetrics.h}px + 120px + 32px + 24px)` : "calc(100% + 120px)",
                                            transition: "height 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                                            overflow: "hidden",
                                            /* Feather edge masks to smoothly dissolve sliding shadows instead of hard clipping */
                                            WebkitMaskImage: "linear-gradient(to right, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)",
                                            maskImage: "linear-gradient(to right, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)",
                                        }}
                                        onTouchStart={e => { hasTouch.current = true; setIsZooming(false); swipeRef.current = e.touches[0].clientX; }}
                                        onTouchEnd={e => {
                                            if (swipeRef.current === null) return;
                                            const d = swipeRef.current - e.changedTouches[0].clientX;
                                            if (d > 48 && images.length > 1) setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                                            else if (d < -48 && images.length > 1) setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                                            swipeRef.current = null;
                                        }}
                                    >
                                        {/* ── THE SLIDER TRACK ── */}
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "8rem", /* Massive 128px gap ensures adjacent 45px shadows cannot reach the 30px expanded viewing boundary */
                                                width: "100%",
                                                height: "100%",
                                                transition: isZooming ? "none" : "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)",
                                                transform: `translateX(calc(-${selectedImageIndex * 100}% - ${selectedImageIndex * 8}rem))`,
                                            }}
                                        >
                                            {images.length > 0 ? (
                                                images.map((img, idx) => {
                                                    // Bulletproof aspect ratio fallback even if image onLoad completely fails due to browser cache
                                                    let fallbackAspect: number | undefined = undefined;
                                                    if (idx === 0) {
                                                        if (work.width_cm && work.height_cm) {
                                                            fallbackAspect = work.width_cm / work.height_cm;
                                                        } else if (work.orientation) {
                                                            fallbackAspect = work.orientation === "horizontal" ? 1.5 : work.orientation === "vertical" ? 0.75 : 1;
                                                        }
                                                    } else {
                                                        fallbackAspect = 1; // reasonable default for thumbnails/detail shots before load
                                                    }

                                                    const aspect = imageAspectRatios[idx] || fallbackAspect;

                                                    // Compute explicit pixel boundaries exactly to completely bypass buggy cross-browser flexbox algorithms.
                                                    // This perfectly guarantees both PC boundary tracking mapping for zoom and Mobile 95vw precision rules!
                                                    let explicitDimensions: React.CSSProperties = { margin: "auto" };

                                                    if (aspect && layoutMetrics.boxW > 0 && layoutMetrics.winW > 0) {
                                                        const isMobile = layoutMetrics.winW < 768;

                                                        if (isMobile) {
                                                            // Mobile: Uncaged 95vw stretch! Absolutely no maxH constraints!
                                                            const renderW = layoutMetrics.boxW * 0.95;
                                                            const renderH = renderW / aspect;
                                                            explicitDimensions = {
                                                                width: `${renderW}px`,
                                                                height: `${renderH}px`,
                                                                margin: "0 auto",
                                                            };
                                                        } else if (layoutMetrics.boxH > 0) {
                                                            const isVertical = aspect < 1;
                                                            // Vertical paintings need more headroom below for thumbnails (130px strip + nav margin + shadow)
                                                            const thumbReserve = isVertical ? 280 : 200;
                                                            const maxW = layoutMetrics.boxW - 45;
                                                            const maxH = layoutMetrics.boxH - thumbReserve;

                                                            let renderW = maxW;
                                                            let renderH = renderW / aspect;

                                                            if (renderH > maxH) {
                                                                renderH = maxH;
                                                                renderW = renderH * aspect;
                                                            }

                                                            explicitDimensions = {
                                                                width: `${renderW}px`,
                                                                height: `${renderH}px`,
                                                                margin: "0 auto",
                                                            };
                                                        }
                                                    }

                                                    return (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                flex: "0 0 100%",
                                                                width: "100%",
                                                                height: layoutMetrics.winW < 768 ? "auto" : "100%",
                                                                display: "flex",
                                                                alignItems: "flex-start", // Anchors the fully scaled image to the very top ceiling instead of floating middle
                                                                justifyContent: "center",
                                                            }}
                                                        >
                                                            <div
                                                                className="artwork-frame"
                                                                ref={el => { imgRefs.current[idx] = el; }}
                                                                onPointerEnter={e => { if (!hasTouch.current && e.pointerType === "mouse" && window.innerWidth > 768) setIsZooming(true); }}
                                                                onPointerLeave={e => { if (!hasTouch.current && e.pointerType === "mouse") setIsZooming(false); }}
                                                                onPointerMove={handlePointerMove}
                                                                onClick={() => { setIsZooming(false); setFullSizeOpen(true); }}
                                                                style={{
                                                                    display: "flex",
                                                                    position: "relative",
                                                                    overflow: "hidden",
                                                                    borderRadius: "4px",
                                                                    boxShadow: "var(--shadow-card-deep)",
                                                                    cursor: "crosshair",
                                                                    ...explicitDimensions
                                                                }}
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={getImageUrl(img, 'original')}
                                                                    alt={work.title}
                                                                    loading={idx === 0 ? "eager" : "lazy"}
                                                                    onLoad={(e) => handleImgLoad(idx, e)}
                                                                    ref={el => {
                                                                        if (el && el.complete && el.naturalWidth > 0 && !imageAspectRatios[idx]) {
                                                                            handleImgLoad(idx, { currentTarget: el } as any);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        maxWidth: "100%",
                                                                        maxHeight: "100%",
                                                                        width: explicitDimensions.width ? "100%" : "auto",
                                                                        height: explicitDimensions.height ? "100%" : "auto",
                                                                        objectFit: "contain",
                                                                        transform: isZooming && selectedImageIndex === idx ? "scale(2.5)" : "scale(1)",
                                                                        transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                                                                        transition: isZooming ? "none" : "transform 0.3s ease",
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div style={{ flex: "0 0 100%", width: "100%", height: "100%", background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})` }} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Full Size button - anchored exactly inside the bottom-right corner of the active frame */}
                                    <button
                                        onClick={() => setFullSizeOpen(true)}
                                        style={{
                                            position: "absolute",
                                            top: `${viewFullSizeTopOffset}px`,
                                            right: `${viewFullSizeRightOffset}px`,
                                            zIndex: 100,
                                            display: layoutMetrics.winW >= 768 && activeImageMetrics.h > 0 ? "inline-flex" : "none",
                                            alignItems: "center",
                                            gap: "0.6rem",
                                            background: "rgba(255,255,255,0.3)",
                                            color: "rgba(26,26,24,0.45)",
                                            border: "1px solid rgba(0,0,0,0.06)",
                                            borderRadius: "20px",
                                            padding: "0.4rem 0.9rem",
                                            cursor: "pointer",
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.65rem",
                                            fontWeight: 600,
                                            letterSpacing: "0.06em",
                                            textTransform: "uppercase",
                                            transition: "background 0.3s ease, color 0.3s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                                            willChange: "transform, background",
                                            backdropFilter: "blur(4px)",
                                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                                            WebkitTapHighlightColor: "transparent",
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.95)";
                                            e.currentTarget.style.color = "var(--color-charcoal)";
                                            e.currentTarget.style.transform = "scale(1.06)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                                            e.currentTarget.style.color = "rgba(26,26,24,0.45)";
                                            e.currentTarget.style.transform = "scale(1)";
                                        }}
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                                            <polyline points="15 3 21 3 21 9" />
                                            <polyline points="9 21 3 21 3 15" />
                                            <line x1="21" y1="3" x2="14" y2="10" />
                                            <line x1="3" y1="21" x2="10" y2="14" />
                                        </svg>
                                        Fullscreen
                                    </button>
                                </div>

                                {/* Thumbnails strip - strictly anchoring below the active image dynamically */}
                                {images.length > 1 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            bottom: layoutMetrics.winW < 768 ? "4px" : "auto",
                                            top: layoutMetrics.winW < 768 ? "auto" : `calc(${layoutMetrics.imgH}px + 2rem)`,
                                            marginTop: 0,
                                            width: "100%",
                                            overflowX: "auto",
                                            overflowY: "hidden",
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            paddingTop: layoutMetrics.winW < 768 ? "0px" : "40px",
                                            transform: layoutMetrics.winW < 768 ? "none" : "translateY(-40px)",
                                            paddingBottom: layoutMetrics.winW < 768 ? "0px" : "50px",
                                            marginBottom: layoutMetrics.winW < 768 ? "0" : "-50px",
                                            scrollbarWidth: "none",
                                            transition: "top 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                                            zIndex: 20
                                        }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: layoutMetrics.winW < 768 ? "0.25rem" : "0.5rem", justifyContent: "center", paddingTop: "0.5rem", minWidth: "min-content" }}>
                                            {images.map((img, idx) => {
                                                const isActive = selectedImageIndex === idx;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedImageIndex(idx)}
                                                        style={{
                                                            height: layoutMetrics.winW < 768 ? "24px" : "70px",
                                                            width: layoutMetrics.winW < 768 ? (mobileThumbsRound ? "24px" : "auto") : "auto",
                                                            padding: 0,
                                                            flexShrink: 0,
                                                            margin: isActive ? (layoutMetrics.winW < 768 ? "0 4px" : "0 10px") : "0",
                                                            border: layoutMetrics.winW < 768
                                                                ? (isActive ? "2px solid #fff" : "2px solid transparent")
                                                                : (isActive ? "2px solid var(--color-charcoal)" : "2px solid transparent"),
                                                            cursor: "pointer",
                                                            borderRadius: layoutMetrics.winW < 768 && mobileThumbsRound ? "50%" : "4px",
                                                            overflow: "hidden",
                                                            outline: "none",
                                                            background: "none",
                                                            display: "block",
                                                            opacity: isActive ? 1 : 0.55,
                                                            boxShadow: isActive ? (layoutMetrics.winW < 768 ? "0 2px 6px rgba(0,0,0,0.15)" : "var(--shadow-card-deep)") : (layoutMetrics.winW < 768 ? "0 1px 3px rgba(0,0,0,0.08)" : "var(--shadow-thumb)"),
                                                            transition: "margin 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                                                            WebkitTapHighlightColor: "transparent",
                                                        }}
                                                        onMouseEnter={e => {
                                                            if (!isActive) {
                                                                (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
                                                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)";
                                                            }
                                                        }}
                                                        onMouseLeave={e => {
                                                            if (!isActive) {
                                                                (e.currentTarget as HTMLButtonElement).style.opacity = "0.55";
                                                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-thumb)";
                                                            }
                                                        }}
                                                    >
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={getImageUrl(img, 'thumb')}
                                                            alt=""
                                                            style={{
                                                                height: "100%",
                                                                width: layoutMetrics.winW < 768 && mobileThumbsRound ? "100%" : "auto",
                                                                display: "block",
                                                                objectFit: layoutMetrics.winW < 768 && mobileThumbsRound ? "cover" : "initial"
                                                            }}
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            </div>{/* end .wrapper */}
                        </div>{/* end .artwork-img-area */}
                    </div>{/* end .artwork-img-col / left cell */}

                    {/* ── Right: Purchase panel ── */}
                    <div style={{ marginTop: layoutMetrics.winW >= 768 ? "-1rem" : "0", paddingBottom: layoutMetrics.winW < 768 ? "1rem" : "6rem" }}>
                        <div className="desktop-title-row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", marginTop: "-0.5rem", gap: "1rem" }}>
                            <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2 }}>{work.title}</h1>
                            <button
                                onClick={async () => {
                                    const newState = !effectiveLiked;
                                    setLiked(newState); // Optimistic UI for animation
                                    setLikeAnimating(true);
                                    setTimeout(() => setLikeAnimating(false), 400);

                                    if (!user) { 
                                        if (work) {
                                            if (newState) addPendingLike(work.id);
                                            else removePendingLike(work.id);
                                        }
                                        incrementUnauthLikeCount();
                                        const nextCount = unauthLikeCount + 1;
                                        if ((nextCount - 1) % 3 === 0) {
                                            setTimeout(() => setShowAuthPrompt(true), 1000);
                                        }
                                        return; 
                                    }
                                    
                                    try {
                                        await apiFetch(`${getApiUrl()}/users/me/likes/${work.id}`, { method: newState ? "POST" : "DELETE" });
                                    } catch {}
                                }}
                                aria-label={effectiveLiked ? "Unlike" : "Like"}
                                style={{
                                    background: "rgba(255,255,255,0.88)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "50%",
                                    width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center",
                                    cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", flexShrink: 0,
                                    transform: likeAnimating ? "scale(1.2)" : "scale(1)",
                                    transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s",
                                    outline: "none"
                                }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)"}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"}
                            >
                                <svg width="22" height="22" viewBox="0 0 24 24" fill={effectiveLiked ? "#e84057" : "none"} stroke={effectiveLiked ? "#e84057" : "#999"} strokeWidth={effectiveLiked ? "1.5" : "2"} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "fill 0.25s, stroke 0.25s" }}>
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                </svg>
                            </button>
                        </div>

                        <div style={{ position: "relative", marginTop: layoutMetrics.winW < 768 ? "-0.5rem" : "1rem", width: layoutMetrics.winW < 768 ? "calc(100% + 4rem)" : "100%", marginLeft: layoutMetrics.winW < 768 ? "-2rem" : "0", marginRight: layoutMetrics.winW < 768 ? "-2rem" : "0" }}>
                            {/* ── Fluid Morphing Folder Tabs ── */}
                            {(() => {
                                const isSmall = layoutMetrics.winW < 768;
                                // Determine radii to make the active tab merge seamlessly into the card
                                const cardBorderRadiusTopLeft = isSmall ? "0" : (purchaseType === "original" ? "0" : "24px");
                                const cardBorderRadiusTopRight = isSmall ? "0" : (purchaseType === "paper" ? "0" : "24px");

                                return (
                                    <>
                                        <style>{`
                                            /* ══════════════════════════════════════
                                               Liquid Glass Purchase Tabs — iOS 2026
                                               ══════════════════════════════════════ */
                                            .fluid-tabs-container {
                                                display: flex;
                                                position: relative;
                                                z-index: 10;
                                                margin-bottom: -1px;
                                                gap: 3px;
                                                padding: 0 16px; /* breathe from card edges on desktop */
                                            }

                                            /* ── Base tab (inactive / glass state) ── */
                                            .fluid-tab {
                                                flex: 1;
                                                position: relative;
                                                padding: 1.1rem 0.75rem 1rem;
                                                font-family: 'Cormorant Garamond', Georgia, serif;
                                                font-weight: 400;
                                                font-size: 1rem;
                                                letter-spacing: 0.03em;
                                                color: rgba(26, 26, 24, 0.5);
                                                border: none;
                                                cursor: pointer;
                                                z-index: 1;
                                                text-align: center;
                                                white-space: nowrap;
                                                border-radius: 14px 14px 0 0;
                                                -webkit-tap-highlight-color: transparent;

                                                /* ✦ Frosted glass — the inactive "you can click me" state */
                                                background: rgba(255, 255, 255, 0.35);
                                                backdrop-filter: blur(16px) saturate(1.4);
                                                -webkit-backdrop-filter: blur(16px) saturate(1.4);
                                                border: 1px solid rgba(255, 255, 255, 0.5);
                                                border-bottom: none;
                                                box-shadow:
                                                    inset 0 1px 0 rgba(255, 255, 255, 0.6),
                                                    0 -1px 4px rgba(0, 0, 0, 0.02);

                                                transition:
                                                    color 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                                                    background 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                                                    backdrop-filter 0.35s ease,
                                                    box-shadow 0.4s ease,
                                                    border-color 0.35s ease,
                                                    transform 0.25s ease;
                                            }

                                            /* Inactive hover — glass brightens */
                                            @media (hover: hover) and (pointer: fine) {
                                                .fluid-tab:hover:not(.active) {
                                                    color: rgba(26, 26, 24, 0.68);
                                                    background: rgba(255, 255, 255, 0.52);
                                                    border-color: rgba(255, 255, 255, 0.7);
                                                    box-shadow:
                                                        inset 0 1px 0 rgba(255, 255, 255, 0.8),
                                                        0 -2px 8px rgba(0, 0, 0, 0.03);
                                                    transform: translateY(-1px);
                                                }
                                            }

                                            /* ── Active tab — solid, elevated, highlighted ── */
                                            .fluid-tab.active {
                                                color: var(--color-charcoal);
                                                font-weight: 500;
                                                z-index: 10;

                                                /* Solid white — no glass, this is THE surface */
                                                background: #fff;
                                                backdrop-filter: none;
                                                -webkit-backdrop-filter: none;
                                                border-color: rgba(0, 0, 0, 0.06);

                                                box-shadow:
                                                    0 -3px 14px rgba(0, 0, 0, 0.05),
                                                    0 -1px 4px rgba(0, 0, 0, 0.03),
                                                    inset 0 2px 0 rgba(255, 255, 255, 1);
                                            }

                                            /* Active highlight bar — warm accent glow at top */
                                            .fluid-tab.active .tab-highlight {
                                                position: absolute;
                                                top: 0;
                                                left: 20%;
                                                right: 20%;
                                                height: 2.5px;
                                                border-radius: 0 0 4px 4px;
                                                background: linear-gradient(90deg, #ec4899, #fb923c);
                                                opacity: 0.7;
                                                transition: opacity 0.35s ease;
                                            }

                                            /* Organic inverse-radius curves — seamless card merge */
                                            .fluid-tab.active::before,
                                            .fluid-tab.active::after {
                                                content: "";
                                                position: absolute;
                                                bottom: 0;
                                                width: 16px;
                                                height: 16px;
                                                pointer-events: none;
                                                z-index: 10;
                                            }
                                            .fluid-tab.active::before {
                                                left: -16px;
                                                background: radial-gradient(circle at 0 0, transparent 15.5px, #fff 16px);
                                            }
                                            .fluid-tab.active::after {
                                                right: -16px;
                                                background: radial-gradient(circle at 100% 0, transparent 15.5px, #fff 16px);
                                            }

                                            /* Don't draw curves at container edges */
                                            .fluid-tab:first-child.active::before { display: none; }
                                            .fluid-tab:last-child.active::after  { display: none; }

                                            /* ── Mobile refinements ── */
                                            @media (max-width: 767px) {
                                                .fluid-tabs-container {
                                                    gap: 2px;
                                                    padding: 0 10px;
                                                }
                                                .fluid-tab {
                                                    font-size: 0.85rem;
                                                    padding: 0.9rem 0.2rem 0.8rem;
                                                    letter-spacing: 0.01em;
                                                    border-radius: 10px 10px 0 0;
                                                }
                                                .fluid-tab.active::before,
                                                .fluid-tab.active::after {
                                                    width: 10px;
                                                    height: 10px;
                                                }
                                                .fluid-tab.active::before {
                                                    left: -10px;
                                                    background: radial-gradient(circle at 0 0, transparent 9.5px, #fff 10px);
                                                }
                                                .fluid-tab.active::after {
                                                    right: -10px;
                                                    background: radial-gradient(circle at 100% 0, transparent 9.5px, #fff 10px);
                                                }
                                            }

                                            /* ── Card & content transitions ── */
                                            .purchase-card {
                                                transition: border-radius 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                                            }
                                            .purchase-card-content {
                                                animation: pcFadeIn 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                                            }
                                            @keyframes pcFadeIn {
                                                from { opacity: 0; transform: translateY(6px); }
                                                to   { opacity: 1; transform: translateY(0); }
                                            }

                                            /* ══════════════════════════════════════
                                               Step-by-Step Configurator
                                               ══════════════════════════════════════ */

                                            /* Header with title + subtitle */
                                            .pc-header {
                                                padding-bottom: 1.25rem;
                                                border-bottom: 1px solid var(--color-border);
                                            }
                                            .pc-title {
                                                font-family: 'Cormorant Garamond', Georgia, serif;
                                                font-size: 1.15rem;
                                                font-weight: 500;
                                                color: var(--color-charcoal);
                                                margin: 0 0 0.3rem;
                                                letter-spacing: 0.01em;
                                            }
                                            .pc-subtitle {
                                                font-family: var(--font-sans);
                                                font-size: 0.68rem;
                                                color: var(--color-muted);
                                                margin: 0;
                                                letter-spacing: 0.02em;
                                            }

                                            /* Step row: number + label + dropdown */
                                            .step-row {
                                                display: flex;
                                                flex-direction: column;
                                                gap: 0.6rem;
                                            }
                                            .step-label {
                                                display: flex;
                                                align-items: center;
                                                gap: 0.5rem;
                                                margin-left: -6px;
                                            }
                                            .step-number {
                                                font-family: 'Cormorant Garamond', Georgia, serif;
                                                font-size: 1.65rem;
                                                font-weight: 500;
                                                color: var(--color-charcoal);
                                                line-height: 1;
                                                width: 1.6rem;
                                                flex-shrink: 0;
                                            }
                                            .step-text {
                                                font-family: var(--font-sans);
                                                font-size: 0.82rem;
                                                font-weight: 600;
                                                letter-spacing: 0.1em;
                                                text-transform: uppercase;
                                                color: var(--color-muted);
                                                line-height: 1;
                                                transform: translateY(1px);
                                            }

                                            /* Custom inline expandable selector */
                                            .step-select-wrap {
                                                position: relative;
                                                padding-left: 10px;
                                            }
                                            .step-trigger {
                                                display: flex;
                                                align-items: center;
                                                justify-content: space-between;
                                                width: 100%;
                                                padding: 0.9rem 1.1rem;
                                                font-family: var(--font-sans);
                                                font-size: 0.85rem;
                                                font-weight: 400;
                                                color: var(--color-charcoal);
                                                background: #fff;
                                                border: 1.5px solid var(--color-border-dark);
                                                border-radius: 10px;
                                                cursor: pointer;
                                                outline: none;
                                                text-align: left;
                                                transition:
                                                    border-color 0.25s ease,
                                                    box-shadow 0.25s ease,
                                                    border-radius 0.2s ease;
                                                -webkit-tap-highlight-color: transparent;
                                            }
                                            .step-trigger.open {
                                                border-color: var(--color-charcoal);
                                                box-shadow: 0 0 0 3px rgba(17, 17, 17, 0.06);
                                                border-radius: 10px 10px 0 0;
                                                border-bottom-color: var(--color-border);
                                            }
                                            @media (hover: hover) and (pointer: fine) {
                                                .step-trigger:hover:not(.open) {
                                                    border-color: rgba(17, 17, 17, 0.35);
                                                }
                                            }
                                            /* Chevron */
                                            .step-chevron {
                                                width: 10px;
                                                height: 10px;
                                                border-right: 1.5px solid var(--color-muted);
                                                border-bottom: 1.5px solid var(--color-muted);
                                                transform: rotate(45deg);
                                                transition: transform 0.25s ease, border-color 0.2s ease;
                                                flex-shrink: 0;
                                                margin-left: 0.75rem;
                                            }
                                            .step-trigger.open .step-chevron {
                                                transform: rotate(-135deg);
                                                border-color: var(--color-charcoal);
                                            }

                                            /* Options panel — inline, pushes content down */
                                            .step-options {
                                                overflow: hidden;
                                                max-height: 0;
                                                opacity: 0;
                                                border: 1.5px solid transparent;
                                                border-top: none;
                                                border-radius: 0 0 10px 10px;
                                                background: #fff;
                                                transition:
                                                    max-height 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                                                    opacity 0.25s ease,
                                                    border-color 0.2s ease;
                                            }
                                            .step-options.open {
                                                max-height: 400px;
                                                opacity: 1;
                                                border-color: var(--color-charcoal);
                                            }

                                            /* Individual option */
                                            .step-option {
                                                display: flex;
                                                align-items: center;
                                                justify-content: space-between;
                                                width: 100%;
                                                padding: 0.75rem 1.1rem;
                                                font-family: var(--font-sans);
                                                font-size: 0.82rem;
                                                font-weight: 400;
                                                color: var(--color-charcoal-mid);
                                                background: transparent;
                                                border: none;
                                                border-top: 1px solid var(--color-border);
                                                cursor: pointer;
                                                text-align: left;
                                                transition: background 0.15s ease, color 0.15s ease;
                                                -webkit-tap-highlight-color: transparent;
                                            }
                                            .step-option:first-child {
                                                border-top: none;
                                            }
                                            .step-option:last-child {
                                                border-radius: 0 0 8px 8px;
                                            }
                                            .step-option.active {
                                                color: var(--color-charcoal);
                                                font-weight: 500;
                                                background: rgba(17, 17, 17, 0.03);
                                            }
                                            .step-option .opt-check {
                                                width: 16px;
                                                height: 16px;
                                                border-radius: 50%;
                                                border: 1.5px solid var(--color-border-dark);
                                                flex-shrink: 0;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                transition: all 0.2s ease;
                                            }
                                            .step-option.active .opt-check {
                                                border-color: var(--color-charcoal);
                                                background: var(--color-charcoal);
                                            }
                                            .step-option.active .opt-check::after {
                                                content: "";
                                                width: 4px;
                                                height: 4px;
                                                border-radius: 50%;
                                                background: #fff;
                                            }
                                            @media (hover: hover) and (pointer: fine) {
                                                .step-option:hover:not(.active) {
                                                    background: rgba(17, 17, 17, 0.02);
                                                    color: var(--color-charcoal);
                                                }
                                            }

                                            /* Info badge — neutral grey */
                                            .info-badge {
                                                display: flex;
                                                align-items: flex-start;
                                                gap: 0.7rem;
                                                padding: 0.85rem 1rem;
                                                border-radius: 8px;
                                                background: rgba(17, 17, 17, 0.03);
                                                border-left: 3px solid rgba(17, 17, 17, 0.15);
                                            }
                                            .info-badge-content {
                                                flex: 1;
                                            }
                                            .info-badge-title {
                                                font-family: var(--font-sans);
                                                font-size: 0.72rem;
                                                font-weight: 600;
                                                color: var(--color-charcoal);
                                                margin: 0 0 0.2rem;
                                                letter-spacing: 0.02em;
                                            }
                                            .info-badge-desc {
                                                font-family: var(--font-sans);
                                                font-size: 0.68rem;
                                                color: var(--color-charcoal-mid);
                                                margin: 0;
                                                line-height: 1.5;
                                            }

                                            /* Conditional step reveal animation */
                                            .step-reveal {
                                                animation: stepSlideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                                            }
                                            @keyframes stepSlideIn {
                                                from { opacity: 0; transform: translateY(8px); }
                                                to   { opacity: 1; transform: translateY(0); }
                                            }

                                            /* ══════════════════════════════════════
                                               Premium Edition Selector Cards
                                               ══════════════════════════════════════ */
                                            .edition-cards-grid {
                                                display: grid;
                                                gap: 0.75rem;
                                                padding-left: 10px;
                                            }
                                            .edition-cards-grid.two-col {
                                                grid-template-columns: 1fr 1fr;
                                            }
                                            .edition-cards-grid.one-col {
                                                grid-template-columns: 1fr;
                                            }

                                            /* Shared card base */
                                            .edition-card {
                                                position: relative;
                                                display: flex;
                                                flex-direction: column;
                                                padding: 1.15rem 1rem 1rem;
                                                border-radius: 14px;
                                                cursor: pointer;
                                                text-align: left;
                                                transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                                                overflow: hidden;
                                                background: #fff;
                                                border: 1.5px solid rgba(49,50,62,0.12);
                                                outline: none;
                                                -webkit-tap-highlight-color: transparent;
                                            }

                                            /* Subtle top shimmer line on hover */
                                            .edition-card::before {
                                                content: "";
                                                position: absolute;
                                                top: 0;
                                                left: 15%;
                                                right: 15%;
                                                height: 2.5px;
                                                border-radius: 0 0 4px 4px;
                                                opacity: 0;
                                                transition: opacity 0.3s ease, left 0.3s ease, right 0.3s ease;
                                            }

                                            /* ── Open Edition — dark elegant ── */
                                            .edition-card.open-edition {
                                                border-color: rgba(49,50,62,0.12);
                                            }
                                            .edition-card.open-edition::before {
                                                background: #31323E;
                                            }
                                            .edition-card.open-edition.active {
                                                border-color: #31323E;
                                                background: linear-gradient(135deg, rgba(49,50,62,0.04) 0%, rgba(49,50,62,0.01) 100%);
                                                box-shadow: 0 0 0 3px rgba(49,50,62,0.08), 0 4px 16px rgba(49,50,62,0.06);
                                            }
                                            .edition-card.open-edition.active::before {
                                                opacity: 0.7;
                                                left: 10%;
                                                right: 10%;
                                            }
                                            @media (hover: hover) and (pointer: fine) {
                                                .edition-card.open-edition:hover:not(.active) {
                                                    border-color: rgba(49,50,62,0.3);
                                                    box-shadow: 0 2px 8px rgba(49,50,62,0.06);
                                                    transform: translateY(-1px);
                                                }
                                                .edition-card.open-edition:hover:not(.active)::before {
                                                    opacity: 0.3;
                                                }
                                            }

                                            /* ── Limited Edition — warm luxury gradient ── */
                                            .edition-card.limited-edition {
                                                border-color: rgba(236,72,153,0.12);
                                            }
                                            .edition-card.limited-edition::before {
                                                background: linear-gradient(90deg, #ec4899, #fb923c);
                                            }
                                            .edition-card.limited-edition.active {
                                                border-color: rgba(236,72,153,0.4);
                                                background: linear-gradient(135deg, rgba(236,72,153,0.04) 0%, rgba(251,146,60,0.02) 100%);
                                                box-shadow: 0 0 0 3px rgba(236,72,153,0.08), 0 4px 16px rgba(236,72,153,0.06);
                                            }
                                            .edition-card.limited-edition.active::before {
                                                opacity: 0.8;
                                                left: 10%;
                                                right: 10%;
                                            }
                                            @media (hover: hover) and (pointer: fine) {
                                                .edition-card.limited-edition:hover:not(.active) {
                                                    border-color: rgba(236,72,153,0.25);
                                                    box-shadow: 0 2px 8px rgba(236,72,153,0.06);
                                                    transform: translateY(-1px);
                                                }
                                                .edition-card.limited-edition:hover:not(.active)::before {
                                                    opacity: 0.35;
                                                }
                                            }

                                            /* Card inner layout */
                                            .edition-card-header {
                                                display: flex;
                                                align-items: center;
                                                gap: 0.5rem;
                                                margin-bottom: 0.45rem;
                                            }
                                            .edition-card-icon {
                                                width: 22px;
                                                height: 22px;
                                                flex-shrink: 0;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                border-radius: 6px;
                                            }
                                            .edition-card.open-edition .edition-card-icon {
                                                background: rgba(49,50,62,0.08);
                                                color: #31323E;
                                            }
                                            .edition-card.limited-edition .edition-card-icon {
                                                background: rgba(236,72,153,0.1);
                                                color: #be185d;
                                            }
                                            .edition-card-title {
                                                font-family: var(--font-sans);
                                                font-size: 0.78rem;
                                                font-weight: 700;
                                                line-height: 1.2;
                                            }
                                            .edition-card.open-edition .edition-card-title {
                                                color: #31323E;
                                            }
                                            .edition-card.limited-edition .edition-card-title {
                                                color: #be185d;
                                            }
                                            .edition-card-desc {
                                                font-family: var(--font-sans);
                                                font-size: 0.64rem;
                                                line-height: 1.5;
                                                margin: 0;
                                            }
                                            .edition-card.open-edition .edition-card-desc {
                                                color: rgba(49,50,62,0.5);
                                            }
                                            .edition-card.limited-edition .edition-card-desc {
                                                color: rgba(190,24,93,0.55);
                                            }

                                            /* Scarcity badge */
                                            .edition-scarcity-badge {
                                                display: inline-flex;
                                                align-items: center;
                                                gap: 0.3rem;
                                                margin-top: 0.5rem;
                                                padding: 0.2rem 0.55rem;
                                                border-radius: 20px;
                                                font-family: var(--font-sans);
                                                font-size: 0.58rem;
                                                font-weight: 600;
                                                letter-spacing: 0.04em;
                                                background: linear-gradient(135deg, rgba(236,72,153,0.08), rgba(251,146,60,0.06));
                                                color: #be185d;
                                                border: 1px solid rgba(236,72,153,0.15);
                                            }
                                            .edition-scarcity-dot {
                                                width: 5px;
                                                height: 5px;
                                                border-radius: 50%;
                                                background: #ec4899;
                                                animation: scarcityPulse 2s ease-in-out infinite;
                                            }
                                            @keyframes scarcityPulse {
                                                0%, 100% { opacity: 1; transform: scale(1); }
                                                50% { opacity: 0.5; transform: scale(0.8); }
                                            }

                                            /* Radio indicator */
                                            .edition-radio {
                                                position: absolute;
                                                top: 0.85rem;
                                                right: 0.85rem;
                                                width: 16px;
                                                height: 16px;
                                                border-radius: 50%;
                                                border: 1.5px solid rgba(49,50,62,0.2);
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                transition: all 0.25s ease;
                                            }
                                            .edition-card.open-edition.active .edition-radio {
                                                border-color: #31323E;
                                                background: #31323E;
                                            }
                                            .edition-card.limited-edition.active .edition-radio {
                                                border-color: #ec4899;
                                                background: linear-gradient(135deg, #ec4899, #fb923c);
                                            }
                                            .edition-radio-dot {
                                                width: 5px;
                                                height: 5px;
                                                border-radius: 50%;
                                                background: #fff;
                                                opacity: 0;
                                                transition: opacity 0.2s ease;
                                            }
                                            .edition-card.active .edition-radio-dot {
                                                opacity: 1;
                                            }

                                            /* ── Edition Features Table ── */
                                            .edition-features {
                                                margin-top: 0.75rem;
                                                padding-left: 10px;
                                                animation: editionFeaturesIn 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
                                            }
                                            @keyframes editionFeaturesIn {
                                                from { opacity: 0; transform: translateY(6px); }
                                                to   { opacity: 1; transform: translateY(0); }
                                            }
                                            .edition-features-list {
                                                display: flex;
                                                flex-direction: column;
                                                gap: 0;
                                                border-radius: 10px;
                                                overflow: hidden;
                                                border: 1px solid var(--color-border);
                                                background: #fff;
                                            }
                                            .edition-feature-row {
                                                display: flex;
                                                align-items: center;
                                                gap: 0.6rem;
                                                padding: 0.6rem 0.85rem;
                                                border-bottom: 1px solid var(--color-border);
                                                font-family: var(--font-sans);
                                                font-size: 0.72rem;
                                                color: var(--color-charcoal-mid);
                                                line-height: 1.35;
                                            }
                                            .edition-feature-row:last-child {
                                                border-bottom: none;
                                            }
                                            .edition-feature-icon {
                                                width: 16px;
                                                height: 16px;
                                                flex-shrink: 0;
                                                display: flex;
                                                align-items: center;
                                                justify-content: center;
                                                font-size: 0.7rem;
                                            }
                                            .edition-feature-icon.positive {
                                                color: #16a34a;
                                            }
                                            .edition-feature-icon.neutral {
                                                color: var(--color-muted);
                                            }
                                            .edition-feature-icon.caution {
                                                color: #d97706;
                                            }

                                            /* Mobile refinements */
                                            @media (max-width: 767px) {
                                                .step-number { font-size: 1.45rem; width: 1.4rem; }
                                                .step-text { font-size: 0.72rem; }
                                                .step-label { margin-left: -3px; }
                                                .step-select-wrap { padding-left: 6px; }
                                                .step-trigger { font-size: 0.82rem; padding: 0.8rem 0.9rem; }
                                                .step-option { font-size: 0.78rem; padding: 0.7rem 0.9rem; }
                                                .pc-title { font-size: 1.05rem; }
                                                .info-badge { padding: 0.75rem 0.85rem; }
                                                .edition-cards-grid { padding-left: 6px; }
                                                .edition-card { padding: 0.9rem 0.8rem 0.85rem; border-radius: 12px; }
                                                .edition-card-title { font-size: 0.72rem; }
                                                .edition-card-desc { font-size: 0.6rem; }
                                                .edition-card-icon { width: 18px; height: 18px; }
                                                .edition-scarcity-badge { font-size: 0.54rem; padding: 0.15rem 0.4rem; }
                                                .edition-features { padding-left: 6px; }
                                                .edition-feature-row { font-size: 0.66rem; padding: 0.5rem 0.7rem; gap: 0.45rem; }
                                            }
                                        `}</style>

                                        {/* ── Tabs ── */}
                                        <div className="fluid-tabs-container">
                                            {([
                                                { key: "original", label: "Original" },
                                                ...(work.has_canvas_print || work.has_canvas_print_limited ? [{ key: "canvas", label: "Canvas Print" }] : []),
                                                ...((work.has_paper_print || work.has_paper_print_limited || work.has_canvas_print || work.has_canvas_print_limited) ? [{ key: "paper", label: "Paper Print" }] : []),
                                            ] as { key: "original" | "canvas" | "paper"; label: string }[]).map(({ key, label }) => {
                                                const isActive = purchaseType === key;
                                                return (
                                                    <button
                                                        key={key}
                                                        className={`fluid-tab ${isActive ? "active" : ""}`}
                                                        onClick={() => setPurchaseType(key)}
                                                    >
                                                        {isActive && <span className="tab-highlight" />}
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="purchase-card" style={{
                                            backgroundColor: "#fff",
                                            padding: isSmall ? "2rem 1.25rem" : "2rem",
                                            borderTopLeftRadius: cardBorderRadiusTopLeft,
                                            borderTopRightRadius: cardBorderRadiusTopRight,
                                            borderBottomLeftRadius: isSmall ? "0" : "24px",
                                            borderBottomRightRadius: isSmall ? "0" : "24px",
                                            boxShadow: "0 4px 16px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.06)",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "2rem",
                                            position: "relative",
                                            zIndex: 1,
                                            width: "100%",
                                            boxSizing: "border-box"
                                        }}>
                                            <div className="purchase-card-content" key={purchaseType} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                                                {purchaseType === "original" ? (
                                                    <>
                                                        {/* ── Original Artwork ── */}
                                                        {work.original_status === "available" && (
                                                            <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.5rem" }}>
                                                                <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.5rem" }}>Purchase Details</h3>
                                                                <p className="font-price" style={{ fontSize: "1.65rem", fontWeight: 600, color: "var(--color-charcoal)", letterSpacing: "-0.03em" }}>{convertPrice(work.original_price)}</p>
                                                                <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>Original Artwork • Certificate of Authenticity included</p>
                                                            </div>
                                                        )}
                                                        <div>
                                                            <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.8rem", marginTop: "0.5rem" }}>About the Painting</h3>
                                                            <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: "var(--color-charcoal-mid)" }}>{work.description}</p>
                                                        </div>

                                                        {work.original_status === "available" && (
                                                            <>
                                                                <div className="info-badge">
                                                                    <div className="info-badge-content">
                                                                        <p className="info-badge-title">Shipped Rolled in Protective Tube</p>
                                                                        <p className="info-badge-desc">Gallery-standard shipping method · Reinforced tube with acid-free tissue · Worldwide delivery</p>
                                                                    </div>
                                                                </div>
                                                                <div style={{ backgroundColor: "#FFF8F0", borderLeft: "3px solid #D4A574", borderRadius: "6px", padding: "0.85rem 1rem" }}>
                                                                    <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 600, color: "var(--color-charcoal)", marginBottom: "0.2rem" }}>Flat crate available on request</p>
                                                                    <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "var(--color-charcoal-mid)", lineHeight: 1.5 }}>Custom crates from <span className="font-price font-medium">{convertPrice(1000)}</span>+. Contact us for details.</p>
                                                                </div>
                                                            </>
                                                        )}

                                                        {work.original_status !== "available" && STATUS_BADGE[work.original_status] && (() => {
                                                            const s = STATUS_BADGE[work.original_status]!;
                                                            return (
                                                                <div style={{ backgroundColor: s.bg, borderLeft: `3px solid ${s.border}`, borderRadius: "6px", padding: "0.85rem 1rem", display: "flex", alignItems: "flex-start", gap: "0.65rem" }}>
                                                                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: s.border, marginTop: "0.35rem", flexShrink: 0 }} />
                                                                    <div style={{ flex: 1 }}>
                                                                        <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, color: "var(--color-charcoal)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</p>
                                                                        {s.desc && <p style={{ margin: "0.2rem 0 0", fontSize: "0.7rem", color: "var(--color-muted)", lineHeight: 1.4 }}>{s.desc}</p>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        <button
                                                            className="premium-cta-btn"
                                                            disabled={work.original_status !== "available"}
                                                            onClick={() => addItem({ id: String(work.id), slug: String(work.id), title: work.title, type: "original", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, imageUrl: getImageUrl(work.images?.[0], 'thumb') || undefined, price: work.original_price, size: work.size, finish: "Original" })}
                                                            style={{ width: "100%", marginTop: "auto", opacity: work.original_status === "available" ? 1 : 0.6 }}
                                                        >
                                                            {work.original_status === "available" ? "Add Original to Cart" : STATUS_BADGE[work.original_status]?.label || "Unavailable"}
                                                        </button>
                                                    </>
                                                ) : purchaseType === "canvas" ? (() => {
                                                    // Compute active sizes for current edition
                                                    const isLimited = canvasEdition === "limited";
                                                    const hasStd = work.has_canvas_print;
                                                    const hasLtd = work.has_canvas_print_limited;
                                                    // Re-derive from DB sizes: std = canvas, ltd = canvas_limited
                                                    const activeSize = selectedCanvasSize;
                                                    const basePrice = activeSize?.price ?? globalPrintPrice;
                                                    const limitedSurcharge = 100;
                                                    const finalPrice = isLimited ? basePrice + limitedSurcharge : basePrice;

                                                    return (
                                                        <>
                                                            {/* ── Header ── */}
                                                            <div className="pc-header">
                                                                <p className="pc-title">Fine Art Canvas Print</p>
                                                                <p className="pc-subtitle">Museum-grade 400gsm canvas · UV archival inks · Worldwide shipping</p>
                                                            </div>

                                                            {/* Step 1: Edition */}
                                                            <div className="step-row">
                                                                <div className="step-label">
                                                                    <span className="step-number">1</span>
                                                                    <span className="step-text">Select Edition</span>
                                                                </div>
                                                                <div className={`edition-cards-grid ${hasStd && hasLtd ? "two-col" : "one-col"}`}>
                                                                    {/* Open Edition */}
                                                                    {(hasStd || !hasLtd) && (
                                                                        <button
                                                                            type="button"
                                                                            className={`edition-card open-edition ${canvasEdition === "standard" ? "active" : ""}`}
                                                                            onClick={() => setCanvasEdition("standard")}
                                                                        >
                                                                            <span className="edition-radio"><span className="edition-radio-dot" /></span>
                                                                            <div className="edition-card-header">
                                                                                <span className="edition-card-icon">
                                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                                                </span>
                                                                                <span className="edition-card-title">Open Edition</span>
                                                                            </div>
                                                                            <p className="edition-card-desc">Museum-quality · Fast worldwide shipping</p>
                                                                        </button>
                                                                    )}
                                                                    {/* Limited Edition */}
                                                                    {hasLtd && (
                                                                        <button
                                                                            type="button"
                                                                            className={`edition-card limited-edition ${canvasEdition === "limited" ? "active" : ""}`}
                                                                            onClick={() => setCanvasEdition("limited")}
                                                                        >
                                                                            <span className="edition-radio"><span className="edition-radio-dot" /></span>
                                                                            <div className="edition-card-header">
                                                                                <span className="edition-card-icon">
                                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                                                                </span>
                                                                                <span className="edition-card-title">Limited Edition</span>
                                                                            </div>
                                                                            <p className="edition-card-desc">Hand-signed · Certificate of authenticity</p>
                                                                            {work.canvas_print_limited_quantity && (
                                                                                <span className="edition-scarcity-badge">
                                                                                    <span className="edition-scarcity-dot" />
                                                                                    Only {work.canvas_print_limited_quantity} copies worldwide
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Edition features table */}
                                                                <div className="edition-features" key={`canvas-features-${canvasEdition}`}>
                                                                    <div className="edition-features-list">
                                                                        <div className="edition-feature-row">
                                                                            <span className="edition-feature-icon positive">✓</span>
                                                                            <span>Museum-grade archival printing · UV-resistant inks</span>
                                                                        </div>
                                                                        {canvasEdition === "standard" ? (
                                                                            <>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Fast delivery — 2–5 business days worldwide</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>400gsm gallery canvas · Ready to frame or stretch</span>
                                                                                </div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Personally signed & numbered by the artist</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Certificate of Authenticity included</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon caution">◷</span>
                                                                                    <span>Delivery in 2–3 weeks (hand-finished to order)</span>
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Step 2: Size */}
                                                            <div className="step-row">
                                                                <div className="step-label">
                                                                    <span className="step-number">2</span>
                                                                    <span className="step-text">Select Size</span>
                                                                </div>
                                                                <div className="step-select-wrap">
                                                                    <button
                                                                        className={`step-trigger ${openDropdown === "canvas-size" ? "open" : ""}`}
                                                                        onClick={() => setOpenDropdown(openDropdown === "canvas-size" ? null : "canvas-size")}
                                                                        type="button"
                                                                    >
                                                                        <span>{activeSize?.size_label ?? "Select a size"} &nbsp;—&nbsp; <span className="font-price font-medium">{convertPrice(finalPrice)}</span></span>
                                                                        <span className="step-chevron" />
                                                                    </button>
                                                                    <div className={`step-options ${openDropdown === "canvas-size" ? "open" : ""}`}>
                                                                        {canvasSizes.length > 0 ? canvasSizes.map(s => (
                                                                            <button
                                                                                key={s.size_label}
                                                                                type="button"
                                                                                className={`step-option ${selectedCanvasSize?.size_label === s.size_label ? "active" : ""}`}
                                                                                onClick={() => { setSelectedCanvasSize(s); setOpenDropdown(null); }}
                                                                            >
                                                                                <span>{s.size_label} &nbsp;—&nbsp; <span className="font-price font-medium">{convertPrice(isLimited ? s.price + limitedSurcharge : s.price)}</span></span>
                                                                                <span className="opt-check" />
                                                                            </button>
                                                                        )) : (
                                                                            <p style={{ padding: "0.75rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "rgba(49,50,62,0.4)", fontStyle: "italic" }}>Sizes coming soon</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Info badge */}
                                                            <div className="info-badge">
                                                                <div className="info-badge-content">
                                                                    <p className="info-badge-title">{isLimited ? "Hand-signed Limited Print" : "Museum-Grade 400gsm Canvas"}</p>
                                                                    <p className="info-badge-desc">
                                                                        {isLimited
                                                                            ? "Individually signed and numbered by the artist · Includes certificate of authenticity · Archival UV inks"
                                                                            : "Giclée-quality printing · Shipped rolled in protective tube · UV-resistant archival inks · Ready to frame or stretch"
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Footer CTA */}
                                                            <div className="purchase-card-footer" style={{ backgroundColor: "#F8F7F5", margin: isSmall ? "1rem -1.25rem -2rem" : "1rem -2rem -2rem", padding: isSmall ? "1.5rem 1.25rem" : "1.5rem 2rem", borderRadius: isSmall ? "0" : "0 0 24px 24px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                                <div>
                                                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", margin: "0 0 2px" }}>Total</p>
                                                                    <span className="font-price" style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--color-charcoal)", letterSpacing: "-0.03em" }}>{convertPrice(finalPrice)}</span>
                                                                </div>
                                                                <button
                                                                    className="premium-cta-btn"
                                                                    onClick={() => addItem({
                                                                        id: `${work.id}-canvas-${canvasEdition}-${activeSize?.size_label ?? "default"}`,
                                                                        slug: String(work.id),
                                                                        title: work.title,
                                                                        type: isLimited ? "canvas_print_limited" : "canvas_print",
                                                                        imageGradientFrom: work.gradientFrom!,
                                                                        imageGradientTo: work.gradientTo!,
                                                                        imageUrl: getImageUrl(work.images?.[0], 'thumb') || undefined,
                                                                        price: finalPrice,
                                                                        finish: isLimited ? "Limited Edition Canvas" : "Canvas Print",
                                                                        size: activeSize?.size_label ?? "",
                                                                    })}
                                                                >Add to Cart</button>
                                                            </div>
                                                        </>
                                                    );
                                                })() : (() => {
                                                    // Paper prints
                                                    const isLimited = paperEdition === "limited";
                                                    const hasStd = work.has_paper_print;
                                                    const hasLtd = work.has_paper_print_limited;
                                                    const activeSize = selectedPaperSize;
                                                    const basePrice = activeSize?.price ?? Math.round(globalPrintPrice * 0.8);
                                                    const limitedSurcharge = 100;
                                                    const finalPrice = isLimited ? basePrice + limitedSurcharge : basePrice;

                                                    return (
                                                        <>
                                                            {/* ── Header ── */}
                                                            <div className="pc-header">
                                                                <p className="pc-title">Fine Art Paper Print</p>
                                                                <p className="pc-subtitle">Hahnemühle 310gsm museum paper · Giclée printing · Worldwide shipping</p>
                                                            </div>

                                                            {/* Step 1: Edition */}
                                                            <div className="step-row">
                                                                <div className="step-label">
                                                                    <span className="step-number">1</span>
                                                                    <span className="step-text">Select Edition</span>
                                                                </div>
                                                                <div className={`edition-cards-grid ${hasStd && hasLtd ? "two-col" : "one-col"}`}>
                                                                    {/* Open Edition */}
                                                                    {(hasStd || !hasLtd) && (
                                                                        <button
                                                                            type="button"
                                                                            className={`edition-card open-edition ${paperEdition === "standard" ? "active" : ""}`}
                                                                            onClick={() => setPaperEdition("standard")}
                                                                        >
                                                                            <span className="edition-radio"><span className="edition-radio-dot" /></span>
                                                                            <div className="edition-card-header">
                                                                                <span className="edition-card-icon">
                                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                                                </span>
                                                                                <span className="edition-card-title">Open Edition</span>
                                                                            </div>
                                                                            <p className="edition-card-desc">Museum-quality · Fast worldwide shipping</p>
                                                                        </button>
                                                                    )}
                                                                    {/* Limited Edition */}
                                                                    {hasLtd && (
                                                                        <button
                                                                            type="button"
                                                                            className={`edition-card limited-edition ${paperEdition === "limited" ? "active" : ""}`}
                                                                            onClick={() => setPaperEdition("limited")}
                                                                        >
                                                                            <span className="edition-radio"><span className="edition-radio-dot" /></span>
                                                                            <div className="edition-card-header">
                                                                                <span className="edition-card-icon">
                                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                                                                                </span>
                                                                                <span className="edition-card-title">Limited Edition</span>
                                                                            </div>
                                                                            <p className="edition-card-desc">Hand-signed · Certificate of authenticity</p>
                                                                            {work.paper_print_limited_quantity && (
                                                                                <span className="edition-scarcity-badge">
                                                                                    <span className="edition-scarcity-dot" />
                                                                                    Only {work.paper_print_limited_quantity} copies worldwide
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Edition features table */}
                                                                <div className="edition-features" key={`paper-features-${paperEdition}`}>
                                                                    <div className="edition-features-list">
                                                                        <div className="edition-feature-row">
                                                                            <span className="edition-feature-icon positive">✓</span>
                                                                            <span>Museum-grade archival printing · UV-resistant inks</span>
                                                                        </div>
                                                                        {paperEdition === "standard" ? (
                                                                            <>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Fast delivery — 2–5 business days worldwide</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Hahnemühle 310gsm museum paper · Matte finish</span>
                                                                                </div>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Personally signed & numbered by the artist</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon positive">✓</span>
                                                                                    <span>Certificate of Authenticity included</span>
                                                                                </div>
                                                                                <div className="edition-feature-row">
                                                                                    <span className="edition-feature-icon caution">◷</span>
                                                                                    <span>Delivery in 2–3 weeks (hand-finished to order)</span>
                                                                                </div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Step 2: Size */}
                                                            <div className="step-row">
                                                                <div className="step-label">
                                                                    <span className="step-number">2</span>
                                                                    <span className="step-text">Select Size</span>
                                                                </div>
                                                                <div className="step-select-wrap">
                                                                    <button
                                                                        className={`step-trigger ${openDropdown === "paper-size" ? "open" : ""}`}
                                                                        onClick={() => setOpenDropdown(openDropdown === "paper-size" ? null : "paper-size")}
                                                                        type="button"
                                                                    >
                                                                        <span>{activeSize?.size_label ?? "Select a size"} &nbsp;—&nbsp; <span className="font-price font-medium">{convertPrice(finalPrice)}</span></span>
                                                                        <span className="step-chevron" />
                                                                    </button>
                                                                    <div className={`step-options ${openDropdown === "paper-size" ? "open" : ""}`}>
                                                                        {paperSizes.length > 0 ? paperSizes.map(s => (
                                                                            <button
                                                                                key={s.size_label}
                                                                                type="button"
                                                                                className={`step-option ${selectedPaperSize?.size_label === s.size_label ? "active" : ""}`}
                                                                                onClick={() => { setSelectedPaperSize(s); setOpenDropdown(null); }}
                                                                            >
                                                                                <span>{s.size_label} &nbsp;—&nbsp; <span className="font-price font-medium">{convertPrice(isLimited ? s.price + limitedSurcharge : s.price)}</span></span>
                                                                                <span className="opt-check" />
                                                                            </button>
                                                                        )) : (
                                                                            <p style={{ padding: "0.75rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "rgba(49,50,62,0.4)", fontStyle: "italic" }}>Sizes coming soon</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Info badge */}
                                                            <div className="info-badge">
                                                                <div className="info-badge-content">
                                                                    <p className="info-badge-title">{isLimited ? "Hand-signed Limited Print" : "Hahnemühle 310gsm Museum Paper"}</p>
                                                                    <p className="info-badge-desc">
                                                                        {isLimited
                                                                            ? "Individually signed and numbered by the artist · Certificate of authenticity · Archival matte finish · Fade-resistant 100+ years"
                                                                            : "Archival giclée printing · Matte finish · Shipped rolled in protective tube · Colour-accurate · Fade-resistant for 100+ years"
                                                                        }
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Footer CTA */}
                                                            <div className="purchase-card-footer" style={{ backgroundColor: "#F8F7F5", margin: isSmall ? "1rem -1.25rem -2rem" : "1rem -2rem -2rem", padding: isSmall ? "1.5rem 1.25rem" : "1.5rem 2rem", borderRadius: isSmall ? "0" : "0 0 24px 24px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                                <div>
                                                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", margin: "0 0 2px" }}>Total</p>
                                                                    <span className="font-price" style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--color-charcoal)", letterSpacing: "-0.03em" }}>{convertPrice(finalPrice)}</span>
                                                                </div>
                                                                <button
                                                                    className="premium-cta-btn"
                                                                    onClick={() => addItem({
                                                                        id: `${work.id}-paper-${paperEdition}-${activeSize?.size_label ?? "default"}`,
                                                                        slug: String(work.id),
                                                                        title: work.title,
                                                                        type: isLimited ? "paper_print_limited" : "paper_print",
                                                                        imageGradientFrom: work.gradientFrom!,
                                                                        imageGradientTo: work.gradientTo!,
                                                                        imageUrl: getImageUrl(work.images?.[0], 'thumb') || undefined,
                                                                        price: finalPrice,
                                                                        finish: isLimited ? "Limited Edition Paper" : "Archival Paper — Matte",
                                                                        size: activeSize?.size_label ?? "",
                                                                    })}
                                                                >Add to Cart</button>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}

                        </div>
                    </div>
                </div>

                {/* ── Artwork details section ── */}
                <div style={{ marginTop: layoutMetrics.winW < 768 ? "1.5rem" : "6rem", borderTop: "1px solid var(--color-border)", paddingTop: layoutMetrics.winW < 768 ? "2rem" : "4rem" }}>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontStyle: "italic", marginBottom: "3rem", textAlign: "center" }}>Artwork Details</h2>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                        <div style={{ maxWidth: "600px", width: "100%" }}>
                            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.5rem" }}>Specifications</h3>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <tbody>
                                    {[["Medium", work.medium], ["Size", work.size]].map(([l, v]) => (
                                        <tr key={l} style={{ borderBottom: "1px solid rgba(26,26,24,0.05)" }}>
                                            <td style={{ padding: "0.75rem 0", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", width: "100px" }}>{l}</td>
                                            <td style={{ fontSize: "0.85rem" }}>{v}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {fullSizeOpen && (
                    <Lightbox works={[work] as any} startImageIndex={selectedImageIndex} onClose={() => setFullSizeOpen(false)} />
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
                            }}
                        >
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
        </div>
    );
}
