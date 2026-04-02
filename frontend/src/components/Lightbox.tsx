"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { getImageUrl, artworkUrl } from "@/utils";

type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface Artwork {
    id: number;
    slug?: string;
    title: string;
    medium: string;
    size: string;
    original_status: OriginalStatus;
    images?: (string | { thumb: string; medium: string; original: string })[];
    aspectRatio?: string;
    aspect_ratio?: string;
    gradientFrom?: string;
    gradientTo?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
const getTouchDist = (t: React.TouchList) => {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
};
const getTouchCenter = (t: React.TouchList) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
});

// ─── Component ────────────────────────────────────────────────────────────────
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
    const [wIdx, setWIdx]       = useState(startWorkIndex);
    const [imageIdx, setImageIdx] = useState(startImageIndex);
    const w = works[wIdx];

    // ── Zoom / Pan ──────────────────────────────────────────────────────────
    const [zoom, setZoom]         = useState(1);
    const [origin, setOrigin]     = useState({ x: 50, y: 50 });
    const [pan, setPan]           = useState({ x: 0, y: 0 });

    // refs for gesture tracking
    const dragRef  = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
    const pinchRef = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null);
    const swipeRef = useRef<{x: number, y: number} | null>(null);   // 1-finger swipe on outer wrapper
    const tapRef   = useRef<number>(0);             // double-tap timing
    const imgRef   = useRef<HTMLDivElement>(null);

    // Reset zoom when painting/image changes
    useEffect(() => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setOrigin({ x: 50, y: 50 });
    }, [wIdx, imageIdx]);

    // ── Zoom helper ─────────────────────────────────────────────────────────
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

    // ── Work / image navigation ─────────────────────────────────────────────
    const prevWork  = useCallback(() => { setWIdx(i => (i - 1 + works.length) % works.length); setImageIdx(0); }, [works.length]);
    const nextWork  = useCallback(() => { setWIdx(i => (i + 1) % works.length);               setImageIdx(0); }, [works.length]);
    const prevImage = useCallback(() => { if (w.images) setImageIdx(i => (i - 1 + w.images!.length) % w.images!.length); }, [w.images]);
    const nextImage = useCallback(() => { if (w.images) setImageIdx(i => (i + 1) % w.images!.length);                     }, [w.images]);

    // ── Keyboard ────────────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape")      onClose();
            if (e.key === "ArrowUp")     prevWork();
            if (e.key === "ArrowDown")   nextWork();
            if (e.key === "ArrowLeft")   prevImage();
            if (e.key === "ArrowRight")  nextImage();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, prevWork, nextWork, prevImage, nextImage]);

    // ── Lock body scroll ────────────────────────────────────────────────────
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    // ── Prevent passive touch-move on the image container (needed for pinch) ─
    useEffect(() => {
        const el = imgRef.current;
        if (!el) return;
        const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
        el.addEventListener("touchmove", prevent, { passive: false });
        return () => el.removeEventListener("touchmove", prevent);
    }, []);

    // ── Double-tap / double-click handler ───────────────────────────────────
    const handleDoubleTap = (clientX: number, clientY: number) => {
        if (zoom > 1) {
            applyZoom(1);
        } else {
            const x = (clientX / window.innerWidth) * 100;
            const y = (clientY / window.innerHeight) * 100;
            applyZoom(3, x, y);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div
            // ── Outer: backdrop (mostly to catch outside clicks) ──────────────────
            onTouchStart={e => {
                if (e.touches.length === 1 && zoom === 1) swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }}
            onTouchEnd={e => {
                if (swipeRef.current === null || zoom > 1) return;
                const dx = swipeRef.current.x - e.changedTouches[0].clientX;
                const dy = swipeRef.current.y - e.changedTouches[0].clientY;
                if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 48) {
                    onClose();
                } else {
                    if (dx > 48) nextImage();
                    else if (dx < -48) prevImage();
                }
                swipeRef.current = null;
            }}
            style={{
                position: "fixed", inset: 0, zIndex: 2000,
                backgroundColor: "#050504",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
                touchAction: "none", // let JS own all touch handling
            }}
        >
            {/* ── Full-screen image ─────────────────────────────────────── */}
            <div
                ref={imgRef}

                // ── Desktop: scroll-wheel zoom ──────────────────────────────
                onWheel={e => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    applyZoom(zoom + (e.deltaY > 0 ? -0.4 : 0.4), x, y);
                }}

                // ── Desktop: double-click zoom ──────────────────────────────
                onDoubleClick={e => { e.stopPropagation(); handleDoubleTap(e.clientX, e.clientY); }}

                // ── Desktop: drag-to-pan ────────────────────────────────────
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

                // ── Mobile/Tablet touch ─────────────────────────────────────
                onTouchStart={e => {
                    e.stopPropagation();

                    if (e.touches.length === 2) {
                        // ── Pinch-to-zoom: record initial state ──────────────
                        const c = getTouchCenter(e.touches);
                        pinchRef.current = {
                            dist: getTouchDist(e.touches),
                            zoom,
                            cx: (c.x / window.innerWidth) * 100,
                            cy: (c.y / window.innerHeight) * 100,
                        };
                        dragRef.current = null;
                    } else if (e.touches.length === 1) {
                        // ── Single finger: pan (when zoomed) OR swipe OR double-tap ──
                        pinchRef.current = null;
                        if (zoom > 1) {
                            dragRef.current = {
                                sx: e.touches[0].clientX, sy: e.touches[0].clientY,
                                px: pan.x, py: pan.y,
                            };
                        } else {
                            swipeRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; // capture inner swipe!
                        }

                        // Double-tap detection
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
                        // ── Pinch zoom ───────────────────────────────────────
                        const newDist = getTouchDist(e.touches);
                        const scale  = newDist / pinchRef.current.dist;
                        applyZoom(
                            pinchRef.current.zoom * scale,
                            pinchRef.current.cx,
                            pinchRef.current.cy,
                        );
                    } else if (e.touches.length === 1 && dragRef.current && zoom > 1) {
                        // ── Pan ──────────────────────────────────────────────
                        setPan({
                            x: dragRef.current.px + (e.touches[0].clientX - dragRef.current.sx),
                            y: dragRef.current.py + (e.touches[0].clientY - dragRef.current.sy),
                        });
                    }
                }}
                onTouchEnd={e => {
                    if (e.touches.length < 2) pinchRef.current = null;
                    if (e.touches.length < 1) dragRef.current  = null;
                    if (swipeRef.current !== null && zoom === 1 && e.changedTouches.length === 1) {
                        const dx = swipeRef.current.x - e.changedTouches[0].clientX;
                        const dy = swipeRef.current.y - e.changedTouches[0].clientY;
                        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 48) {
                            onClose();
                        } else {
                            if (dx > 48) nextImage();
                            else if (dx < -48) prevImage();
                        }
                    }
                    swipeRef.current = null;
                }}

                onClick={e => e.stopPropagation()}

                style={{
                    width: "100vw",
                    height: "100vh",
                    backgroundImage: w.images?.[imageIdx]
                        ? `url(${getImageUrl(w.images[imageIdx], "original")})`
                        : `linear-gradient(160deg, ${w.gradientFrom} 0%, ${w.gradientTo} 100%)`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    cursor: zoom > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                    transformOrigin: `${origin.x}% ${origin.y}%`,
                    transition: pinchRef.current || dragRef.current ? "none" : "transform 0.12s ease",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                }}
            />

            {/* ── Visual Left/Right navigation for items ── */}
            {w.images && w.images.length > 1 && zoom === 1 && (
                <>
                    <button
                        className="hidden md:flex items-center justify-center"
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        style={{
                            position: "absolute", left: "1.5rem", top: "50%", transform: "translateY(-50%)", zIndex: 20,
                            width: "72px", height: "72px", 
                            background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "50%", backdropFilter: "blur(4px)",
                            cursor: "pointer", color: "#ffffff",
                            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.15))",
                            transition: "background 0.2s, transform 0.2s"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.transform = "translateY(-50%) scale(1.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(0.9)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1.15)"; }}
                    >
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button
                        className="hidden md:flex items-center justify-center"
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        style={{
                            position: "absolute", right: "1.5rem", top: "50%", transform: "translateY(-50%)", zIndex: 20,
                            width: "72px", height: "72px", 
                            background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "50%", backdropFilter: "blur(4px)",
                            cursor: "pointer", color: "#ffffff",
                            filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.15))",
                            transition: "background 0.2s, transform 0.2s"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.transform = "translateY(-50%) scale(1.15)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.transform = "translateY(-50%) scale(1)"; }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(0.9)"; }}
                        onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(-50%) scale(1.15)"; }}
                    >
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </>
            )}

            {/* ── TOP BAR: counter + close ───────────────────────────────── */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.75rem 1rem",
                background: "linear-gradient(to bottom, rgba(5,5,4,0.72) 0%, transparent 100%)",
                pointerEvents: "none",
            }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>
                    {wIdx + 1} / {works.length}
                </span>
                <button
                    onClick={onClose}
                    style={{
                        pointerEvents: "auto",
                        background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)",
                        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                        color: "rgba(255,255,255,0.85)", fontSize: "0.85rem", cursor: "pointer",
                        width: "34px", height: "34px", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                >✕</button>
            </div>

            {/* ── LEFT / RIGHT arrows ────────────────────────────────────── */}
            {works.length > 1 && zoom === 1 && (
                <>
                    {[{ fn: prevWork, side: "left", glyph: "‹" }, { fn: nextWork, side: "right", glyph: "›" }].map(({ fn, side, glyph }) => (
                        <button
                            key={side}
                            onClick={fn}
                            style={{
                                position: "absolute", [side]: "0.65rem", top: "50%",
                                transform: "translateY(-50%)", zIndex: 20,
                                width: "42px", height: "42px", borderRadius: "50%",
                                backgroundColor: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.15)",
                                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                                color: "#fff", fontSize: "1.5rem", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "background 0.2s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"}
                        >{glyph}</button>
                    ))}
                </>
            )}

            {/* ── ZOOM LEVEL indicator (only when zoomed) ─────────────────── */}
            {zoom > 1.05 && (
                <button
                    onClick={() => applyZoom(1)}
                    title="Reset zoom"
                    style={{
                        position: "absolute", top: "0.85rem", left: "1rem", zIndex: 20,
                        background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.15)",
                        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                        color: "rgba(255,255,255,0.75)", cursor: "pointer",
                        borderRadius: "20px", padding: "4px 10px",
                        fontFamily: "var(--font-mono)", fontSize: "0.68rem", letterSpacing: "0.06em",
                        display: "flex", alignItems: "center", gap: "5px",
                        transition: "background 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,0,0,0.65)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.45)"}
                >
                    {zoom.toFixed(1)}× <span style={{ opacity: 0.5, fontSize: "0.6rem" }}>✕</span>
                </button>
            )}

            {/* ── Multi-image dots ─────────────────────────────────────────── */}
            {w.images && w.images.length > 1 && zoom === 1 && (
                <div style={{
                    position: "absolute", bottom: "5.5rem", left: "50%",
                    transform: "translateX(-50%)", zIndex: 20,
                    display: "flex", gap: "8px",
                }}>
                    {w.images.map((_, i) => (
                        <button
                            key={i}
                            onClick={e => { e.stopPropagation(); setImageIdx(i); }}
                            style={{
                                width: i === imageIdx ? "20px" : "8px", height: "8px",
                                borderRadius: "4px",
                                backgroundColor: i === imageIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                                border: "none", cursor: "pointer", padding: 0,
                                transition: "width 0.3s ease, background-color 0.3s ease",
                            }}
                        />
                    ))}
                </div>
            )}

            {/* ── BOTTOM BAR: metadata ─────────────────────────────────────── */}
            <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
                padding: "2rem 1.25rem 1.1rem",
                background: "linear-gradient(to top, rgba(5,5,4,0.82) 0%, rgba(5,5,4,0.5) 65%, transparent 100%)",
                pointerEvents: "none",
            }}>
                {/* Hint text (desktop) */}
                <p style={{
                    fontFamily: "var(--font-sans)", fontSize: "0.58rem",
                    color: "rgba(255,255,255,0.22)", textAlign: "center",
                    letterSpacing: "0.08em", marginBottom: "0.65rem",
                    display: "block",
                }}>
                    scroll to zoom · double-click to zoom in · drag to pan · ← → to browse
                </p>

                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                        <p style={{
                            fontFamily: "var(--font-serif)", fontStyle: "italic",
                            fontSize: "1rem", fontWeight: 400, color: "#FAFAF7", marginBottom: "0.2rem",
                        }}>
                            {w.title}
                        </p>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                            {(w.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m, wd, h) =>
                                `${m} | ${Math.round(Number(wd) * 2.54)} × ${Math.round(Number(h) * 2.54)} cm`
                            )} · {w.medium}
                            {w.original_status === "available" && <span style={{ marginLeft: "0.5rem", color: "#6DB87E" }}>● Available</span>}
                            {w.original_status === "sold"      && <span style={{ marginLeft: "0.5rem", color: "#C87070" }}>● Sold</span>}
                            {w.original_status === "reserved"  && <span style={{ marginLeft: "0.5rem", color: "#C4963A" }}>● Reserved</span>}
                            {w.original_status === "digital"   && <span style={{ marginLeft: "0.5rem", color: "#B89AEE" }}>● Digital</span>}
                        </p>
                    </div>
                    {window.location.pathname !== artworkUrl(w.slug || w.id) && (
                        <Link
                            href={artworkUrl(w.slug || w.id)}
                            onClick={onClose}
                            style={{
                                pointerEvents: "auto",
                                fontFamily: "var(--font-sans)", fontSize: "0.63rem", fontWeight: 500,
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                color: "rgba(255,255,255,0.5)", textDecoration: "none",
                                borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "1px",
                                flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center",
                            }}
                        >
                            Shop →
                        </Link>
                    )}
                </div>

                {/* Artwork dots */}
                {works.length > 1 && (
                    <div style={{
                        display: "flex", gap: "5px", alignItems: "center",
                        justifyContent: "center", marginTop: "0.7rem",
                    }}>
                        {works.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setWIdx(i)}
                                style={{
                                    pointerEvents: "auto",
                                    width: i === wIdx ? "18px" : "6px", height: "6px",
                                    borderRadius: "3px",
                                    backgroundColor: i === wIdx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)",
                                    border: "none", cursor: "pointer", padding: 0,
                                    transition: "width 0.25s ease, background-color 0.2s ease",
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
