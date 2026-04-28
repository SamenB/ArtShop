"use client";

import { apiFetch, getApiUrl } from "@/utils";

export type PurchaseType = "canvas" | "paper";

export interface SourceQualitySummary {
    status?: string;
    message?: string;
    embedded_dpi?: {
        x?: number | null;
        y?: number | null;
    };
    max_print_size_at_300dpi_in?: {
        width?: number | null;
        height?: number | null;
    };
    max_print_size_at_150dpi_in?: {
        width?: number | null;
        height?: number | null;
    };
}

export interface PrintSourceMetadata {
    public_url?: string | null;
    file_name?: string | null;
    file_size_bytes?: number | null;
    format?: string | null;
    mode?: string | null;
    width_px?: number | null;
    height_px?: number | null;
    dpi_x?: number | null;
    dpi_y?: number | null;
    icc_profile_present?: boolean;
    aspect_ratio?: string | null;
    max_print_size_at_300dpi_in?: {
        width?: number | null;
        height?: number | null;
    };
    max_print_size_at_150dpi_in?: {
        width?: number | null;
        height?: number | null;
    };
}

export interface StorefrontSizeOption {
    id?: number | null;
    slot_size_label: string;
    size_label: string;
    sku?: string | null;
    supplier_size_cm?: string | null;
    supplier_size_inches?: string | null;
    print_area?: {
        width_px?: number | null;
        height_px?: number | null;
        name?: string | null;
        source?: string | null;
        dimensions?: Record<string, unknown>;
    } | null;
    provider_attributes?: Record<string, string>;
    source_country?: string | null;
    currency?: string | null;
    delivery_days?: string | null;
    shipping_method?: string | null;
    service_name?: string | null;
    service_level?: string | null;
    default_shipping_tier?: string | null;
    shipping_profiles?: Array<Record<string, unknown>>;
    shipping_support?: {
        status?: string;
        chosen_tier?: string | null;
        chosen_shipping_price?: number | null;
    };
    business_policy?: {
        shipping_mode?: string | null;
        retail_product_price?: number | null;
        customer_shipping_price?: number | null;
        free_delivery_badge?: boolean;
    };
    supplier_product_price?: number | null;
    supplier_shipping_price?: number | null;
    supplier_total_cost?: number | null;
    retail_product_price?: number | null;
    customer_shipping_price?: number | null;
    customer_total_price?: number | null;
}

export interface StorefrontCard {
    category_id: string;
    label: string;
    medium: PurchaseType;
    storefront_action?: string | null;
    material_label?: string | null;
    frame_label?: string | null;
    fulfillment_level?: string | null;
    geography_scope?: string | null;
    tax_risk?: string | null;
    note?: string | null;
    source_mix?: string | null;
    source_countries?: string[];
    available_shipping_tiers?: string[];
    default_shipping_tier?: string | null;
    shipping_support?: {
        status?: string;
    };
    business_summary?: {
        default_shipping_mode?: string;
    };
    edition_context: {
        open_available: boolean;
        limited_available: boolean;
        limited_quantity?: number | null;
    };
    default_prodigi_attributes: Record<string, string>;
    allowed_attribute_options: Record<string, string[]>;
    print_profile: {
        editor_mode?: string;
        crop_strategy?: string;
        edge_extension_mode?: string;
        target_dpi?: number;
        minimum_dpi?: number;
        prodigi_sizing?: string;
        safe_margin_pct?: number;
        mount_safe_margin_pct?: number;
        wrap_margin_pct?: number;
    };
    size_options: StorefrontSizeOption[];
}

export interface MediumOffers {
    open_available: boolean;
    limited_available: boolean;
    limited_quantity?: number | null;
    cards: StorefrontCard[];
}

export interface ArtworkPrintStorefront {
    artwork_id: number;
    slug: string;
    title: string;
    country_code: string;
    country_name?: string | null;
    print_quality_url?: string | null;
    print_source_metadata?: PrintSourceMetadata | null;
    source_quality_summary?: SourceQualitySummary;
    mediums: {
        paper: MediumOffers;
        canvas: MediumOffers;
    };
    country_supported: boolean;
    available_country_codes: string[];
    message?: string | null;
}

const storefrontCache = new Map<string, ArtworkPrintStorefront>();
const pendingStorefrontRequests = new Map<string, Promise<ArtworkPrintStorefront>>();

export function buildArtworkStorefrontKey(
    artworkSlugOrId: string | number,
    countryCode: string
): string {
    return `${String(artworkSlugOrId)}:${countryCode.toUpperCase()}`;
}

export async function loadArtworkStorefront(
    artworkSlugOrId: string | number,
    countryCode: string
): Promise<ArtworkPrintStorefront> {
    const requestKey = buildArtworkStorefrontKey(artworkSlugOrId, countryCode);
    const cached = storefrontCache.get(requestKey);
    if (cached) {
        return cached;
    }

    const pending = pendingStorefrontRequests.get(requestKey);
    if (pending) {
        return pending;
    }

    const request = (async () => {
        const artworkRef = encodeURIComponent(String(artworkSlugOrId));
        const response = await apiFetch(
            `${getApiUrl()}/artworks/${artworkRef}/prints?country=${countryCode.toUpperCase()}`
        );
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.detail || "Unable to load print offers.");
        }

        const data = (await response.json()) as ArtworkPrintStorefront;
        storefrontCache.set(requestKey, data);
        return data;
    })();

    pendingStorefrontRequests.set(requestKey, request);
    try {
        return await request;
    } finally {
        pendingStorefrontRequests.delete(requestKey);
    }
}
