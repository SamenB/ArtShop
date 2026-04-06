"use client";
// Redirect old /gallery/{id} links to the new canonical /artwork/{id}-{slug} URL
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApiUrl, artworkUrl, apiFetch } from "@/utils";

export default function GallerySlugRedirect() {
    const params = useParams();
    const router = useRouter();
    const slug = params?.slug as string;

    useEffect(() => {
        if (!slug) return;
        const id = parseInt(slug.split("-")[0], 10);
        if (!id) { router.replace("/shop"); return; }

        // Fetch title so we can build the pretty URL, fallback to just /artwork/{id}
        apiFetch(`${getApiUrl()}/artworks/${id}`)
            .then(res => res.json())
            .then(data => {
                const item = data.data || data;
                router.replace(artworkUrl(item.slug || item.id));
            })
            .catch(() => router.replace(`/artwork/${id}`));
    }, [slug, router]);

    return (
        <div style={{ height: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", color: "var(--color-muted)" }}>
            Redirecting…
        </div>
    );
}
