export interface ArtworkImage {
    thumb: string;
    medium: string;
    original: string;
}

export type ImageEntry = string | ArtworkImage;

export interface Label {
    id: number;
    title: string;
    category_id?: number;
}

export interface LabelCategory {
    id: number;
    title: string;
    accent_color?: string;
}

export interface AspectRatio {
    id: number;
    label: string;
    description: string | null;
}

export interface PrintReadinessSummary {
    status: "ready" | "attention" | "blocked" | "not_required";
    message: string;
    total_slots: number;
    relevant_slots: number;
    ready_slots: number;
    blocked_slots: number;
    highlight_variant?: string;
    // Legacy compat
    blocking_step_count: number;
    attention_step_count: number;
    blocking_category_count: number;
    ready_category_count: number;
    enabled_category_count: number;
}

export interface MasterSlot {
    slot_id: string;
    label: string;
    description: string;
    asset_role: string;
    covers_categories: string[];
    derives_categories?: string[];
    relevant: boolean;
    status: "ready" | "attention" | "blocked" | "not_required";
    required_min_px: {
        width: number;
        height: number;
        source?: string | null;
        print_area_name?: string | null;
        visible_art_width_px?: number | null;
        visible_art_height_px?: number | null;
        physical_width_in?: number | null;
        physical_height_in?: number | null;
    } | null;
    required_min_px_source?: string | null;
    export_guidance?: {
        mode: string;
        title: string;
        message: string;
        target_width_px: number;
        target_height_px: number;
        source?: string | null;
        print_area_name?: string | null;
        artwork_ratio?: number | null;
        target_ratio?: number | null;
        full_file_ratio_diff_px?: number | null;
        full_file_ratio_diff_warning?: boolean;
        visible_art_width_px?: number | null;
        visible_art_height_px?: number | null;
        physical_width_in?: number | null;
        physical_height_in?: number | null;
        provider_target_differs_from_visible_art?: boolean;
        provider_target_width_px?: number | null;
        provider_target_height_px?: number | null;
        estimated_cover_crop_width_px?: number | null;
        estimated_cover_crop_height_px?: number | null;
        ratio_label?: string | null;
    } | null;
    derivative_plan?: {
        strategy: string;
        target_count: number;
        direct_resize_count: number;
        exact_recompose_count: number;
        can_direct_resize_all: boolean;
        note?: string | null;
    } | null;
    provider_attribute_coverage?: {
        kind: string;
        attribute: string;
        preferred_value: string;
        total_options: number;
        preferred_count: number;
        non_preferred_count: number;
        strict_preferred_hidden_count: number;
        coverage_pct?: number | null;
        by_wrap: Record<string, number>;
        by_category: Array<{
            category_id: string;
            total_options: number;
            preferred_count: number;
            non_preferred_count: number;
            coverage_pct?: number | null;
            by_wrap: Record<string, number>;
        }>;
        note?: string | null;
    } | null;
    largest_size_label: string | null;
    required_for_sizes: string[];
    covered_size_count: number;
    generated_derivatives_count: number;
    uploaded_asset: ArtworkPrintAsset | null;
    validation: {
        issues: string[];
        warnings: string[];
    };
    issues: string[];
    warnings: string[];
}

export interface ArtworkPrintWorkflowPayload {
    artwork_id: number;
    provider_key: string;
    print_enabled: boolean;
    ratio_assigned?: boolean;
    ratio_label?: string | null;
    master_slots: MasterSlot[];
    overall_status: string;
    readiness_summary: PrintReadinessSummary;
}

export interface Artwork {
    id: number;
    title: string;
    slug?: string | null;
    description?: string | null;
    year?: number | null;
    width_cm?: number | null;
    height_cm?: number | null;
    original_price?: number | null;
    original_status?: string | null;
    images?: ImageEntry[];
    has_original?: boolean;
    has_canvas_print?: boolean;
    has_canvas_print_limited?: boolean;
    has_paper_print?: boolean;
    has_paper_print_limited?: boolean;
    canvas_print_limited_quantity?: number | null;
    paper_print_limited_quantity?: number | null;
    white_border_pct?: number;
    print_aspect_ratio_id?: number | null;
    orientation?: string | null;
    print_quality_url?: string | null;
    print_profile_overrides?: Record<string, unknown> | null;
    print_readiness_summary?: PrintReadinessSummary | null;
    labels?: { id: number; title: string; category_id?: number }[];
}

export interface ArtworkPrintAsset {
    id: number;
    artwork_id: number;
    provider_key: string;
    category_id: string | null;
    asset_role: string;
    slot_size_label: string | null;
    file_url: string;
    file_name: string | null;
    file_ext: string | null;
    mime_type: string | null;
    file_size_bytes: number | null;
    checksum_sha256: string | null;
    file_metadata?: Record<string, unknown> | null;
    note?: string | null;
}

export interface ArtworkFormState {
    title: string;
    description: string;
    year: number;
    width_cm: number | string;
    height_cm: number | string;
    original_price: number | string;
    has_original: boolean;
    has_canvas_print: boolean;
    has_canvas_print_limited: boolean;
    has_paper_print: boolean;
    has_paper_print_limited: boolean;
    canvas_print_limited_quantity: number | string;
    paper_print_limited_quantity: number | string;
    white_border_pct: number;
    print_aspect_ratio_id: number | null;
    orientation: string;
    labels: number[];
    original_status: string;
    print_quality_url: string;
    print_profile_overrides: Record<string, unknown> | null;
    canvas_wrap_style: string;
}

export interface DragItem {
    type: "existing" | "new";
    url: string;
    existingData?: ImageEntry;
    file?: File;
}
