"use client";
// Shop — CSS Grid, natural aspect-ratios, no broken max-height tricks.
// Sidebar hidden on mobile. Hover only on image.

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";

interface Product {
    id: string; title: string; collection: string; year: number;
    medium: string; size: string; sizeCategory: "Small" | "Medium" | "Large";
    aspectRatio: string; price: number; available: boolean;
    tags: string[]; gradientFrom: string; gradientTo: string;
}

const PRODUCTS: Product[] = [
    { id: "morning-tide", title: "Morning Tide", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", sizeCategory: "Medium", aspectRatio: "4/5", price: 1800, available: true, tags: ["Seascape", "Light"], gradientFrom: "#6A9FB5", gradientTo: "#3A6E85" },
    { id: "deep-blue", title: "Deep Blue", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "16 × 20 in", sizeCategory: "Small", aspectRatio: "4/5", price: 1200, available: true, tags: ["Seascape"], gradientFrom: "#2A5F7A", gradientTo: "#1A3A55" },
    { id: "coastal-evening", title: "Coastal Evening", collection: "Sea Cycles 2024", year: 2024, medium: "Watercolor", size: "12 × 16 in", sizeCategory: "Small", aspectRatio: "3/4", price: 750, available: false, tags: ["Seascape", "Light"], gradientFrom: "#8A7AB5", gradientTo: "#4A5A8A" },
    { id: "still-waters", title: "Still Waters", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "30 × 40 in", sizeCategory: "Large", aspectRatio: "3/4", price: 2800, available: true, tags: ["Seascape"], gradientFrom: "#5A8A8A", gradientTo: "#2A5A5A" },
    { id: "horizon-glow", title: "Horizon Glow", collection: "Sea Cycles 2024", year: 2024, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/4", price: 1600, available: true, tags: ["Seascape", "Light"], gradientFrom: "#D4905A", gradientTo: "#8A5030" },
    { id: "morning-rush", title: "Morning Rush", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/4", price: 1500, available: true, tags: ["Urban"], gradientFrom: "#8A7A6A", gradientTo: "#5A4A3A" },
    { id: "city-lights", title: "City Lights", collection: "Urban Studies", year: 2023, medium: "Oil on Canvas", size: "24 × 36 in", sizeCategory: "Large", aspectRatio: "2/3", price: 2100, available: false, tags: ["Urban", "Light"], gradientFrom: "#3A3A5A", gradientTo: "#1A1A3A" },
    { id: "rainy-street", title: "Rainy Street", collection: "Urban Studies", year: 2023, medium: "Watercolor", size: "14 × 18 in", sizeCategory: "Small", aspectRatio: "7/9", price: 680, available: true, tags: ["Urban"], gradientFrom: "#6A7A8A", gradientTo: "#3A4A5A" },
    { id: "ethereal-dreams", title: "Ethereal Dreams", collection: "Golden Fields", year: 2024, medium: "Oil on Canvas", size: "24 × 30 in", sizeCategory: "Medium", aspectRatio: "4/5", price: 1200, available: true, tags: ["Landscape", "Light"], gradientFrom: "#C4B882", gradientTo: "#8A8040" },
    { id: "golden-hour", title: "Golden Hour", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "30 × 40 in", sizeCategory: "Large", aspectRatio: "3/4", price: 2100, available: false, tags: ["Landscape"], gradientFrom: "#D4B86A", gradientTo: "#C8965A" },
    { id: "summer-meadow", title: "Summer Meadow", collection: "Golden Fields", year: 2023, medium: "Oil on Canvas", size: "18 × 24 in", sizeCategory: "Medium", aspectRatio: "3/4", price: 1350, available: true, tags: ["Landscape"], gradientFrom: "#B8C870", gradientTo: "#8A9840" },
    { id: "inner-light", title: "Inner Light", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "16 × 20 in", sizeCategory: "Small", aspectRatio: "4/5", price: 1600, available: true, tags: ["Portrait"], gradientFrom: "#C4A882", gradientTo: "#8A6840" },
    { id: "contemplation", title: "Contemplation", collection: "Portraits", year: 2022, medium: "Oil on Canvas", size: "20 × 24 in", sizeCategory: "Medium", aspectRatio: "5/6", price: 1900, available: true, tags: ["Portrait"], gradientFrom: "#9A8870", gradientTo: "#6A5840" },
];

const ALL_TAGS = ["All", ...Array.from(new Set(PRODUCTS.flatMap(p => p.tags)))];
const ALL_YEARS = ["All", ...Array.from(new Set(PRODUCTS.map(p => String(p.year)))).sort((a, b) => +b - +a)];
const ALL_MEDIUMS = ["All", ...Array.from(new Set(PRODUCTS.map(p => p.medium)))];
const ALL_SIZES = ["All", "Small", "Medium", "Large"] as const;
const PRICE_RANGES = [{ label: "Any Price", min: 0, max: Infinity }, { label: "Under $1k", min: 0, max: 999 }, { label: "$1k–$2k", min: 1000, max: 2000 }, { label: "Over $2k", min: 2001, max: Infinity }];
const SORT_OPTIONS = [{ label: "Newest", fn: (a: Product, b: Product) => b.year - a.year }, { label: "Price ↑", fn: (a: Product, b: Product) => a.price - b.price }, { label: "Price ↓", fn: (a: Product, b: Product) => b.price - a.price }];

function ProductCard({ product }: { product: Product }) {
    const [hovered, setHovered] = useState(false);

    return (
        <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
            style={{ display: "flex", flexDirection: "column", width: "100%" }}>
            <Link href={`/gallery/${product.id}`} style={{ textDecoration: "none", display: "block", width: "100%" }}>
                {/* OUTER — handles soft shadow + lift */}
                <div style={{
                    width: "100%",
                    aspectRatio: product.aspectRatio,
                    borderRadius: "3px",
                    // Punchy double shadow — always clearly visible
                    boxShadow: hovered
                        ? "0 20px 60px rgba(0,0,0,0.45), 0 6px 16px rgba(0,0,0,0.22)"
                        : "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14)",
                    transform: hovered ? "translateY(-4px)" : "translateY(0)",
                    transition: "transform 0.4s ease-out, box-shadow 0.4s ease-out",
                }}>
                    {/* INNER — clips the zoom animation */}
                    <div style={{
                        width: "100%", height: "100%",
                        overflow: "hidden",
                        borderRadius: "2px",
                    }}>
                        <div style={{
                            width: "100%", height: "100%",
                            background: `linear-gradient(160deg, ${product.gradientFrom} 0%, ${product.gradientTo} 100%)`,
                            transform: hovered ? "scale(1.02)" : "scale(1)",
                            transition: "transform 0.5s ease",
                        }} />
                    </div>
                </div>
            </Link>

            {/* Fixed-height text block: same height for ALL cards → align-items:center on grid
                aligns painting centers on one axis regardless of SOLD/available text length */}
            <div style={{ paddingTop: "0.8rem", minHeight: "6rem" }}>
                <p style={{
                    fontFamily: "var(--font-serif)", fontSize: "1.1rem",
                    fontWeight: 400, fontStyle: "italic",
                    color: "var(--color-charcoal)", marginBottom: "0.15rem",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{product.title}</p>
                <p style={{
                    fontFamily: "var(--font-sans)", fontSize: "0.65rem",
                    fontWeight: 300, color: "var(--color-muted)",
                    marginBottom: "0.35rem",
                }}>{product.size}</p>

                {product.available ? (
                    <>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-charcoal)", marginBottom: "0.1rem" }}>
                            Original {product.medium} ${product.price.toLocaleString()}
                        </p>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-charcoal-mid)" }}>
                            Textured Replicas starting at ${(product.price * 0.15).toFixed(0)}
                        </p>
                    </>
                ) : (
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 600, color: "var(--color-sold)", letterSpacing: "0.05em" }}>
                        SOLD <span style={{ fontWeight: 300, color: "var(--color-charcoal-mid)" }}>— {product.medium}</span>
                    </p>
                )}
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
    const [activeTag, setActiveTag] = useState("All");
    const [activeYear, setActiveYear] = useState("All");
    const [activeMedium, setActiveMedium] = useState("All");
    const [activeSize, setActiveSize] = useState("All");
    const [priceRange, setPriceRange] = useState(0);
    const [availOnly, setAvailOnly] = useState(false);
    const [sortIdx, setSortIdx] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [cols, setCols] = useState(3);

    useEffect(() => {
        const update = () => {
            const w = window.innerWidth;
            setIsMobile(w < 768);
            setCols(w < 480 ? 2 : w < 768 ? 2 : w < 1200 ? 3 : 4);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    const filtered = useMemo(() => {
        const r = PRICE_RANGES[priceRange];
        return PRODUCTS
            .filter(p => (activeTag === "All" || p.tags.includes(activeTag)) && (activeYear === "All" || String(p.year) === activeYear) && (activeMedium === "All" || p.medium === activeMedium) && (activeSize === "All" || p.sizeCategory === activeSize) && p.price >= r.min && p.price <= r.max && (!availOnly || p.available))
            .sort(SORT_OPTIONS[sortIdx].fn);
    }, [activeTag, activeYear, activeMedium, activeSize, priceRange, availOnly, sortIdx]);

    const afc = [activeTag !== "All", activeYear !== "All", activeMedium !== "All", activeSize !== "All", priceRange !== 0, availOnly].filter(Boolean).length;
    const clearAll = () => { setActiveTag("All"); setActiveYear("All"); setActiveMedium("All"); setActiveSize("All"); setPriceRange(0); setAvailOnly(false); };

    const filtersJSX = (<>
        <SidebarSection title="Collections">{ALL_TAGS.map(t => <FilterCheckbox key={t} label={t} active={activeTag === t} onClick={() => setActiveTag(t)} />)}</SidebarSection>
        <SidebarSection title="Price">{PRICE_RANGES.map((r, i) => <FilterCheckbox key={r.label} label={r.label} active={priceRange === i} onClick={() => setPriceRange(i)} />)}</SidebarSection>
        <SidebarSection title="Size">{ALL_SIZES.map(s => <FilterCheckbox key={s} label={s} active={activeSize === s} onClick={() => setActiveSize(s)} />)}</SidebarSection>
        <SidebarSection title="Year">{ALL_YEARS.map(y => <FilterCheckbox key={y} label={y} active={activeYear === y} onClick={() => setActiveYear(y)} />)}</SidebarSection>
        <SidebarSection title="Medium">{ALL_MEDIUMS.map(m => <FilterCheckbox key={m} label={m} active={activeMedium === m} onClick={() => setActiveMedium(m)} />)}</SidebarSection>
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
                <div style={{ flex: 1, minWidth: 0, padding: "1rem 2.5rem 6rem 2rem" }}>
                    {/* Top bar: count + sort */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-muted)" }}>{filtered.length} works</span>
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
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
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
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gap: "5rem 3.5rem",
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
