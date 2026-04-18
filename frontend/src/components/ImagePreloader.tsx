"use client";

/**
 * Invisible Asset Preloader.
 * Queues and pre-fetches high priority graphics in the browser's background idle time.
 */

import { useEffect } from "react";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";

interface Artwork {
    id: number;
    images?: string[];
}

export default function ImagePreloader() {
    useEffect(() => {
        // Run preloading aggressively after initial mount but without blocking
        // main thread interactive paint
        const runPreload = () => {
             apiFetch(`${getApiUrl()}/artworks?limit=1000`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (!data) return;
                    const rawData = data.items || data.data || data;
                    if (!Array.isArray(rawData)) return;
                    
                    const urlsToPreload = new Set<string>();

                    rawData.forEach((art: Artwork) => {
                        if (art.images && art.images.length > 0) {
                            const url = getImageUrl(art.images[0], 'medium');
                            if (url) urlsToPreload.add(url);
                        }
                    });

                    // Preload unique URLs
                    urlsToPreload.forEach(url => {
                        const img = new Image();
                        img.src = url;
                    });
                    
                    if (urlsToPreload.size > 0) {
                        console.log(`Preloaded ${urlsToPreload.size} artwork images.`);
                    }
                })
                .catch(err => console.error("Preloader error:", err));       
        };

        let handle: any;
        if ('requestIdleCallback' in window) {
            handle = window.requestIdleCallback(runPreload, { timeout: 2000 });
        } else {
            handle = setTimeout(runPreload, 200);
        }

        return () => {
            if ('cancelIdleCallback' in window) window.cancelIdleCallback(handle);
            else clearTimeout(handle);
        };
    }, []);

    return null;
}
