"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import { getImageUrl } from "@/utils";
import { Artwork } from "../types";
import { STATUS } from "../constants";

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
export function ArtCard({ work, onClick, zoneH, gridMode, isMobile, liked: initialLiked, onLike, onAuthRequired }: ArtCardProps) {
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
