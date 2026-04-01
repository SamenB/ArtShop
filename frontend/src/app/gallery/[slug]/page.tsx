"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";
import { useCart } from "@/context/CartContext";
import Lightbox from "@/components/Lightbox";
import { getApiUrl, getImageUrl } from "@/utils";

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
    // UI fallbacks
    aspect_ratio?: string;
    gradientFrom?: string;
    gradientTo?: string;
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
    const [finish, setFinish] = useState<"Rolled" | "Framed" | "Stretched">("Rolled");
    const [zoomPoint, setZoomPoint] = useState<{ x: number; y: number } | null>(null);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);

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

    const artRatio = work.aspect_ratio ? eval(work.aspect_ratio.replace("/", "/")) : 0.8;
    const currentPrintPrice = Math.round(globalPrintPrice * selectedPrint.multiplier);

    return (
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "2rem 2rem 6rem" }}>
            {work.images && work.images.length > 0 && (
                <link rel="preload" as="image" href={getImageUrl(work.images[selectedImageIndex], 'original')} />
            )}
            <Link href="/shop" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--font-sans)", fontSize: "0.75rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-muted)", textDecoration: "none", marginBottom: "2rem" }}>← Back to Shop</Link>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "4rem", alignItems: "start" }}>
                <div className="relative md:sticky md:top-[100px]">
                    <div style={{
                        aspectRatio: work.aspect_ratio || "4/5",
                        backgroundImage: (work.images && work.images.length > 0) 
                            ? `url(${getImageUrl(work.images[selectedImageIndex], 'original')})` 
                            : `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                        backgroundSize: "cover", backgroundPosition: "center",
                        position: "relative", boxShadow: "0 16px 40px rgba(0,0,0,0.12)", borderRadius: "4px",
                    }}>
                        {STATUS_BADGE[work.original_status] && (
                            <span style={{ position: "absolute", top: "1rem", left: "1rem", padding: "0.25rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-sans)", color: "#fff", backgroundColor: STATUS_BADGE[work.original_status]!.bg, borderRadius: "4px" }}>
                                {STATUS_BADGE[work.original_status]!.label}
                            </span>
                        )}
                    </div>
                    {work.images && work.images.length > 1 && (
                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
                            {work.images.map((img, idx) => (
                                <button key={idx} onClick={() => setSelectedImageIndex(idx)} style={{ width: "70px", height: "70px", padding: 0, border: selectedImageIndex === idx ? "2px solid var(--color-charcoal)" : "2px solid transparent", backgroundImage: `url(${getImageUrl(img, 'thumb')})`, backgroundSize: "cover", backgroundPosition: "center", cursor: "pointer", borderRadius: "4px", opacity: selectedImageIndex === idx ? 1 : 0.6 }} />
                            ))}
                        </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "1rem" }}>
                        <button onClick={() => setFullSizeOpen(true)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-muted)" }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 1h4v4M5 13H1V9M13 1L8 6M1 13l5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            View full size
                        </button>
                    </div>
                </div>

                <div>
                    <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(2rem, 4vw, 2.75rem)", fontWeight: 600, fontStyle: "italic", color: "var(--color-charcoal)", lineHeight: 1.1, marginBottom: "1.5rem" }}>{work.title}</h1>
                    
                    <div style={{ position: "relative", marginTop: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", marginLeft: "1rem" }}>
                            {(["original", "print"] as const).map(type => (
                                <button key={type} onClick={() => setPurchaseType(type)} style={{ padding: "0.75rem 1.5rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", backgroundColor: purchaseType === type ? "#fff" : "#F1F5F9", color: purchaseType === type ? "var(--color-charcoal)" : "var(--color-muted)", border: "1px solid var(--color-border)", borderBottom: purchaseType === type ? "1px solid #fff" : "1px solid var(--color-border)", borderRadius: "8px 8px 0 0", cursor: "pointer", position: "relative", zIndex: purchaseType === type ? 2 : 1, marginBottom: "-1px", minWidth: "120px" }}>
                                    {type === "original" ? "Original" : "Fine Art Print"}
                                </button>
                            ))}
                        </div>

                        <div style={{ backgroundColor: "#fff", padding: "2rem", borderRadius: "12px", borderTopLeftRadius: purchaseType === "original" ? "0px" : "12px", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", display: "flex", flexDirection: "column", gap: "2rem", border: "1px solid var(--color-border)", position: "relative", zIndex: 1 }}>
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
                                        style={{ padding: "1.25rem", backgroundColor: work.original_status === "available" ? "var(--color-charcoal)" : "#b0b0b0", color: "#fff", border: "none", borderRadius: "4px", cursor: work.original_status === "available" ? "pointer" : "not-allowed", fontWeight: 600, fontSize: "1rem" }}
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
                                                <button key={ps.labelCm} onClick={() => setSelectedPrint(ps)} style={{ padding: "0.75rem 0.5rem", border: `1px solid ${selectedPrint === ps ? "var(--color-charcoal)" : "var(--color-border-dark)"}`, borderRadius: "6px", cursor: "pointer" }}>
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
                                                <button key={f} onClick={() => setFinish(f)} style={{ padding: "1rem", border: `1px solid ${finish === f ? "var(--color-charcoal)" : "var(--color-border-dark)"}`, backgroundColor: finish === f ? "rgba(26,26,24,0.02)" : "transparent", borderRadius: "6px", cursor: "pointer" }}>
                                                    <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500 }}>{f}</span>
                                                    <span style={{ display: "block", fontSize: "0.7rem", color: "var(--color-muted)" }}>{f === "Rolled" ? "In tube" : `+ ${convertPrice(100)}`}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{ backgroundColor: "#F1F5F9", margin: "1rem -2rem -2rem", padding: "2rem", borderRadius: "0 0 12px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span style={{ fontFamily: "var(--font-serif)", fontSize: "1.75rem", fontWeight: 600 }}>{convertPrice(currentPrintPrice + (finish === "Framed" ? 100 : 0))}</span>
                                        <button onClick={() => addItem({ id: `${work.id}-print-${finish}-${selectedPrint.labelCm}`, slug: String(work.id), title: work.title, type: "print", imageGradientFrom: work.gradientFrom!, imageGradientTo: work.gradientTo!, price: currentPrintPrice + (finish === "Framed" ? 100 : 0), finish, size: units === "cm" ? selectedPrint.labelCm : selectedPrint.labelIn })} style={{ padding: "1rem 2rem", backgroundColor: "#334C75", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600 }}>Add to Cart</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
    );
}
