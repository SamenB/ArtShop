"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
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
    aspect_ratio?: string; // from detail page
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
    
    // Zoom + pan state
    const [zoomLevel, setZoomLevel] = useState(1);
    const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 }); // percentages
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    
    const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);
    const tx = useRef<number | null>(null);
    const imgContainerRef = useRef<HTMLDivElement>(null);

    // Reset zoom when switching images
    useEffect(() => {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
        setZoomOrigin({ x: 50, y: 50 });
    }, [wIdx, imageIdx]);

    // Change artwork
    const prevWork = useCallback(() => { setWIdx(i => (i - 1 + works.length) % works.length); setImageIdx(0); }, [works.length]);
    const nextWork = useCallback(() => { setWIdx(i => (i + 1) % works.length); setImageIdx(0); }, [works.length]);
    
    // Change image within artwork
    const prevImage = useCallback(() => { if (!w.images) return; setImageIdx(i => (i - 1 + w.images!.length) % w.images!.length); }, [w.images]);
    const nextImage = useCallback(() => { if (!w.images) return; setImageIdx(i => (i + 1) % w.images!.length); }, [w.images]);

    // Keyboard navigation
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
        const clampedZoom = Math.max(1, Math.min(newZoom, 5)); // max 5x zoom
        if (clampedZoom === 1) {
            setPanOffset({ x: 0, y: 0 });
            setZoomOrigin({ x: 50, y: 50 });
        } else if (zoomLevel === 1 && clampedZoom > 1) {
            setZoomOrigin({ x: originX, y: originY });
        }
        setZoomLevel(clampedZoom);
    };

    // Calculate image render ratio
    const ratioStr = w.aspectRatio || w.aspect_ratio || "4/5";
    const ratioParts = ratioStr.split("/").map(Number);
    const ratio = ratioParts.length === 2 ? (ratioParts[0] / ratioParts[1]) : Number(ratioStr) || 0.8;

    return (
        <div 
            onTouchStart={e => { tx.current = e.touches[0].clientX; }}
            onTouchEnd={e => { 
                if (!tx.current || zoomLevel > 1) return; // Don't swipe works if zoomed
                const d = tx.current - e.changedTouches[0].clientX; 
                if (d > 40) nextWork(); else if (d < -40) prevWork(); 
                tx.current = null; 
            }}
            style={{ 
                position: "fixed", inset: 0, zIndex: 2000, 
                backgroundColor: "#080806", display: "flex", flexDirection: "column" 
            }}
        >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1rem", height: "52px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>{wIdx + 1} / {works.length}</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>Originals & Prints</span>
                <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", fontSize: "1.5rem", cursor: "pointer", minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: "1rem" }}>
                {works.length > 1 && zoomLevel === 1 && <button onClick={prevWork} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", zIndex: 10, width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.2s" }}>‹</button>}
                {works.length > 1 && zoomLevel === 1 && <button onClick={nextWork} style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", zIndex: 10, width: "40px", height: "40px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.2s" }}>›</button>}
                
                {/* Image Container with Zoom logic */}
                <div
                    ref={imgContainerRef}
                    onWheel={(e) => {
                        e.stopPropagation();
                        // PC Wheel zoom
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = ((e.clientX - rect.left) / rect.width) * 100;
                        const y = ((e.clientY - rect.top) / rect.height) * 100;
                        
                        const delta = e.deltaY > 0 ? -0.5 : 0.5;
                        handleZoomUpdate(zoomLevel + delta, x, y);
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (zoomLevel > 1) {
                            handleZoomUpdate(1);
                        } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = ((e.clientX - rect.left) / rect.width) * 100;
                            const y = ((e.clientY - rect.top) / rect.height) * 100;
                            handleZoomUpdate(3, x, y); // Jump to 3x zoom on double tap
                        }
                    }}
                    onMouseDown={(e) => {
                        if (zoomLevel <= 1) return;
                        e.preventDefault();
                        dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                    }}
                    onMouseMove={(e) => {
                        if (!dragRef.current) return;
                        const dx = e.clientX - dragRef.current.startX;
                        const dy = e.clientY - dragRef.current.startY;
                        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                        setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                    }}
                    onMouseUp={() => { dragRef.current = null; }}
                    onMouseLeave={() => { dragRef.current = null; }}
                    onTouchStart={(e) => {
                        if (zoomLevel <= 1 || e.touches.length !== 1) return;
                        dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startPanX: panOffset.x, startPanY: panOffset.y, moved: false };
                    }}
                    onTouchMove={(e) => {
                        if (!dragRef.current || e.touches.length !== 1) return;
                        e.preventDefault();
                        const dx = e.touches[0].clientX - dragRef.current.startX;
                        const dy = e.touches[0].clientY - dragRef.current.startY;
                        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
                        setPanOffset({ x: dragRef.current.startPanX + dx, y: dragRef.current.startPanY + dy });
                    }}
                    onTouchEnd={() => { dragRef.current = null; }}
                    onClick={(e) => { e.stopPropagation(); }}
                    style={{
                        width: `min(100%, calc((100vh - 200px) * ${ratio}))`,
                        height: `min(100%, calc(100vh - 200px))`,
                        maxWidth: "100%",
                        aspectRatio: `${ratioStr}`,
                        backgroundImage: w.images?.[imageIdx] ? `url(${getImageUrl(w.images[imageIdx], 'original')})` : `linear-gradient(160deg, ${w.gradientFrom} 0%, ${w.gradientTo} 100%)`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        borderRadius: "2px",
                        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
                        cursor: zoomLevel > 1 ? (dragRef.current ? "grabbing" : "grab") : "zoom-in",
                        transition: dragRef.current ? "none" : "transform 0.15s ease",
                        transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
                        transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                        userSelect: "none",
                    }}
                />

                {/* Multiple images indicator */}
                {w.images && w.images.length > 1 && zoomLevel === 1 && (
                    <div style={{
                        position: "absolute", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
                        display: "flex", gap: "8px", zIndex: 10
                    }}>
                        {w.images.map((_, i) => (
                            <button
                                key={i}
                                onClick={(e) => { e.stopPropagation(); setImageIdx(i); }}
                                style={{
                                    width: i === imageIdx ? "20px" : "8px",
                                    height: "8px",
                                    borderRadius: "4px",
                                    backgroundColor: i === imageIdx ? "#fff" : "rgba(255,255,255,0.3)",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    transition: "width 0.3s ease, background-color 0.3s ease"
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Panel (Zoom Slider & Metadata) */}
            <div style={{ flexShrink: 0, padding: "0.85rem 1.25rem 1.1rem", borderTop: "1px solid rgba(255,255,255,0.08)", backgroundColor: "rgba(8,8,6,0.98)" }}>
                
                {/* CSS Range Slider for Zooming */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem", marginBottom: "1rem", maxWidth: "400px", margin: "0 auto 1rem" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", flexShrink: 0 }}>–</span>
                    <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="0.05" 
                        value={zoomLevel} 
                        onChange={(e) => handleZoomUpdate(parseFloat(e.target.value))}
                        style={{
                            width: "100%",
                            cursor: "pointer",
                            accentColor: "rgba(255,255,255,0.8)" // Native color fallback
                        }}
                    />
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.85rem", flexShrink: 0 }}>+</span>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: works.length > 1 ? "0.65rem" : 0 }}>
                    <div>
                        <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.1rem", fontWeight: 600, color: "#FAFAF7", marginBottom: "0.3rem" }}>{w.title}</p>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "rgba(255,255,255,0.45)" }}>
                            {(w.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m, wd, h) => `${m} | ${Math.round(Number(wd) * 2.54)} × ${Math.round(Number(h) * 2.54)} cm`)} · {w.medium}
                            {w.original_status === "available" && <span style={{ marginLeft: "0.6rem", color: "#6DB87E" }}>● Available</span>}
                            {w.original_status === "sold" && <span style={{ marginLeft: "0.6rem", color: "#C87070" }}>● Sold</span>}
                            {w.original_status === "reserved" && <span style={{ marginLeft: "0.6rem", color: "#C4963A" }}>● Reserved</span>}
                            {w.original_status === "digital" && <span style={{ marginLeft: "0.6rem", color: "#B89AEE" }}>● Digital</span>}
                        </p>
                    </div>
                    {window.location.pathname !== `/gallery/${w.id}` && (
                        <Link href={`/gallery/${w.id}`} onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "1px", flexShrink: 0, whiteSpace: "nowrap", alignSelf: "center" }}>
                            Shop →
                        </Link>
                    )}
                </div>
                {works.length > 1 && (
                    <div style={{ display: "flex", gap: "5px", alignItems: "center", justifyContent: "center" }}>
                        {works.map((_, i) => <button key={i} onClick={() => setWIdx(i)} style={{ width: i === wIdx ? "18px" : "6px", height: "6px", borderRadius: "3px", backgroundColor: i === wIdx ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.28)", border: "none", cursor: "pointer", padding: 0, transition: "width 0.25s ease, background-color 0.2s ease" }} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

