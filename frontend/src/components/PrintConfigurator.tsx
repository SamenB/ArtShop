"use client";

import React, { useState, useEffect } from "react";
import { getApiUrl, apiFetch, getImageUrl } from "@/utils";
import { usePreferences } from "@/context/PreferencesContext";

interface PrintConfiguratorProps {
    artworkId: number;
    artworkTitle: string;
    aspectRatio: string;
    userCountryCode: string;
    purchaseType: "canvas" | "paper";
    units: "cm" | "in";
    isSmall: boolean;
    onAddToCart: (item: any) => void;
    imageGradientFrom: string;
    imageGradientTo: string;
    imageUrl?: string;
    isLimited?: boolean;
    limitedQuantity?: number;
    hasHighResAsset?: boolean;
}

export default function PrintConfigurator({
    artworkId,
    artworkTitle,
    aspectRatio,
    userCountryCode,
    purchaseType,
    units,
    isSmall,
    onAddToCart,
    imageGradientFrom,
    imageGradientTo,
    imageUrl,
    isLimited = false,
    limitedQuantity,
    hasHighResAsset = false,
}: PrintConfiguratorProps) {
    const { convertPrice } = usePreferences();
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState<any>(null);
    
    // Canvas selections
    const [canvasFormat, setCanvasFormat] = useState<"rolled" | "framed">("rolled");
    const [canvasFrame, setCanvasFrame] = useState<string>("black");
    
    // Paper selections
    const [paperFrame, setPaperFrame] = useState<"rolled" | "framed">("rolled");

    const [selectedVariant, setSelectedVariant] = useState<any>(null);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [selectedShipping, setSelectedShipping] = useState<any>(null);
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);

    // Initial fetch options
    useEffect(() => {
        if (!userCountryCode || !aspectRatio) return;
        setLoading(true);
        apiFetch(`${getApiUrl()}/print-options/options?country=${userCountryCode}&aspect_ratio=${aspectRatio}`)
            .then(res => res.json())
            .then(data => setOptions(data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [userCountryCode, aspectRatio]);

    // Reset selection when changing tabs or options load
    useEffect(() => {
        if (!options) return;
        if (purchaseType === "canvas") {
            const types = options.canvas_prints?.types || [];
            const activeType = canvasFormat === "framed" ? types.find((t: any) => t.id === "floating_frame_canvas") : types.find((t: any) => t.id === "stretched_canvas");
            if (activeType?.variants?.length) {
                // Keep selected variant if it's in the new list, otherwise select first
                if (!selectedVariant || !activeType.variants.find((v: any) => v.sku === selectedVariant.sku)) {
                    setSelectedVariant(activeType.variants[0]);
                }
            }
        } else {
            const papers = options.paper_prints?.papers || [];
            if (papers.length > 0 && papers[0].variants?.length > 0) {
                if (!selectedVariant || !papers[0].variants.find((v: any) => v.sku === selectedVariant.sku)) {
                    setSelectedVariant(papers[0].variants[0]);
                }
            }
        }
    }, [purchaseType, options, canvasFormat]);

    // Fetch quote on variant/country change
    useEffect(() => {
        if (!selectedVariant || !userCountryCode) return;
        setQuotes([]);
        setSelectedShipping(null);
        apiFetch(`${getApiUrl()}/print-options/options/quote?sku=${selectedVariant.sku}&country=${userCountryCode}&attributes=${JSON.stringify(selectedVariant.attributes || {})}`)
            .then(res => res.json())
            .then(data => {
                if (data.shipping_options) {
                    setQuotes(data.shipping_options);
                    setSelectedShipping(data.shipping_options[0]);
                }
            })
            .catch(console.error);
    }, [selectedVariant, userCountryCode]);

    if (loading) return <div style={{ padding: "2rem", color: "var(--color-muted)", textAlign: "center" }}>Loading options...</div>;
    if (!options) return <div style={{ padding: "2rem", color: "var(--color-muted)", textAlign: "center" }}>Unavailable for your region.</div>;

    const currentVariants = purchaseType === "canvas" 
        ? ((options.canvas_prints?.types?.find((t: any) => t.id === (canvasFormat === "framed" ? "floating_frame_canvas" : "stretched_canvas"))?.variants) || [])
        : ((options.paper_prints?.papers?.[0]?.variants) || []);

    const isFramedCanvasAvailable = options.canvas_prints?.types?.some((t: any) => t.id === "floating_frame_canvas");

    return (
        <div className="print-configurator-inner">
            <div className="pc-header" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                        <p className="pc-title">Fine Art {purchaseType === "canvas" ? "Canvas" : "Paper"} Prints</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <p className="pc-subtitle">Printed & fulfilled by Prodigi · Shipped worldwide</p>
                            {hasHighResAsset && (
                                <span style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '3px',
                                    padding: '2px 6px',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    color: '#10B981',
                                    borderRadius: '4px',
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.02em'
                                }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Verified Full-Res
                                </span>
                            )}
                        </div>
                    </div>
                    {isLimited && (
                        <div style={{ 
                            background: 'linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)',
                            color: '#1a1a1a',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            boxShadow: '0 2px 8px rgba(212, 175, 55, 0.2)',
                            flexShrink: 0,
                            textAlign: 'center'
                        }}>
                            Limited Edition
                            {limitedQuantity && <div style={{ fontSize: '0.55rem', opacity: 0.8, marginTop: '1px' }}>1 of {limitedQuantity}</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* Canvas Formats */}
            {purchaseType === "canvas" && isFramedCanvasAvailable && (
                <div className="step-row">
                    <div className="step-label">
                        <span className="step-number">1</span>
                        <span className="step-text">Select Format</span>
                    </div>
                    <div className="step-select-wrap">
                        <button
                            className={`step-trigger ${openDropdown === "format" ? "open" : ""}`}
                            onClick={() => setOpenDropdown(openDropdown === "format" ? null : "format")}
                            type="button"
                        >
                            <span>{canvasFormat === "rolled" ? "Stretched Canvas" : "Framed Canvas"}</span>
                            <span className="step-chevron" />
                        </button>
                        <div className={`step-options ${openDropdown === "format" ? "open" : ""}`}>
                            <button
                                type="button"
                                className={`step-option ${canvasFormat === "rolled" ? "active" : ""}`}
                                onClick={() => { setCanvasFormat("rolled"); setOpenDropdown(null); }}
                            >
                                <span>Stretched Canvas</span>
                                <span className="opt-check" />
                            </button>
                            <button
                                type="button"
                                className={`step-option ${canvasFormat === "framed" ? "active" : ""}`}
                                onClick={() => { setCanvasFormat("framed"); setOpenDropdown(null); }}
                            >
                                <span>Framed Canvas</span>
                                <span className="opt-check" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Select Size */}
            {currentVariants.length > 0 && (
                <div className="step-row">
                    <div className="step-label">
                        <span className="step-number">{purchaseType === "canvas" && isFramedCanvasAvailable ? "2" : "1"}</span>
                        <span className="step-text">Select Size</span>
                    </div>
                    <div className="step-select-wrap">
                        <button
                            className={`step-trigger ${openDropdown === "size" ? "open" : ""}`}
                            onClick={() => setOpenDropdown(openDropdown === "size" ? null : "size")}
                            type="button"
                        >
                            <span>{selectedVariant ? (units === "cm" ? selectedVariant.size_cm : selectedVariant.size_in) : "Select..."}  —  <span className="font-price font-medium">{selectedVariant ? convertPrice(selectedVariant.retail_eur) : ""}</span></span>
                            <span className="step-chevron" />
                        </button>
                        <div className={`step-options ${openDropdown === "size" ? "open" : ""}`}>
                            {currentVariants.map((v: any) => (
                                <button
                                    key={v.sku}
                                    type="button"
                                    className={`step-option ${selectedVariant?.sku === v.sku ? "active" : ""}`}
                                    onClick={() => { setSelectedVariant(v); setOpenDropdown(null); }}
                                >
                                    <span>{units === "cm" ? v.size_cm : v.size_in}  —  <span className="font-price font-medium">{convertPrice(v.retail_eur)}</span></span>
                                    <span className="opt-check" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Select Frame Color (if framed canvas) */}
            {purchaseType === "canvas" && canvasFormat === "framed" && (
                <div className="step-row step-reveal">
                    <div className="step-label">
                        <span className="step-number">3</span>
                        <span className="step-text">Select Frame Color</span>
                    </div>
                    <div className="step-select-wrap">
                        <button
                            className={`step-trigger ${openDropdown === "frame-color" ? "open" : ""}`}
                            onClick={() => setOpenDropdown(openDropdown === "frame-color" ? null : "frame-color")}
                            type="button"
                        >
                            <span style={{ textTransform: "capitalize" }}>{canvasFrame} Frame</span>
                            <span className="step-chevron" />
                        </button>
                        <div className={`step-options ${openDropdown === "frame-color" ? "open" : ""}`}>
                            {["black", "white", "natural"].map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    className={`step-option ${canvasFrame === c ? "active" : ""}`}
                                    onClick={() => { setCanvasFrame(c); setOpenDropdown(null); }}
                                >
                                    <span style={{ textTransform: "capitalize" }}>{c} Frame</span>
                                    <span className="opt-check" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Shipping options */}
            {quotes.length > 0 && (
                <div className="step-row step-reveal">
                    <div className="step-label">
                        <span className="step-number">{purchaseType === "canvas" && canvasFormat === "framed" ? "4" : (purchaseType === "canvas" && isFramedCanvasAvailable ? "3" : "2")}</span>
                        <span className="step-text">Shipping Method</span>
                    </div>
                    <div className="step-select-wrap">
                        <button
                            className={`step-trigger ${openDropdown === "shipping" ? "open" : ""}`}
                            onClick={() => setOpenDropdown(openDropdown === "shipping" ? null : "shipping")}
                            type="button"
                        >
                            <span>{selectedShipping?.method} Delivery — <span className="font-price font-medium">{selectedShipping?.shipping_eur === 0 ? "Free" : convertPrice(selectedShipping?.shipping_eur)}</span></span>
                            <span className="step-chevron" />
                        </button>
                        <div className={`step-options ${openDropdown === "shipping" ? "open" : ""}`}>
                            {quotes.map(q => (
                                <button
                                    key={q.method}
                                    type="button"
                                    className={`step-option ${selectedShipping?.method === q.method ? "active" : ""}`}
                                    onClick={() => { setSelectedShipping(q); setOpenDropdown(null); }}
                                >
                                    <span>{q.method} Delivery — <span className="font-price font-medium">{q.shipping_eur === 0 ? "Free" : convertPrice(q.shipping_eur)}</span></span>
                                    <span className="opt-check" />
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="info-badge" style={{ marginTop: "1rem" }}>
                <div className="info-badge-content">
                    <p className="info-badge-title">Museum-Grade Materials</p>
                    <p className="info-badge-desc">
                        {purchaseType === "canvas" 
                            ? "400gsm cotton canvas · UV-resistant archival inks. " + (canvasFormat === "framed" ? "Premium floating frame · Ready to hang." : "Gallery wrapped.") 
                            : "Hahnemühle 310gsm Museum Paper · Shipped rolled in protective tube. Fade-resistant for 100+ years."}
                    </p>
                </div>
            </div>

            <div className="purchase-card-footer" style={{ 
                backgroundColor: "#F8F7F5", 
                margin: isSmall ? "1rem -1.25rem -2rem" : "1rem -2rem -2rem", 
                padding: isSmall ? "1.5rem 1.25rem" : "1.5rem 2rem", 
                borderRadius: isSmall ? "0" : "0 0 24px 24px", 
                borderTop: "1px solid var(--color-border)", 
                display: "flex", alignItems: "center", justifyContent: "space-between" 
            }}>
                <div>
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)", margin: "0 0 2px" }}>Total</p>
                    <span className="font-price" style={{ fontSize: "1.75rem", fontWeight: 600, color: "var(--color-charcoal)", letterSpacing: "-0.03em" }}>
                        {selectedShipping ? convertPrice(selectedShipping.total_eur) : (selectedVariant ? convertPrice(selectedVariant.retail_eur) : "...")}
                    </span>
                </div>
                <button
                    className="premium-cta-btn"
                    disabled={!selectedShipping}
                    onClick={() => onAddToCart({
                        id: `${artworkId}-${purchaseType}-${selectedVariant.sku}-${selectedShipping.method}`,
                        slug: String(artworkId),
                        title: artworkTitle,
                        type: "print",
                        imageGradientFrom: imageGradientFrom,
                        imageGradientTo: imageGradientTo,
                        imageUrl: imageUrl,
                        price: selectedShipping.total_eur,
                        finish: purchaseType === "canvas" ? (canvasFormat === "framed" ? `Framed Canvas (${canvasFrame})` : "Stretched Canvas") : "Fine Art Paper Print",
                        size: units === "cm" ? selectedVariant.size_cm : selectedVariant.size_in,
                        prodigi_sku: selectedVariant.sku,
                        prodigi_attributes: { ...selectedVariant.attributes, color: canvasFrame },
                        prodigi_shipping_method: selectedShipping.method,
                        prodigi_wholesale_eur: selectedShipping.product_wholesale_eur,
                        prodigi_shipping_eur: selectedShipping.shipping_eur,
                        prodigi_retail_eur: selectedShipping.total_eur
                    })}
                >
                    Add to Cart
                </button>
            </div>
        </div>
    );
}
