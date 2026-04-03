"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";
import { useCart } from "@/context/CartContext";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl, artworkUrl } from "@/utils";

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

const PRINT_SIZES = [
    { labelCm: "20 × 30 cm", labelIn: "8 × 12 in", multiplier: 0.6 },
    { labelCm: "30 × 40 cm", labelIn: "12 × 16 in", multiplier: 1.0 },
    { labelCm: "40 × 60 cm", labelIn: "16 × 24 in", multiplier: 1.5 },
    { labelCm: "50 × 70 cm", labelIn: "20 × 28 in", multiplier: 2.0 },
    { labelCm: "70 × 100 cm", labelIn: "28 × 40 in", multiplier: 3.0 },
];

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
    const params = useParams();
    const slug = params?.slug as string;
    const { units, convertPrice, globalPrintPrice } = usePreferences();
    const { addItem } = useCart();

    const [work, setWork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPrint, setSelectedPrint] = useState(PRINT_SIZES[1]);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [fullSizeOpen, setFullSizeOpen] = useState(false);
    const [purchaseType, setPurchaseType] = useState<"original" | "print">("original");
    const [finish, setFinish] = useState<"Rolled" | "Framed">("Rolled");

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
        fetch(`${getApiUrl()}/artworks/${slug}`)
            .then(res => res.json())
            .then(data => {
                const item = data.data || data;
                setWork({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][1],
                });
            })
            .catch(() => console.warn("Backend unavailable"))
            .finally(() => setLoading(false));
    }, [slug]);

    useEffect(() => {
        if (fullSizeOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [fullSizeOpen]);

    if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Loading artwork...</div>;
    if (!work) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Artwork not found.</div>;

    const images = work.images || [];
    const currentPrintPrice = Math.round(globalPrintPrice * selectedPrint.multiplier);

    // Dynamic metrics to align elements with the current image's edges
    const activeImageMetrics = (function () {
        if (!layoutMetrics.boxW || !layoutMetrics.boxH) return { w: 0, h: 0 };
        const idx = selectedImageIndex;
        const fallbackAspect = work.width_cm && work.height_cm ? work.width_cm / work.height_cm : (work.orientation === "horizontal" ? 1.5 : 0.75);
        const aspect = imageAspectRatios[idx] || fallbackAspect;

        if (layoutMetrics.winW < 768) {
            const w = layoutMetrics.boxW * 0.95;
            return { w, h: w / aspect };
        }

        const maxW = layoutMetrics.boxW - 40;
        const maxH = layoutMetrics.boxH - 240;
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
        <div className="overflow-x-hidden w-full">
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
                    width: 100vw;
                    margin-left: calc(-50vw + 50%);
                    margin-top: 3rem; /* Dropped down on mobile */
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
                    }
                    .artwork-img-area {
                        margin-left: 0;
                        margin-right: 0;
                        margin-top: 3rem; /* Dropped down below BACK TO SHOP */
                        width: 100%;
                        height: calc(100% - 3rem); /* Compensate for the 3rem drop */
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
            `}</style>
                <div className={`grid grid-cols-1 items-start gap-12 lg:gap-16 ${work.orientation === "horizontal" ? "md:grid-cols-2" : "md:grid-cols-[1.25fr_1fr]"}`}>

                    {/* LEFT CELL (50%): image viewer  */}
                    <div className="artwork-img-col">
                        {/* ── Header row: [← Back to Shop] ── */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexShrink: 0 }}>
                            <Link
                                href="/shop"
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--font-sans)", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-muted)", textDecoration: "none", whiteSpace: "nowrap", transition: "color 0.2s" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "translateY(0.5px)" }}><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                Back to Shop
                            </Link>

                            {/* Mobile: Fullscreen button inline with Back to Shop */}
                            {layoutMetrics.winW < 768 && (
                                <button
                                    onClick={() => setFullSizeOpen(true)}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "0.45rem",
                                        background: "rgba(255,255,255,0.4)",
                                        color: "var(--color-muted)",
                                        border: "1px solid rgba(0,0,0,0.06)",
                                        borderRadius: "20px",
                                        padding: "0.3rem 0.7rem",
                                        cursor: "pointer",
                                        fontFamily: "var(--font-sans)",
                                        fontSize: "0.6rem",
                                        fontWeight: 600,
                                        letterSpacing: "0.05em",
                                        textTransform: "uppercase",
                                        backdropFilter: "blur(4px)"
                                    }}
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                                    </svg>
                                    Fullscreen
                                </button>
                            )}
                        </div>

                        {/* ── Image area: fills viewport height minus header-row ── */}
                        <div className="artwork-img-area">
                            {/* Wrapper that leaves 130px safely at the bottom for thumbnails on PC, but just flows dynamically on Mobile */}
                            <div className="artwork-slider-wrap">

                                {/* ── THE MAX SPACE IMAGE BOX ──────────────────────────────────────────── */}
                                <div
                                    ref={boxRef}
                                    className="w-full z-10"
                                    style={{
                                        position: layoutMetrics.winW < 768 ? "relative" : "absolute",
                                        inset: layoutMetrics.winW < 768 ? "auto" : 0,
                                        height: layoutMetrics.winW < 768 ? "auto" : "100%",
                                        /* Classic shadow-reveal trick: expand the clip zone vertically so shadows render,
                                           then pull it back with negative margins so layout stays intact */
                                        overflow: "hidden",
                                        marginTop: "-50px",
                                        paddingTop: "50px",
                                        marginBottom: "-50px",
                                        paddingBottom: "50px",
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
                                            gap: "2rem",
                                            width: "100%",
                                            height: layoutMetrics.winW < 768 ? "auto" : "100%",
                                            transition: isZooming ? "none" : "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)",
                                            transform: `translateX(calc(-${selectedImageIndex * 100}% - ${selectedImageIndex * 2}rem))`,
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
                                                        // PC Desktop: Make horizontal images larger, vertical ones slightly smaller
                                                        // By reducing horizontal margins and increasing vertical ones
                                                        const maxW = layoutMetrics.boxW - 40;
                                                        const maxH = layoutMetrics.boxH - 240;

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

                                {/* Thumbnails strip - tracked exactly 30px beneath the top-aligned photo lower-border on PC, gracefully flowed on Mobile! */}
                                {images.length > 1 && (
                                    <div
                                        style={{
                                            position: layoutMetrics.winW < 768 ? "relative" : "absolute",
                                            top: layoutMetrics.winW < 768 ? "auto" : `calc(${layoutMetrics.imgH}px + 2rem)`,
                                            marginTop: layoutMetrics.winW < 768 ? "1.5rem" : "0",
                                            width: "100%",
                                            overflowX: "auto",
                                            overflowY: "visible", /* allow vertical shadow to show */
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            padding: "12px 0 20px", /* top/bottom padding gives box-shadows room to breathe */
                                            scrollbarWidth: "thin",
                                            scrollbarColor: "var(--color-border) transparent",
                                            transition: "top 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                                            zIndex: 20
                                        }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", justifyContent: "center", paddingTop: "0.5rem", minWidth: "min-content" }}>
                                            {images.map((img, idx) => {
                                                const isActive = selectedImageIndex === idx;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedImageIndex(idx)}
                                                        style={{
                                                            width: "70px",
                                                            height: "70px",
                                                            padding: 0,
                                                            flexShrink: 0,
                                                            /* Active thumb pushes siblings via margin — same size, no scale */
                                                            margin: isActive ? "0 10px" : "0",
                                                            border: isActive
                                                                ? "2px solid var(--color-charcoal)"
                                                                : "2px solid transparent",
                                                            backgroundImage: `url(${getImageUrl(img, 'thumb')})`,
                                                            backgroundSize: "cover",
                                                            backgroundPosition: "center",
                                                            cursor: "pointer",
                                                            borderRadius: "4px",
                                                            opacity: isActive ? 1 : 0.55,
                                                            boxShadow: isActive ? "var(--shadow-card-deep)" : "var(--shadow-thumb)",
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
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            </div>{/* end .wrapper */}
                        </div>{/* end .artwork-img-area */}
                    </div>{/* end .artwork-img-col / left cell */}

                    {/* ── Right: Purchase panel ── */}
                    <div style={{ paddingTop: layoutMetrics.winW >= 768 ? "8rem" : "0", paddingBottom: "6rem" }}>
                        <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.6rem, 5vw, 3.8rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2, marginBottom: "1.5rem" }}>{work.title}</h1>

                        <div style={{ position: "relative", marginTop: "1rem" }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", marginLeft: "1rem" }}>
                                {(["original", "print"] as const).map(type => (
                                    <button key={type} onClick={() => setPurchaseType(type)} style={{ padding: "0.75rem 1.5rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", backgroundColor: purchaseType === type ? "#fff" : "#F1F5F9", color: purchaseType === type ? "var(--color-charcoal)" : "var(--color-muted)", border: "1px solid var(--color-border)", borderBottom: purchaseType === type ? "1px solid #fff" : "1px solid var(--color-border)", borderRadius: "8px 8px 0 0", cursor: "pointer", position: "relative", zIndex: purchaseType === type ? 2 : 1, marginBottom: "-1px", minWidth: "120px" }}>
                                        {type === "original" ? "Original" : "Fine Art Print"}
                                    </button>
                                ))}
                            </div>

                            <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "12px", borderTopLeftRadius: purchaseType === "original" ? "0px" : "12px", boxShadow: "var(--shadow-panel)", display: "flex", flexDirection: "column", gap: "2rem", border: "1px solid var(--color-border)", position: "relative", zIndex: 1 }}>
                                {purchaseType === "original" ? (
                                    <>
                                        <div style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1.5rem" }}>
                                            <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "0.5rem" }}>Purchase Details</h3>
                                            <p style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--color-charcoal)" }}>{convertPrice(work.original_price)}</p>
                                            <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>Original Artwork • Certificate of Authenticity included</p>
                                        </div>
                                        <button
                                            onClick={() => addItem({ id: `${work.id}-original`, slug: String(work.id), title: work.title, type: "original", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: work.original_price })}
                                            disabled={work.original_status !== "available"}
                                            style={{ padding: "1.25rem", backgroundColor: work.original_status === "available" ? "var(--color-charcoal)" : "#b0b0b0", color: "#fff", border: "none", borderRadius: "4px", cursor: work.original_status === "available" ? "pointer" : "not-allowed", fontWeight: 600, fontSize: "1rem", boxShadow: work.original_status === "available" ? "var(--shadow-card)" : "none", transition: "box-shadow 0.2s, transform 0.15s" }}
                                            onMouseEnter={e => { if (work.original_status === "available") { e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                                            onMouseLeave={e => { e.currentTarget.style.boxShadow = work.original_status === "available" ? "var(--shadow-card)" : "none"; e.currentTarget.style.transform = "translateY(0)"; }}
                                        >
                                            {work.original_status === "available" ? "Add Original to Cart" : STATUS_BADGE[work.original_status]?.label || "Unavailable"}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "1rem" }}>Select Size</h3>
                                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem" }}>
                                                {PRINT_SIZES.map(ps => (
                                                    <button key={ps.labelCm} onClick={() => setSelectedPrint(ps)} style={{ padding: "0.75rem 0.5rem", border: `1px solid ${selectedPrint === ps ? "var(--color-charcoal)" : "var(--color-border-dark)"}`, borderRadius: "6px", cursor: "pointer", boxShadow: selectedPrint === ps ? "var(--shadow-thumb)" : "none", transition: "box-shadow 0.15s" }}>
                                                        <span style={{ display: "block", fontSize: "0.75rem", fontWeight: selectedPrint === ps ? 600 : 400 }}>{units === "cm" ? ps.labelCm : ps.labelIn}</span>
                                                        <span style={{ display: "block", fontSize: "0.65rem", color: "var(--color-muted)" }}>{convertPrice(Math.round(globalPrintPrice * ps.multiplier))}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--color-muted)", marginBottom: "1rem" }}>Select Finish</h3>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                                                {(["Rolled", "Framed"] as const).map(f => (
                                                    <button key={f} onClick={() => setFinish(f)} style={{ padding: "1rem", border: `1px solid ${finish === f ? "var(--color-charcoal)" : "var(--color-border-dark)"}`, backgroundColor: finish === f ? "rgba(26,26,24,0.02)" : "transparent", borderRadius: "6px", cursor: "pointer", boxShadow: finish === f ? "var(--shadow-thumb)" : "none", transition: "box-shadow 0.15s" }}>
                                                        <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500 }}>{f}</span>
                                                        <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-muted)" }}>{f === "Rolled" ? "In tube" : `+ ${convertPrice(100)}`}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={{ backgroundColor: "#F1F5F9", margin: "1rem -2rem -2rem", padding: "2rem", borderRadius: "0 0 12px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 600 }}>{convertPrice(currentPrintPrice + (finish === "Framed" ? 100 : 0))}</span>
                                            <button
                                                onClick={() => addItem({ id: `${work.id}-print-${finish}-${selectedPrint.labelCm}`, slug: String(work.id), title: work.title, type: "print", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: currentPrintPrice + (finish === "Framed" ? 100 : 0), finish, size: units === "cm" ? selectedPrint.labelCm : selectedPrint.labelIn })}
                                                style={{ padding: "1rem 2rem", backgroundColor: "#334C75", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600, boxShadow: "var(--shadow-card)", transition: "box-shadow 0.2s, transform 0.15s" }}
                                                onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-card-hover)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                                                onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow-card)"; e.currentTarget.style.transform = "translateY(0)"; }}
                                            >Add to Cart</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Artwork details section ── */}
                <div style={{ marginTop: "6rem", borderTop: "1px solid var(--color-border)", paddingTop: "4rem" }}>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontStyle: "italic", marginBottom: "3rem", textAlign: "center" }}>Artwork Details</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "4rem" }}>
                        <div>
                            <h3 style={{ fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.5rem" }}>About</h3>
                            <p style={{ fontSize: "0.95rem", lineHeight: 1.8, color: "var(--color-charcoal-mid)" }}>{work.description}</p>
                        </div>
                        <div>
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
