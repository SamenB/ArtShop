"use client";

/**
 * Immersive Fullscreen Image Viewer.
 * Orchestrates multi-touch pan, pinch-to-zoom, and rapid swipe navigation using hardware-accelerated transforms.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { getImageUrl } from "@/utils";

interface Artwork {
    id: number;
    slug?: string;
    title: string;
    medium: string;
    size: string;
    original_status: string;
    description?: string;
    images?: (string | { thumb: string; medium: string; original: string })[];
    gradientFrom?: string;
    gradientTo?: string;
}

const getTouchDist = (t: React.TouchList) => {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
};
const getTouchCenter = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
});

export default function Lightbox({
    works,
    startWorkIndex = 0,
    startImageIndex = 0,
    onClose,
}: {
    works: Artwork[];
    startWorkIndex?: number;
    startImageIndex?: number;
    onClose: () => void;
}) {
    const [wIdx, setWIdx] = useState(startWorkIndex);
    const [imageIdx, setImageIdx] = useState(startImageIndex);
    const w = works[wIdx];
    const images = w.images || [];

    // ── Zoom / Pan ────────────────────────────────────────────────────────────
    const [zoom, setZoom] = useState(1);
    const [origin, setOrigin] = useState({ x: 50, y: 50 });
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
    const pinchRef = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null);
    const swipeRef = useRef<{ x: number; y: number } | null>(null);
    const tapRef = useRef<number>(0);
    const imgRef = useRef<HTMLDivElement>(null);

    // Reset zoom on image/work change
    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setOrigin({ x: 50, y: 50 });
    }, [wIdx, imageIdx]);

    const applyZoom = useCallback((newZoom: number, ox = 50, oy = 50) => {
        const clamped = Math.max(1, Math.min(newZoom, 8));
        setZoom(prev => {
            if (clamped === 1) {
                setPan({ x: 0, y: 0 });
                setOrigin({ x: 50, y: 50 });
            } else if (prev === 1 && clamped > 1) {
                setOrigin({ x: ox, y: oy });
            }
            return clamped;
        });
    }, []);

    // ── Navigation ────────────────────────────────────────────────────────────
    const handlePrev = useCallback(() => {
        if (works.length > 1) {
            setWIdx(i => (i - 1 + works.length) % works.length);
            setImageIdx(0);
        } else if (images.length > 1) {
            setImageIdx(i => (i - 1 + images.length) % images.length);
        }
    }, [works.length, images.length]);

    const handleNext = useCallback(() => {
        if (works.length > 1) {
            setWIdx(i => (i + 1) % works.length);
            setImageIdx(0);
        } else if (images.length > 1) {
            setImageIdx(i => (i + 1) % images.length);
        }
    }, [works.length, images.length]);

    // ── Keyboard ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") handlePrev();
            if (e.key === "ArrowRight") handleNext();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, handlePrev, handleNext]);

    // ── Lock body scroll ──────────────────────────────────────────────────────
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // ── Prevent passive touchmove and background wheel scroll ───────────────
    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;
        const preventTouch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
        el.addEventListener("touchmove", preventTouch, { passive: false });

        const preventWheel = (e: WheelEvent) => {
            if (!(e.target as HTMLElement).closest('.lb-details')) {
                e.preventDefault();
            }
        };
        document.addEventListener("wheel", preventWheel, { passive: false });

        return () => {
            el.removeEventListener("touchmove", preventTouch);
            document.removeEventListener("wheel", preventWheel);
        };
    }, []);

    // ── Double-tap / double-click ─────────────────────────────────────────────
    const handleDoubleTap = (clientX: number, clientY: number) => {
        if (zoom > 1) {
            applyZoom(1);
        } else {
            const x = (clientX / window.innerWidth) * 100;
            const y = (clientY / window.innerHeight) * 100;
            applyZoom(3, x, y);
        }
    };

    const canNav = (images.length > 1 || works.length > 1) && zoom === 1;

    return (
        <div
            className="lb-root"
            style={{
                position: "fixed", inset: 0, zIndex: 2000,
                // Blur backdrop — show the blurred page behind
                backgroundColor: "rgba(252, 252, 252, 0.75)",
                backdropFilter: "blur(22px)",
                WebkitBackdropFilter: "blur(22px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
            }}
            // Outer layer swipe (fallback)
            onTouchStart={e => {
                if (e.touches.length === 1 && zoom === 1)
                    swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={e => {
                if (!swipeRef.current || zoom > 1) return;
                const dx = swipeRef.current.x - e.changedTouches[0].clientX;
                const dy = swipeRef.current.y - e.changedTouches[0].clientY;
                // Swipe up or down to exit
                if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) onClose();
                else if (dx > 48) handleNext();
                else if (dx < -48) handlePrev();
                swipeRef.current = null;
            }}
        >
            {/* ── Top Header ─────────────────────────────────────────────────── */}
            <div 
                className="lb-header"
                style={{
                    opacity: zoom > 1 ? 0 : 1,
                    transition: "opacity 0.2s ease",
                }}
            >
                <h2 className="lb-title" style={{
                    fontFamily: "var(--font-artwork-title)",
                    fontStyle: "normal",
                    fontWeight: 400,
                    color: "rgba(20,20,18,0.9)",
                    margin: 0,
                    textShadow: "0 2px 10px rgba(255,255,255,0.8)",
                }}>
                    {w.title}
                </h2>
            </div>

            {/* ── Image ──────────────────────────────────────────────────────── */}
            <div
                ref={imgRef}
                className="lb-image-container"
                // Wheel zoom (desktop)
                onWheel={e => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    applyZoom(zoom + (e.deltaY > 0 ? -0.4 : 0.4), x, y);
                }}
                onDoubleClick={e => { e.stopPropagation(); handleDoubleTap(e.clientX, e.clientY); }}
                // Desktop drag-to-pan
                onMouseDown={e => {
                    if (zoom <= 1) return;
                    e.preventDefault();
                    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
                }}
                onMouseMove={e => {
                    if (!dragRef.current) return;
                    setPan({
                        x: dragRef.current.px + (e.clientX - dragRef.current.sx),
                        y: dragRef.current.py + (e.clientY - dragRef.current.sy),
                    });
                }}
                onMouseUp={() => { dragRef.current = null; }}
                onMouseLeave={() => { dragRef.current = null; }}
                // Touch: pinch + pan + swipe
                onTouchStart={e => {
                    e.stopPropagation();
                    if (e.touches.length === 2) {
                        const c = getTouchCenter(e.touches);
                        pinchRef.current = {
                            dist: getTouchDist(e.touches), zoom,
                            cx: (c.x / window.innerWidth) * 100,
                            cy: (c.y / window.innerHeight) * 100,
                        };
                        dragRef.current = null;
                    } else {
                        pinchRef.current = null;
                        if (zoom > 1) {
                            dragRef.current = {
                                sx: e.touches[0].clientX, sy: e.touches[0].clientY,
                                px: pan.x, py: pan.y,
                            };
                        } else {
                            swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                        }
                        // Double-tap
                        const now = Date.now();
                        if (now - tapRef.current < 280) {
                            handleDoubleTap(e.touches[0].clientX, e.touches[0].clientY);
                            tapRef.current = 0;
                        } else {
                            tapRef.current = now;
                        }
                    }
                }}
                onTouchMove={e => {
                    e.stopPropagation();
                    if (e.touches.length === 2 && pinchRef.current) {
                        const scale = getTouchDist(e.touches) / pinchRef.current.dist;
                        applyZoom(pinchRef.current.zoom * scale, pinchRef.current.cx, pinchRef.current.cy);
                    } else if (e.touches.length === 1 && dragRef.current && zoom > 1) {
                        setPan({
                            x: dragRef.current.px + (e.touches[0].clientX - dragRef.current.sx),
                            y: dragRef.current.py + (e.touches[0].clientY - dragRef.current.sy),
                        });
                    }
                }}
                onTouchEnd={e => {
                    if (e.touches.length < 2) pinchRef.current = null;
                    if (e.touches.length < 1) dragRef.current = null;
                    if (swipeRef.current !== null && zoom === 1 && e.changedTouches.length === 1) {
                        const dx = swipeRef.current.x - e.changedTouches[0].clientX;
                        const dy = swipeRef.current.y - e.changedTouches[0].clientY;
                        // Swipe up or down to exit
                        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) onClose();
                        else if (dx > 48) handleNext();
                        else if (dx < -48) handlePrev();
                        swipeRef.current = null;
                    }
                }}
                onClick={e => e.stopPropagation()}
                style={{
                    width: "100vw",
                    height: "100vh",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transformOrigin: `${origin.x}% ${origin.y}%`,
                    transition: pinchRef.current || dragRef.current ? "none" : "transform 0.12s ease",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    touchAction: "none",
                }}
            >
                {images[imageIdx] ? (
                    <img
                        className="lb-image"
                        src={getImageUrl(images[imageIdx], "original")}
                        alt={w.title}
                        draggable={false}
                        style={{
                            maxWidth: "94vw",
                            maxHeight: "94vh",
                            objectFit: "contain",
                            boxShadow: "0 40px 90px rgba(0,0,0,0.35), 0 10px 30px rgba(0,0,0,0.12)",
                            backgroundColor: "#fff",
                            display: "block",
                        }}
                    />
                ) : (
                    <div style={{
                        width: "94vw", height: "94vh",
                        maxWidth: "800px", maxHeight: "800px",
                        background: `linear-gradient(160deg, ${w.gradientFrom} 0%, ${w.gradientTo} 100%)`,
                        boxShadow: "0 40px 90px rgba(0,0,0,0.35), 0 10px 30px rgba(0,0,0,0.12)",
                    }} />
                )}
            </div>

            {/* ── Artwork Details (Bottom Scrollable) ────────────────────────── */}
            <div
                className="lb-details"
                onPointerDown={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                onTouchEnd={e => e.stopPropagation()}
                style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight: "35vh",
                    overflowY: "auto",
                    padding: "0 1.5rem 2.5rem",
                    zIndex: 26,
                    background: "transparent",
                    opacity: zoom > 1 ? 0 : 1,
                    transition: "opacity 0.2s ease",
                    pointerEvents: "auto",
                    touchAction: "pan-y",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehavior: "contain",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "0.8rem",
                    color: "rgba(20,20,18,0.9)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                    textShadow: "0 2px 10px rgba(255,255,255,0.8)",
                    fontWeight: 500,
                }}>
                    {w.size && <span>{w.size}</span>}
                    {w.size && w.original_status && <span style={{ margin: "0 10px", opacity: 0.5 }}>|</span>}
                    {w.original_status && <span>{w.original_status.replace(/_/g, ' ')}</span>}
                </div>
                {w.description && (
                    <div style={{
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.95rem",
                        lineHeight: 1.6,
                        color: "rgba(20,20,18,0.85)",
                        textShadow: "0 2px 10px rgba(255,255,255,0.8)",
                        maxWidth: "800px",
                        whiteSpace: "pre-wrap",
                    }}>
                        {w.description}
                    </div>
                )}
            </div>

            {/* ── Close button (only UI element) ─────────────────────────────── */}
            <button
                onClick={onClose}
                style={{
                    position: "absolute", top: "1.1rem", right: "1.1rem", zIndex: 30,
                    width: "38px", height: "38px", borderRadius: "50%",
                    background: "rgba(255,255,255,0.18)",
                    border: "1px solid rgba(0,0,0,0.08)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    color: "rgba(30,30,28,0.75)",
                    fontSize: "1rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s, color 0.2s",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.85)";
                    e.currentTarget.style.color = "rgba(20,20,18,0.9)";
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.18)";
                    e.currentTarget.style.color = "rgba(30,30,28,0.75)";
                }}
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="1" y1="1" x2="11" y2="11" /><line x1="11" y1="1" x2="1" y2="11" />
                </svg>
            </button>

            {/* ── Desktop arrow buttons (left / right) — only PC, only when can nav ── */}
            {canNav && (
                <>
                    <button
                        onClick={e => { e.stopPropagation(); handlePrev(); }}
                        style={{
                            position: "absolute", left: "1.25rem", top: "50%",
                            transform: "translateY(-50%)", zIndex: 25,
                            width: "44px", height: "44px", borderRadius: "50%",
                            background: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(0,0,0,0.06)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            color: "rgba(30,30,28,0.7)",
                            cursor: "pointer",
                            display: "none", // hidden on mobile via inline override below
                            alignItems: "center", justifyContent: "center",
                            transition: "background 0.2s, transform 0.2s",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                        }}
                        className="lb-arrow"
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.82)"; e.currentTarget.style.transform = "translateY(-50%) scale(1.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); handleNext(); }}
                        style={{
                            position: "absolute", right: "1.25rem", top: "50%",
                            transform: "translateY(-50%)", zIndex: 25,
                            width: "44px", height: "44px", borderRadius: "50%",
                            background: "rgba(255,255,255,0.18)",
                            border: "1px solid rgba(0,0,0,0.06)",
                            backdropFilter: "blur(12px)",
                            WebkitBackdropFilter: "blur(12px)",
                            color: "rgba(30,30,28,0.7)",
                            cursor: "pointer",
                            display: "none",
                            alignItems: "center", justifyContent: "center",
                            transition: "background 0.2s, transform 0.2s",
                            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                        }}
                        className="lb-arrow"
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.82)"; e.currentTarget.style.transform = "translateY(-50%) scale(1.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                </>
            )}

            {/* ── CSS: show arrows only on pointer:fine (mouse/trackpad) ──────── */}
            <style>{`
                @media (hover: hover) and (pointer: fine) {
                    .lb-arrow { display: flex !important; }
                }
                .lb-header {
                    position: absolute;
                    top: 2.5rem;
                    left: 0;
                    right: 0;
                    z-index: 25;
                    padding: 0 1.5rem;
                    display: flex;
                    justify-content: center;
                    pointer-events: none;
                }
                .lb-title {
                    font-size: min(9vw, 2.4rem);
                }
                @media (min-width: 768px) {
                    .lb-header {
                        top: 2.5rem !important;
                        left: 2.5rem !important;
                        right: auto;
                        justify-content: flex-start;
                        width: 320px;
                        padding: 0 !important;
                    }
                    .lb-title {
                        font-size: 2.4rem;
                    }
                    .lb-details {
                        position: absolute !important;
                        left: 2.5rem !important;
                        right: auto !important;
                        bottom: 2.5rem !important;
                        width: 320px !important;
                        padding: 0 !important;
                        max-height: calc(100vh - 150px) !important;
                    }
                }
                .lb-details::-webkit-scrollbar {
                    width: 4px;
                }
                .lb-details::-webkit-scrollbar-thumb {
                    background: rgba(20,20,18,0.2);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}
