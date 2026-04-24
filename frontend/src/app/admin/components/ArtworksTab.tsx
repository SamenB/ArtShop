"use client";

import { useEffect, useRef, useState } from "react";

import { apiFetch, getApiUrl, getImageUrl } from "@/utils";

import SimpleArtworkCropperModal from "./SimpleArtworkCropperModal";

interface ArtworkImage {
    thumb: string;
    medium: string;
    original: string;
}

type ImageEntry = string | ArtworkImage;

interface Label {
    id: number;
    title: string;
    category_id?: number;
}

interface LabelCategory {
    id: number;
    title: string;
    accent_color?: string;
}

interface AspectRatio {
    id: number;
    label: string;
    description: string | null;
}

interface PrintReadinessSummary {
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

interface MasterSlot {
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

interface ArtworkPrintWorkflowPayload {
    artwork_id: number;
    provider_key: string;
    print_enabled: boolean;
    ratio_assigned?: boolean;
    ratio_label?: string | null;
    master_slots: MasterSlot[];
    overall_status: string;
    readiness_summary: PrintReadinessSummary;
}

interface Artwork {
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
    print_aspect_ratio_id?: number | null;
    orientation?: string | null;
    print_quality_url?: string | null;
    print_readiness_summary?: PrintReadinessSummary | null;
    labels?: { id: number; title: string; category_id?: number }[];
}

interface ArtworkPrintAsset {
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

interface ArtworkFormState {
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
    print_aspect_ratio_id: number | null;
    orientation: string;
    labels: number[];
    original_status: string;
    print_quality_url: string;
}

interface DragItem {
    type: "existing" | "new";
    url: string;
    existingData?: ImageEntry;
    file?: File;
}

const STATUS_OPTIONS = [
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "reserved", label: "Reserved" },
    { value: "not_for_sale", label: "Not for Sale" },
    { value: "on_exhibition", label: "On Exhibition" },
    { value: "archived", label: "Archived" },
    { value: "digital", label: "Digital" },
];

const WORKFLOW_STEP_ORDER = [
    { id: "basics", label: "Basics" },
    { id: "offerings", label: "Offerings" },
    { id: "pipeline", label: "Print Pipeline" },
    { id: "media", label: "Media" },
] as const;

const PRINT_CATEGORY_LABELS: Record<string, string> = {
    paperPrintRolled: "Rolled paper prints",
    paperPrintBoxFramed: "Framed paper prints",
    canvasRolled: "Rolled canvas",
    canvasStretched: "Stretched canvas",
    canvasClassicFrame: "Classic framed canvas",
    canvasFloatingFrame: "Floating framed canvas",
};

const INPUT_CLASS =
    "w-full bg-white border border-[#31323E]/15 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#31323E] focus:outline-none focus:border-[#31323E]/45 focus:ring-2 focus:ring-[#31323E]/10 transition-all";

const currentYear = new Date().getFullYear();

function createDefaultFormState(): ArtworkFormState {
    return {
        title: "",
        description: "",
        year: currentYear,
        width_cm: "",
        height_cm: "",
        original_price: 1000,
        has_original: false,
        has_canvas_print: false,
        has_canvas_print_limited: false,
        has_paper_print: false,
        has_paper_print_limited: false,
        canvas_print_limited_quantity: "",
        paper_print_limited_quantity: "",
        print_aspect_ratio_id: null,
        orientation: "Horizontal",
        labels: [],
        original_status: "available",
        print_quality_url: "",
    };
}

function resolveImageUrl(img: ImageEntry): string {
    if (typeof img === "string") {
        return img.startsWith("http") ? img : `${getApiUrl().replace("/api", "")}${img}`;
    }
    return getImageUrl(img, "thumb") || "";
}

function hasPrintOfferings(formData: ArtworkFormState): boolean {
    return Boolean(
        formData.has_canvas_print ||
            formData.has_canvas_print_limited ||
            formData.has_paper_print ||
            formData.has_paper_print_limited
    );
}

function hasMissingPrintRatio(formData: ArtworkFormState): boolean {
    return hasPrintOfferings(formData) && !formData.print_aspect_ratio_id;
}

function hasOfferingValidationIssues(formData: ArtworkFormState): boolean {
    return Boolean(
        (formData.has_canvas_print_limited &&
            !Number(formData.canvas_print_limited_quantity || 0)) ||
            (formData.has_paper_print_limited &&
                !Number(formData.paper_print_limited_quantity || 0))
    );
}

function toNumber(value: number | string | null | undefined, isFloat = false): number | null {
    if (value === "" || value === null || value === undefined) {
        return null;
    }
    const parsed = isFloat ? Number.parseFloat(String(value)) : Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function buildFormPayload(formData: ArtworkFormState) {
    const payload: Record<string, unknown> = {
        ...formData,
        original_price: toNumber(formData.original_price),
        year: toNumber(formData.year),
        width_cm: toNumber(formData.width_cm, true),
        height_cm: toNumber(formData.height_cm, true),
        canvas_print_limited_quantity: toNumber(formData.canvas_print_limited_quantity),
        paper_print_limited_quantity: toNumber(formData.paper_print_limited_quantity),
        print_aspect_ratio_id: formData.print_aspect_ratio_id,
    };

    if (payload.width_cm !== null) {
        payload.width_in = Number(((payload.width_cm as number) * 0.393701).toFixed(2));
    } else {
        payload.width_in = null;
    }

    if (payload.height_cm !== null) {
        payload.height_in = Number(((payload.height_cm as number) * 0.393701).toFixed(2));
    } else {
        payload.height_in = null;
    }

    if (!formData.has_original || formData.original_status !== "available") {
        payload.original_price = null;
    }

    if (formData.original_status === "digital") {
        payload.width_cm = null;
        payload.height_cm = null;
        payload.width_in = null;
        payload.height_in = null;
    }

    return payload;
}

function getStatusClasses(status: string): string {
    if (status === "ready") {
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (status === "blocked") {
        return "bg-rose-50 text-rose-700 border border-rose-200";
    }
    return "bg-amber-50 text-amber-700 border border-amber-200";
}

function titleCase(value: string): string {
    return value
        .replace(/[_-]/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatPrintCategory(categoryId: string): string {
    return PRINT_CATEGORY_LABELS[categoryId] || titleCase(categoryId);
}

function formatInchesValue(value: number | null | undefined): string | null {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return null;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatCoverCropNotice(
    widthPx: number | null | undefined,
    heightPx: number | null | undefined
): string | null {
    const safeWidth = widthPx ?? 0;
    const safeHeight = heightPx ?? 0;
    if (safeHeight >= safeWidth && safeHeight > 0) {
        return `${safeHeight} px on the height`;
    }
    if (safeWidth > 0) {
        return `${safeWidth} px on the width`;
    }
    return null;
}

function FormSection({ title, description }: { title: string; description?: string }) {
    return (
        <div className="mb-5">
            <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-[#31323E]">
                    {title}
                </h3>
                <div className="flex-1 h-px bg-[#31323E]/10" />
            </div>
            {description ? (
                <p className="text-xs text-[#31323E]/45 font-medium">{description}</p>
            ) : null}
        </div>
    );
}

function FieldLabel({
    text,
    required = false,
    valid = true,
}: {
    text: string;
    required?: boolean;
    valid?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 mb-1.5">
            <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    valid ? "bg-emerald-400" : "bg-amber-400"
                }`}
            />
            <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#31323E]/60">
                {text}
                {required ? " *" : ""}
            </label>
        </div>
    );
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getStatusClasses(status)}`}
        >
            {label || titleCase(status)}
        </span>
    );
}

function IssueList({
    title,
    items,
    tone,
}: {
    title: string;
    items?: string[];
    tone: "danger" | "warning";
}) {
    if (!items || items.length === 0) {
        return null;
    }

    const classes =
        tone === "danger"
            ? "bg-rose-50 border border-rose-200 text-rose-700"
            : "bg-amber-50 border border-amber-200 text-amber-700";

    return (
        <div className={`rounded-xl px-3.5 py-3 ${classes}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2">{title}</p>
            <ul className="space-y-1.5 text-xs font-medium">
                {items.map((item) => (
                    <li key={item}>- {item}</li>
                ))}
            </ul>
        </div>
    );
}

function LabelMultiSelect({
    labels,
    selected,
    onChange,
    placeholder,
}: {
    labels: Label[];
    selected: number[];
    onChange: (ids: number[]) => void;
    placeholder: string;
}) {
    const toggle = (id: number) => {
        if (selected.includes(id)) {
            onChange(selected.filter((item) => item !== id));
            return;
        }
        onChange([...selected, id]);
    };

    return (
        <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
                const active = selected.includes(label.id);
                return (
                    <button
                        key={label.id}
                        type="button"
                        onClick={() => toggle(label.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            active
                                ? "bg-[#31323E] text-white border border-[#31323E]"
                                : "bg-white text-[#31323E]/70 border border-[#31323E]/15 hover:bg-[#31323E]/5"
                        }`}
                    >
                        {label.title}
                    </button>
                );
            })}
            {labels.length === 0 ? (
                <span className="text-xs font-medium text-[#31323E]/40 italic">{placeholder}</span>
            ) : null}
        </div>
    );
}

function ImageReorderGrid({
    items,
    onReorder,
    onRemove,
    onAddFiles,
    onCropClick,
    maxItems = 10,
}: {
    items: DragItem[];
    onReorder: (next: DragItem[]) => void;
    onRemove: (index: number) => void;
    onAddFiles: (files: File[]) => void;
    onCropClick?: (index: number) => void;
    maxItems?: number;
}) {
    const dragIndexRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (index: number) => {
        if (dragIndexRef.current === null || dragIndexRef.current === index) {
            return;
        }
        const next = [...items];
        const [moved] = next.splice(dragIndexRef.current, 1);
        next.splice(index, 0, moved);
        dragIndexRef.current = null;
        onReorder(next);
    };

    return (
        <div>
            <div className="flex flex-wrap gap-3 mt-3">
                {items.map((item, index) => (
                    <div
                        key={`${item.url}-${index}`}
                        draggable
                        onDragStart={() => {
                            dragIndexRef.current = index;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        className={`relative w-[104px] h-[104px] rounded-xl overflow-hidden bg-[#31323E]/5 ${
                            index === 0 ? "ring-2 ring-[#31323E]" : "border border-[#31323E]/10"
                        }`}
                    >
                        <img
                            src={item.url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        />
                        <div className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-[0.14em] rounded-full px-2 py-1 bg-white/90 text-[#31323E]">
                            {index === 0 ? "Cover" : `#${index + 1}`}
                        </div>
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold"
                        >
                            x
                        </button>
                        {item.type === "new" && onCropClick ? (
                            <button
                                type="button"
                                onClick={() => onCropClick(index)}
                                className="absolute bottom-2 right-2 rounded-full bg-[#31323E] text-white text-[10px] font-bold px-2 py-1"
                            >
                                Crop
                            </button>
                        ) : null}
                    </div>
                ))}

                {items.length < maxItems ? (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="w-[104px] h-[104px] rounded-xl border border-dashed border-[#31323E]/20 text-[#31323E]/35 text-3xl font-light hover:bg-[#31323E]/5 transition-colors"
                    >
                        +
                    </button>
                ) : null}
            </div>

            <p className="text-[10px] font-semibold text-[#31323E]/40 mt-2 tracking-[0.14em] uppercase">
                Drag to reorder. First image becomes the cover. Up to {maxItems} photos.
            </p>

            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onClick={(event) => {
                    (event.target as HTMLInputElement).value = "";
                }}
                onChange={(event) => {
                    const files = Array.from(event.target.files || []).slice(0, maxItems - items.length);
                    if (files.length > 0) {
                        onAddFiles(files);
                    }
                    (event.target as HTMLInputElement).value = "";
                }}
            />
        </div>
    );
}

export default function ArtworksTab() {
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [categories, setCategories] = useState<LabelCategory[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [savingArtwork, setSavingArtwork] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [imageItems, setImageItems] = useState<DragItem[]>([]);
    const [cropImageIndex, setCropImageIndex] = useState<number | null>(null);
    const [workflowData, setWorkflowData] = useState<ArtworkPrintWorkflowPayload | null>(null);
    const [workflowLoading, setWorkflowLoading] = useState(false);
    const [workflowError, setWorkflowError] = useState<string | null>(null);
    const [assetUploadingSlot, setAssetUploadingSlot] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [payloadRefreshLoading, setPayloadRefreshLoading] = useState(false);
    const [payloadRefreshMessage, setPayloadRefreshMessage] = useState<string | null>(null);
    const [payloadRefreshError, setPayloadRefreshError] = useState<string | null>(null);
    const [activeStep, setActiveStep] =
        useState<(typeof WORKFLOW_STEP_ORDER)[number]["id"]>("basics");
    const [formData, setFormData] = useState<ArtworkFormState>(createDefaultFormState());

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artworksRes, categoriesRes, labelsRes, ratiosRes] = await Promise.all([
                apiFetch(`${getApiUrl()}/artworks/admin/list?limit=200&include_print_readiness=true`),
                apiFetch(`${getApiUrl()}/labels/categories`),
                apiFetch(`${getApiUrl()}/labels`),
                apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios`),
            ]);

            if (artworksRes.ok) {
                setArtworks(await artworksRes.json());
            }
            if (categoriesRes.ok) {
                setCategories(await categoriesRes.json());
            }
            if (labelsRes.ok) {
                setLabels(await labelsRes.json());
            }
            if (ratiosRes.ok) {
                setAspectRatios(await ratiosRes.json());
            }
        } catch (error) {
            console.error("Failed to fetch artwork admin data", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchWorkflow = async (artworkId: number) => {
        setWorkflowLoading(true);
        setWorkflowError(null);
        try {
            const response = await apiFetch(`${getApiUrl()}/artworks/${artworkId}/print-workflow?t=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Workflow request failed with ${response.status}`);
            }
            setWorkflowData((await response.json()) as ArtworkPrintWorkflowPayload);
        } catch (error) {
            console.error(error);
            setWorkflowData(null);
            setWorkflowError("Could not load print workflow yet.");
        } finally {
            setWorkflowLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const refreshArtworkPayloads = async () => {
        const confirmed = window.confirm(
            "Refresh storefront payloads for all artworks now? This rebuilds the active Prodigi bake, rematerializes artwork payloads, and clears runtime print caches."
        );
        if (!confirmed) {
            return;
        }

        setPayloadRefreshLoading(true);
        setPayloadRefreshMessage(null);
        setPayloadRefreshError(null);

        try {
            const response = await apiFetch(`${getApiUrl()}/v1/admin/prodigi/refresh-artwork-payloads`, {
                method: "POST",
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }

            const payload = await response.json();
            const bakeSummary = payload?.bake
                ? `${payload.bake.offer_group_count} groups / ${payload.bake.offer_size_count} sizes`
                : "bake updated";
            const materializedCount =
                payload?.artwork_storefront_materialization?.payload_count ?? null;
            const cacheCleared = payload?.cache_clear?.deleted_keys ?? 0;

            setPayloadRefreshMessage(
                `Storefront payloads refreshed: ${bakeSummary}${
                    materializedCount !== null ? `, ${materializedCount} artwork-country payloads` : ""
                }, cache cleared ${cacheCleared} key${cacheCleared === 1 ? "" : "s"}.`
            );
            await fetchData();
            if (editingId) {
                await fetchWorkflow(editingId);
            }
        } catch (error) {
            console.error("Failed to refresh artwork storefront payloads", error);
            setPayloadRefreshError(
                error instanceof Error
                    ? error.message
                    : "Failed to refresh storefront payloads."
            );
        } finally {
            setPayloadRefreshLoading(false);
        }
    };

    const resetEditor = () => {
        setFormData(createDefaultFormState());
        setImageItems([]);
        setEditingId(null);
        setWorkflowData(null);
        setWorkflowError(null);
        setNotice(null);
        setActiveStep("basics");
        setIsFormOpen(false);
    };

    const openNewEditor = () => {
        setFormData(createDefaultFormState());
        setImageItems([]);
        setEditingId(null);
        setWorkflowData(null);
        setWorkflowError(null);
        setNotice(null);
        setActiveStep("basics");
        setIsFormOpen(true);
    };

    const handleSaveCrop = async (croppedBlob: Blob) => {
        if (cropImageIndex === null) {
            return;
        }
        const file = new File([croppedBlob], `cropped-${Date.now()}.webp`, {
            type: "image/webp",
        });
        setImageItems((previous) => {
            const next = [...previous];
            next[cropImageIndex] = {
                type: "new",
                url: URL.createObjectURL(file),
                file,
            };
            return next;
        });
        setCropImageIndex(null);
    };

    const saveArtwork = async () => {
        if (!formData.title.trim()) {
            window.alert("Title is required.");
            return null;
        }

        if (hasPrintOfferings(formData) && !formData.print_aspect_ratio_id) {
            window.alert("Please choose a print aspect ratio in the Basics section before enabling print offerings.");
            return null;
        }

        if (formData.has_original && formData.original_status === "available") {
            const originalPrice = Number(formData.original_price || 0);
            if (originalPrice <= 0) {
                window.alert("Original price must be greater than zero when the original is sellable.");
                return null;
            }
        }

        setSavingArtwork(true);
        setNotice(null);

        try {
            const payload = buildFormPayload(formData);
            const method = editingId ? "PUT" : "POST";
            const url = editingId
                ? `${getApiUrl()}/artworks/${editingId}`
                : `${getApiUrl()}/artworks`;

            const response = await apiFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                window.alert(`Save failed: ${response.status} ${JSON.stringify(errorPayload)}`);
                return null;
            }

            const data = await response.json();
            const targetId = editingId || data.data?.id;
            if (!targetId) {
                throw new Error("Artwork ID was not returned after save.");
            }

            if (editingId) {
                const existingOrdered = imageItems
                    .filter((item) => item.type === "existing")
                    .map((item) => item.existingData);
                await apiFetch(`${getApiUrl()}/artworks/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ images: existingOrdered }),
                });
            }

            const newFiles = imageItems
                .filter((item) => item.type === "new" && item.file)
                .map((item) => item.file as File);
            if (newFiles.length > 0) {
                const body = new FormData();
                newFiles.forEach((file) => body.append("files", file));
                await apiFetch(`${getApiUrl()}/artworks/${targetId}/images`, {
                    method: "POST",
                    body,
                });
            }

            setEditingId(targetId);
            setIsFormOpen(true);
            setNotice(
                editingId
                    ? "Artwork updated. Draft state and print workflow were refreshed."
                    : "Artwork draft created. You can continue through the print workflow now."
            );

            await fetchData();

            if (hasPrintOfferings(formData)) {
                await fetchWorkflow(targetId);
                if (!editingId) {
                    setActiveStep(formData.print_aspect_ratio_id ? "pipeline" : "basics");
                }
            } else {
                setWorkflowData(null);
            }

            return targetId;
        } catch (error) {
            console.error(error);
            window.alert("Network error while saving the artwork.");
            return null;
        } finally {
            setSavingArtwork(false);
        }
    };

