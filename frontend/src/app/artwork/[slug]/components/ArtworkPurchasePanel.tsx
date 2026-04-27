"use client";

import React, { useState } from "react";
import PrintConfigurator from "@/components/PrintConfigurator";
import { STATUS_BADGE } from "../constants";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";

export interface ArtworkPurchasePanelProps {
    work: any;
    layoutMetrics: any;
    effectiveLiked: boolean;
    setLiked: (val: boolean) => void;
    user: any;
    addPendingLike: (id: number) => void;
    removePendingLike: (id: number) => void;
    incrementUnauthLikeCount: () => void;
    unauthLikeCount: number;
    setShowAuthPrompt: (val: boolean) => void;
    resolvedPurchaseType: string;
    hasCanvasOffers: boolean;
    hasPaperOffers: boolean;
    updateRouteState: (params: any) => void;
    activeCountryCode: string;
    convertPrice: (price: number) => string;
    addItem: (item: any) => void;
    units: "cm" | "in";
    storefront: any;
    storefrontLoading: boolean;
    storefrontError: any;
}

export function ArtworkPurchasePanel({
    work,
    layoutMetrics,
    effectiveLiked,
    setLiked,
    user,
    addPendingLike,
    removePendingLike,
    incrementUnauthLikeCount,
    unauthLikeCount,
    setShowAuthPrompt,
    resolvedPurchaseType,
    hasCanvasOffers,
    hasPaperOffers,
    updateRouteState,
    activeCountryCode,
    convertPrice,
    addItem,
    units,
    storefront,
    storefrontLoading,
    storefrontError
}: ArtworkPurchasePanelProps) {
    const [likeAnimating, setLikeAnimating] = useState(false);
    const isSmall = layoutMetrics.winW < 768;
    const cardBorderRadiusTopLeft = isSmall ? "0" : (resolvedPurchaseType === "original" ? "0" : "24px");
    const cardBorderRadiusTopRight = isSmall ? "0" : (resolvedPurchaseType === "paper" ? "0" : "24px");

    const handleLike = async () => {
        const newState = !effectiveLiked;
        setLiked(newState);
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
    };

    return (
        <div style={{ marginTop: layoutMetrics.winW >= 768 ? "-1rem" : "0", paddingBottom: layoutMetrics.winW < 768 ? "1rem" : "6rem" }}>
            <div className="desktop-title-row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", marginTop: "-0.5rem", gap: "1rem" }}>
                <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2 }}>{work.title}</h1>
                <button
                    onClick={handleLike}
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
                <div className="fluid-tabs-container">
                    {([
                        { key: "original", label: "Original" },
                        { key: "canvas", label: "Canvas Prints" },
                        { key: "paper", label: "Paper Prints" },
                    ] as const).map(({ key, label }) => {
                        const isActive = resolvedPurchaseType === key;
                        const unavailableForCountry =
                            key === "canvas"
                                ? !hasCanvasOffers
                                : key === "paper"
                                  ? !hasPaperOffers
                                  : false;
                        return (
                            <button
                                key={key}
                                className={`fluid-tab ${isActive ? "active" : ""}`}
                                onClick={() => updateRouteState({ view: key })}
                                style={unavailableForCountry ? { opacity: 0.72 } : undefined}
                                title={
                                    unavailableForCountry && key !== "original"
                                        ? `This print medium is not currently baked for ${activeCountryCode}.`
                                        : undefined
                                }
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
                    <div className="purchase-card-content" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                        {resolvedPurchaseType === "original" ? (
                            <>
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
                                                <p className="info-badge-desc">
                                                    Gallery-standard shipping method · Reinforced tube with acid-free tissue · Worldwide delivery
                                                </p>
                                            </div>
                                        </div>

                                        <div style={{
                                            backgroundColor: "#FFF8F0",
                                            borderLeft: "3px solid #D4A574",
                                            borderRadius: "6px",
                                            padding: "0.85rem 1rem",
                                        }}>
                                            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "0.68rem", fontWeight: 600, color: "var(--color-charcoal)", marginBottom: "0.2rem" }}>Flat crate available on request</p>
                                            <p style={{ margin: 0, fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "var(--color-charcoal-mid)", lineHeight: 1.5 }}>
                                                Custom crates from <span className="font-price font-medium">{convertPrice(1000)}</span>+. Contact us for details.
                                            </p>
                                        </div>
                                    </>
                                )}

                                {work.original_status !== "available" && STATUS_BADGE[work.original_status as keyof typeof STATUS_BADGE] && (() => {
                                    const s = STATUS_BADGE[work.original_status as keyof typeof STATUS_BADGE]!;
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
                                    onClick={() => addItem({ id: String(work.id), slug: String(work.id), title: work.title, type: "original", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, imageUrl: getImageUrl(work.images?.[0], 'thumb') || undefined, price: work.original_price, size: work.size, finish: "Original" })}
                                    style={{ width: "100%", marginTop: "auto", opacity: work.original_status === "available" ? 1 : 0.6 }}
                                >
                                    {work.original_status === "available" ? "Add Original to Cart" : STATUS_BADGE[work.original_status as keyof typeof STATUS_BADGE]?.label || "Unavailable"}
                                </button>
                            </>
                        ) : <PrintConfigurator 
                            artworkId={work.id}
                            artworkTitle={work.title}
                            purchaseType={resolvedPurchaseType as "canvas" | "paper"}
                            units={units}
                            isSmall={isSmall}
                            onAddToCart={addItem}
                            imageGradientFrom={work.gradientFrom || "#ccc"}
                            imageGradientTo={work.gradientTo || "#fff"}
                            imageUrl={getImageUrl(work.images?.[0], 'thumb') || undefined}
                            hasHighResAsset={!!work.print_quality_url}
                            storefront={storefront}
                            storefrontLoading={storefrontLoading}
                            storefrontError={storefrontError}
                        /> }
                    </div>
                </div>
            </div>
        </div>
    );
}
