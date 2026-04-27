"use client";

/**
 * Shop module for the ArtShop.
 * Provides a comprehensive catalog of artworks with multi-layered sidebar filters,
 * including categories, price ranges, dimensions, orientation, and more.
 */

import { useState, useMemo, useEffect, useCallback, useRef, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInView } from "react-intersection-observer";
import { usePreferences } from "@/context/PreferencesContext";
import { useUser } from "@/context/UserContext";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch, apiJson } from "@/utils";
import GoogleLoginButton from "@/components/GoogleLoginButton";

import { Product, Label, LabelCategory, SortKey } from "./types";
import { DEFAULT_GRADIENTS, SORT_OPTIONS, IMAGE_ZONE } from "./constants";
import { getOrientation, sortProducts } from "./utils";
import { ProductCard } from "./components/ProductCard";
import { FilterCheckbox } from "./components/FilterCheckbox";
import { SidebarSection } from "./components/SidebarSection";
import { DualRangeSlider } from "./components/DualRangeSlider";
import { PriceRangeSection } from "./components/PriceRangeSection";

/**
 * Main Shop catalog page.
 * Manages complex filtering state, multi-unit dimension handling,
 * responsive layout transitions, and dynamic data fetching for artworks and labels.
 */
export default function ShopPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
            <ShopPageContent />
        </Suspense>
    );
}