    const handleEditClick = async (artwork: Artwork) => {
        setNotice(null);
        setWorkflowError(null);

        try {
            const response = await apiFetch(`${getApiUrl()}/artworks/${artwork.id}`);
            if (!response.ok) {
                throw new Error(`Artwork request failed with ${response.status}`);
            }
            const full = (await response.json()) as Artwork;
            setFormData({
                title: full.title || "",
                description: full.description || "",
                year: full.year || currentYear,
                width_cm: full.width_cm || "",
                height_cm: full.height_cm || "",
                original_price: full.original_price || "",
                has_original: Boolean(full.has_original),
                has_canvas_print: Boolean(full.has_canvas_print),
                has_canvas_print_limited: Boolean(full.has_canvas_print_limited),
                has_paper_print: Boolean(full.has_paper_print),
                has_paper_print_limited: Boolean(full.has_paper_print_limited),
                canvas_print_limited_quantity: full.canvas_print_limited_quantity || "",
                paper_print_limited_quantity: full.paper_print_limited_quantity || "",
                print_aspect_ratio_id: full.print_aspect_ratio_id || null,
                orientation: full.orientation || "Horizontal",
                labels: (full.labels || []).map((label) => label.id),
                original_status: full.original_status || "available",
                print_quality_url: full.print_quality_url || "",
            });
            setImageItems(
                (full.images || []).map((image) => ({
                    type: "existing" as const,
                    url: resolveImageUrl(image),
                    existingData: image,
                }))
            );
            setEditingId(full.id);
            setIsFormOpen(true);
            setActiveStep("basics");

            if (
                full.has_canvas_print ||
                full.has_canvas_print_limited ||
                full.has_paper_print ||
                full.has_paper_print_limited
            ) {
                await fetchWorkflow(full.id);
            } else {
                setWorkflowData(null);
            }
        } catch (error) {
            console.error(error);
            window.alert("Error loading artwork details.");
        }
    };

