"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePreferences } from "@/context/PreferencesContext";
import { getApiUrl, getImageUrl } from "@/utils";
import { Product } from "../types";
import { STATUS } from "../constants";
import { buildArtworkHref, getStorefrontSummary } from "../utils";

export function ProductCard({ product, zoneH, gridMode, isMobile, countryCode, initialLiked, likedIds, onAuthRequired, listIndex, onLikeChange }: {
    product: Product; zoneH: number; gridMode: string; isMobile: boolean;
    countryCode?: string;
    initialLiked?: boolean;
    likedIds?: Set<number>;
    onAuthRequired?: (id: number, newState: boolean) => void;
    listIndex?: number;
    onLikeChange?: (id: number, liked: boolean) => void;
}) {
    const { convertPrice, units } = usePreferences();
    const storefrontSummary = getStorefrontSummary(product);
    const artworkHref = buildArtworkHref(product, countryCode);
    const paperStartingPrice = storefrontSummary?.mediums.paper.starting_price ?? null;
    const canvasStartingPrice = storefrontSummary?.mediums.canvas.starting_price ?? null;
    const hasStructuredPrintSummary = Boolean(
        storefrontSummary?.mediums.paper.available || storefrontSummary?.mediums.canvas.available,
    );
    const fallbackPrintStartingPrice = storefrontSummary?.min_print_price ?? product.base_print_price;
    const fallbackPrintLabel = storefrontSummary?.default_medium === "paper"
        ? "Paper prints"
        : storefrontSummary?.default_medium === "canvas"
            ? "Canvas prints"
            : "Prints";
    const ori = (product.orientation || "vertical").toLowerCase();
    const isHorizontal = ori === "horizontal";
    const isSquare = ori === "square";
    const imgSrc = product.images?.[0] ? getImageUrl(product.images[0], "original") || "" : "";
    const st = STATUS[product.original_status];

    const containerRef = useRef<HTMLDivElement>(null);
    const [textPad, setTextPad] = useState(0);
    const [emptyBottom, setEmptyBottom] = useState(0);
    const [measuredImgH, setMeasuredImgH] = useState(0);
    const [measuredImgW, setMeasuredImgW] = useState(0);
    const [imgHovered, setImgHovered] = useState(false);
    const [localLiked, setLocalLiked] = useState(initialLiked || false);
    const [likeAnimating, setLikeAnimating] = useState(false);

    const liked = likedIds !== undefined ? likedIds.has(product.id) : localLiked;

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

    useEffect(() => {
        requestAnimationFrame(recalc);
    }, [zoneH, recalc]);

    const sizeStr = useMemo(() => {
        const w = units === "in" ? product.width_in : product.width_cm;
        const h = units === "in" ? product.height_in : product.height_cm;
        if (w && h) return `${w} x ${h} ${units}`;
        return (product.size || "").replace(/([\d.]+) × ([\d.]+) in/, (m: string, w: string, h: string) => {
            if (units === "cm") return `${Math.round(Number(w) * 2.54)} x ${Math.round(Number(h) * 2.54)} cm`;
            return m;
        });
    }, [product, units]);

    const handleLike = async (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        const newState = !liked;
        
        setLocalLiked(newState); 
        if (onLikeChange) onLikeChange(product.id, newState);
        
        setLikeAnimating(true);
        setTimeout(() => setLikeAnimating(false), 400);

        if (onAuthRequired) { 
            onAuthRequired(product.id, newState);
            return;
        }
        
        try {
            if (newState) {
                await fetch(`${getApiUrl()}/users/me/likes/${product.id}`, { method: "POST" });
            } else {
                await fetch(`${getApiUrl()}/users/me/likes/${product.id}`, { method: "DELETE" });
            }
        } catch {
            setLocalLiked(!newState);
            if (onLikeChange) onLikeChange(product.id, !newState);
        }
    };

    return (
        <div
            className={`art-card magnetic-scroll${listIndex !== undefined && listIndex < 2 ? " no-scroll-anim" : ""}`}
            style={{
                display: "flex", flexDirection: "column", width: "100%", padding: 0,
                transform: imgHovered && !isMobile ? "scale(1.03)" : "scale(1)",
                transformOrigin: "center center",
                transition: "transform 0.2s ease-out",
                WebkitTapHighlightColor: "transparent",
            }}
        >
            <Link href={artworkHref} style={{ textDecoration: "none", display: "block", width: "100%", position: "relative", zIndex: 10, pointerEvents: "none" }}>
                <div
                    ref={containerRef}
                    className="art-card-container"
                    style={{
                        width: "100%", height: `${zoneH}px`, display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, position: "relative", pointerEvents: "none",
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
                                display: "block", maxWidth: "78%", maxHeight: isHorizontal ? `${zoneH * 0.78}px` : `${zoneH * 0.92}px`,
                                width: "auto", height: "auto", borderRadius: "4px", alignSelf: "center", flexShrink: 0,
                                boxShadow: imgHovered && !isMobile ? "4px 16px 40px rgba(28,25,22,0.58), 0 4px 12px rgba(28,25,22,0.35)" : "2px 10px 28px rgba(28,25,22,0.48), 0 3px 8px rgba(28,25,22,0.25)",
                                transition: "box-shadow 0.2s ease-out, transform 0.2s ease-out", cursor: "pointer",
                                WebkitTouchCallout: "none", userSelect: "none", WebkitUserSelect: "none", pointerEvents: "auto",
                            }}
                        />
                    ) : (
                        <div className="art-card-inner" style={{
                            width: isHorizontal || isSquare ? "78%" : "55%", height: isHorizontal ? "55%" : "85%",
                            backgroundImage: `linear-gradient(160deg, ${product.gradientFrom} 0%, ${product.gradientTo} 100%)`,
                            borderRadius: "4px", alignSelf: "center", flexShrink: 0,
                            boxShadow: "2px 8px 22px rgba(28,25,22,0.36), 0 2px 6px rgba(28,25,22,0.20)",
                        }} />
                    )}
                </div>
            </Link>

            {(gridMode !== "3" || !isMobile) && (
                <div style={{
                    position: "relative", zIndex: 5,
                    marginTop: measuredImgH > 0 ? `-${emptyBottom + measuredImgH + 4}px` : `-${emptyBottom - (isMobile ? 10 : 8)}px`,
                    marginLeft: `${textPad - 4}px`, marginRight: `${textPad - 4}px`,
                    paddingTop: measuredImgH > 0 ? `${measuredImgH + (isMobile ? 10 : 8) + 4}px` : "0.15rem",
                    paddingBottom: "0.5rem", paddingLeft: "0.55rem", paddingRight: "0.55rem",
                    backgroundColor: "rgba(235, 235, 237, 0.82)", backdropFilter: "blur(12px) saturate(1.3)",
                    WebkitBackdropFilter: "blur(12px) saturate(1.3)",
                    borderTop: "1px solid rgba(255,255,255,0.75)", borderLeft: "1px solid rgba(255,255,255,0.55)",
                    borderRight: "1px solid rgba(200,200,205,0.38)", borderBottom: "1px solid rgba(180,180,190,0.3)",
                    borderRadius: "4px", boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.6) inset",
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.3rem",
                }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem", flex: 1, minWidth: 0, pointerEvents: "auto" }}>
                        <p style={{
                            fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.90rem" : gridMode === "2" ? "0.85rem" : "0.78rem",
                            fontWeight: 400, fontStyle: "italic", letterSpacing: "0.01em", color: "#333", margin: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2
                        }}>
                            {product.title}
                        </p>

                        <p style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem", fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0 }}>
                            {sizeStr}
                        </p>
                        {st && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "1px" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", backgroundColor: st.badgeBg, border: `1px solid ${st.badgeText}33`, borderRadius: "4px", padding: "2px 7px 2px 5px" }}>
                                    <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", backgroundColor: st.badgeText, flexShrink: 0 }} />
                                    <span style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.60rem" : gridMode === "2" ? "0.58rem" : "0.55rem", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: st.badgeText, lineHeight: 1, whiteSpace: "nowrap" }}>
                                        {st.label}
                                    </span>
                                </span>
                            </div>
                        )}
                        {product.original_status === "available" && product.original_price && (
                            <p style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem", fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0 }}>
                                Original <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(product.original_price)}</span>
                            </p>
                        )}
                        {product.has_prints && hasStructuredPrintSummary && paperStartingPrice && (
                            <p style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem", fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0 }}>
                                Paper prints starting at <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(paperStartingPrice)}</span>
                            </p>
                        )}
                        {product.has_prints && hasStructuredPrintSummary && canvasStartingPrice && (
                            <p style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem", fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0 }}>
                                Canvas prints starting at <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(canvasStartingPrice)}</span>
                            </p>
                        )}
                        {product.has_prints && !hasStructuredPrintSummary && fallbackPrintStartingPrice && (
                            <p style={{ fontFamily: "var(--font-sans)", fontSize: gridMode === "1" ? "0.68rem" : gridMode === "2" ? "0.64rem" : "0.60rem", fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0 }}>
                                {fallbackPrintLabel} starting at <span className="font-price" style={{ fontWeight: 600, color: "#444" }}>{convertPrice(fallbackPrintStartingPrice)}</span>
                            </p>
                        )}
                    </div>

                    <button
                        onClick={handleLike} onTouchEnd={handleLike} onMouseEnter={() => setImgHovered(false)} onMouseLeave={() => setImgHovered(false)}
                        onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
                        aria-label={liked ? "Unlike artwork" : "Like artwork"}
                        style={{
                            background: "none", border: "none", cursor: "pointer", padding: "6px", marginTop: "-2px", flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transform: likeAnimating ? "scale(1.35)" : "scale(1)", transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            outline: "none", pointerEvents: "auto", touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        <svg width={gridMode === "3" ? "18" : gridMode === "2" ? "22" : "26"} height={gridMode === "3" ? "18" : gridMode === "2" ? "22" : "26"} viewBox="0 0 24 24" fill={liked ? "#e84057" : "none"} stroke={liked ? "#e84057" : "#888"} strokeWidth={liked ? "1.5" : "2"} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "fill 0.25s ease, stroke 0.25s ease, filter 0.25s ease", filter: liked ? "drop-shadow(0 2px 6px rgba(232,64,87,0.4))" : "none", pointerEvents: "none" }}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}
