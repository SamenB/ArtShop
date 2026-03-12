"use client";
// Shop — CSS Grid, natural aspect-ratios, no broken max-height tricks.
// Sidebar hidden on mobile. Hover only on image.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface Product {
    id: string; title: string; collection: string; year: number;
    medium: string; size: string; sizeCategory: "Small" | "Medium" | "Large";
    aspectRatio: string; price: number; originalStatus: OriginalStatus;
    tags: string[]; gradientFrom: string; gradientTo: string;
}

const PRODUCTS: Product[] = [
    { id: "morning-tide", title: "Morning Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", sizeCategory: "Medium", aspectRatio: "4/5", price: 1800, originalStatus: "available", tags: ["Seascape", "Light"], gradientFrom: "#6A9FB5", gradientTo: "#3A6E85" },
    { id: "deep-blue", title: "Deep Blue", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "16 × 20 in", sizeCategory: "Small", aspectRatio: "4/5", price: 1200, originalStatus: "sold", tags: ["Seascape"], gradientFrom: "#2A5F7A", gradientTo: "#1A3A55" },
    { id: "coastal-evening", title: "Coastal Evening", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: "12 × 16 in", sizeCategory: "Small", aspectRatio: "3/4", price: 750, originalStatus: "reserved", tags: ["Seascape", "Light"], gradientFrom: "#8A7AB5", gradientTo: "#4A5A8A" },
    { id: "still-waters", title: "Still Waters", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "30 × 40 in", sizeCategory: "Large", aspectRatio: "3/4", price: 2800, originalStatus: "available", tags: ["Seascape"], gradientFrom: "#5A8A8A", gradientTo: "#2A5A5A" },
    { id: "horizon-glow", title: "Horizon Glow", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/4", price: 1600, originalStatus: "not_for_sale", tags: ["Seascape", "Light"], gradientFrom: "#D4905A", gradientTo: "#8A5030" },
    { id: "morning-rush", title: "Morning Rush", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/4", price: 1500, originalStatus: "on_exhibition", tags: ["Urban"], gradientFrom: "#8A7A6A", gradientTo: "#5A4A3A" },
    { id: "city-lights", title: "City Lights", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "24 × 36 in", sizeCategory: "Large", aspectRatio: "2/3", price: 2100, originalStatus: "archived", tags: ["Urban", "Light"], gradientFrom: "#3A3A5A", gradientTo: "#1A1A3A" },
    { id: "rainy-street", title: "Rainy Street", collection: "Urban Studies", year: 2023, medium: "Watercolor", size: "14 × 18 in", sizeCategory: "Small", aspectRatio: "7/9", price: 680, originalStatus: "digital", tags: ["Urban"], gradientFrom: "#6A7A8A", gradientTo: "#3A4A5A" },
    { id: "ethereal-dreams", title: "Ethereal Dreams", collection: "Golden Fields", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", sizeCategory: "Medium", aspectRatio: "4/5", price: 1200, originalStatus: "available", tags: ["Landscape", "Light"], gradientFrom: "#C4B882", gradientTo: "#8A8040" },
    { id: "golden-hour", title: "Golden Hour", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "30 × 40 in", sizeCategory: "Large", aspectRatio: "3/4", price: 2100, originalStatus: "sold", tags: ["Landscape"], gradientFrom: "#D4B86A", gradientTo: "#C8965A" },
    { id: "summer-meadow", title: "Summer Meadow", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "18 × 24 in", sizeCategory: "Medium", aspectRatio: "3/4", price: 1350, originalStatus: "available", tags: ["Landscape"], gradientFrom: "#B8C870", gradientTo: "#8A9840" },
    { id: "inner-light", title: "Inner Light", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "16 × 20 in", sizeCategory: "Small", aspectRatio: "4/5", price: 1600, originalStatus: "not_for_sale", tags: ["Portrait"], gradientFrom: "#C4A882", gradientTo: "#8A6840" },
    { id: "contemplation", title: "Contemplation", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/6", price: 1900, originalStatus: "available", tags: ["Portrait"], gradientFrom: "#9A8870", gradientTo: "#6A5840" },
];

const ALL_TAGS = Array.from(new Set(PRODUCTS.flatMap(p => p.tags)));
const ALL_YEARS = Array.from(new Set(PRODUCTS.map(p => String(p.year)))).sort((a, b) => +b - +a);
const ALL_MEDIUMS = Array.from(new Set(PRODUCTS.map(p => p.medium)));
const ALL_SIZES = ["Small", "Medium", "Large"] as const;
const PRICE_RANGES = [{ label: "Any Price", min: 0, max: Infinity }, { label: "Under $1k", min: 0, max: 999 }, { label: "$1k–$2k", min: 1000, max: 2000 }, { label: "Over $2k", min: 2001, max: Infinity }];
const SORT_OPTIONS = [{ label: "Newest", fn: (a: Product, b: Product) => b.year - a.year }, { label: "Price ↑", fn: (a: Product, b: Product) => a.price - b.price }, { label: "Price ↓", fn: (a: Product, b: Product) => b.price - a.price }];

function ProductCard({ product }: { product: Product }) {
    return (
        <div className="art-card"
            style={{ display: "flex", flexDirection: "column", width: "100%", padding: 0 }}>

            <Link href={`/gallery/${product.id}`} style={{ textDecoration: "none", display: "block", width: "100%" }}>
                {/* Контейнер для обрезки (crop) при наведении */}
                <div className="art-card-container" style={{
                    width: "100%",
                    aspectRatio: product.aspectRatio,
                    borderRadius: "2px",
                    overflow: "hidden",
                }}>
                    <div className="art-card-inner" style={{
                        width: "100%", height: "100%",
                        background: `linear-gradient(160deg, ${product.gradientFrom} 0%, ${product.gradientTo} 100%)`,
                        position: "relative",
                    }}>
                    </div>
                </div>
            </Link>

            {/* Compact text — same column width as image, quiet and unobtrusive */}
            {/* Fixed-height text block — ensures painting centers align across the row */}
            <div style={{ paddingTop: "0.75rem", height: "5.5rem", display: "flex", flexDirection: "column", gap: "0.1rem" }}>
                <p style={{
                    fontFamily: "var(--font-serif)", fontSize: "1.05rem",
                    fontWeight: 500, fontStyle: "italic",
                    color: "#555", marginBottom: "0.1rem",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: 1.35, paddingBottom: "0.15rem"
                }}>{product.title}</p>
                <p style={{
                    fontFamily: "var(--font-sans)", fontSize: "0.8rem",
                    fontWeight: 400, color: "#aaa",
                    letterSpacing: "0.01em", marginBottom: "0.05rem", lineHeight: 1.3,
                }}>{product.size.replace(/([\d.]+) × ([\d.]+) in/, (m, w, h) => `${m} | ${Math.round(Number(w) * 2.54)} × ${Math.round(Number(h) * 2.54)} cm`)}</p>

                <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 400, color: "#888", lineHeight: 1.4 }}>
                    Original {product.medium}
                    {product.originalStatus === "available" && <> — <span style={{ color: "#555", fontWeight: 600 }}>${product.price.toLocaleString()}</span></>}
                    {product.originalStatus === "sold" && <> — <span style={{ color: "#D48A8A", fontWeight: 600 }}>SOLD</span></>}
                    {product.originalStatus === "reserved" && <> — <span style={{ color: "#C8B478", fontWeight: 600 }}>RESERVED</span></>}
                    {product.originalStatus === "not_for_sale" && <> — <span style={{ color: "#b0b0b0", fontWeight: 500, fontStyle: "italic" }}>Not for Sale</span></>}
                    {product.originalStatus === "on_exhibition" && <> — <span style={{ color: "#8AACC8", fontWeight: 500, fontStyle: "italic" }}>On Exhibition</span></>}
                    {product.originalStatus === "archived" && <> — <span style={{ color: "#b0b0b0", fontWeight: 500, fontStyle: "italic" }}>Archived</span></>}
                    {product.originalStatus === "digital" && <> — <span style={{ color: "#B8A0D8", fontWeight: 600 }}>Digital</span></>}
                </p>
            </div>
        </div>
    );
}

// Proper checkbox filter item (desktop sidebar)
function FilterItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <label style={{ display: "flex", alignItems: "center", gap: "0.55rem", cursor: "pointer", padding: "0.3rem 0", userSelect: "none" as const }}>
            {/* Custom checkbox */}
            <span style={{
                width: "14px", height: "14px", flexShrink: 0,
                border: `1.5px solid ${active ? "#1a1a18" : "rgba(26,26,24,0.25)"}`,
                borderRadius: "2px",
                backgroundColor: active ? "#1a1a18" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s, border-color 0.15s",
            }}>
                {active && (
                    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </span>
            <span style={{
                fontFamily: "var(--font-sans)", fontSize: "0.78rem",
                fontWeight: active ? 500 : 300,
                color: active ? "#1a1a18" : "#7a7a78",
                transition: "color 0.15s",
                lineHeight: 1.4,
            }}>{label}</span>
            <input type="checkbox" checked={active} onChange={onClick}
                style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }} />
        </label>
    );
}

