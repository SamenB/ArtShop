"use client";

/**
 * Migration redirect component for legacy gallery URLs.
 * Detects requests to old /gallery/[slug] routes and performs a client-side
 * redirection to the modern canonical /artwork/[id]-[slug] structure.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApiUrl, artworkUrl, apiFetch } from "@/utils";

/**
 * Handles incoming requests to legacy gallery slugs.
 * Extracts the artwork ID from the slug (e.g., "123-sunset"), 
 * fetches the latest canonical slug from the API, and redirects the user.
 * Fallbacks to the root shop or a basic ID-based URL if the lookup fails.
 */
export default function GallerySlugRedirect() {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;

    useEffect(() => {
        if (!slug) return;
        
        // Extract the numeric ID from the hyphenated slug.
        const id = parseInt(slug.split("-")[0], 10);
        if (!id) { 
            router.replace("/shop"); 
            return; 
        }

        // Fetch the specific artwork to build the most up-to-date pretty URL.
        apiFetch(`${getApiUrl()}/artworks/${id}`)
            .then(res => res.json())
            .then(data => {
                const item = data.data || data;
                // Use the canonical URL generator to ensure formatting consistency.
                router.replace(artworkUrl(item.slug || item.id));
            })
            .catch(() => {
                // Persistent fallback if the API is unreachable or the slug is missing.
                router.replace(`/artwork/${id}`);
            });
    }, [slug, router]);

    return (
        <div style={{ 
            height: "60vh", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            fontFamily: "var(--font-sans)", 
            color: "var(--color-muted)" 
        }}>
            Authenticating exhibition path…
        </div>
    );
}