function ShopPageContent() {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useUser();
    const urlCountry = (searchParams.get("country") || "").toUpperCase();
    const [userCountryCode, setUserCountryCode] = useState<string>("");
    const activeCountryCode = /^[A-Z]{2}$/.test(urlCountry) ? urlCountry : (userCountryCode || "DE");
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<LabelCategory[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /** Liked artwork IDs loaded from DB (only when user is authenticated). */
    const [likedIds, setLikedIds] = useState<Set<number> | undefined>(undefined);
    /** Controls the sign-in prompt modal for unauthenticated likes. */
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    /** Filter state: Arrays for multi-select, primitives for ranges. */
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);    // "originals" | "prints"
    const [priceMin, setPriceMin] = useState(0);
    const [priceMax, setPriceMax] = useState(999999);
    const [widthMin, setWidthMin] = useState(0);
    const [widthMax, setWidthMax] = useState(0);
    const [heightMin, setHeightMin] = useState(0);
    const [heightMax, setHeightMax] = useState(0);
    const [activeYears, setActiveYears] = useState<number[]>([]);
    const [activeOrientations, setActiveOrientations] = useState<string[]>([]);
    const [activeLabels, setActiveLabels] = useState<number[]>([]);
    const [filterLiked, setFilterLiked] = useState(searchParams.get("liked") === "true");

    useEffect(() => {
        setFilterLiked(searchParams.get("liked") === "true");
    }, [searchParams]);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/geo/country`)
            .then((res) => apiJson<{ country_code?: string }>(res))
            .then((data) => {
                if (data.country_code) {
                    setUserCountryCode(String(data.country_code).toUpperCase());
                } else {
                    setUserCountryCode("DE");
                }
            })
            .catch(() => setUserCountryCode("DE"));
    }, []);

    useEffect(() => {
        if (/^[A-Z]{2}$/.test(urlCountry) || !/^[A-Z]{2}$/.test(userCountryCode)) {
            return;
        }
        const nextParams = new URLSearchParams(searchParams.toString());
        nextParams.set("country", userCountryCode);
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    }, [pathname, router, searchParams, urlCountry, userCountryCode]);

    const [sortIdx, setSortIdx] = useState(0);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isPhone, setIsPhone] = useState(false);
    const [gridMode, setGridMode] = useState<"1" | "2" | "3">("2");
    const [gridLoaded, setGridLoaded] = useState(false);

    const { globalPrintPrice, convertPrice, units, pendingLikes, addPendingLike, removePendingLike, unauthLikeCount, incrementUnauthLikeCount } = usePreferences();
    const itemsPerPage = gridMode === "3" ? 36 : gridMode === "2" ? 24 : 12;
    const [visibleCount, setVisibleCount] = useState(12);

    // Initial load of grid preference for Shop
    useEffect(() => {
        const saved = localStorage.getItem("artshop_shop_grid");
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        }
        setGridLoaded(true);
    }, []);

    // Persist grid preference for Shop
    useEffect(() => {
        if (gridLoaded) {
            localStorage.setItem("artshop_shop_grid", gridMode);
        }
    }, [gridMode, gridLoaded]);

    /** Bootstraps the catalog data from multiple endpoints. */
    useEffect(() => {
        if (!activeCountryCode) {
            return;
        }
        const apiUrl = getApiUrl();
        const abortController = new AbortController();
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([
            apiFetch(`${apiUrl}/artworks?limit=1000&country=${activeCountryCode}`, { signal: abortController.signal }).then(r => apiJson<any>(r)),
            apiFetch(`${apiUrl}/labels/categories`, { signal: abortController.signal }).then(r => apiJson<any>(r)),
            apiFetch(`${apiUrl}/labels`, { signal: abortController.signal }).then(r => apiJson<any>(r)),
        ]).then(([artData, catData, lblData]) => {
            if (cancelled) {
                return;
            }
            const rawData = artData.items || artData.data || artData;
            if (Array.isArray(rawData)) {
                const items = rawData.map((item: any, idx: number) => ({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][1],
                }));
                setAllProducts(items);
            } else {
                setError("Failed to load artworks.");
            }
            if (Array.isArray(catData)) setCategories(catData);
            if (Array.isArray(lblData)) setLabels(lblData);
        }).catch(err => {
            if (cancelled || abortController.signal.aborted) {
                return;
            }
            console.error("Shop initialization failed:", err);
            setError(err instanceof Error ? err.message : "Network error.");
        }).finally(() => {
            if (!cancelled) {
                setLoading(false);
            }
        });

        return () => {
            cancelled = true;
            abortController.abort();
        };
    }, [activeCountryCode]);

    /** Fetch the authenticated user's liked artwork IDs for UI state init. */
    useEffect(() => {
        if (!user) {
            setLikedIds(new Set(pendingLikes)); // Fallback initialization
            return;
        }
        apiFetch(`${getApiUrl()}/users/me/likes`)
            .then(r => r.ok ? r.json() : [])
            .then((items: { id: number }[]) => {
                setLikedIds(new Set(items.map(a => a.id)));
            })
            .catch(() => setLikedIds(new Set()));
    }, [pendingLikes, user]);

    /** Monitors viewport width to toggle between desktop sidebar and mobile bottom drawer. */
    useEffect(() => {
        const update = () => {
            setIsMobile(window.innerWidth < 1024);
            setIsPhone(window.innerWidth < 768);
        };
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    /** Layout persistence: Remembers grid density preferences per device type in session storage. */
    useEffect(() => {
        const mob = window.innerWidth < 1024;
        const storageKey = mob ? "artshop_shop_gridMode_mobile" : "artshop_shop_gridMode_pc";
        const saved = sessionStorage.getItem(storageKey) as "1" | "2" | "3" | null;
        if (saved === "1" || saved === "2" || saved === "3") {
            setGridMode(saved);
        } else {
            // Defaults: High-visibility single-column for mobile, standard for desktop.
            setGridMode(mob ? "1" : "2");
        }
    }, [isMobile]);

    const handleSetGridMode = (val: "1" | "2" | "3") => {
        setGridMode(val);
        const storageKey = isMobile ? "artshop_shop_gridMode_mobile" : "artshop_shop_gridMode_pc";
        sessionStorage.setItem(storageKey, val);
    };

    /** Unique years appearing in the current catalog for filter generation. */
    const availableYears = useMemo(() =>
        [...new Set(allProducts.map(p => p.year).filter(Boolean) as number[])].sort((a, b) => b - a),
        [allProducts]);

    /** 
     * Converts a specific dimension (width/height) to the user's preferred unit.
     * Prioritizes native unit metadata if available; otherwise performs a calculated conversion.
     */
    const getUnitVal = useCallback((p: Product, measure: "width" | "height") => {
        if (units === "in") {
            const valIn = (p as any)[`${measure}_in` as keyof Product];
            if (valIn !== undefined && valIn !== null) return valIn;
            const valCm = p[`${measure}_cm` as keyof Product] as number ?? 0;
            return Number((valCm * 0.393701).toFixed(2));
        }
        return (p[`${measure}_cm` as keyof Product] as number) ?? 0;
    }, [units]);

    /** 
     * Reset slider bounds when switching units (cm <-> in) to prevent
     * filtering collisions due to out-of-sync min/max values.
     */
    const prevUnitsRef = useRef(units);
    useEffect(() => {
        if (prevUnitsRef.current !== units) {
            prevUnitsRef.current = units;
            setWidthMin(0); setWidthMax(0);
            setHeightMin(0); setHeightMax(0);
        }
    }, [units]);

    /** Calculate the minimum width bound across the entire catalog in current units. */
    const wGlobalMin = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "width")).filter(v => v > 0);
        return vals.length ? Math.floor(Math.min(...vals)) : 0;
    }, [allProducts, getUnitVal]);

    /** Calculate the maximum width bound across the entire catalog in current units. */
    const wGlobalMax = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "width")).filter(v => v > 0);
        return vals.length ? Math.ceil(Math.max(...vals)) : (units === "in" ? 80 : 200);
    }, [allProducts, getUnitVal, units]);

    /** Calculate the minimum height bound across the entire catalog in current units. */
    const hGlobalMin = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "height")).filter(v => v > 0);
        return vals.length ? Math.floor(Math.min(...vals)) : 0;
    }, [allProducts, getUnitVal]);

    /** Calculate the maximum height bound across the entire catalog in current units. */
    const hGlobalMax = useMemo(() => {
        const vals = allProducts.map(p => getUnitVal(p, "height")).filter(v => v > 0);
        return vals.length ? Math.ceil(Math.max(...vals)) : (units === "in" ? 80 : 200);
    }, [allProducts, getUnitVal, units]);

    /** Hydrate slider state once global bounds are calculated from API data. */
    useEffect(() => {
        if (wGlobalMin > 0 && widthMax === 0) { setWidthMin(wGlobalMin); setWidthMax(wGlobalMax); }
        if (hGlobalMin > 0 && heightMax === 0) { setHeightMin(hGlobalMin); setHeightMax(hGlobalMax); }
    }, [wGlobalMin, wGlobalMax, hGlobalMin, hGlobalMax, widthMax, heightMax]);

    /** 
     * Core filtering engine.
     * Aggregates all active UI filters (type, price, size, tech info) into a 
     * single high-performance memoized list.
     */
    const effectiveLikedIds = useMemo(
        () => (user ? likedIds : new Set(pendingLikes)),
        [likedIds, pendingLikes, user],
    );

    const filtered = useMemo(() => {
        let list = allProducts;

        // Classification filter: Distinguishes between physical originals and reproductions.
        if (categoryFilter.includes("originals") && !categoryFilter.includes("prints")) {
            list = list.filter(p => p.original_status === "available");
        } else if (categoryFilter.includes("prints") && !categoryFilter.includes("originals")) {
            list = list.filter(p => p.has_prints);
        } else if (categoryFilter.includes("originals") && categoryFilter.includes("prints")) {
            list = list.filter(p => p.original_status === "available" || p.has_prints);
        }

        // Liked constraint
        if (filterLiked) {
            if (!effectiveLikedIds) return []; // Return empty array while loading
            list = list.filter(p => effectiveLikedIds.has(p.id));
        }

        // Budgetary constraints (Originals only).
        if (priceMin > 0 || priceMax < 999999) {
            list = list.filter(p => {
                return p.original_status === "available" && p.original_price && p.original_price >= priceMin && p.original_price <= priceMax;
            });
        }

        // Dimension constraints: Width.
        const effWMax = widthMax || wGlobalMax;
        if ((widthMin > 0 && widthMin > wGlobalMin) || effWMax < wGlobalMax) {
            list = list.filter(p => {
                const w = getUnitVal(p, "width");
                return w > 0 && w >= widthMin && w <= effWMax;
            });
        }

        // Dimension constraints: Height.
        const effHMax = heightMax || hGlobalMax;
        if ((heightMin > 0 && heightMin > hGlobalMin) || effHMax < hGlobalMax) {
            list = list.filter(p => {
                const h = getUnitVal(p, "height");
                return h > 0 && h >= heightMin && h <= effHMax;
            });
        }

        // Chronological constraints.
        if (activeYears.length > 0) {
            list = list.filter(p => p.year && activeYears.includes(p.year));
        }

        // Geometric constraints.
        if (activeOrientations.length > 0) {
            list = list.filter(p => {
                const ori = getOrientation(p);
                return ori && activeOrientations.includes(ori);
            });
        }



        if (activeLabels.length > 0) {
            list = list.filter(p => (p.labels || []).some(t => activeLabels.includes(typeof t === "number" ? t : (t as any).id)));
        }

        return list;
    }, [activeLabels, activeOrientations, activeYears, allProducts, categoryFilter, effectiveLikedIds, filterLiked, getUnitVal, hGlobalMax, hGlobalMin, heightMax, heightMin, priceMax, priceMin, wGlobalMax, wGlobalMin, widthMax, widthMin]);

    /** Updates pending likes locally, and occasionally prompts the user. */
    const handleAuthRequired = (id: number, isLiked: boolean) => {
        if (isLiked) {
            addPendingLike(id);
        } else {
            removePendingLike(id);
        }
        
        incrementUnauthLikeCount();
        const nextCount = unauthLikeCount + 1;

        // Display the auth prompt on the 1st like, and then every 3rd like (4th, 7th...)
        if ((nextCount - 1) % 3 === 0) {
            setTimeout(() => setShowAuthPrompt(true), 1000);
        }
    };

    /** Synchronizes like state from child to parent, useful for live filtering. */
    const handleLikeChange = useCallback((id: number, isLiked: boolean) => {
        setLikedIds(prev => {
            const next = new Set(prev || []);
            if (isLiked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    /** Final sorted results for exhibition, respecting pagination and display limits. */
    const displayed = useMemo(() => {
        return sortProducts(filtered, SORT_OPTIONS[sortIdx].key, globalPrintPrice).slice(0, visibleCount);
    }, [filtered, sortIdx, visibleCount, globalPrintPrice]);

    /** Calculate the total number of active filters to show count badges on mobile. */
    const widthActive = widthMin > wGlobalMin || widthMax < wGlobalMax;
    const heightActive = heightMin > hGlobalMin || heightMax < hGlobalMax;
    const afc = categoryFilter.length
        + (filterLiked ? 1 : 0)
        + (priceMin > 0 || priceMax < 999999 ? 1 : 0)
        + (widthActive ? 1 : 0) + (heightActive ? 1 : 0)
        + activeYears.length + activeOrientations.length
        + (activeLabels?.length ?? 0);

    /** Resets the entire filter matrix to the default exhibition state. */
    const clearAll = () => {
        setCategoryFilter([]); setPriceMin(0); setPriceMax(999999);
        setWidthMin(wGlobalMin); setWidthMax(wGlobalMax);
        setHeightMin(hGlobalMin); setHeightMax(hGlobalMax);
        setActiveYears([]); setActiveOrientations([]);
        setActiveLabels([]);
        setFilterLiked(false);
    };

    /** Unified string multi-select toggler. */
    const toggleStr = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

    /** Unified numeric multi-select toggler. */
    const toggleNum = (setter: React.Dispatch<React.SetStateAction<number[]>>, val: number) =>
        setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);

    const { ref: loadMoreRef, inView } = useInView({ rootMargin: "200px" });

    // Handle initial pagination and reacts to filter changes by resetting the visible offset.
    useEffect(() => {
        setVisibleCount(itemsPerPage);
    }, [categoryFilter, priceMin, priceMax, widthMin, widthMax, heightMin, heightMax, activeYears, activeOrientations, activeLabels, sortIdx, itemsPerPage]);

    // Infinite scroll trigger: Increments display quota when the user approaches the end of the results.
    useEffect(() => {
        if (inView && visibleCount < filtered.length) setVisibleCount(prev => prev + itemsPerPage);
    }, [inView, filtered.length, visibleCount, itemsPerPage]);

    /** CSS grid column mapping for the current density mode. */
    const getColumns = () => {
        if (isMobile) {
            if (isPhone) {
                if (gridMode === "1") return "1fr";
                if (gridMode === "2") return "repeat(2, 1fr)";
                return "repeat(3, 1fr)";
            } else {
                // Tablet layout
                if (gridMode === "1") return "repeat(2, 1fr)";
                if (gridMode === "2") return "repeat(3, 1fr)";
                return "repeat(4, 1fr)";
            }
        }
        // Desktop layout (Strict grid structure)
        if (gridMode === "1") return "repeat(2, 1fr)";
        if (gridMode === "2") return "repeat(3, 1fr)"; // Strictly 3 items
        return "repeat(4, 1fr)";
    };

    /** CSS grid gap mapping for the current density mode. */
    const getGap = () => {
        if (isMobile) {
            if (isPhone) {
                if (gridMode === "1") return "2.25rem 1rem";
                if (gridMode === "2") return "1.5rem 1.25rem";
                return "0.5rem 0.5rem";
            } else {
                // Tablet gap
                if (gridMode === "1") return "3rem 1.5rem";
                if (gridMode === "2") return "2rem 1rem";
                return "1rem 0.5rem";
            }
        }
        if (gridMode === "1") return "4rem 24px";
        if (gridMode === "2") return "3rem 16px";
        return "2rem 10px";
    };

    /** 
     * Shared filter panel composition.
     * Rendered either in the desktop sidebar or the mobile bottom drawer.
     * Divided into 7 logical sections: Category, Price, Size, Year, Orientation, Collections, and Medium.
     */
    const filtersJSX = (
        <>
            {/* 0. Collection filtering. */}
            {user && (
                <SidebarSection title="My Collection" defaultOpen={true} isMobile={isMobile}>
                    <FilterCheckbox label="My Likes" active={filterLiked} onClick={() => setFilterLiked(!filterLiked)} isMobile={isMobile} />
                </SidebarSection>
            )}

            {/* 1. Classification filtering. */}
            <SidebarSection title="Category" defaultOpen={false} isMobile={isMobile}>
                <FilterCheckbox label="Available Originals" active={categoryFilter.includes("originals")} onClick={() => toggleStr(setCategoryFilter, "originals")} isMobile={isMobile} />
                <FilterCheckbox label="Prints Available" active={categoryFilter.includes("prints")} onClick={() => toggleStr(setCategoryFilter, "prints")} isMobile={isMobile} />
            </SidebarSection>

            {/* 2. Budgetary filtering. */}
            <PriceRangeSection key={`${priceMin}-${priceMax}`} min={priceMin} max={priceMax} onChange={(mn, mx) => { setPriceMin(mn); setPriceMax(mx); }} isMobile={isMobile} />

            {/* 3. Physical dimension filtering. */}
            <SidebarSection title="Size" defaultOpen={false} isMobile={isMobile}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.8rem", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.05em" }}>({units})</span>
                </div>
                {wGlobalMax > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <DualRangeSlider
                            label="Width"
                            unit={units}
                            globalMin={wGlobalMin}
                            globalMax={wGlobalMax}
                            valueMin={widthMin || wGlobalMin}
                            valueMax={widthMax || wGlobalMax}
                            onChange={(mn, mx) => { setWidthMin(mn); setWidthMax(mx); }}
                        />
                        <DualRangeSlider
                            label="Height"
                            unit={units}
                            globalMin={hGlobalMin}
                            globalMax={hGlobalMax}
                            valueMin={heightMin || hGlobalMin}
                            valueMax={heightMax || hGlobalMax}
                            onChange={(mn, mx) => { setHeightMin(mn); setHeightMax(mx); }}
                        />
                    </div>
                ) : (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#bbb", fontStyle: "italic" }}>No size data yet</span>
                )}
            </SidebarSection>

            {/* 4. Temporal filtering. */}
            <SidebarSection title="Year" defaultOpen={false} isMobile={isMobile}>
                {availableYears.length > 0 ? availableYears.map(y => (
                    <FilterCheckbox key={y} label={String(y)} active={activeYears.includes(y)} onClick={() => toggleNum(setActiveYears, y)} isMobile={isMobile} />
                )) : (
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#bbb", fontStyle: "italic" }}>No year data yet</span>
                )}
            </SidebarSection>

            {/* 5. Geometric orientation filtering. */}
            <SidebarSection title="Orientation" defaultOpen={false} isMobile={isMobile}>
                <FilterCheckbox label="Horizontal" active={activeOrientations.includes("horizontal")} onClick={() => toggleStr(setActiveOrientations, "horizontal")} isMobile={isMobile} />
                <FilterCheckbox label="Vertical" active={activeOrientations.includes("vertical")} onClick={() => toggleStr(setActiveOrientations, "vertical")} isMobile={isMobile} />
                <FilterCheckbox label="Square" active={activeOrientations.includes("square")} onClick={() => toggleStr(setActiveOrientations, "square")} isMobile={isMobile} />
            </SidebarSection>



            {/* 7. Dynamic Label filtering. */}
            {categories.map(cat => {
                const catLabels = labels.filter(l => l.category_id === cat.id);
                if (catLabels.length === 0) return null;
                return (
                    <SidebarSection key={cat.id} title={cat.title} defaultOpen={false} isMobile={isMobile}>
                        {catLabels.map(l => (
                            <FilterCheckbox key={l.id} label={l.title} active={activeLabels.includes(l.id)} onClick={() => toggleNum(setActiveLabels, l.id)} isMobile={isMobile} />
                        ))}
                    </SidebarSection>
                );
            })}
        </>
    );

    // Initial page load: Reset scroll to provide a consistent entrance to the catalog.
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.scrollTo({ top: 0, behavior: "instant" });
        }
    }, []);

    return (
        <div className="premium-texture-bg" style={{ color: "var(--color-charcoal)", minHeight: "100vh" }}>
            {/* Mobile Bottom Drawer Backdrop: Dims the content when filtering is active. */}
            {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(26,26,24,0.75)", zIndex: 40 }} />}

            {/* Mobile Bottom Drawer: Contains all filters for compact accessibility. */}
            <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: "#ffffff", borderTop: "1px solid var(--color-border)", transform: drawerOpen ? "translateY(0)" : "translateY(100%)", transition: "transform 0.38s cubic-bezier(0.4,0,0.2,1)", maxHeight: "85vh", overflowY: "auto" }}>
                <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid rgba(26,26,24,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, backgroundColor: "#ffffff", zIndex: 1 }}>
                    <div style={{ position: "absolute", top: "0.5rem", left: "50%", transform: "translateX(-50%)", width: "32px", height: "3px", borderRadius: "2px", backgroundColor: "rgba(26,26,24,0.12)" }} />
                    <h3 style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "0.5rem", color: "var(--color-charcoal)" }}>Filters</h3>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginTop: "0.5rem" }}>
                        {afc > 0 && <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 300, color: "var(--color-charcoal-mid)", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid rgba(26,26,24,0.2)", paddingBottom: "1px" }}>Clear all</button>}
                        <button onClick={() => setDrawerOpen(false)} style={{ fontSize: "2rem", fontWeight: 200, color: "var(--color-charcoal)", background: "none", border: "none", cursor: "pointer", minWidth: "64px", minHeight: "64px", display: "flex", alignItems: "center", justifyContent: "flex-end", lineHeight: 1, padding: "0 10px" }}>✕</button>
                    </div>
                </div>
                <div style={{ padding: "1.25rem 1.5rem 1rem" }}>{filtersJSX}</div>
                <div style={{ padding: "1rem 1.5rem", borderTop: "1px solid rgba(26,26,24,0.06)", position: "sticky", bottom: 0, backgroundColor: "#ffffff" }}>
                    <button onClick={() => setDrawerOpen(false)} style={{ width: "100%", padding: "0.85rem", backgroundColor: "var(--color-charcoal)", color: "var(--color-cream)", borderRadius: "2px", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", minHeight: "48px" }}>
                        Show {filtered.length} work{filtered.length !== 1 ? "s" : ""}
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", gap: "0", alignItems: "flex-start" }}>
                {/* Desktop Sidebar: Static panel for persistent filtering during navigation. */}
                <aside className="shop-desktop-sidebar" style={{ width: "240px", minWidth: "240px", flexShrink: 0, paddingLeft: "1.25rem", paddingRight: "1.5rem", paddingTop: "1.25rem", borderRight: "1px solid rgba(26,26,24,0.07)" }}>
                    {/* Clear All action: Strategically reserved space to prevent layout shifts. */}
                    <button
                        onClick={clearAll}
                        disabled={afc === 0}
                        style={{
                            fontFamily: "var(--font-sans)", fontSize: "0.58rem", fontWeight: 400,
                            letterSpacing: "0.1em", textTransform: "uppercase",
                            color: afc > 0 ? "#888" : "transparent",
                            background: "none", border: "none",
                            cursor: afc > 0 ? "pointer" : "default",
                            padding: "0 0 0.6rem", display: "block",
                            transition: "color 0.18s",
                            pointerEvents: afc === 0 ? "none" : "auto",
                            textDecoration: "underline",
                            textUnderlineOffset: "2px",
                        }}
                        onMouseEnter={e => { if (afc > 0) e.currentTarget.style.color = "#1a1a18"; }}
                        onMouseLeave={e => { if (afc > 0) e.currentTarget.style.color = "#888"; }}
                    >Clear all</button>
                    {filtersJSX}
                </aside>

                <div style={{ flex: 1, minWidth: 0, padding: isMobile ? "1rem 1rem 6rem 1rem" : "1rem 2.5rem 6rem 2rem" }}>
                    {/* Catalog Control Bar: Status counter and sort/grid density toggles. */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", flexWrap: isMobile ? "nowrap" : "wrap", gap: isMobile ? "0.75rem" : "1rem", overflowX: isMobile ? "auto" : "visible", paddingBottom: isMobile ? "5px" : 0, scrollbarWidth: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.75rem", fontWeight: 300, color: "var(--color-muted)", whiteSpace: "nowrap" }}>{filtered.length} works</span>
                            {isMobile && (
                                <button onClick={() => setDrawerOpen(true)} style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.25rem 0.8rem", backgroundColor: afc > 0 ? "rgba(26,26,24,0.03)" : "transparent", color: "var(--color-charcoal)", border: "1px solid", borderColor: afc > 0 ? "var(--color-charcoal)" : "rgba(26,26,24,0.12)", fontFamily: "var(--font-sans)", fontSize: "0.65rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", borderRadius: "2px" }}>
                                    Filters{afc > 0 ? ` (${afc})` : ""}
                                </button>
                            )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.5rem" : "1rem", flexShrink: 0 }}>
                            <div className="grid-toggle-wrapper" style={{ display: "flex", alignItems: "center", backgroundColor: "var(--color-cream-dark)", borderRadius: "6px", padding: "2px" }}>
                                {(["1", "2", "3"] as const).map(mode => (
                                    <button key={mode} onClick={() => handleSetGridMode(mode)} title={`${mode} in a row`}
                                        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 8px", backgroundColor: gridMode === mode ? "#ffffff" : "transparent", color: gridMode === mode ? "var(--color-charcoal)" : "var(--color-muted)", border: "none", borderRadius: "4px", boxShadow: gridMode === mode ? "0 1px 3px rgba(0,0,0,0.1)" : "none", cursor: "pointer", transition: "all 0.2s" }}>
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                                            {mode === "1" && <rect x="2" y="2" width="12" height="12" rx="1" />}
                                            {mode === "2" && <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>}
                                            {mode === "3" && <><rect x="1" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="1" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.5" /><rect x="1" y="11.5" width="3.5" height="3.5" rx="0.5" /><rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.5" /><rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.5" /></>}
                                        </svg>
                                    </button>
                                ))}
                            </div>
                            <div style={{ position: "relative" }}>
                                <select value={sortIdx} onChange={e => setSortIdx(Number(e.target.value))} style={{ appearance: "none", backgroundColor: "transparent", border: "1px solid rgba(26,26,24,0.2)", borderRadius: "20px", padding: "0.4rem 2.2rem 0.4rem 1rem", fontFamily: "var(--font-sans)", fontSize: "0.8rem", color: "var(--color-charcoal)", cursor: "pointer", outline: "none" }}>
                                    {SORT_OPTIONS.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
                                </select>
                                <span style={{ position: "absolute", right: "0.8rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: "0.65rem", color: "var(--color-charcoal)", fontWeight: 300 }}>∨</span>
                            </div>
                        </div>
                    </div>

                    {loading && <div style={{ padding: "5rem 1rem", textAlign: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)", fontSize: "0.85rem" }}>Curating catalog...</div>}
                    {error && <div style={{ padding: "5rem 1rem", textAlign: "center", fontFamily: "var(--font-sans)", color: "#C87070" }}>{error}</div>}

                    {!loading && !error && (filtered.length > 0 ? (
                        <div className="art-grid" style={{ display: "grid", gridTemplateColumns: getColumns(), justifyContent: "start", gap: getGap(), alignItems: "start" }}>
                            {displayed.map((p, i) => <ProductCard
                                key={p.id}
                                product={p}
                                zoneH={IMAGE_ZONE[gridMode] || 380}
                                gridMode={gridMode}
                                isMobile={isMobile}
                                countryCode={activeCountryCode}
                                likedIds={effectiveLikedIds}
                                listIndex={i}
                                onAuthRequired={!user ? handleAuthRequired : undefined}
                                onLikeChange={handleLikeChange}
                            />)}
                        </div>
                    ) : (
                        <div style={{ textAlign: "center", padding: "5rem 1rem" }}>
                            <p style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: "1.2rem", color: "var(--color-muted)", marginBottom: "1.25rem" }}>Exhibition results remain empty for these parameters.</p>
                            <button onClick={clearAll} style={{ fontFamily: "var(--font-sans)", fontSize: "0.8rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--color-accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Reset all parameters</button>
                        </div>
                    ))}

                    {visibleCount < filtered.length && (
                        <div ref={loadMoreRef} style={{ height: "40px", marginTop: "2rem", display: "flex", justifyContent: "center" }}>
                            <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontFamily: "var(--font-sans)" }}>Curating more works...</span>
                        </div>
                    )}
                </div>
            </div>
            {/* Auth Prompt Modal — shown when unauthenticated user tries to like */}
            {showAuthPrompt && (
                <div
                    onClick={() => setShowAuthPrompt(false)}
                    style={{
                        position: "fixed", inset: 0, zIndex: 9999,
                        background: "rgba(10,10,10,0.65)",
                        backdropFilter: "blur(6px)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        padding: "1rem",
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "#fff",
                            borderRadius: "20px",
                            padding: "2.5rem 2rem",
                            maxWidth: "360px",
                            width: "100%",
                            textAlign: "center",
                            boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1)",
                            position: "relative",
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setShowAuthPrompt(false)}
                            aria-label="Close"
                            style={{
                                position: "absolute",
                                top: "1rem",
                                right: "1rem",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                padding: "0.25rem",
                                color: "#999",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                transition: "color 0.2s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = "#333"}
                            onMouseLeave={e => e.currentTarget.style.color = "#999"}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>

                        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>♡</div>
                        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem", fontWeight: 400, fontStyle: "italic", color: "#1a1a18", marginBottom: "0.5rem" }}>
                            Save to your collection
                        </h2>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.85rem", color: "#777", lineHeight: 1.6, marginBottom: "1.75rem" }}>
                            Sign in to save artworks you love and revisit them anytime from your profile.
                        </p>
                        {/* Modern Google Authentication Button */}
                        <GoogleLoginButton
                            onSuccess={() => setShowAuthPrompt(false)}
                            containerStyle={{ marginBottom: "1rem" }}
                        />
                        <button
                            onClick={() => setShowAuthPrompt(false)}
                            style={{ marginTop: "1rem", background: "none", border: "none", fontFamily: "var(--font-sans)", fontSize: "0.75rem", color: "#999", cursor: "pointer", letterSpacing: "0.05em" }}
                        >
                            Continue browsing
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
