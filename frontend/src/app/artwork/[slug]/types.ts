import type { ArtworkPrintStorefront } from "@/lib/artworkStorefront";

export type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

export interface ArtworkImage {
    thumb: string;
    medium: string;
    original: string;
}

export interface Artwork {
    id: number;
    slug?: string;
    title: string;
    description: string;
    medium: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    has_prints: boolean;
    has_original?: boolean;
    has_canvas_print?: boolean;
    has_paper_print?: boolean;
    orientation?: string;
    base_print_price?: number;
    images?: (string | ArtworkImage)[];
    aspect_ratio?: string;
    gradientFrom?: string;
    gradientTo?: string;
    width_cm?: number;
    height_cm?: number;
    print_aspect_ratio?: { id: number; label: string };
    has_canvas_print_limited?: boolean;
    has_paper_print_limited?: boolean;
    canvas_print_limited_quantity?: number;
    paper_print_limited_quantity?: number;
    print_quality_url?: string;
    print_storefront?: ArtworkPrintStorefront | null;
}
