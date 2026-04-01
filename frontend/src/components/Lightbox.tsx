"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { getImageUrl } from "@/utils";

type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface Artwork {
    id: number;
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

export default function Lightbox({
    works,
    startWorkIndex = 0,
    startImageIndex = 0,
    onClose
}: {
    works: Artwork[];
    startWorkIndex?: number;
    startImageIndex?: number;
    onClose: () => void;
}) {
    const [wIdx, setWIdx] = useState(startWorkIndex);
    const [imageIdx, setImageIdx] = useState(startImageIndex);
    const w = works[wIdx];

    // Zoom + pan
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

    // UI visibility — hide controls when zoomed in or after idle
    const [controlsVisible, setControlsVisible] = useState(true);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);
    const tx = useRef<number | null>(null);
    const imgContainerRef = useRef<HTMLDivElement>(null);

    // Show controls temporarily then auto-hide after 3s of inactivity
    const showControls = useCallback(() => {
        setControlsVisible(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
            if (zoomLevel <= 1) setControlsVisible(true); // Keep visible at 1x
        }, 3000);
    }, [zoomLevel]);

    // Reset zoom on image change
    useEffect(() => {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        setZoomOrigin({ x: 50, y: 50 });
    }, [wIdx, imageIdx]);

    // Always show controls at 1x zoom
    useEffect(() => {
        if (zoomLevel === 1) setControlsVisible(true);
    }, [zoomLevel]);

    const prevWork = useCallback(() => { setWIdx(i => (i - 1 + works.length) % works.length); setImageIdx(0); }, [works.length]);
    const nextWork = useCallback(() => { setWIdx(i => (i + 1) % works.length); setImageIdx(0); }, [works.length]);
    const prevImage = useCallback(() => { if (!w.images) return; setImageIdx(i => (i - 1 + w.images!.length) % w.images!.length); }, [w.images]);
    const nextImage = useCallback(() => { if (!w.images) return; setImageIdx(i => (i + 1) % w.images!.length); }, [w.images]);

    // Keyboard
    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") prevWork();
            if (e.key === "ArrowRight") nextWork();
            if (e.key === "ArrowUp") prevImage();
            if (e.key === "ArrowDown") nextImage();
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    }, [onClose, prevWork, nextWork, prevImage, nextImage]);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = ""; };
    }, []);

    const handleZoomUpdate = (newZoom: number, originX: number = 50, originY: number = 50) => {
        const clampedZoom = Math.max(1, Math.min(newZoom, 5));
        if (clampedZoom === 1) {
            setPanOffset({ x: 0, y: 0 });
            setZoomOrigin({ x: 50, y: 50 });
        } else if (zoomLevel === 1 && clampedZoom > 1) {
            setZoomOrigin({ x: originX, y: originY });
        }
        setZoomLevel(clampedZoom);
    };

    // Aspect ratio
    const ratioStr = w.aspectRatio || w.aspect_ratio || "4/5";
    const ratioParts = ratioStr.split("/").map(Number);
    const ratio = ratioParts.length === 2 ? (ratioParts[0] / ratioParts[1]) : Number(ratioStr) || 0.8;

    const overlayBase: React.CSSProperties = {
        position: "absolute",
        zIndex: 10,
        transition: "opacity 0.3s ease",
        opacity: controlsVisible ? 1 : 0,
        pointerEvents: controlsVisible ? "auto" : "none",
    };

    return (
        <div
            onMouseMove={showControls}
            onTouchStart={e => {
                showControls();
                tx.current = e.touches[0].clientX;
            }}
            onTouchEnd={e => {
                if (!tx.current || zoomLevel > 1) return;
                const d = tx.current - e.changedTouches[0].clientX;
                if (d > 40) nextWork(); else if (d < -40) prevWork();
                tx.current = null;
            }}
            style={{
                position: "fixed", inset: 0, zIndex: 2000,
                backgroundColor: "#050504",
                display: "flex", alignItems: "center", justifyContent: "center",
                overflow: "hidden",
            }}
        >
            {/* ── Full-screen Image ── */}
            <div
                ref={imgContainerRef}
                onWheel={e => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    handleZoomUpdate(zoomLevel + (e.deltaY > 0 ? -0.5 : 0.5), x, y);
                }}
                onDoubleClick={e => {
                    e.stopPropagation();
                    if (zoomLevel > 1) {
                        handleZoomUpdate(1);
                    } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        handleZoomUpdate(3, x, y);
                    }
                }}
                onMouseDown={e => {
                    if (zoomLevel <= 1) return;
                    e.preventDefault();
                    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                }}
                onMouseMove={e => {
                    if (!dragRef.current) return;
                    const dx = e.clientX - dragRef.current.startX;
                    const dy = e.clientY - dragRef.current.startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                    setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                }}
                onMouseUp={() => { dragRef.current = null; }}
                onMouseLeave={() => { dragRef.current = null; }}
                onTouchStart={e => {
                    if (zoomLevel <= 1 || e.touches.length !== 1) return;
                    dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                }}
                onTouchMove={e => {
                    if (!dragRef.current || e.touches.length !== 1) return;
                    e.preventDefault();
                    const dx = e.touches[0].clientX - dragRef.current.startX;
                    const dy = e.touches[0].clientY - dragRef.current.startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                    setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                }}
                onTouchEnd={() => { dragRef.current = null; }}
                onClick={e => { e.stopPropagation(); }}
                style={{
                    // Fill entire viewport — letterbox with object-fit if needed
                    width: "100vw",
                    height: "100vh",
                    backgroundImage: w.images?.[imageIdx]
                        ? `url(${getImageUrl(w.images[imageIdx], 'original')})`
                        : `linear-gradient(160deg, ${w.gradientFrom} 0%, ${w.gradientTo} 100%)`,
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "center",
                    cursor: zoomLevel > 1 ? (dragRef.current ? "grabbing" : "grab") : "default",
                    transition: dragRef.current ? "none" : "transform 0.15s ease",
                    transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                    userSelect: "none",
                }}
            />

            {/* ── Top bar: counter + close ── */}
            <div style={{
                ...overlayBase,
                top: 0, left: 0, right: 0,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "0.75rem 1rem",
                background: "linear-gradient(to bottom, rgba(5,5,4,0.75) 0%, transparent 100%)",
                backdropFilter: "none",
            }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}>
                    {wIdx + 1} / {works.length}
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Originals &amp; Prints
                </span>
                <button
                    onClick={onClose}
                    style={{
                        background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                        backdropFilter: "blur(8px)",
                        color: "rgba(255,255,255,0.85)", fontSize: "1rem", cursor: "pointer",
                        width: "36px", height: "36px", borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                >✕</button>
            </div>

            {/* ── Left/Right artwork nav arrows ── */}
            {works.length > 1 && zoomLevel === 1 && (
                <>
                    <button
                        onClick={prevWork}
                        style={{
                            ...overlayBase,
                            left: "0.75rem", top: "50%", transform: "translateY(-50%)",
                            width: "42px", height: "42px", borderRadius: "50%",
                            backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                            backdropFilter: "blur(8px)",
                            color: "#fff", fontSize: "1.4rem", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >‹</button>
                    <button
                        onClick={nextWork}
                        style={{
                            ...overlayBase,
                            right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                            width: "42px", height: "42px", borderRadius: "50%",
                            backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
                            backdropFilter: "blur(8px)",
                            color: "#fff", fontSize: "1.4rem", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                    >›</button>
                </>
            )}

            {/* ── Multi-image dots (top of bottom bar area) ── */}
            {w.images && w.images.length > 1 && zoomLevel === 1 && (
                <div style={{
                    ...overlayBase,
                    bottom: "7rem", left: "50%", transform: "translateX(-50%)",
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

            {/* ── Bottom bar: zoom slider + metadata ── */}
            <div style={{
                ...overlayBase,
                bottom: 0, left: 0, right: 0,
                padding: "1.5rem 1.25rem 1.1rem",
                background: "linear-gradient(to top, rgba(5,5,4,0.88) 0%, rgba(5,5,4,0.6) 70%, transparent 100%)",
            }}>
                {/* Zoom slider */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    maxWidth: "320px", margin: "0 auto 0.85rem",
                }}>
                    <button
                        onClick={() => handleZoomUpdate(zoomLevel - 0.5)}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: "1.2rem", cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0, width: "24px", textAlign: "center" }}
                    >–</button>
                    <input
                        type="range"
                        min="1" max="5" step="0.05"
                        value={zoomLevel}
                        onChange={e => handleZoomUpdate(parseFloat(e.target.value))}
                        style={{ width: "100%", cursor: "pointer", accentColor: "rgba(255,255,255,0.8)" }}
                    />
                    <button
                        onClick={() => handleZoomUpdate(zoomLevel + 0.5)}
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: "1.2rem", cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0, width: "24px", textAlign: "center" }}
                    >+</button>
                </div>

                {/* Metadata row */}
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
                    <div>
                        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1rem", fontWeight: 400, color: "#FAFAF7", marginBottom: "0.2rem" }}>
                            {w.title}
                        </p>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", lineHeight: 1.5 }}>
                            {(w.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m, wd, h) => `${m} | ${Math.round(Number(wd) * 2.54)} × ${Math.round(Number(h) * 2.54)} cm`)} · {w.medium}
                            {w.original_status === "available" && <span style={{ marginLeft: "0.5rem", color: "#6DB87E" }}>● Available</span>}
                            {w.original_status === "sold" && <span style={{ marginLeft: "0.5rem", color: "#C87070" }}>● Sold</span>}
                            {w.original_status === "reserved" && <span style={{ marginLeft: "0.5rem", color: "#C4963A" }}>● Reserved</span>}
                            {w.original_status === "digital" && <span style={{ marginLeft: "0.5rem", color: "#B89AEE" }}>● Digital</span>}
                        </p>
                    </div>
                    {window.location.pathname !== `/gallery/${w.id}` && (
                        <Link
                            href={`/gallery/${w.id}`}
                            onClick={onClose}
                            style={{
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

                {/* Works dots */}
                {works.length > 1 && (
                    <div style={{ display: "flex", gap: "5px", alignItems: "center", justifyContent: "center", marginTop: "0.65rem" }}>
                        {works.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setWIdx(i)}
                                style={{
                                    width: i === wIdx ? "18px" : "6px", height: "6px", borderRadius: "3px",
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
