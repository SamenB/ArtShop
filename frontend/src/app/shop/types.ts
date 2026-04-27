export type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

export interface Product {
    id: number;
    slug?: string;
    title: string;
    description: string;
    medium: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    images?: (string | { thumb: string; medium: string; original: string })[];
    width_cm?: number;
    height_cm?: number;
    width_in?: number;
    height_in?: number;
    year?: number;
    has_prints?: boolean;
    orientation?: string;
    base_print_price?: number;
    storefront_summary?: {
        country_code: string;
        country_name?: string | null;
        print_country_supported: boolean;
        min_print_price?: number | null;
        default_medium?: "paper" | "canvas" | null;
        mediums: {
            paper: {
                available: boolean;
                starting_price?: number | null;
                starting_size_label?: string | null;
                card_count: number;
            };
            canvas: {
                available: boolean;
                starting_price?: number | null;
                starting_size_label?: string | null;
                card_count: number;
            };
        };
    };
    aspectRatio?: string;
    gradientFrom?: string;
    gradientTo?: string;
    labels?: { id: number; title: string; category_id?: number }[];
}

export interface Label { id: number; title: string; category_id?: number; }
export interface LabelCategory { id: number; title: string; }

export type SortKey = "newest" | "price-low" | "price-high" | "size-small" | "size-large";