    const handleDelete = async (artworkId: number) => {
        if (!window.confirm("Delete this artwork?")) {
            return;
        }

        const response = await apiFetch(`${getApiUrl()}/artworks/${artworkId}`, {
            method: "DELETE",
        });
        if (!response.ok) {
            window.alert("Delete failed.");
            return;
        }

        setArtworks((previous) => previous.filter((artwork) => artwork.id !== artworkId));
        if (editingId === artworkId) {
            resetEditor();
        }
    };

    const uploadMasterAsset = async (slotId: string, assetRole: string, file: File) => {
        if (!editingId) {
            return;
        }

        setAssetUploadingSlot(slotId);
        setWorkflowError(null);

        try {
            const body = new FormData();
            body.append("file", file);
            body.append("asset_role", assetRole);
            body.append("category_id", slotId);

            const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-assets`, {
                method: "POST",
                body,
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.detail || "Upload failed.");
            }

            const payload = await response.json();
            await fetchWorkflow(editingId);
            await fetchData();
            const generatedCount = Array.isArray(payload.generated_assets)
                ? payload.generated_assets.length
                : 0;
            setNotice(
                generatedCount > 0
                    ? `Master uploaded for ${slotId}. ${generatedCount} derivatives generated automatically.`
                    : `Master uploaded for ${slotId}.`
            );
        } catch (error) {
            console.error(error);
            setWorkflowError(error instanceof Error ? error.message : "Upload failed.");
        } finally {
            setAssetUploadingSlot(null);
        }
    };

    const deleteMasterAsset = async (assetId: number) => {
        if (!editingId) {
            return;
        }
        const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-assets/${assetId}`, {
            method: "DELETE",
        });
        if (!response.ok) {
            window.alert("Could not delete asset.");
            return;
        }
        await fetchWorkflow(editingId);
        await fetchData();
    };

