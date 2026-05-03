export type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

export interface Artwork {
    id: number;
    slug?: string;
    title: string;
    description: string;
    medium?: string;
    style?: string;
    size: string;
    original_price: number;
    original_status: OriginalStatus;
    has_prints: boolean;
    orientation?: string;
    base_print_price?: number;
    width_cm?: number;
    height_cm?: number;
    width_in?: number;
    height_in?: number;
    images?: (string | { thumb: string; medium: string; original: string })[];
    gradientFrom?: string;
    gradientTo?: string;
    labels?: Array<{ title: string; category_id?: number; id: number }>;
}

export interface CollectionData {
    id: number;
    title: string;
}

export type SortKey = "default" | "year" | "title" | "available";