const FilterCheckbox = FilterItem;

// Sidebar section — clean accordion with SVG chevron
function SidebarSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: "1px solid rgba(26,26,24,0.09)" }}>
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "none", border: "none", padding: "0.85rem 0 0.55rem", cursor: "pointer",
                }}
            >
                <span style={{
                    fontFamily: "var(--font-sans)", fontSize: "0.62rem", fontWeight: 600,
                    letterSpacing: "0.16em", textTransform: "uppercase",
                    color: "#1a1a18",
                }}>{title}</span>
                {/* SVG chevron — no rotation trick, just swap path */}
                <svg
                    width="10" height="6" viewBox="0 0 10 6" fill="none"
                    style={{ transition: "transform 0.22s ease", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}
                >
                    <path d="M1 1L5 5L9 1" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
                <div style={{ overflow: "hidden" }}>
                    <div style={{ paddingBottom: "0.85rem", display: "flex", flexDirection: "column", gap: "0.05rem" }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function ShopPage() {
    const [activeTags, setActiveTags] = useState<string[]>([]);
    const [activeYears, setActiveYears] = useState<string[]>([]);
    const [activeMediums, setActiveMediums] = useState<string[]>([]);
    const [activeSizes, setActiveSizes] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState(0);
    const [availOnly, setAvailOnly] = useState(false);
    const [sortIdx, setSortIdx] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [cols, setCols] = useState(3);
    const [denseGrid, setDenseGrid] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("artshop_denseGrid");
        if (saved !== null) {
            setDenseGrid(saved === "true");
        } else {
            setDenseGrid(window.innerWidth < 768);
        }
    }, []);

    const handleSetDenseGrid = (val: boolean) => {
        setDenseGrid(val);
        localStorage.setItem("artshop_denseGrid", String(val));
    };

    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            setIsMobile(w < 768);
            setCols(w < 480 ? 1 : w < 768 ? 2 : w < 1200 ? 3 : 4);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const filtered = useMemo(() => {
        const r = PRICE_RANGES[priceRange];
        return PRODUCTS
            .filter(p =>
                (activeTags.length === 0 || activeTags.some(t => p.tags.includes(t))) &&
                (activeYears.length === 0 || activeYears.includes(String(p.year))) &&
                (activeMediums.length === 0 || activeMediums.includes(p.medium)) &&
                (activeSizes.length === 0 || activeSizes.includes(p.sizeCategory)) &&
                p.price >= r.min && p.price <= r.max &&
                (!availOnly || p.originalStatus === "available")
            )
            .sort(SORT_OPTIONS[sortIdx].fn);
    }, [activeTags, activeYears, activeMediums, activeSizes, priceRange, availOnly, sortIdx]);

    const afc = activeTags.length + activeYears.length + activeMediums.length + activeSizes.length + (priceRange !== 0 ? 1 : 0) + (availOnly ? 1 : 0);
    const clearAll = () => { setActiveTags([]); setActiveYears([]); setActiveMediums([]); setActiveSizes([]); setPriceRange(0); setAvailOnly(false); };

    const toggleFilter = (setState: React.Dispatch<React.SetStateAction<any[]>>, val: string) => {
        setState(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
    };

    const filtersJSX = (<>
        <SidebarSection title="Collections">{ALL_TAGS.map(t => <FilterCheckbox key={t} label={t} active={activeTags.includes(t)} onClick={() => toggleFilter(setActiveTags, t)} />)}</SidebarSection>
        <SidebarSection title="Price">{PRICE_RANGES.map((r, i) => <FilterCheckbox key={r.label} label={r.label} active={priceRange === i} onClick={() => setPriceRange(i)} />)}</SidebarSection>
        <SidebarSection title="Size">{ALL_SIZES.map(s => <FilterCheckbox key={s} label={s} active={activeSizes.includes(s)} onClick={() => toggleFilter(setActiveSizes, s)} />)}</SidebarSection>
        <SidebarSection title="Year">{ALL_YEARS.map(y => <FilterCheckbox key={y} label={y} active={activeYears.includes(y)} onClick={() => toggleFilter(setActiveYears, y)} />)}</SidebarSection>
        <SidebarSection title="Medium">{ALL_MEDIUMS.map(m => <FilterCheckbox key={m} label={m} active={activeMediums.includes(m)} onClick={() => toggleFilter(setActiveMediums, m)} />)}</SidebarSection>
        <SidebarSection title="Availability">
            <FilterCheckbox label="Available only" active={availOnly} onClick={() => setAvailOnly(p => !p)} />
        </SidebarSection>
    </>);

    return (
        <div style={{ backgroundColor: "#ffffff", color: "var(--color-charcoal)", minHeight: "100vh" }}>
            {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(26,26,24,0.75)", zIndex: 40 }} />}
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: "#ffffff", borderTop: "1px solid var(--color-border)", transform: drawerOpen ? "translateY(0)" : "translateY(100%)", transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1)", maxHeight: "85vh", overflowY: "auto" }}>
                <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(26,26,24,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, backgroundColor: "#ffffff", zIndex: 1 }}>
                    <div style={{ position: "absolute", top: "0.5rem", left: "50%", transform: "translateX(-50%)", width: "32px", height: "3px", borderRadius: "2px", backgroundColor: "rgba(26,26,24,0.12)" }} />
                    <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "0.5rem", color: "var(--color-charcoal)" }}>Filters</h3>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.5rem" }}>
                        {afc > 0 && <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 300, color: "var(--color-charcoal-mid)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(26,26,24,0.2)", paddingBottom: "1px", transition: "border-color 0.2s ease" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--color-charcoal)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(26,26,24,0.2)"}>Clear all</button>}
                        <button onClick={() => setDrawerOpen(false)} style={{ fontSize: "1.2rem", fontWeight: 300, color: "var(--color-charcoal-mid)", background: "none", border: "none", cursor: "pointer", minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>✕</button>
                    </div>
                </div>
                <div style={{ padding: "1.25rem 1.5rem 1rem" }}>{filtersJSX}</div>
                <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid rgba(26,26,24,0.06)", position: "sticky", bottom: 0, backgroundColor: "#ffffff" }}>
                    <button onClick={() => setDrawerOpen(false)} style={{ width: "100%", padding: "0.85rem", backgroundColor: "var(--color-charcoal)", color: "var(--color-cream)", borderRadius: "2px", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", minHeight: "48px", transition: "opacity 0.2s ease" }} onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"} onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}>
                        Show {filtered.length} work{filtered.length !== 1 ? "s" : ""}
                    </button>
                </div>
            </div>

            {/* Full-width outer wrapper — sidebar touches left edge */}
            <div style={{ display: "flex", gap: "0", alignItems: "flex-start" }}>
                {!isMobile && (
                    <aside style={{
                        width: "200px", minWidth: "200px", flexShrink: 0,
                        // No sticky — scrolls in sync with the works
                        paddingLeft: "2.5rem",
                        paddingRight: "1.5rem",
                        paddingTop: "1rem",
                        borderRight: "1px solid rgba(26,26,24,0.07)",
                    }}>
                        {afc > 0 && (
                            <button onClick={clearAll} style={{
                                fontFamily: "var(--font-sans)", fontSize: "0.6rem", fontWeight: 500,
                                letterSpacing: "0.1em", textTransform: "uppercase",
                                color: "#999", background: "none", border: "none",
                                cursor: "pointer", padding: "0 0 0.75rem", display: "block",
                                transition: "color 0.15s",
                            }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#1a1a18")}
                                onMouseLeave={e => (e.currentTarget.style.color = "#999")}
                            >Clear all</button>
                        )}
                        {filtersJSX}
                    </aside>
                )}
                <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "1rem 1rem 6rem 1rem" : "1rem 2.5rem 6rem 2rem" }}>
                    {/* Top bar: count + sort */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: isMobile ? "nowrap" : "wrap", gap: isMobile ? "0.75rem" : "1rem", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? "5px" : 0, scrollbarWidth: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-muted)", whiteSpace: "nowrap" }}>{filtered.length} works</span>
                            {isMobile && (
                                <button
                                    onClick={() => setDrawerOpen(true)}
                                    style={{
                                        display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.8rem",
                                        backgroundColor: afc > 0 ? "rgba(26,26,24,0.03)" : "transparent",
                                        color: "var(--color-charcoal)",
                                        border: "1px solid", borderColor: afc > 0 ? "var(--color-charcoal)" : "rgba(26,26,24,0.12)",
                                        fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase",
                                        cursor: "pointer", borderRadius: "2px", transition: "all 0.2s ease"
                                    }}
                                >
                                    Filters{afc > 0 ? ` (${afc})` : ""}
                                </button>
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--color-muted)", display: isMobile ? "none" : "inline" }}>View</span>
                                <div style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                    <button
                                        onClick={() => handleSetDenseGrid(false)}
                                        title="Normal Grid"
                                        style={{
                                            display: "flex", alignItems: "center", gap: "6px",
                                            padding: "4px 8px",
                                            backgroundColor: !denseGrid ? "#ffffff" : "transparent",
                                            color: !denseGrid ? "var(--color-charcoal)" : "var(--color-muted)",
                                            border: "none", borderRadius: "4px",
                                            boxShadow: !denseGrid ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                            cursor: "pointer", transition: "all 0.2s"
                                        }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            <rect x="2" y="2" width="5" height="5" rx="1" />
                                            <rect x="9" y="2" width="5" height="5" rx="1" />
                                            <rect x="2" y="9" width="5" height="5" rx="1" />
                                            <rect x="9" y="9" width="5" height="5" rx="1" />
                                        </svg>
                                        {!isMobile && <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500 }}>Normal</span>}
                                    </button>
                                    <button
                                        onClick={() => handleSetDenseGrid(true)}
                                        title="Dense Grid"
                                        style={{
                                            display: "flex", alignItems: "center", gap: "6px",
                                            padding: "4px 8px",
                                            backgroundColor: denseGrid ? "#ffffff" : "transparent",
                                            color: denseGrid ? "var(--color-charcoal)" : "var(--color-muted)",
                                            border: "none", borderRadius: "4px",
                                            boxShadow: denseGrid ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                            cursor: "pointer", transition: "all 0.2s"
                                        }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            <rect x="1" y="1" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                            <rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" />
                                        </svg>
                                        {!isMobile && <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500 }}>Dense</span>}
                                    </button>
                                </div>
                            </div>
                            <div style={{ position: "relative" }}>
                                <select
                                    value={sortIdx}
                                    onChange={(e) => setSortIdx(Number(e.target.value))}
                                    style={{
                                        appearance: "none",
                                        backgroundColor: "transparent",
                                        border: "1px solid rgba(26,26,24,0.2)",
                                        borderRadius: "20px",
                                        padding: "0.4rem 2.2rem 0.4rem 1rem",
                                        fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-charcoal)",
                                        cursor: "pointer", outline: "none"
                                    }}
                                >
                                    {SORT_OPTIONS.map((s, i) => (
                                        <option key={i} value={i}>{s.label}</option>
                                    ))}
                                </select>
                                <span style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.65rem", color: "var(--color-charcoal)", fontWeight: 300 }}>∨</span>
                            </div>
                        </div>
                    </div>

                    {filtered.length > 0 ? (
                        <div className={`art-grid ${denseGrid ? "dense" : ""}`} style={{
                            display: "grid",
                            gridTemplateColumns: denseGrid ? "repeat(auto-fit, 160px)" : "repeat(auto-fit, 320px)",
                            justifyContent: "space-evenly",
                            gap: denseGrid ? "2rem 90px" : "4rem 180px",
                            alignItems: "center",
                        }}>
                            {filtered.map(p => (
                                <ProductCard key={p.id} product={p} />
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "5rem 1rem" }}>
                            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.2rem", color: "var(--color-muted)", marginBottom: "1.25rem" }}>No works match these filters</p>
                            <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Clear all filters</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