    const stepStatusMap: Record<(typeof WORKFLOW_STEP_ORDER)[number]["id"], string> = {
        basics: !formData.title.trim()
            ? "blocked"
            : hasMissingPrintRatio(formData)
            ? "attention"
            : "ready",
        offerings: hasOfferingValidationIssues(formData) ? "attention" : "ready",
        pipeline: !hasPrintOfferings(formData)
            ? "ready"
            : hasMissingPrintRatio(formData)
            ? "blocked"
            : editingId
            ? workflowData
                ? workflowData.overall_status === "ready"
                    ? "ready"
                    : workflowData.overall_status === "blocked"
                    ? "blocked"
                    : "attention"
                : "attention"
            : "attention",
        media: imageItems.length > 0 ? "ready" : "attention",
    };

    const headerReadiness = hasPrintOfferings(formData)
        ? hasMissingPrintRatio(formData)
            ? { status: "blocked", message: "Choose a print aspect ratio in Basics." }
            : workflowData?.readiness_summary || null
        : null;

    if (loading) {
        return (
            <div className="flex items-center gap-3 py-10">
                <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-[0.14em]">
                    Synchronizing admin catalog
                </span>
            </div>
        );
    }

    return (
        <div className="space-y-8 text-[#31323E]">
            <div className="flex flex-wrap justify-between items-start gap-4 pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">
                        Artwork Workbench
                    </h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        {artworks.length} artworks, drafts and sellable works together
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => void refreshArtworkPayloads()}
                        disabled={payloadRefreshLoading}
                        className="px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-[0.14em] border border-[#31323E]/15 bg-white text-[#31323E] hover:bg-[#31323E]/5 disabled:opacity-50"
                    >
                        {payloadRefreshLoading ? "Refreshing payloads..." : "Refresh Payloads"}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (isFormOpen) {
                                resetEditor();
                            } else {
                                openNewEditor();
                            }
                        }}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold uppercase tracking-[0.14em] transition-colors ${
                            isFormOpen
                                ? "bg-[#31323E]/10 text-[#31323E] border border-[#31323E]/15"
                                : "bg-[#31323E] text-white hover:bg-[#434455]"
                        }`}
                    >
                        {isFormOpen ? "Close Editor" : "New Artwork"}
                    </button>
                </div>
            </div>

            {payloadRefreshMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    {payloadRefreshMessage}
                </div>
            ) : null}

            {payloadRefreshError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {payloadRefreshError}
                </div>
            ) : null}

            {isFormOpen ? (
                <div className="bg-[#FCFBF8] border border-[#31323E]/10 rounded-[28px] shadow-sm overflow-hidden">
                    <div className="px-8 py-6 border-b border-[#31323E]/8 bg-white">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-[#31323E]">
                                    {editingId ? "Edit Artwork" : "Create Artwork Draft"}
                                </h3>
                                <p className="text-sm font-medium text-[#31323E]/45 mt-1">
                                    Build the artwork step by step, then complete strict print-prep
                                    validation directly in admin.
                                </p>
                            </div>

                            {headerReadiness ? (
                                <div className="text-right">
                                    <StatusBadge
                                        status={headerReadiness.status}
                                        label={headerReadiness.message}
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 mt-6">
                            {WORKFLOW_STEP_ORDER.map((step) => (
                                <button
                                    key={step.id}
                                    type="button"
                                    onClick={() => setActiveStep(step.id)}
                                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                                        activeStep === step.id
                                            ? "border-[#31323E] bg-[#31323E] text-white"
                                            : "border-[#31323E]/12 bg-white hover:bg-[#31323E]/3"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[11px] font-bold uppercase tracking-[0.14em]">
                                            {step.label}
                                        </span>
                                        <StatusBadge status={stepStatusMap[step.id]} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <form
                        onSubmit={async (event) => {
                            event.preventDefault();
                            await saveArtwork();
                        }}
                        className="p-8 space-y-8"
                    >
                        {notice ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                                {notice}
                            </div>
                        ) : null}

                        {activeStep === "basics" ? (
                            <div className="space-y-6">
                                <div>
                                    <FormSection
                                        title="Artwork Basics"
                                        description="Core identity, physical dimensions, original-sales information, and the normalized print ratio family for this artwork."
                                    />
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div>
                                            <FieldLabel text="Title" required valid={Boolean(formData.title.trim())} />
                                            <input
                                                value={formData.title}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        title: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="Artwork title"
                                            />
                                        </div>

                                        <div>
                                            <FieldLabel text="Year" valid={Boolean(formData.year)} />
                                            <input
                                                type="number"
                                                value={formData.year}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        year: Number(event.target.value || currentYear),
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                            />
                                        </div>

                                        <div>
                                            <FieldLabel
                                                text="Orientation"
                                                valid={Boolean(formData.orientation)}
                                            />
                                            <select
                                                value={formData.orientation}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        orientation: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                            >
                                                <option value="Horizontal">Horizontal</option>
                                                <option value="Vertical">Vertical</option>
                                                <option value="Square">Square</option>
                                            </select>
                                        </div>

                                        <div>
                                            <FieldLabel text="Original Status" valid={Boolean(formData.original_status)} />
                                            <select
                                                value={formData.original_status}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        original_status: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                            >
                                                {STATUS_OPTIONS.map((option) => (
                                                    <option key={option.value} value={option.value}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <FieldLabel text="Width cm" valid={Boolean(formData.width_cm)} />
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={formData.width_cm}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        width_cm: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="e.g. 60"
                                            />
                                        </div>

                                        <div>
                                            <FieldLabel text="Height cm" valid={Boolean(formData.height_cm)} />
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={formData.height_cm}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        height_cm: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="e.g. 80"
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <FieldLabel
                                                text="Print aspect ratio"
                                                valid={!hasPrintOfferings(formData) || Boolean(formData.print_aspect_ratio_id)}
                                            />
                                            <select
                                                value={formData.print_aspect_ratio_id || ""}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        print_aspect_ratio_id: event.target.value
                                                            ? Number(event.target.value)
                                                            : null,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                            >
                                                <option value="">Select ratio</option>
                                                {aspectRatios.map((ratio) => (
                                                    <option key={ratio.id} value={ratio.id}>
                                                        {ratio.label}
                                                        {ratio.description ? ` - ${ratio.description}` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="mt-2 text-xs font-medium text-[#31323E]/45">
                                                Choose the normalized ratio family here. Exact sizes and prices come
                                                from the active provider snapshot.
                                            </p>
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="flex items-center gap-3 rounded-2xl border border-[#31323E]/12 bg-white px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.has_original}
                                                    onChange={(event) =>
                                                        setFormData((previous) => ({
                                                            ...previous,
                                                            has_original: event.target.checked,
                                                        }))
                                                    }
                                                    className="w-4 h-4 accent-[#31323E]"
                                                />
                                                <span className="text-sm font-semibold text-[#31323E]">
                                                    Original artwork is offered for sale
                                                </span>
                                            </label>
                                        </div>

                                        <div>
                                            <FieldLabel
                                                text="Original price USD"
                                                valid={
                                                    !formData.has_original ||
                                                    Number(formData.original_price || 0) > 0
                                                }
                                            />
                                            <input
                                                type="number"
                                                min={0}
                                                value={formData.original_price}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        original_price: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="e.g. 2400"
                                            />
                                        </div>

                                        <div>
                                            <FieldLabel text="Description" valid={Boolean(formData.description.trim())} />
                                            <textarea
                                                value={formData.description}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        description: event.target.value,
                                                    }))
                                                }
                                                rows={4}
                                                className={INPUT_CLASS}
                                                placeholder="Artwork story, mood, technique, collector notes"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {activeStep === "offerings" ? (
                            <div className="space-y-6">
                                <div>
                                    <FormSection
                                        title="Offerings"
                                        description="Define the provider-neutral selling intent for this artwork: which print families are enabled and whether limited editions exist."
                                    />

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {[
                                            {
                                                key: "has_canvas_print",
                                                label: "Canvas print",
                                            },
                                            {
                                                key: "has_canvas_print_limited",
                                                label: "Canvas print limited",
                                            },
                                            {
                                                key: "has_paper_print",
                                                label: "Paper print",
                                            },
                                            {
                                                key: "has_paper_print_limited",
                                                label: "Paper print limited",
                                            },
                                        ].map((item) => (
                                            <label
                                                key={item.key}
                                                className={`rounded-2xl border px-4 py-3 cursor-pointer transition-colors ${
                                                    formData[item.key as keyof ArtworkFormState]
                                                        ? "bg-[#31323E]/5 border-[#31323E]/25"
                                                        : "bg-white border-[#31323E]/12 hover:bg-[#31323E]/3"
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(
                                                            formData[item.key as keyof ArtworkFormState]
                                                        )}
                                                        onChange={(event) =>
                                                            setFormData((previous) => ({
                                                                ...previous,
                                                                [item.key]: event.target.checked,
                                                            }))
                                                        }
                                                        className="w-4 h-4 accent-[#31323E]"
                                                    />
                                                    <span className="text-sm font-semibold text-[#31323E]">
                                                        {item.label}
                                                    </span>
                                                </div>

                                                {item.key === "has_canvas_print_limited" &&
                                                formData.has_canvas_print_limited ? (
                                                    <div className="mt-3">
                                                        <FieldLabel text="Canvas edition size" valid={Boolean(formData.canvas_print_limited_quantity)} />
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={formData.canvas_print_limited_quantity}
                                                            onChange={(event) =>
                                                                setFormData((previous) => ({
                                                                    ...previous,
                                                                    canvas_print_limited_quantity:
                                                                        event.target.value,
                                                                }))
                                                            }
                                                            className={INPUT_CLASS}
                                                        />
                                                    </div>
                                                ) : null}

                                                {item.key === "has_paper_print_limited" &&
                                                formData.has_paper_print_limited ? (
                                                    <div className="mt-3">
                                                        <FieldLabel text="Paper edition size" valid={Boolean(formData.paper_print_limited_quantity)} />
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            value={formData.paper_print_limited_quantity}
                                                            onChange={(event) =>
                                                                setFormData((previous) => ({
                                                                    ...previous,
                                                                    paper_print_limited_quantity:
                                                                        event.target.value,
                                                                }))
                                                            }
                                                            className={INPUT_CLASS}
                                                        />
                                                    </div>
                                                ) : null}
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {hasPrintOfferings(formData) ? (
                                    <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/60">
                                        <p className="font-semibold text-[#31323E]">Print ratio is chosen in Basics.</p>
                                        <p className="mt-1">
                                            Offerings only defines what this artwork can sell. The exact storefront
                                            size grid is resolved later from the active provider catalog.
                                        </p>
                                        {hasMissingPrintRatio(formData) ? (
                                            <p className="mt-2 text-amber-700">
                                                Choose a print aspect ratio in Basics before continuing to the print
                                                pipeline.
                                            </p>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                                        No print families are enabled yet. The print source and print workflow
                                        steps will unlock automatically once you enable at least one paper or
                                        canvas offering.
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {activeStep === "pipeline" ? (
                            <div className="space-y-6">
                                <FormSection
                                    title="Print Pipeline"
                                    description="Upload up to two production masters: one bordered paper file and one clean master for framed paper plus canvas. The backend validates the largest required size and pre-generates exact PNG derivatives for active baked storefront sizes."
                                />

                                {!hasPrintOfferings(formData) ? (
                                    <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                                        Enable at least one print family in the Offerings step to unlock the
                                        print pipeline.
                                    </div>
                                ) : !formData.print_aspect_ratio_id ? (
                                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                                        Choose a print aspect ratio in Basics first. The pipeline cannot calculate
                                        required pixels or unlock master uploads without a normalized ratio family.
                                    </div>
                                ) : !editingId ? (
                                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                                        Save the artwork draft first. The pipeline will calculate size
                                        requirements once saved.
                                    </div>
                                ) : workflowLoading ? (
                                    <div className="flex items-center gap-3 py-6">
                                        <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                                        <span className="text-sm font-semibold text-[#31323E]/55">
                                            Loading print pipeline
                                        </span>
                                    </div>
                                ) : workflowError ? (
                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
                                        {workflowError}
                                    </div>
                                ) : workflowData ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <StatusBadge status={workflowData.readiness_summary.status} />
                                            <span className="text-sm font-semibold text-[#31323E]/70">
                                                {workflowData.readiness_summary.message}
                                            </span>
                                        </div>

                                        <div className="space-y-4">
                                            {workflowData.master_slots.map((slot) => {
                                                const asset = slot.uploaded_asset;
                                                const assetMeta = (asset?.file_metadata || {}) as Record<string, unknown>;
                                                const assetUrl = asset?.file_url
                                                    ? `${getApiUrl().replace("/api", "")}${asset.file_url}`
                                                    : null;

                                                if (!slot.relevant) {
                                                    return (
                                                        <div
                                                            key={slot.slot_id}
                                                            className="rounded-2xl border border-[#31323E]/8 bg-[#31323E]/3 px-5 py-4"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <p className="text-sm font-bold text-[#31323E]/40">
                                                                    {slot.label}
                                                                </p>
                                                                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                                                    Not required
                                                                </span>
                                                            </div>
                                                            <p className="text-xs font-medium text-[#31323E]/35 mt-1">
                                                                {slot.description}
                                                            </p>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div
                                                        key={slot.slot_id}
                                                        className={`rounded-2xl border px-5 py-5 ${
                                                            slot.status === "ready"
                                                                ? "border-emerald-200 bg-emerald-50/40"
                                                                : slot.status === "blocked"
                                                                ? "border-rose-200 bg-rose-50/40"
                                                                : "border-amber-200 bg-amber-50/40"
                                                        }`}
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-3 flex-wrap">
                                                                    <p className="text-sm font-bold text-[#31323E]">
                                                                        {slot.label}
                                                                    </p>
                                                                    <StatusBadge status={slot.status} />
                                                                </div>
                                                                <p className="text-xs font-medium text-[#31323E]/50 mt-1">
                                                                    {slot.description}
                                                                </p>
                                                                <p className="text-xs font-medium text-[#31323E]/45 mt-2">
                                                                    For:{" "}
                                                                    {slot.covers_categories
                                                                        .map((categoryId) =>
                                                                            formatPrintCategory(categoryId)
                                                                        )
                                                                        .join(", ")}
                                                                    {slot.derives_categories &&
                                                                    slot.derives_categories.length > 0
                                                                        ? ` | Derives: ${slot.derives_categories
                                                                              .map((categoryId) =>
                                                                                  formatPrintCategory(categoryId)
                                                                              )
                                                                              .join(", ")}`
                                                                        : ""}
                                                                </p>
                                                                <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                    <span>
                                                                        Covers {slot.covered_size_count} size
                                                                        {slot.covered_size_count === 1 ? "" : "s"}
                                                                    </span>
                                                                    {slot.largest_size_label ? (
                                                                        <span>Largest: {slot.largest_size_label}</span>
                                                                    ) : null}
                                                                    {slot.generated_derivatives_count > 0 ? (
                                                                        <span>{slot.generated_derivatives_count} pre-generated</span>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            {slot.required_min_px ? (
                                                                <div className="rounded-xl bg-white/80 px-3 py-2 border border-[#31323E]/10">
                                                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                        {slot.export_guidance?.mode ===
                                                                        "strict_ratio_cover_master"
                                                                            ? "Largest exact provider target"
                                                                            : "Min required px"}
                                                                    </p>
                                                                    <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                        {slot.required_min_px.width} x {slot.required_min_px.height}
                                                                    </p>
                                                                    {slot.required_min_px.source ? (
                                                                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/35 mt-1">
                                                                            {titleCase(slot.required_min_px.source)}
                                                                        </p>
                                                                    ) : null}
                                                                    {slot.required_min_px.visible_art_width_px &&
                                                                    slot.required_min_px.visible_art_height_px ? (
                                                                        <p className="text-[11px] font-medium leading-relaxed text-[#31323E]/55 mt-2">
                                                                            Visible art at 300 DPI:{" "}
                                                                            {slot.required_min_px.visible_art_width_px} x{" "}
                                                                            {slot.required_min_px.visible_art_height_px} px
                                                                        </p>
                                                                    ) : null}
                                                                    {slot.required_min_px.physical_width_in &&
                                                                    slot.required_min_px.physical_height_in ? (
                                                                        <p className="text-[11px] font-medium leading-relaxed text-[#31323E]/45 mt-1">
                                                                            Nominal product size:{" "}
                                                                            {formatInchesValue(
                                                                                slot.required_min_px.physical_width_in
                                                                            )}{" "}
                                                                            x{" "}
                                                                            {formatInchesValue(
                                                                                slot.required_min_px.physical_height_in
                                                                            )}{" "}
                                                                            in
                                                                        </p>
                                                                    ) : null}
                                                                    {slot.export_guidance?.mode ===
                                                                    "strict_ratio_cover_master" ? (
                                                                        <p className="text-[11px] font-semibold leading-relaxed text-emerald-700 mt-2">
                                                                            Upload clean master at:{" "}
                                                                            {slot.export_guidance.target_width_px} x{" "}
                                                                            {slot.export_guidance.target_height_px} px
                                                                            {slot.export_guidance.ratio_label
                                                                                ? ` (${slot.export_guidance.ratio_label})`
                                                                                : ""}
                                                                        </p>
                                                                    ) : null}
                                                                    {slot.export_guidance?.mode ===
                                                                    "strict_ratio_cover_master" ? (
                                                                        <p className="text-[11px] font-medium leading-relaxed text-emerald-700/80 mt-1">
                                                                            Use this strict-ratio size for the uploaded
                                                                            master. Exact provider artboards are generated
                                                                            automatically.
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>

                                                        {slot.export_guidance ? (
                                                            <div className="mt-4 rounded-xl border border-[#31323E]/10 bg-white px-3.5 py-3">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                        {slot.export_guidance.title}
                                                                    </p>
                                                                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                                                        {slot.export_guidance.target_width_px} x{" "}
                                                                        {slot.export_guidance.target_height_px} px
                                                                    </span>
                                                                </div>
                                                                <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/60">
                                                                    {slot.export_guidance.message}
                                                                </p>
                                                                {slot.export_guidance.provider_target_width_px &&
                                                                slot.export_guidance.provider_target_height_px ? (
                                                                    <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/58">
                                                                        Largest exact provider artboard:{" "}
                                                                        {slot.export_guidance.provider_target_width_px} x{" "}
                                                                        {slot.export_guidance.provider_target_height_px} px.
                                                                    </p>
                                                                ) : null}
                                                                {slot.export_guidance.provider_target_differs_from_visible_art &&
                                                                slot.export_guidance.visible_art_width_px &&
                                                                slot.export_guidance.visible_art_height_px ? (
                                                                    <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/58">
                                                                        Prodigi Product Details gives an exact provider
                                                                        target of{" "}
                                                                        {slot.export_guidance.provider_target_width_px ??
                                                                            slot.export_guidance.target_width_px}{" "}
                                                                        x{" "}
                                                                        {slot.export_guidance.provider_target_height_px ??
                                                                            slot.export_guidance.target_height_px} px, while
                                                                        the nominal visible art area is{" "}
                                                                        {slot.export_guidance.visible_art_width_px} x{" "}
                                                                        {slot.export_guidance.visible_art_height_px} px
                                                                        at 300 DPI.
                                                                        {slot.export_guidance.physical_width_in &&
                                                                        slot.export_guidance.physical_height_in
                                                                            ? ` That comes from the product's ${formatInchesValue(slot.export_guidance.physical_width_in)} x ${formatInchesValue(slot.export_guidance.physical_height_in)} in size.`
                                                                            : ""}
                                                                    </p>
                                                                ) : null}
                                                                {slot.export_guidance.full_file_ratio_diff_warning ? (
                                                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-700">
                                                                        {slot.export_guidance.mode ===
                                                                        "strict_ratio_cover_master"
                                                                            ? `Exact provider target differs from the artwork ratio by about ${slot.export_guidance.full_file_ratio_diff_px} px. We will use a tiny cover crop${
                                                                                  formatCoverCropNotice(
                                                                                      slot.export_guidance.estimated_cover_crop_width_px,
                                                                                      slot.export_guidance.estimated_cover_crop_height_px
                                                                                  )
                                                                                      ? ` of ${formatCoverCropNotice(
                                                                                            slot.export_guidance.estimated_cover_crop_width_px,
                                                                                            slot.export_guidance.estimated_cover_crop_height_px
                                                                                        )}`
                                                                                      : ""
                                                                              } instead of stretching or leaving white strips.`
                                                                            : `Full file ratio differs from the artwork ratio by about ${slot.export_guidance.full_file_ratio_diff_px} px. This is expected for wrap, bleed, or bordered targets: build the exact artboard instead of stretching the source.`}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        ) : null}

                                                        {slot.provider_attribute_coverage ? (
                                                            <div className="mt-3 rounded-xl border border-[#31323E]/10 bg-white/80 px-3.5 py-3">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                        Canvas wrap coverage
                                                                    </p>
                                                                    <span
                                                                        className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                                                                            slot.provider_attribute_coverage.non_preferred_count === 0
                                                                                ? "text-emerald-700"
                                                                                : "text-amber-700"
                                                                        }`}
                                                                    >
                                                                        {slot.provider_attribute_coverage.preferred_value}{" "}
                                                                        {slot.provider_attribute_coverage.coverage_pct ?? 0}%
                                                                    </span>
                                                                </div>
                                                                <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/60">
                                                                    {slot.provider_attribute_coverage.preferred_count} of{" "}
                                                                    {slot.provider_attribute_coverage.total_options} canvas wrap
                                                                    options for this artwork ratio support{" "}
                                                                    {slot.provider_attribute_coverage.preferred_value}.
                                                                    Enforcing it strictly would hide{" "}
                                                                    {slot.provider_attribute_coverage.strict_preferred_hidden_count} option
                                                                    {slot.provider_attribute_coverage.strict_preferred_hidden_count === 1
                                                                        ? ""
                                                                        : "s"}
                                                                    .
                                                                </p>
                                                                {slot.provider_attribute_coverage.non_preferred_count > 0 ? (
                                                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#31323E]/45">
                                                                        {Object.entries(slot.provider_attribute_coverage.by_wrap).map(
                                                                            ([wrap, count]) => (
                                                                                <span
                                                                                    key={wrap}
                                                                                    className="rounded-full border border-[#31323E]/10 bg-white px-2 py-1"
                                                                                >
                                                                                    {wrap}: {count}
                                                                                </span>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : null}

                                                        {slot.derivative_plan ? (
                                                            <div className="mt-3 rounded-xl border border-[#31323E]/10 bg-white/80 px-3.5 py-3">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                        Derivative generation
                                                                    </p>
                                                                    <span
                                                                        className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
                                                                            slot.derivative_plan.can_direct_resize_all
                                                                                ? "text-emerald-700"
                                                                                : "text-amber-700"
                                                                        }`}
                                                                    >
                                                                        {titleCase(slot.derivative_plan.strategy)}
                                                                    </span>
                                                                </div>
                                                                <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/60">
                                                                    {slot.derivative_plan.note}
                                                                </p>
                                                                <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                                                    {slot.derivative_plan.direct_resize_count} direct resize
                                                                    {" / "}
                                                                    {slot.derivative_plan.exact_recompose_count} exact
                                                                    recompose
                                                                    {" / "}
                                                                    {slot.derivative_plan.target_count} total targets
                                                                </p>
                                                            </div>
                                                        ) : null}

                                                        {/* Upload / asset status */}
                                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                                            <label className="px-4 py-2 rounded-xl bg-[#31323E] text-white text-sm font-bold cursor-pointer hover:bg-[#31323E]/85 transition-colors">
                                                                {assetUploadingSlot === slot.slot_id
                                                                    ? "Uploading..."
                                                                    : asset
                                                                    ? "Replace"
                                                                    : "Upload Master"}
                                                                <input
                                                                    type="file"
                                                                    accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                                                    className="hidden"
                                                                    disabled={assetUploadingSlot !== null}
                                                                    onChange={(event) => {
                                                                        const file = event.target.files?.[0];
                                                                        if (file) {
                                                                            void uploadMasterAsset(
                                                                                slot.slot_id,
                                                                                slot.asset_role,
                                                                                file
                                                                            );
                                                                        }
                                                                        (event.target as HTMLInputElement).value = "";
                                                                    }}
                                                                />
                                                            </label>

                                                            {asset ? (
                                                                <>
                                                                    <span className="text-xs font-medium text-[#31323E]/55">
                                                                        {String(assetMeta.width_px || "?")} x {String(assetMeta.height_px || "?")} px
                                                                    </span>
                                                                    {slot.generated_derivatives_count > 0 ? (
                                                                        <span className="text-xs font-medium text-emerald-700">
                                                                            {slot.generated_derivatives_count} derivatives ready
                                                                        </span>
                                                                    ) : null}
                                                                    {assetUrl ? (
                                                                        <a
                                                                            href={assetUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E] underline"
                                                                        >
                                                                            Open
                                                                        </a>
                                                                    ) : null}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => void deleteMasterAsset(asset.id)}
                                                                        className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </>
                                                            ) : null}
                                                        </div>

                                                        {/* Issues & warnings */}
                                                        <div className="mt-3 space-y-2">
                                                            {slot.required_for_sizes.length > 0 ? (
                                                                <div className="rounded-xl border border-[#31323E]/10 bg-white px-3.5 py-3">
                                                                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                        Covers sizes
                                                                    </p>
                                                                    <p className="text-xs font-medium text-[#31323E]/60 mt-2">
                                                                        {slot.required_for_sizes.join(", ")}
                                                                    </p>
                                                                </div>
                                                            ) : null}
                                                            <IssueList title="Issues" items={slot.issues} tone="danger" />
                                                            <IssueList title="Warnings" items={slot.warnings} tone="warning" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        ) : null}

                        {activeStep === "media" ? (
                            <div className="space-y-6">
                                <div>
                                    <FormSection
                                        title="Labels and Photos"
                                        description="Tag the artwork for discovery and manage the gallery imagery shown on the site."
                                    />

                                    <div className="space-y-5">
                                        {categories.map((category) => {
                                            const categoryLabels = labels.filter(
                                                (label) => label.category_id === category.id
                                            );
                                            return (
                                                <div key={category.id}>
                                                    <FieldLabel
                                                        text={category.title}
                                                        valid={Boolean(
                                                            formData.labels.some((labelId) =>
                                                                categoryLabels.find(
                                                                    (label) => label.id === labelId
                                                                )
                                                            )
                                                        )}
                                                    />
                                                    <LabelMultiSelect
                                                        labels={categoryLabels}
                                                        selected={formData.labels}
                                                        onChange={(selectedIds) =>
                                                            setFormData((previous) => ({
                                                                ...previous,
                                                                labels: selectedIds,
                                                            }))
                                                        }
                                                        placeholder={`No ${category.title} labels yet.`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <FormSection title="Artwork Photos" description="Cover image first, supporting shots after that." />
                                    <ImageReorderGrid
                                        items={imageItems}
                                        onReorder={setImageItems}
                                        onRemove={(index) =>
                                            setImageItems((previous) =>
                                                previous.filter((_, itemIndex) => itemIndex !== index)
                                            )
                                        }
                                        onAddFiles={(files) => {
                                            const nextItems = files.map((file) => ({
                                                type: "new" as const,
                                                url: URL.createObjectURL(file),
                                                file,
                                            }));
                                            setImageItems((previous) => [...previous, ...nextItems].slice(0, 10));
                                        }}
                                        onCropClick={(index) => setCropImageIndex(index)}
                                    />
                                </div>
                            </div>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#31323E]/8">
                            <div className="flex items-center gap-2">
                                {WORKFLOW_STEP_ORDER.map((step, index) =>
                                    step.id === activeStep ? (
                                        <span
                                            key={step.id}
                                            className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/45"
                                        >
                                            Step {index + 1} of {WORKFLOW_STEP_ORDER.length}
                                        </span>
                                    ) : null
                                )}
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentIndex = WORKFLOW_STEP_ORDER.findIndex(
                                            (step) => step.id === activeStep
                                        );
                                        if (currentIndex > 0) {
                                            setActiveStep(WORKFLOW_STEP_ORDER[currentIndex - 1].id);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl border border-[#31323E]/12 text-sm font-semibold text-[#31323E]"
                                >
                                    Previous
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        const currentIndex = WORKFLOW_STEP_ORDER.findIndex(
                                            (step) => step.id === activeStep
                                        );
                                        if (currentIndex < WORKFLOW_STEP_ORDER.length - 1) {
                                            setActiveStep(WORKFLOW_STEP_ORDER[currentIndex + 1].id);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl border border-[#31323E]/12 text-sm font-semibold text-[#31323E]"
                                >
                                    Next
                                </button>

                                <button
                                    type="submit"
                                    disabled={savingArtwork}
                                    className="px-5 py-2.5 rounded-xl bg-[#31323E] text-white text-sm font-bold uppercase tracking-[0.14em] disabled:opacity-50"
                                >
                                    {savingArtwork
                                        ? "Saving..."
                                        : editingId
                                        ? "Save Artwork Draft"
                                        : "Create Draft"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            ) : null}

            <SimpleArtworkCropperModal
                isOpen={cropImageIndex !== null}
                imageSrc={
                    cropImageIndex !== null && imageItems[cropImageIndex]?.url
                        ? imageItems[cropImageIndex].url
                        : ""
                }
                onClose={() => setCropImageIndex(null)}
                onSaveCrop={handleSaveCrop}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {artworks.map((artwork) => {
                    const readiness = artwork.print_readiness_summary;
                    return (
                        <div
                            key={artwork.id}
                            className={`rounded-[24px] overflow-hidden border bg-white shadow-sm ${
                                readiness?.status === "blocked"
                                    ? "border-rose-200"
                                    : readiness?.status === "attention"
                                    ? "border-amber-200"
                                    : "border-[#31323E]/10"
                            }`}
                        >
                            <div className="aspect-[4/5] bg-[#31323E]/5 relative overflow-hidden">
                                {artwork.images && artwork.images.length > 0 ? (
                                    <img
                                        src={resolveImageUrl(artwork.images[0])}
                                        alt={artwork.title}
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-[0.14em] text-[#31323E]/35">
                                        No image
                                    </div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 to-transparent flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleEditClick(artwork)}
                                        className="flex-1 rounded-xl bg-white text-[#31323E] text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-2"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleDelete(artwork.id)}
                                        className="flex-1 rounded-xl bg-rose-500 text-white text-[11px] font-bold uppercase tracking-[0.14em] px-3 py-2"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            <div className="px-4 py-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-bold text-[#31323E] leading-tight">
                                            {artwork.title}
                                        </h3>
                                        <p className="text-sm font-semibold text-[#31323E]/45 mt-1">
                                            Original:{" "}
                                            {artwork.original_price ? `$${artwork.original_price}` : "not priced"}
                                        </p>
                                    </div>
                                    {readiness ? <StatusBadge status={readiness.status} /> : null}
                                </div>

                                {readiness ? (
                                    <div className="rounded-2xl bg-[#31323E]/4 px-3.5 py-3">
                                        <p className="text-sm font-semibold text-[#31323E]">
                                            {readiness.message}
                                        </p>
                                        <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                            <span>Ready slots: {readiness.ready_slots}</span>
                                            <span>Blocked slots: {readiness.blocked_slots}</span>
                                            <span>Attention slots: {readiness.attention_step_count}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl bg-[#31323E]/4 px-3.5 py-3 text-sm font-medium text-[#31323E]/55">
                                        No print-prep summary yet.
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                    {artwork.has_paper_print || artwork.has_paper_print_limited ? (
                                        <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                            Paper
                                        </span>
                                    ) : null}
                                    {artwork.has_canvas_print || artwork.has_canvas_print_limited ? (
                                        <span className="rounded-full bg-[#31323E]/6 px-2.5 py-1">
                                            Canvas
                                        </span>
                                    ) : null}
                                    {artwork.print_quality_url ? (
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                            Source linked
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
