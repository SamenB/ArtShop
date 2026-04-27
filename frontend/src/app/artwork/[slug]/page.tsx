"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePreferences } from "@/context/PreferencesContext";
import { useCart } from "@/context/CartContext";
import { useUser } from "@/context/UserContext";
import Lightbox from "@/components/Lightbox";
import PrintConfigurator from "@/components/PrintConfigurator";
import type { ArtworkPrintStorefront } from "@/lib/artworkStorefront";
import { buildArtworkStorefrontKey, loadArtworkStorefront } from "@/lib/artworkStorefront";
import { getApiUrl, getImageUrl, artworkUrl, apiFetch } from "@/utils";
import GoogleLoginButton from "@/components/GoogleLoginButton";

import { type Artwork, type OriginalStatus, type ArtworkImage } from "./types";
import { DEFAULT_GRADIENTS, STATUS_BADGE } from "./constants";
import { AuthPromptModal } from "./components/AuthPromptModal";

import { ArtworkPurchasePanel } from "./components/ArtworkPurchasePanel";
import { ArtworkPurchaseStyles } from "./components/ArtworkPurchaseStyles";
export default function ArtworkDetailPage() {
    const params = useParams();
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const slug = params?.slug as string;
    const { units, convertPrice } = usePreferences();
    const { addItem } = useCart();

    const [work, setWork] = useState<Artwork | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [fullSizeOpen, setFullSizeOpen] = useState(false);
    const [allSlugs, setAllSlugs] = useState<string[]>([]); // For prev/next navigation
    const [userCountryCode, setUserCountryCode] = useState<string>("");
    const [storefrontState, setStorefrontState] = useState<{
        requestKey: string;
        storefront: ArtworkPrintStorefront | null;
        error: string | null;
    } | null>(null);
    const urlCountry = (searchParams.get("country") || "").toUpperCase();
    const urlView = searchParams.get("view");
    const activeCountryCode = /^[A-Z]{2}$/.test(urlCountry) ? urlCountry : (userCountryCode || "DE");

    useEffect(() => {
        apiFetch(`${getApiUrl()}/geo/country`)
            .then(res => res.json())
            .then(data => {
                if (data.country_code) setUserCountryCode(String(data.country_code).toUpperCase());
                else setUserCountryCode("DE");
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

    const { user } = useUser();
    const [liked, setLiked] = useState(false);
    const [likeAnimating, setLikeAnimating] = useState(false);
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    // Toggle these to switch designs easily
    const mobileThumbsRound = true;


    const swipeRef = useRef<number | null>(null);
    const hasTouch = useRef(false);

    // Measure bounding box and active image directly to place thumbnails accurately
    const boxRef = useRef<HTMLDivElement>(null);
    const imgRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [layoutMetrics, setLayoutMetrics] = useState({ boxW: 0, boxH: 0, imgH: 0, winW: 0 });
    const [imageAspectRatios, setImageAspectRatios] = useState<Record<number, number>>({});

    useEffect(() => {
        const boxNode = boxRef.current;
        const imgNode = imgRefs.current[selectedImageIndex];
        if (!boxNode) return;

        const updateMetrics = () => {
            if (boxNode) {
                setLayoutMetrics({ boxW: boxNode.clientWidth, boxH: boxNode.clientHeight, imgH: imgNode ? imgNode.clientHeight : 0, winW: window.innerWidth });
            }
        };

        const observer = new ResizeObserver(updateMetrics);
        observer.observe(boxNode);
        if (imgNode) observer.observe(imgNode);

        updateMetrics(); // Initial read
        return () => observer.disconnect();
    }, [selectedImageIndex, work?.images?.length]);

    const handleImgLoad = (idx: number, e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) {
            setImageAspectRatios(prev => ({ ...prev, [idx]: naturalWidth / naturalHeight }));
        }
        const boxNode = boxRef.current;
        const imgNode = imgRefs.current[selectedImageIndex];
        if (boxNode) {
            setLayoutMetrics({ boxW: boxNode.clientWidth, boxH: boxNode.clientHeight, imgH: imgNode ? imgNode.clientHeight : 0, winW: window.innerWidth });
        }
    };

    // Amazon style zoom state
    const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
    const [isZooming, setIsZooming] = useState(false);

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (hasTouch.current || e.pointerType !== "mouse") return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setZoomPos({ x, y });
    };

    useEffect(() => {
        if (!slug) return;
        const params = new URLSearchParams();
        if (activeCountryCode) {
            params.set("country", activeCountryCode);
        }

        apiFetch(`${getApiUrl()}/artworks/${slug}${params.size ? `?${params.toString()}` : ""}`)
            .then(res => res.json())
            .then(data => {
                const item = data.data || data;
                setWork({
                    ...item,
                    gradientFrom: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][0],
                    gradientTo: DEFAULT_GRADIENTS[item.id % DEFAULT_GRADIENTS.length][1],
                });
                if (item.print_storefront && activeCountryCode) {
                    setStorefrontState({
                        requestKey: buildArtworkStorefrontKey(slug, activeCountryCode),
                        storefront: item.print_storefront,
                        error: null,
                    });
                }
            })
            .catch(() => console.warn("Backend unavailable"))
            .finally(() => setLoading(false));
    }, [activeCountryCode, slug]);

    useEffect(() => {
        if (!slug || !activeCountryCode || loading) {
            return;
        }

        let cancelled = false;
        const requestKey = buildArtworkStorefrontKey(slug, activeCountryCode);

        if (work?.print_storefront?.country_code === activeCountryCode) {
            return;
        }

        if (storefrontState?.requestKey === requestKey && storefrontState.storefront) {
            return;
        }

        loadArtworkStorefront(slug, activeCountryCode)
            .then((data) => {
                if (!cancelled) {
                    setStorefrontState({
                        requestKey,
                        storefront: data,
                        error: null,
                    });
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setStorefrontState({
                        requestKey,
                        storefront: null,
                        error:
                            err instanceof Error ? err.message : "Unable to load print offers.",
                    });
                }
            });

        return () => {
            cancelled = true;
        };
    }, [activeCountryCode, loading, slug, storefrontState, work]);

    const { pendingLikes, addPendingLike, removePendingLike, unauthLikeCount, incrementUnauthLikeCount } = usePreferences();

    // Fetch all artwork slugs for prev/next navigation
    useEffect(() => {
        apiFetch(`${getApiUrl()}/artworks?limit=500&fields=slug`)
            .then(res => res.json())
            .then(data => {
                const items = data.data || data.items || data || [];
                const slugs = items.map((a: { slug: string }) => a.slug).filter(Boolean);
                setAllSlugs(slugs);
            })
            .catch(() => { });
    }, []);

    // Fetch initial like state if authenticated
    useEffect(() => {
        if (!user || !work) {
            return;
        }
        apiFetch(`${getApiUrl()}/users/me/likes`)
            .then(res => res.ok ? res.json() : [])
            .then((data: { id: number }[]) => {
                setLiked(data.some(a => a.id === work.id));
            })
            .catch(() => setLiked(false));
    }, [user, work]);

    useEffect(() => {
        if (fullSizeOpen) {
            document.body.style.overflow = "hidden";
            return () => { document.body.style.overflow = ""; };
        }
    }, [fullSizeOpen]);

    if (loading) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Loading artwork...</div>;
    if (!work) return <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>Artwork not found.</div>;

    const storefrontRequestKey = buildArtworkStorefrontKey(slug, activeCountryCode);
    const embeddedStorefront =
        work.print_storefront?.country_code === activeCountryCode ? work.print_storefront : null;
    const storefront = embeddedStorefront
        || (storefrontState?.requestKey === storefrontRequestKey ? storefrontState.storefront : null);
    const storefrontError = embeddedStorefront
        ? null
        : storefrontState?.requestKey === storefrontRequestKey ? storefrontState.error : null;
    const storefrontLoading = !embeddedStorefront && storefrontState?.requestKey !== storefrontRequestKey;
    const images = work.images || [];
    const storefrontCanvasAvailable = Boolean(storefront?.mediums?.canvas?.cards?.length);
    const storefrontPaperAvailable = Boolean(storefront?.mediums?.paper?.cards?.length);
    const hasCanvasOffers = storefront
        ? storefrontCanvasAvailable
        : Boolean(work.has_canvas_print || work.has_canvas_print_limited);
    const hasPaperOffers = storefront
        ? storefrontPaperAvailable
        : Boolean(work.has_paper_print || work.has_paper_print_limited);
    const defaultPurchaseType: "original" | "canvas" | "paper" =
        work.original_status === "available"
            ? "original"
            : work.has_canvas_print || work.has_canvas_print_limited
              ? "canvas"
              : work.has_paper_print || work.has_paper_print_limited
                ? "paper"
                : "original";
    const resolvedPurchaseType: "original" | "canvas" | "paper" =
        urlView === "canvas" || urlView === "paper" || urlView === "original"
            ? urlView
            : defaultPurchaseType;
    const effectiveLiked = user ? liked : pendingLikes.includes(work.id);

    const updateRouteState = (next: { country?: string; view?: "original" | "canvas" | "paper" }) => {
        const nextParams = new URLSearchParams(searchParams.toString());
        const nextCountry = (next.country || activeCountryCode || userCountryCode || "US").toUpperCase();
        nextParams.set("country", nextCountry);
        if (next.view) {
            nextParams.set("view", next.view);
        } else {
            nextParams.delete("view");
        }
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    };

    // Compute prev/next slugs
    const currentSlugIdx = allSlugs.indexOf(slug);
    const prevSlug = currentSlugIdx > 0 ? allSlugs[currentSlugIdx - 1] : null;
    const nextSlug = currentSlugIdx !== -1 && currentSlugIdx < allSlugs.length - 1 ? allSlugs[currentSlugIdx + 1] : null;

    // Dynamic metrics to align elements with the current image's edges
    const activeImageMetrics = (function () {
        if (!layoutMetrics.boxW || (layoutMetrics.winW >= 768 && !layoutMetrics.boxH)) return { w: 0, h: 0 };
        const idx = selectedImageIndex;
        const fallbackAspect = work.width_cm && work.height_cm ? work.width_cm / work.height_cm : (work.orientation === "horizontal" ? 1.5 : 0.75);
        const aspect = imageAspectRatios[idx] || fallbackAspect;

        if (layoutMetrics.winW < 768) {
            const w = layoutMetrics.boxW * 0.95;
            return { w, h: w / aspect };
        }

        const isVertical = aspect < 1;
        const thumbReserve = isVertical ? 280 : 200;
        const maxW = layoutMetrics.boxW - 40;
        const maxH = layoutMetrics.boxH - thumbReserve;
        let rW = maxW;
        let rH = rW / aspect;
        if (rH > maxH) {
            rH = maxH;
            rW = rH * aspect;
        }
        return { w: rW, h: rH };
    })();
    const viewFullSizeRightOffset = Math.max(0, (layoutMetrics.boxW - activeImageMetrics.w) / 2);
    const viewFullSizeTopOffset = activeImageMetrics.h + 5;

    return (
        <div className="w-full relative" style={{ maxWidth: "100%", overflowX: "clip" }}>
            <style>{`
            @keyframes subtlePulse {
                0% { box-shadow: 0 0 0 0 rgba(100, 116, 139, 0.15); border-color: rgba(100, 116, 139, 0.2); }
                50% { box-shadow: 0 0 0 4px rgba(100, 116, 139, 0); border-color: rgba(100, 116, 139, 0.4); }
                100% { box-shadow: 0 0 0 0 rgba(100, 116, 139, 0); border-color: rgba(100, 116, 139, 0.2); }
            }
        `}</style>
            <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "1.5rem 2rem 6rem" }}>
                {images.length > 0 && (
                    <link rel="preload" as="image" href={getImageUrl(images[selectedImageIndex], 'original')} />
                )}
                {/* ── Desktop: [LEFT 50% = image-viewer] [RIGHT 50% = purchase] ── */}
                {/* ── Mobile: single column ──────────────────────────────────── */}
                <style>{`
                .artwork-img-col { 
                    display: flex; 
                    flex-direction: column; 
                    position: relative; 
                    height: auto; /* Freedom from svh vertical clipping on mobile! */
                }
                .artwork-img-area {
                    flex: unset;
                    position: relative;
                    width: calc(100% + 4rem); /* Safe breakout that respects scrollbars unlike 100vw */
                    margin-left: -2rem;       /* Cancel out parent's 2rem horizontal padding */
                    margin-top: 2rem; /* Dropped down on mobile */
                    display: flex;
                    flex-direction: column; /* Flawless natural flow for thumbnails on mobile */
                    align-items: center;
                    justify-content: flex-start;
                }
                .artwork-frame {
                    max-width: 95vw; /* Absolute 95vw ensures infallible 2.5vw edges on mobile */
                }
                .artwork-slider-wrap {
                    display: flex;
                    flex-direction: column; /* Force vertical stacking of slider and thumbnails! */
                    align-items: center;
                    justify-content: flex-start;
                    width: 100%;
                    /* Naturally grows with image aspect */
                }
                @media (min-width: 768px) {
                    .artwork-img-col {
                        top: 10px;
                        height: calc(100vh - 40px);
                        pointer-events: none; /* Prevent invisible overflow from blocking nav bar clicks */
                    }
                    .artwork-img-col * {
                        pointer-events: auto; /* Re-enable clicks for all actual interactive children */
                    }
                    .artwork-img-area {
                        margin-left: 0;
                        margin-right: 0;
                        margin-top: -1rem; /* Lifted up significantly */
                        width: 100%;
                        height: calc(100% + 1rem); /* Space recovered */
                        align-items: flex-start;
                        flex: 1;
                    }
                    .artwork-frame {
                        /* max-width and max-height removed because explicitDimensions completely controls safe bounds in JS pixel-perfectly */
                    }
                    .artwork-slider-wrap {
                        height: calc(100% - 130px);
                    }
                }

                @media (max-width: 767px) {
                    /* Removed legacy .purchase-card break-out */
                }
                /* Show/hide like title row correctly per viewport */
                .mobile-title-row { display: flex; }
                .desktop-title-row { display: none; }
                @media (min-width: 768px) {
                    .mobile-title-row { display: none; }
                    .desktop-title-row { display: flex; }
                }
            `}</style>

                {/* ── GALLERY NAV ── */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0",
                    marginBottom: layoutMetrics.winW < 768 ? "1rem" : "2rem",
                    fontFamily: "var(--font-sans)",
                    fontSize: "0.72rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    position: "relative",
                    zIndex: 50,
                }}>
                    <div style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: "#fff",
                        borderRadius: "40px",
                        boxShadow: "0 2px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.05)",
                        padding: "0 0.25rem",
                        gap: "0",
                    }}>
                        {/* Next — LEFT */}
                        {nextSlug ? (
                            <Link
                                href={`/artwork/${nextSlug}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.65rem 1.4rem",
                                    color: "var(--color-muted)",
                                    textDecoration: "none",
                                    transition: "color 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                            >
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="7,1 1,7 7,13" />
                                </svg>
                                Next
                            </Link>
                        ) : (
                            <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.65rem 1.4rem",
                                color: "var(--color-border)",
                                opacity: 0.35,
                                whiteSpace: "nowrap",
                                cursor: "default",
                            }}>
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="7,1 1,7 7,13" />
                                </svg>
                                Next
                            </span>
                        )}

                        {/* Divider */}
                        <span style={{ width: "1px", height: "16px", background: "var(--color-border)", opacity: 0.5, flexShrink: 0 }} />

                        {/* Center: All Works */}
                        <Link
                            href="/shop"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.65rem 1.6rem",
                                color: "var(--color-muted)",
                                textDecoration: "none",
                                transition: "color 0.2s",
                                whiteSpace: "nowrap",
                                WebkitTapHighlightColor: "transparent",
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                        >
                            All Works
                        </Link>

                        {/* Divider */}
                        <span style={{ width: "1px", height: "16px", background: "var(--color-border)", opacity: 0.5, flexShrink: 0 }} />

                        {/* Prev — RIGHT */}
                        {prevSlug ? (
                            <Link
                                href={`/artwork/${prevSlug}`}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.5rem",
                                    padding: "0.65rem 1.4rem",
                                    color: "var(--color-muted)",
                                    textDecoration: "none",
                                    transition: "color 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-charcoal)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--color-muted)"; }}
                            >
                                Prev
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,1 7,7 1,13" />
                                </svg>
                            </Link>
                        ) : (
                            <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.65rem 1.4rem",
                                color: "var(--color-border)",
                                opacity: 0.35,
                                whiteSpace: "nowrap",
                                cursor: "default",
                            }}>
                                Prev
                                <svg width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="1,1 7,7 1,13" />
                                </svg>
                            </span>
                        )}
                    </div>
                </div>

                {/* Mobile Title above the image */}
                <div className="mobile-title-row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: "0", marginTop: "1rem", textAlign: "left", gap: "1rem" }}>
                    <h1 style={{ fontFamily: "var(--font-artwork-title)", fontSize: "clamp(2.4rem, 4.5vw, 3.4rem)", fontWeight: 400, fontStyle: "normal", color: "var(--color-charcoal)", lineHeight: 1.2 }}>{work.title}</h1>
                    <button
                        onClick={async () => {
                            const newState = !effectiveLiked;
                            setLiked(newState); // Optimistic UI for animation
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
                        }}
                        aria-label={effectiveLiked ? "Unlike" : "Like"}
                        style={{
                            background: "rgba(255,255,255,0.88)", border: "1px solid rgba(0,0,0,0.05)", borderRadius: "50%",
                            width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", flexShrink: 0,
                            transform: likeAnimating ? "scale(1.2)" : "scale(1)",
                            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s",
                            outline: "none",
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={effectiveLiked ? "#e84057" : "none"} stroke={effectiveLiked ? "#e84057" : "#999"} strokeWidth={effectiveLiked ? "1.5" : "2"} strokeLinecap="round" strokeLinejoin="round" style={{ transition: "fill 0.25s, stroke 0.25s", pointerEvents: "none" }}>
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </button>
                </div>

                <div className={`grid grid-cols-1 items-start gap-12 lg:gap-16 ${work.orientation === "horizontal" ? "md:grid-cols-2" : "md:grid-cols-[1.25fr_1fr]"}`}>

                    {/* LEFT CELL (50%): image viewer  */}
                    <div className="artwork-img-col">

                        {/* ── Image area: fills viewport height minus header-row ── */}
                        <div className="artwork-img-area" style={{ marginTop: layoutMetrics.winW < 768 ? "0.75rem" : "0" }}>
                            {/* Wrapper that leaves 130px safely at the bottom for thumbnails on PC, but just flows dynamically on Mobile */}
                            <div className="artwork-slider-wrap">

                                {/* ── THE MAX SPACE IMAGE BOX ──────────────────────────────────────────── */}
                                <div ref={boxRef} style={{ width: "100%", height: layoutMetrics.winW < 768 ? "auto" : "100%", position: layoutMetrics.winW < 768 ? "relative" : "absolute", inset: layoutMetrics.winW < 768 ? "auto" : 0 }}>
                                    <div
                                        className="w-full z-10"
                                        style={{
                                            position: "relative",
                                            /* Expand overflow clip: 60px vertically for deep shadow, 30px horizontally (safely less than 32px gap) */
                                            margin: "-60px -30px",
                                            padding: "60px 30px",
                                            width: "calc(100% + 60px)",
                                            height: layoutMetrics.winW < 768 ? `calc(${activeImageMetrics.h}px + 120px + 32px + 24px)` : "calc(100% + 120px)",
                                            transition: "height 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                                            overflow: "hidden",
                                            /* Feather edge masks to smoothly dissolve sliding shadows instead of hard clipping */
                                            WebkitMaskImage: "linear-gradient(to right, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)",
                                            maskImage: "linear-gradient(to right, transparent 0px, black 15px, black calc(100% - 15px), transparent 100%)",
                                        }}
                                        onTouchStart={e => { hasTouch.current = true; setIsZooming(false); swipeRef.current = e.touches[0].clientX; }}
                                        onTouchEnd={e => {
                                            if (swipeRef.current === null) return;
                                            const d = swipeRef.current - e.changedTouches[0].clientX;
                                            if (d > 48 && images.length > 1) setSelectedImageIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
                                            else if (d < -48 && images.length > 1) setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
                                            swipeRef.current = null;
                                        }}
                                    >
                                        {/* ── THE SLIDER TRACK ── */}
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "8rem", /* Massive 128px gap ensures adjacent 45px shadows cannot reach the 30px expanded viewing boundary */
                                                width: "100%",
                                                height: "100%",
                                                transition: isZooming ? "none" : "transform 0.6s cubic-bezier(0.25, 1, 0.5, 1)",
                                                transform: `translateX(calc(-${selectedImageIndex * 100}% - ${selectedImageIndex * 8}rem))`,
                                            }}
                                        >
                                            {images.length > 0 ? (
                                                images.map((img, idx) => {
                                                    // Bulletproof aspect ratio fallback even if image onLoad completely fails due to browser cache
                                                    let fallbackAspect: number | undefined = undefined;
                                                    if (idx === 0) {
                                                        if (work.width_cm && work.height_cm) {
                                                            fallbackAspect = work.width_cm / work.height_cm;
                                                        } else if (work.orientation) {
                                                            fallbackAspect = work.orientation === "horizontal" ? 1.5 : work.orientation === "vertical" ? 0.75 : 1;
                                                        }
                                                    } else {
                                                        fallbackAspect = 1; // reasonable default for thumbnails/detail shots before load
                                                    }

                                                    const aspect = imageAspectRatios[idx] || fallbackAspect;

                                                    // Compute explicit pixel boundaries exactly to completely bypass buggy cross-browser flexbox algorithms.
                                                    // This perfectly guarantees both PC boundary tracking mapping for zoom and Mobile 95vw precision rules!
                                                    let explicitDimensions: React.CSSProperties = { margin: "auto" };

                                                    if (aspect && layoutMetrics.boxW > 0 && layoutMetrics.winW > 0) {
                                                        const isMobile = layoutMetrics.winW < 768;

                                                        if (isMobile) {
                                                            // Mobile: Uncaged 95vw stretch! Absolutely no maxH constraints!
                                                            const renderW = layoutMetrics.boxW * 0.95;
                                                            const renderH = renderW / aspect;
                                                            explicitDimensions = {
                                                                width: `${renderW}px`,
                                                                height: `${renderH}px`,
                                                                margin: "0 auto",
                                                            };
                                                        } else if (layoutMetrics.boxH > 0) {
                                                            const isVertical = aspect < 1;
                                                            // Vertical paintings need more headroom below for thumbnails (130px strip + nav margin + shadow)
                                                            const thumbReserve = isVertical ? 280 : 200;
                                                            const maxW = layoutMetrics.boxW - 45;
                                                            const maxH = layoutMetrics.boxH - thumbReserve;

                                                            let renderW = maxW;
                                                            let renderH = renderW / aspect;

                                                            if (renderH > maxH) {
                                                                renderH = maxH;
                                                                renderW = renderH * aspect;
                                                            }

                                                            explicitDimensions = {
                                                                width: `${renderW}px`,
                                                                height: `${renderH}px`,
                                                                margin: "0 auto",
                                                            };
                                                        }
                                                    }

                                                    return (
                                                        <div
                                                            key={idx}
                                                            style={{
                                                                flex: "0 0 100%",
                                                                width: "100%",
                                                                height: layoutMetrics.winW < 768 ? "auto" : "100%",
                                                                display: "flex",
                                                                alignItems: "flex-start", // Anchors the fully scaled image to the very top ceiling instead of floating middle
                                                                justifyContent: "center",
                                                            }}
                                                        >
                                                            <div
                                                                className="artwork-frame"
                                                                ref={el => { imgRefs.current[idx] = el; }}
                                                                onPointerEnter={e => { if (!hasTouch.current && e.pointerType === "mouse" && window.innerWidth > 768) setIsZooming(true); }}
                                                                onPointerLeave={e => { if (!hasTouch.current && e.pointerType === "mouse") setIsZooming(false); }}
                                                                onPointerMove={handlePointerMove}
                                                                onClick={() => { setIsZooming(false); setFullSizeOpen(true); }}
                                                                style={{
                                                                    display: "flex",
                                                                    position: "relative",
                                                                    overflow: "hidden",
                                                                    borderRadius: "4px",
                                                                    boxShadow: "var(--shadow-card-deep)",
                                                                    cursor: "crosshair",
                                                                    ...explicitDimensions
                                                                }}
                                                            >
                                                                <img
                                                                    src={getImageUrl(img, 'original')}
                                                                    alt={work.title}
                                                                    loading={idx === 0 ? "eager" : "lazy"}
                                                                    onLoad={(e) => handleImgLoad(idx, e)}
                                                                    ref={el => {
                                                                        if (el && el.complete && el.naturalWidth > 0 && !imageAspectRatios[idx]) {
                                                                            handleImgLoad(idx, { currentTarget: el } as any);
                                                                        }
                                                                    }}
                                                                    style={{
                                                                        maxWidth: "100%",
                                                                        maxHeight: "100%",
                                                                        width: explicitDimensions.width ? "100%" : "auto",
                                                                        height: explicitDimensions.height ? "100%" : "auto",
                                                                        objectFit: "contain",
                                                                        transform: isZooming && selectedImageIndex === idx ? "scale(2.5)" : "scale(1)",
                                                                        transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                                                                        transition: isZooming ? "none" : "transform 0.3s ease",
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div style={{ flex: "0 0 100%", width: "100%", height: "100%", background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})` }} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Full Size button - anchored exactly inside the bottom-right corner of the active frame */}
                                    <button
                                        onClick={() => setFullSizeOpen(true)}
                                        style={{
                                            position: "absolute",
                                            top: `${viewFullSizeTopOffset}px`,
                                            right: `${viewFullSizeRightOffset}px`,
                                            zIndex: 100,
                                            display: layoutMetrics.winW >= 768 && activeImageMetrics.h > 0 ? "inline-flex" : "none",
                                            alignItems: "center",
                                            gap: "0.6rem",
                                            background: "rgba(255,255,255,0.3)",
                                            color: "rgba(26,26,24,0.45)",
                                            border: "1px solid rgba(0,0,0,0.06)",
                                            borderRadius: "20px",
                                            padding: "0.4rem 0.9rem",
                                            cursor: "pointer",
                                            fontFamily: "var(--font-sans)",
                                            fontSize: "0.65rem",
                                            fontWeight: 600,
                                            letterSpacing: "0.06em",
                                            textTransform: "uppercase",
                                            transition: "background 0.3s ease, color 0.3s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
                                            willChange: "transform, background",
                                            backdropFilter: "blur(4px)",
                                            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                                            WebkitTapHighlightColor: "transparent",
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.95)";
                                            e.currentTarget.style.color = "var(--color-charcoal)";
                                            e.currentTarget.style.transform = "scale(1.06)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = "rgba(255,255,255,0.3)";
                                            e.currentTarget.style.color = "rgba(26,26,24,0.45)";
                                            e.currentTarget.style.transform = "scale(1)";
                                        }}
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                                            <polyline points="15 3 21 3 21 9" />
                                            <polyline points="9 21 3 21 3 15" />
                                            <line x1="21" y1="3" x2="14" y2="10" />
                                            <line x1="3" y1="21" x2="10" y2="14" />
                                        </svg>
                                        Fullscreen
                                    </button>
                                </div>

                                {/* Thumbnails strip - strictly anchoring below the active image dynamically */}
                                {images.length > 1 && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            bottom: layoutMetrics.winW < 768 ? "4px" : "auto",
                                            top: layoutMetrics.winW < 768 ? "auto" : `calc(${layoutMetrics.imgH}px + 2rem)`,
                                            marginTop: 0,
                                            width: "100%",
                                            overflowX: "auto",
                                            overflowY: "hidden",
                                            display: "flex",
                                            justifyContent: "center",
                                            alignItems: "center",
                                            paddingTop: layoutMetrics.winW < 768 ? "0px" : "40px",
                                            transform: layoutMetrics.winW < 768 ? "none" : "translateY(-40px)",
                                            paddingBottom: layoutMetrics.winW < 768 ? "0px" : "50px",
                                            marginBottom: layoutMetrics.winW < 768 ? "0" : "-50px",
                                            scrollbarWidth: "none",
                                            transition: "top 0.4s cubic-bezier(0.25, 1, 0.5, 1)",
                                            zIndex: 20
                                        }}>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: layoutMetrics.winW < 768 ? "0.25rem" : "0.5rem", justifyContent: "center", paddingTop: "0.5rem", minWidth: "min-content" }}>
                                            {images.map((img, idx) => {
                                                const isActive = selectedImageIndex === idx;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setSelectedImageIndex(idx)}
                                                        style={{
                                                            height: layoutMetrics.winW < 768 ? "24px" : "70px",
                                                            width: layoutMetrics.winW < 768 ? (mobileThumbsRound ? "24px" : "auto") : "auto",
                                                            padding: 0,
                                                            flexShrink: 0,
                                                            margin: isActive ? (layoutMetrics.winW < 768 ? "0 4px" : "0 10px") : "0",
                                                            border: layoutMetrics.winW < 768
                                                                ? (isActive ? "2px solid #fff" : "2px solid transparent")
                                                                : (isActive ? "2px solid var(--color-charcoal)" : "2px solid transparent"),
                                                            cursor: "pointer",
                                                            borderRadius: layoutMetrics.winW < 768 && mobileThumbsRound ? "50%" : "4px",
                                                            overflow: "hidden",
                                                            outline: "none",
                                                            background: "none",
                                                            display: "block",
                                                            opacity: isActive ? 1 : 0.55,
                                                            boxShadow: isActive ? (layoutMetrics.winW < 768 ? "0 2px 6px rgba(0,0,0,0.15)" : "var(--shadow-card-deep)") : (layoutMetrics.winW < 768 ? "0 1px 3px rgba(0,0,0,0.08)" : "var(--shadow-thumb)"),
                                                            transition: "margin 0.25s ease, opacity 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                                                            WebkitTapHighlightColor: "transparent",
                                                        }}
                                                        onMouseEnter={e => {
                                                            if (!isActive) {
                                                                (e.currentTarget as HTMLButtonElement).style.opacity = "0.85";
                                                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-card)";
                                                            }
                                                        }}
                                                        onMouseLeave={e => {
                                                            if (!isActive) {
                                                                (e.currentTarget as HTMLButtonElement).style.opacity = "0.55";
                                                                (e.currentTarget as HTMLButtonElement).style.boxShadow = "var(--shadow-thumb)";
                                                            }
                                                        }}
                                                    >
                                                        <img
                                                            src={getImageUrl(img, 'thumb')}
                                                            alt=""
                                                            style={{
                                                                height: "100%",
                                                                width: layoutMetrics.winW < 768 && mobileThumbsRound ? "100%" : "auto",
                                                                display: "block",
                                                                objectFit: layoutMetrics.winW < 768 && mobileThumbsRound ? "cover" : "initial"
                                                            }}
                                                        />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                            </div>{/* end .wrapper */}
                        </div>{/* end .artwork-img-area */}
                    </div>{/* end .artwork-img-col / left cell */}

                    {/* ── Right: Purchase panel ── */}
                    <ArtworkPurchaseStyles />
                    <ArtworkPurchasePanel
                        work={work}
                        layoutMetrics={layoutMetrics}
                        effectiveLiked={effectiveLiked}
                        setLiked={setLiked}
                        user={user}
                        addPendingLike={addPendingLike}
                        removePendingLike={removePendingLike}
                        incrementUnauthLikeCount={incrementUnauthLikeCount}
                        unauthLikeCount={unauthLikeCount}
                        setShowAuthPrompt={setShowAuthPrompt}
                        resolvedPurchaseType={resolvedPurchaseType}
                        hasCanvasOffers={hasCanvasOffers}
                        hasPaperOffers={hasPaperOffers}
                        updateRouteState={updateRouteState}
                        activeCountryCode={activeCountryCode}
                        convertPrice={convertPrice}
                        addItem={addItem}
                        units={units}
                        storefront={storefront}
                        storefrontLoading={storefrontLoading}
                        storefrontError={storefrontError}
                    />
                </div>
                {/* ── Artwork details section ── */}
                <div style={{ marginTop: layoutMetrics.winW < 768 ? "1.5rem" : "6rem", borderTop: "1px solid var(--color-border)", paddingTop: layoutMetrics.winW < 768 ? "2rem" : "4rem" }}>
                    <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", fontStyle: "italic", marginBottom: "3rem", textAlign: "center" }}>Artwork Details</h2>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                        <div style={{ maxWidth: "600px", width: "100%" }}>
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

                {/* Auth Prompt Modal */}
                <AuthPromptModal isOpen={showAuthPrompt} onClose={() => setShowAuthPrompt(false)} />
            </div>
        </div>
    );
}
