"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";
import { useCart } from "@/context/CartContext";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";

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

const CANVAS_SIZES = [
    { labelCm: "40 × 60 cm", labelIn: "16 × 24 in", multiplier: 1.0 },
    { labelCm: "60 × 90 cm", labelIn: "24 × 36 in", multiplier: 1.8 },
    { labelCm: "80 × 120 cm", labelIn: "32 × 48 in", multiplier: 2.8 },
];

const PAPER_SIZES = [
    { labelCm: "30 × 45 cm", labelIn: "12 × 18 in", multiplier: 1.0 },
    { labelCm: "40 × 60 cm", labelIn: "16 × 24 in", multiplier: 1.5 },
    { labelCm: "50 × 75 cm", labelIn: "20 × 30 in", multiplier: 2.2 },
];

export default function ArtworkDetailPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const { units, convertPrice, globalPrintPrice } = usePreferences();
    const { addItem } = useCart();

    const [work, setWork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCanvas, setSelectedCanvas] = useState(CANVAS_SIZES[0]);
    const [selectedPaper, setSelectedPaper] = useState(PAPER_SIZES[0]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [fullSizeOpen, setFullSizeOpen] = useState(false);
    const [purchaseType, setPurchaseType] = useState<"original" | "canvas" | "paper">("original");
    const [canvasFinish, setCanvasFinish] = useState<"Rolled" | "Framed">("Rolled");
    const [paperFinish, setPaperFinish] = useState<"Matte" | "Satin">("Matte");
    const [allSlugs, setAllSlugs] = useState<string[]>([]); // For prev/next navigation

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
            .then(res => res.json())
            .then(data => {
                const item = data.data || data;
                setWork({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][1],
                });

                // Auto-select the most relevant tab
                if (item.original_status === "available") {
                    setPurchaseType("original");
                } else if (item.has_prints) {
                    setPurchaseType("canvas");
                } else {
                    setPurchaseType("original");
                }
            })
            .catch(() => console.warn("Backend unavailable"))
            .finally(() => setLoading(false));
    }, [slug]);

    // Fetch all artwork slugs for prev/next navigation
    useEffect(() => {
        apiFetch(`${getApiUrl()}/artworks?limit=500&fields=slug`)
            .then(res => res.json())
            .then(data => {
                const items = data.data || data.items || data || [];
                const slugs = items.map((a: { slug: string }) => a.slug).filter(Boolean);
                setAllSlugs(slugs);
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (fullSizeOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [fullSizeOpen]);

    if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Loading artwork...</div>;
    if (!work) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Artwork not found.</div>;

    const images = work.images || [];
    const currentCanvasPrice = Math.round(globalPrintPrice * selectedCanvas.multiplier);
    const currentPaperPrice = Math.round((globalPrintPrice * 0.8) * selectedPaper.multiplier);

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
                    .purchase-card {
                        margin-left: -2rem !important;
                        margin-right: -2rem !important;
                        border-left: none !important;
                        border-right: none !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        padding: 2rem 1.25rem !important; /* Kept 2rem vertical, reduced horizontal to 1.25rem */
                    }
                    .purchase-card-footer {
                        margin: 1rem -1.25rem -2rem !important; /* Adjusted to match card padding */
                        padding: 2rem 1.25rem !important;
                        border-radius: 0 !important;
                    }
                    .purchase-tabs {
                        margin-left: -2rem !important;
                        margin-right: -2rem !important;
                        width: calc(100% + 4rem) !important;
                    }
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
                <div style={{ display: layoutMetrics.winW < 768 ? "block" : "none", marginBottom: "0.5rem", marginTop: layoutMetrics.winW < 768 ? "0.5rem" : "0", textAlign: "left" }}>
                    <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2 }}>{work.title}</h1>
                </div>

                <div className={`grid grid-cols-1 items-start gap-12 lg:gap-16 ${work.orientation === "horizontal" ? "md:grid-cols-2" : "md:grid-cols-[1.25fr_1fr]"}`}>

                    {/* LEFT CELL (50%): image viewer  */}
                    <div className="artwork-img-col">

                        {/* ── Image area: fills viewport height minus header-row ── */}
                        <div className="artwork-img-area" style={{ marginTop: layoutMetrics.winW < 768 ? "-0.5rem" : "0" }}>
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
                                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)"
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
                        <h1 style={{ display: layoutMetrics.winW < 768 ? "none" : "block", fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2, marginBottom: "1.5rem", marginTop: "-0.5rem" }}>{work.title}</h1>

                        <div style={{ position: "relative", marginTop: "1rem", width: "100%" }}>
                            {/* ── Three edge-to-edge folder tabs ── */}
                            {(() => {
                                const isSmall = layoutMetrics.winW < 768;
                                const borderRadiusValue = isSmall ? "0" : "12px";
                                return (
                                    <>
                                        <style>{`
                                            .purchase-tabs::-webkit-scrollbar { display: none; }
                                        `}</style>
                                        <div 
                                            className="purchase-tabs" 
                                            style={{ 
                                                display: "grid", 
                                                gridTemplateColumns: isSmall ? "repeat(3, 1fr)" : "repeat(3, auto)",
                                                width: "100%",
                                                gap: "0",
                                                boxSizing: "border-box",
                                            }}
                                        >
                                            {([
                                                { key: "original", label: "Original" },
                                                { key: "canvas",   label: "Canvas Prints" },
                                                { key: "paper",    label: "Paper Prints" },
                                            ] as const).map(({ key, label }, idx) => {
                                                const isActive = purchaseType === key;
                                                return (
                                                    <button
                                                        key={key}
                                                        onClick={() => setPurchaseType(key)}
                                                        style={{
                                                            position: "relative",
                                                            padding: isSmall ? "1.4rem 0.75rem" : "1rem 1.5rem",
                                                            fontFamily: "var(--font-sans)",
                                                            fontSize: isSmall ? "0.78rem" : "0.7rem",
                                                            fontWeight: isActive ? 600 : 400,
                                                            letterSpacing: "0.12em",
                                                            textTransform: "uppercase",
                                                            backgroundColor: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
                                                            backdropFilter: isActive ? "none" : "blur(10px)",
                                                            color: isActive ? "var(--color-charcoal)" : "var(--color-muted)",
                                                            border: "none",
                                                            borderRight: idx < 2 && !isActive ? "1px solid rgba(0,0,0,0.05)" : "none",
                                                            borderTop: isActive ? "3px solid var(--color-charcoal)" : "1px solid rgba(0,0,0,0.05)",
                                                            cursor: "pointer",
                                                            zIndex: isActive ? 10 : 1,
                                                            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                                                            whiteSpace: "nowrap",
                                                            textAlign: isSmall ? "left" : "center",
                                                            boxSizing: "border-box",
                                                        }}
                                                    >
                                                        {label}
                                                        {isActive && !isSmall && (
                                                            <div style={{ position: "absolute", bottom: "-1px", left: 0, right: 0, height: "2px", backgroundColor: "#fff", zIndex: 11 }} />
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="purchase-card" style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: `0 ${isSmall ? "0" : "12px"} ${borderRadiusValue} ${borderRadiusValue}`, boxShadow: "var(--shadow-panel)", display: "flex", flexDirection: "column", gap: "2rem", border: "1px solid var(--color-border)", position: "relative", zIndex: 1, width: "100%", boxSizing: "border-box" }}>
                                            {purchaseType === "original" ? (
                                                <>
                                                    {/* Purchase Details */}
                                                    {work.original_status === "available" && (
                                                        <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.5rem" }}>
                                                            <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.5rem" }}>Purchase Details</h3>
                                                            <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-charcoal)" }}>{convertPrice(work.original_price)}</p>
                                                            <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>Original Artwork • Certificate of Authenticity included</p>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.8rem", marginTop: "0.5rem" }}>About the Painting</h3>
                                                        <p style={{ fontSize: "0.9rem", lineHeight: 1.7, color: "var(--color-charcoal-mid)" }}>{work.description}</p>
                                                    </div>

                                                    {/* Availability notice */}
                                                    {work.original_status !== "available" && STATUS_BADGE[work.original_status] && (() => {
                                                        const s = STATUS_BADGE[work.original_status]!;
                                                        return (
                                                            <div style={{
                                                                backgroundColor: s.bg,
                                                                borderLeft: `3px solid ${s.border}`,
                                                                borderRadius: "6px",
                                                                padding: "0.85rem 1rem",
                                                                display: "flex",
                                                                alignItems: "flex-start",
                                                                gap: "0.65rem",
                                                            }}>
                                                                <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: s.border, marginTop: "0.35rem", flexShrink: 0 }}></div>
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
                                                        onClick={() => addItem({ id: String(work.id), slug: String(work.id), title: work.title, type: "original", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: work.original_price, size: work.size, finish: "Original" })}
                                                        style={{ width: "100%", marginTop: "auto", opacity: work.original_status === "available" ? 1 : 0.6 }}
                                                    >
                                                        {work.original_status === "available" ? "Add Original to Cart" : STATUS_BADGE[work.original_status]?.label || "Unavailable"}
                                                    </button>
                                                </>
                                            ) : purchaseType === "canvas" ? (
                                                <>
                                                    {/* Canvas intro */}
                                                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.25rem" }}>
                                                        <p style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontStyle: "italic", color: "var(--color-charcoal-mid)", lineHeight: 1.7, margin: 0 }}>
                                                            Museum-grade canvas printed with archival UV inks. Stretcher-bar mounted and hand-finished.
                                                        </p>
                                                    </div>

                                                    {/* Size selector */}
                                                    <div>
                                                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.75rem" }}>Select Size</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                                                            {CANVAS_SIZES.map(ps => {
                                                                const active = selectedCanvas === ps;
                                                                return (
                                                                    <button key={ps.labelCm} onClick={() => setSelectedCanvas(ps)} style={{
                                                                        padding: "0.75rem 0.5rem",
                                                                        border: `1.5px solid ${active ? "var(--color-charcoal)" : "var(--color-border-dark)"}`,
                                                                        borderRadius: "6px", cursor: "pointer",
                                                                        backgroundColor: active ? "rgba(26,26,24,0.03)" : "transparent",
                                                                        boxShadow: active ? "var(--shadow-thumb)" : "none",
                                                                        transition: "all 0.15s",
                                                                    }}>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: active ? 600 : 400, color: "var(--color-charcoal)" }}>{units === "cm" ? ps.labelCm : ps.labelIn}</span>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.62rem", color: "var(--color-muted)", marginTop: "2px" }}>{convertPrice(Math.round(globalPrintPrice * ps.multiplier))}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Finish selector */}
                                                    <div>
                                                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.75rem" }}>Finish</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                                                            {(["Rolled", "Framed"] as const).map(f => {
                                                                const active = canvasFinish === f;
                                                                return (
                                                                    <button key={f} onClick={() => setCanvasFinish(f)} style={{
                                                                        padding: "0.9rem 0.75rem",
                                                                        border: `1.5px solid ${active ? "var(--color-charcoal)" : "var(--color-border-dark)"}`,
                                                                        backgroundColor: active ? "rgba(26,26,24,0.03)" : "transparent",
                                                                        borderRadius: "6px", cursor: "pointer",
                                                                        boxShadow: active ? "var(--shadow-thumb)" : "none",
                                                                        transition: "all 0.15s", textAlign: "left",
                                                                    }}>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.82rem", fontWeight: 500 }}>{f}</span>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "var(--color-muted)", marginTop: "2px" }}>{f === "Rolled" ? "Shipped in tube" : `+ ${convertPrice(120)}`}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="purchase-card-footer" style={{ backgroundColor: "#F8F7F5", margin: "1rem -2rem -2rem", padding: "1.5rem 2rem", borderRadius: "0 0 12px 12px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                        <div>
                                                            <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", margin: "0 0 2px" }}>Total</p>
                                                            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", fontWeight: 400, color: "var(--color-charcoal)" }}>{convertPrice(currentCanvasPrice + (canvasFinish === "Framed" ? 120 : 0))}</span>
                                                        </div>
                                                        <button
                                                            className="premium-cta-btn"
                                                            onClick={() => addItem({ id: `${work.id}-canvas-${canvasFinish}-${selectedCanvas.labelCm}`, slug: String(work.id), title: work.title, type: "print", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: currentCanvasPrice + (canvasFinish === "Framed" ? 120 : 0), finish: canvasFinish, size: units === "cm" ? selectedCanvas.labelCm : selectedCanvas.labelIn })}
                                                        >Add Canvas to Cart</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Paper intro */}
                                                    <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.25rem" }}>
                                                        <p style={{ fontFamily: "var(--font-serif)", fontSize: "0.95rem", fontStyle: "italic", color: "var(--color-charcoal-mid)", lineHeight: 1.7, margin: 0 }}>
                                                            Archival giclée on 310 gsm Hahnemühle fine art paper. Colour-accurate, fade-resistant for 100+ years.
                                                        </p>
                                                    </div>

                                                    {/* Size selector */}
                                                    <div>
                                                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.75rem" }}>Select Size</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                                                            {PAPER_SIZES.map(ps => {
                                                                const active = selectedPaper === ps;
                                                                return (
                                                                    <button key={ps.labelCm} onClick={() => setSelectedPaper(ps)} style={{
                                                                        padding: "0.75rem 0.5rem",
                                                                        border: `1.5px solid ${active ? "var(--color-charcoal)" : "var(--color-border-dark)"}`,
                                                                        borderRadius: "6px", cursor: "pointer",
                                                                        backgroundColor: active ? "rgba(26,26,24,0.03)" : "transparent",
                                                                        boxShadow: active ? "var(--shadow-thumb)" : "none",
                                                                        transition: "all 0.15s",
                                                                    }}>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.72rem", fontWeight: active ? 600 : 400, color: "var(--color-charcoal)" }}>{units === "cm" ? ps.labelCm : ps.labelIn}</span>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.62rem", color: "var(--color-muted)", marginTop: "2px" }}>{convertPrice(Math.round(globalPrintPrice * 0.8 * ps.multiplier))}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Finish / surface selector */}
                                                    <div>
                                                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.75rem" }}>Surface</p>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                                                            {(["Matte", "Satin"] as const).map(f => {
                                                                const active = paperFinish === f;
                                                                return (
                                                                    <button key={f} onClick={() => setPaperFinish(f)} style={{
                                                                        padding: "0.9rem 0.75rem",
                                                                        border: `1.5px solid ${active ? "var(--color-charcoal)" : "var(--color-border-dark)"}`,
                                                                        backgroundColor: active ? "rgba(26,26,24,0.03)" : "transparent",
                                                                        borderRadius: "6px", cursor: "pointer",
                                                                        boxShadow: active ? "var(--shadow-thumb)" : "none",
                                                                        transition: "all 0.15s", textAlign: "left",
                                                                    }}>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.82rem", fontWeight: 500 }}>{f}</span>
                                                                        <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "var(--color-muted)", marginTop: "2px" }}>{f === "Matte" ? "No glare, velvety" : "Subtle sheen"}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    {/* Footer */}
                                                    <div className="purchase-card-footer" style={{ backgroundColor: "#F8F7F5", margin: "1rem -2rem -2rem", padding: "1.5rem 2rem", borderRadius: "0 0 12px 12px", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                        <div>
                                                            <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", margin: "0 0 2px" }}>Total</p>
                                                            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.6rem", fontWeight: 400, color: "var(--color-charcoal)" }}>{convertPrice(currentPaperPrice)}</span>
                                                        </div>
                                                        <button
                                                            className="premium-cta-btn"
                                                            onClick={() => addItem({ id: `${work.id}-paper-${paperFinish}-${selectedPaper.labelCm}`, slug: String(work.id), title: work.title, type: "print", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: currentPaperPrice, finish: paperFinish, size: units === "cm" ? selectedPaper.labelCm : selectedPaper.labelIn })}
                                                        >Add Print to Cart</button>
                                                    </div>
                                                </>
                                            )}
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
            </div>
        </div>
    );
}
