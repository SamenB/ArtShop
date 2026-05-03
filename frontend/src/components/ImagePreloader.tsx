"use client";

/**
 * Invisible Asset Preloader.
 * Queues and pre-fetches high priority graphics in the browser's background idle time.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getApiUrl, getImageUrl, apiFetch, apiJson } from "@/utils";

interface Artwork {
    id: number;
    images?: (string | { thumb?: string; medium?: string; original?: string })[];
}

export default function ImagePreloader() {
    const pathname = usePathname();

    useEffect(() => {
        if (pathname === "/shop" || pathname?.startsWith("/artwork/")) {
            return;
        }

        const storageKey = "artshop_preloaded_artwork_images_v1";
        if (sessionStorage.getItem(storageKey) === "1") {
            return;
        }

        const abortController = new AbortController();
        let cancelled = false;

        const preloadImage = (url: string) => new Promise<void>((resolve) => {
            if (cancelled) {
                resolve();
                return;
            }
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
        });

        const runPreload = async () => {
            try {
                const data = await apiFetch(`${getApiUrl()}/artworks?limit=12`, {
                    signal: abortController.signal,
                })
                    .then(res => apiJson<Artwork[] | { items?: Artwork[]; data?: Artwork[] }>(res));
                if (cancelled) return;
                const rawData = Array.isArray(data) ? data : data.items || data.data || [];
                if (!Array.isArray(rawData)) return;

                const urlsToPreload = [...new Set(rawData
                    .map((art) => art.images?.[0] ? getImageUrl(art.images[0], "thumb") : undefined)
                    .filter((url): url is string => Boolean(url))
                )].slice(0, 8);

                for (const url of urlsToPreload) {
                    if (cancelled) break;
                    await preloadImage(url);
                }

                if (!cancelled) {
                    sessionStorage.setItem(storageKey, "1");
                }
            } catch (err) {
                if (!cancelled && !abortController.signal.aborted) {
                    console.warn("Preloader skipped:", err);
                }
            }
        };

        let handle: ReturnType<typeof setTimeout> | number;
        let idleHandle = false;
        if ("requestIdleCallback" in window) {
            handle = window.requestIdleCallback(runPreload, { timeout: 3000 });
            idleHandle = true;
        } else {
            handle = globalThis.setTimeout(runPreload, 1000);
        }

        return () => {
            cancelled = true;
            abortController.abort();
            if (idleHandle && "cancelIdleCallback" in window) window.cancelIdleCallback(handle as number);
            else clearTimeout(handle);
        };
    }, [pathname]);

    return null;
}
