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

interface WorkflowCategoryConfig {
    enabled?: boolean | null;
    reviewed?: boolean;
    asset_strategy?: string;
    provider_attributes?: Record<string, string>;
    notes?: string;
}

interface PrintWorkflowConfig {
    source_master_reviewed?: boolean;
    categories?: Record<string, WorkflowCategoryConfig>;
}

interface PrintReadinessSummary {
    status: "ready" | "attention" | "blocked";
    message: string;
    blocking_step_count: number;
    attention_step_count: number;
    blocking_category_count: number;
    ready_category_count: number;
    enabled_category_count: number;
    highlight_variant?: string;
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
    print_min_size_label?: string | null;
    print_max_size_label?: string | null;
    orientation?: string | null;
    print_quality_url?: string | null;
    print_workflow_config?: PrintWorkflowConfig | null;
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

interface WorkflowAttributeChoice {
    key: string;
    mode: "fixed" | "select" | "default";
    value?: string | null;
    options: string[];
    default_value?: string | null;
}

interface WorkflowValidation {
    status: "ready" | "blocked" | "attention" | "not_required";
    issues: string[];
    warnings: string[];
}

interface SizeRequirement {
    slot_size_label: string;
    required: boolean;
    asset_role: string | null;
    asset_role_label: string | null;
    strategy: string;
    target_dpi: number;
    base_target_dpi?: number;
    dpi_policy_note?: string;
    wrap_margin_pct: number;
    required_dimensions_px: {
        width: number;
        height: number;
    };
    asset_source?: "missing" | "exact" | "category_master";
    asset: ArtworkPrintAsset | null;
    validation: WorkflowValidation;
}

interface PreparationMatrixEntry {
    category_id: string;
    label: string;
    enabled: boolean;
    status: "ready" | "attention" | "blocked";
    asset_strategy: string;
    uses_source_master_only: boolean;
    category_master_supported: boolean;
    required_asset_role: string | null;
    required_asset_label: string | null;
    suggested_master_size_label: string | null;
    suggested_master_target_dpi?: number | null;
    suggested_master_dpi_policy_note?: string | null;
    minimum_master_dimensions_px: {
        width: number;
        height: number;
    } | null;
    covered_size_count: number;
    source_master_present: boolean;
    source_master_reviewed: boolean;
    client_selectable_attributes: WorkflowAttributeChoice[];
    provider_submission_defaults: Record<string, string>;
}

interface CategoryWorkflow {
    category_id: string;
    label: string;
    medium: string;
    material_label: string;
    frame_label: string;
    enabled: boolean;
    offered_in_active_bake: boolean;
    asset_strategy: string;
    reviewed: boolean;
    provider_attributes: Record<string, string>;
    attribute_choices: WorkflowAttributeChoice[];
    admin_managed_attributes: WorkflowAttributeChoice[];
    client_selectable_attributes: WorkflowAttributeChoice[];
    provider_submission_defaults: Record<string, string>;
    effective_profile: Record<string, unknown>;
    issues: string[];
    size_requirements: SizeRequirement[];
    summary: {
        required_count: number;
        ready_count: number;
        blocking_count: number;
        status: "ready" | "attention" | "blocked";
    };
}

interface WorkflowStep {
    id: string;
    label: string;
    status: "ready" | "attention" | "blocked";
    issues?: string[];
    warnings?: string[];
}

interface ArtworkPrintWorkflowPayload {
    artwork_id: number;
    provider_key: string;
    print_enabled: boolean;
    source_master: {
        required: boolean;
        present: boolean;
        reviewed: boolean;
        status: "ready" | "attention" | "blocked";
        issues: string[];
        warnings: string[];
        url: string | null;
        metadata?: Record<string, unknown> | null;
    };
    workflow_config: PrintWorkflowConfig;
    preparation_matrix: PreparationMatrixEntry[];
    category_workflows: CategoryWorkflow[];
    steps: WorkflowStep[];
    assets: ArtworkPrintAsset[];
    readiness_summary: PrintReadinessSummary;
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
    print_min_size_label: string;
    print_max_size_label: string;
    orientation: string;
    labels: number[];
    original_status: string;
    print_quality_url: string;
    print_workflow_config: PrintWorkflowConfig;
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

const INPUT_CLASS =
    "w-full bg-white border border-[#31323E]/15 rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#31323E] focus:outline-none focus:border-[#31323E]/45 focus:ring-2 focus:ring-[#31323E]/10 transition-all";

const currentYear = new Date().getFullYear();

function createEmptyWorkflowConfig(): PrintWorkflowConfig {
    return {
        source_master_reviewed: false,
        categories: {},
    };
}

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
        print_min_size_label: "",
        print_max_size_label: "",
        orientation: "Horizontal",
        labels: [],
        original_status: "available",
        print_quality_url: "",
        print_workflow_config: createEmptyWorkflowConfig(),
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
        print_workflow_config: formData.print_workflow_config,
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
    const [printUploading, setPrintUploading] = useState(false);
    const [printUploadError, setPrintUploadError] = useState<string | null>(null);
    const [workflowData, setWorkflowData] = useState<ArtworkPrintWorkflowPayload | null>(null);
    const [workflowLoading, setWorkflowLoading] = useState(false);
    const [workflowError, setWorkflowError] = useState<string | null>(null);
    const [workflowSaving, setWorkflowSaving] = useState(false);
    const [assetUploadingKey, setAssetUploadingKey] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
    const [activeStep, setActiveStep] =
        useState<(typeof WORKFLOW_STEP_ORDER)[number]["id"]>("basics");
    const printFileRef = useRef<HTMLInputElement>(null);
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
            const response = await apiFetch(`${getApiUrl()}/artworks/${artworkId}/print-workflow`);
            if (!response.ok) {
                throw new Error(`Workflow request failed with ${response.status}`);
            }
            const payload = (await response.json()) as ArtworkPrintWorkflowPayload;
            setWorkflowData(payload);
            setFormData((previous) => ({
                ...previous,
                print_workflow_config: payload.workflow_config || createEmptyWorkflowConfig(),
            }));
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

    useEffect(() => {
        if (!workflowData) {
            setCollapsedCategories({});
            return;
        }
        setCollapsedCategories((previous) => {
            const next: Record<string, boolean> = {};
            workflowData.category_workflows.forEach((category) => {
                next[category.category_id] =
                    previous[category.category_id] ?? category.summary.status === "ready";
            });
            return next;
        });
    }, [workflowData]);

    const resetEditor = () => {
        setFormData(createDefaultFormState());
        setImageItems([]);
        setEditingId(null);
        setWorkflowData(null);
        setWorkflowError(null);
        setPrintUploadError(null);
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
        setPrintUploadError(null);
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
                    setActiveStep("pipeline");
                }
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
                print_min_size_label: full.print_min_size_label || "",
                print_max_size_label: full.print_max_size_label || "",
                orientation: full.orientation || "Horizontal",
                labels: (full.labels || []).map((label) => label.id),
                original_status: full.original_status || "available",
                print_quality_url: full.print_quality_url || "",
                print_workflow_config: full.print_workflow_config || createEmptyWorkflowConfig(),
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

    const patchArtwork = async (payload: Record<string, unknown>) => {
        if (!editingId) {
            return false;
        }
        const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            console.error("Patch failed", errorPayload);
            return false;
        }
        return true;
    };

    const persistWorkflowConfig = async (nextConfig: PrintWorkflowConfig) => {
        setFormData((previous) => ({
            ...previous,
            print_workflow_config: nextConfig,
        }));

        if (!editingId) {
            setNotice("Save the artwork draft first to persist workflow decisions.");
            return;
        }

        setWorkflowSaving(true);
        const ok = await patchArtwork({ print_workflow_config: nextConfig });
        if (!ok) {
            window.alert("Could not save print workflow changes.");
            setWorkflowSaving(false);
            return;
        }

        await fetchWorkflow(editingId);
        await fetchData();
        setWorkflowSaving(false);
    };

    const updateSourceReviewed = async (reviewed: boolean) => {
        const nextConfig: PrintWorkflowConfig = {
            ...(formData.print_workflow_config || createEmptyWorkflowConfig()),
            source_master_reviewed: reviewed,
            categories: {
                ...((formData.print_workflow_config || createEmptyWorkflowConfig()).categories || {}),
            },
        };
        await persistWorkflowConfig(nextConfig);
    };

    const updateCategoryConfig = async (
        categoryId: string,
        patch: Partial<WorkflowCategoryConfig>
    ) => {
        const existingConfig = formData.print_workflow_config || createEmptyWorkflowConfig();
        const nextConfig: PrintWorkflowConfig = {
            source_master_reviewed: existingConfig.source_master_reviewed || false,
            categories: {
                ...(existingConfig.categories || {}),
                [categoryId]: {
                    enabled: existingConfig.categories?.[categoryId]?.enabled,
                    reviewed: existingConfig.categories?.[categoryId]?.reviewed || false,
                    asset_strategy:
                        existingConfig.categories?.[categoryId]?.asset_strategy || undefined,
                    provider_attributes: {
                        ...(existingConfig.categories?.[categoryId]?.provider_attributes || {}),
                    },
                    ...patch,
                },
            },
        };
        await persistWorkflowConfig(nextConfig);
    };

    const uploadPreparedAsset = async (
        categoryId: string,
        assetRole: string | null,
        slotSizeLabel: string | null,
        file: File
    ) => {
        if (!editingId || !assetRole) {
            return;
        }

        const uploadKey = `${categoryId}:${slotSizeLabel || "category-master"}:${assetRole}`;
        setAssetUploadingKey(uploadKey);
        setWorkflowError(null);

        try {
            const body = new FormData();
            body.append("file", file);
            body.append("asset_role", assetRole);
            body.append("category_id", categoryId);
            if (slotSizeLabel) {
                body.append("slot_size_label", slotSizeLabel);
            }

            const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-assets`, {
                method: "POST",
                body,
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.detail || "Prepared asset upload failed.");
            }

            const payload = await response.json();
            await fetchWorkflow(editingId);
            await fetchData();
            const generatedCount = Array.isArray(payload.generated_assets)
                ? payload.generated_assets.length
                : 0;
            if (slotSizeLabel) {
                setNotice(`Prepared asset uploaded for ${slotSizeLabel}.`);
            } else if (generatedCount > 0) {
                setNotice(
                    `Category preparation master uploaded. ${generatedCount} smaller print assets were generated automatically.`
                );
            } else {
                setNotice("Category preparation master uploaded.");
            }
        } catch (error) {
            console.error(error);
            setWorkflowError(error instanceof Error ? error.message : "Prepared asset upload failed.");
        } finally {
            setAssetUploadingKey(null);
        }
    };

    const deletePreparedAsset = async (assetId: number) => {
        if (!editingId) {
            return;
        }
        const response = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-assets/${assetId}`, {
            method: "DELETE",
        });
        if (!response.ok) {
            window.alert("Could not delete prepared asset.");
            return;
        }
        await fetchWorkflow(editingId);
        await fetchData();
    };

    const stepStatusMap: Record<(typeof WORKFLOW_STEP_ORDER)[number]["id"], string> = {
        basics: formData.title.trim() ? "ready" : "blocked",
        offerings:
            hasPrintOfferings(formData) && !formData.print_aspect_ratio_id ? "attention" : "ready",
        pipeline: hasPrintOfferings(formData)
            ? editingId
                ? workflowData
                    ? workflowData.readiness_summary.status === "ready" &&
                      workflowData.source_master.status === "ready"
                        ? "ready"
                        : workflowData.readiness_summary.status === "blocked" ||
                            workflowData.source_master.status === "blocked"
                        ? "blocked"
                        : "attention"
                    : "attention"
                : "attention"
            : "ready",
        media: imageItems.length > 0 ? "ready" : "attention",
    };
    const sourceMaxPrint300 = (workflowData?.source_master.metadata?.max_print_size_at_300dpi_in ||
        {}) as {
        width?: number | string;
        height?: number | string;
    };

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

                            {workflowData?.readiness_summary ? (
                                <div className="text-right">
                                    <StatusBadge
                                        status={workflowData.readiness_summary.status}
                                        label={workflowData.readiness_summary.message}
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
                                        description="Core identity, physical dimensions and original-sales information."
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
                                        description="Turn print families on or off, define edition logic and bind the artwork to the storefront ratio grid."
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
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div>
                                            <FieldLabel
                                                text="Print aspect ratio"
                                                valid={Boolean(formData.print_aspect_ratio_id)}
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
                                        </div>

                                        <div>
                                            <FieldLabel text="Min size label" valid={true} />
                                            <input
                                                value={formData.print_min_size_label}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        print_min_size_label: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="e.g. 30x40 cm"
                                            />
                                        </div>

                                        <div>
                                            <FieldLabel text="Max size label" valid={true} />
                                            <input
                                                value={formData.print_max_size_label}
                                                onChange={(event) =>
                                                    setFormData((previous) => ({
                                                        ...previous,
                                                        print_max_size_label: event.target.value,
                                                    }))
                                                }
                                                className={INPUT_CLASS}
                                                placeholder="e.g. 80x100 cm"
                                            />
                                        </div>
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

                        {false ? (
                            <div className="space-y-6">
                                <FormSection
                                    title="Source Master"
                                    description="Upload the hi-res print source that every prepared print asset derives from."
                                />

                                {workflowData?.source_master ? (
                                    <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-bold text-[#31323E]">
                                                    Source master readiness
                                                </p>
                                                <p className="text-xs font-medium text-[#31323E]/45 mt-1">
                                                    Current upload, metadata presence and manual approval state.
                                                </p>
                                            </div>
                                            <StatusBadge status={workflowData?.source_master.status || "attention"} />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                            <div className="rounded-xl bg-[#31323E]/4 px-3 py-3">
                                                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                    Source Present
                                                </p>
                                                <p className="text-sm font-semibold text-[#31323E] mt-1">
                                                    {workflowData?.source_master.present ? "Yes" : "No"}
                                                </p>
                                            </div>
                                            <div className="rounded-xl bg-[#31323E]/4 px-3 py-3">
                                                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                    Reviewed
                                                </p>
                                                <p className="text-sm font-semibold text-[#31323E] mt-1">
                                                    {workflowData?.source_master.reviewed ? "Yes" : "No"}
                                                </p>
                                            </div>
                                            <div className="rounded-xl bg-[#31323E]/4 px-3 py-3">
                                                <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                    Pixel Size
                                                </p>
                                                <p className="text-sm font-semibold text-[#31323E] mt-1">
                                                    {String(
                                                        workflowData?.source_master.metadata?.width_px || "-"
                                                    )}{" "}
                                                    x{" "}
                                                    {String(
                                                        workflowData?.source_master.metadata?.height_px || "-"
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <label className="flex items-center gap-3 rounded-xl border border-[#31323E]/10 px-3.5 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(
                                                        formData.print_workflow_config.source_master_reviewed
                                                    )}
                                                    onChange={(event) =>
                                                        void updateSourceReviewed(event.target.checked)
                                                    }
                                                    className="w-4 h-4 accent-[#31323E]"
                                                />
                                                <span className="text-sm font-semibold text-[#31323E]">
                                                    Source master has been visually approved for production
                                                </span>
                                            </label>
                                        </div>

                                        <div className="mt-4 space-y-3">
                                            <IssueList
                                                title="Blocking issues"
                                                items={workflowData?.source_master.issues}
                                                tone="danger"
                                            />
                                            <IssueList
                                                title="Warnings"
                                                items={workflowData?.source_master.warnings}
                                                tone="warning"
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4">
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div>
                                            <p className="text-sm font-bold text-[#31323E]">
                                                High-res source file
                                            </p>
                                            <p className="text-xs font-medium text-[#31323E]/45 mt-1">
                                                TIFF, PNG, JPEG or WebP. Use the untouched master if possible.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            disabled={!editingId || printUploading}
                                            onClick={() => printFileRef.current?.click()}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold ${
                                                editingId
                                                    ? "bg-[#31323E] text-white"
                                                    : "bg-[#31323E]/10 text-[#31323E]/40"
                                            }`}
                                        >
                                            {printUploading ? "Uploading..." : "Upload Source"}
                                        </button>
                                    </div>

                                    <div className="mt-4 flex flex-col gap-3">
                                        <input
                                            type="text"
                                            value={formData.print_quality_url}
                                            onChange={(event) =>
                                                setFormData((previous) => ({
                                                    ...previous,
                                                    print_quality_url: event.target.value,
                                                }))
                                            }
                                            placeholder="/static/print/my-master.tif"
                                            className={`${INPUT_CLASS} font-mono text-xs`}
                                        />

                                        {formData.print_quality_url ? (
                                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-700">
                                                Current source: {formData.print_quality_url}
                                            </div>
                                        ) : null}

                                        {printUploadError ? (
                                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">
                                                {printUploadError}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <input
                                    ref={printFileRef}
                                    type="file"
                                    accept="image/tiff,image/png,image/jpeg,image/webp,.tif,.tiff"
                                    className="hidden"
                                    onChange={async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file || !editingId) {
                                            return;
                                        }

                                        setPrintUploading(true);
                                        setPrintUploadError(null);
                                        try {
                                            const body = new FormData();
                                            body.append("file", file);
                                            const response = await apiFetch(
                                                `${getApiUrl()}/artworks/${editingId}/print-image`,
                                                {
                                                    method: "POST",
                                                    body,
                                                }
                                            );
                                            if (!response.ok) {
                                                const errorPayload = await response.json().catch(() => ({}));
                                                throw new Error(JSON.stringify(errorPayload));
                                            }

                                            const payload = await response.json();
                                            setFormData((previous) => ({
                                                ...previous,
                                                print_quality_url: payload.url,
                                            }));
                                            await fetchWorkflow(editingId);
                                            await fetchData();
                                        } catch (error) {
                                            console.error(error);
                                            setPrintUploadError("Upload failed.");
                                        } finally {
                                            setPrintUploading(false);
                                            (event.target as HTMLInputElement).value = "";
                                        }
                                    }}
                                />
                            </div>
                        ) : null}

                        {activeStep === "pipeline" ? (
                            <div className="space-y-6">
                                <FormSection
                                    title="Print Pipeline"
                                    description="Upload the source once, validate the preparation matrix, and let smaller prepared sizes derive automatically from the largest approved category master."
                                />

                                <div className="rounded-[24px] border border-[#31323E]/10 bg-white px-5 py-5">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <h4 className="text-base font-bold text-[#31323E]">
                                                Source And Quality
                                            </h4>
                                            <p className="text-sm font-medium text-[#31323E]/50 mt-1">
                                                One hi-res source file powers the whole print pipeline.
                                            </p>
                                        </div>
                                        {workflowData?.source_master ? (
                                            <StatusBadge status={workflowData.source_master.status} />
                                        ) : null}
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mt-5">
                                        <div className="rounded-2xl border border-[#31323E]/10 px-4 py-4">
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <p className="text-sm font-bold text-[#31323E]">
                                                    High-res source file
                                                </p>
                                                <p className="text-xs font-medium text-[#31323E]/45 mt-1">
                                                    TIFF, PNG, JPEG or WebP. PNG is preferred for the print pipeline.
                                                </p>
                                            </div>
                                                <button
                                                    type="button"
                                                    disabled={!editingId || printUploading}
                                                    onClick={() => printFileRef.current?.click()}
                                                    className={`px-4 py-2 rounded-xl text-sm font-bold ${
                                                        editingId
                                                            ? "bg-[#31323E] text-white"
                                                            : "bg-[#31323E]/10 text-[#31323E]/40"
                                                    }`}
                                                >
                                                    {printUploading ? "Uploading..." : "Upload Source"}
                                                </button>
                                            </div>

                                            <div className="mt-4 flex flex-col gap-3">
                                                <input
                                                    type="text"
                                                    value={formData.print_quality_url}
                                                    onChange={(event) =>
                                                        setFormData((previous) => ({
                                                            ...previous,
                                                            print_quality_url: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="/static/print/my-master.tif"
                                                    className={`${INPUT_CLASS} font-mono text-xs`}
                                                />

                                                {formData.print_quality_url ? (
                                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-semibold text-emerald-700">
                                                        Current source: {formData.print_quality_url}
                                                    </div>
                                                ) : null}

                                                {printUploadError ? (
                                                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-semibold text-rose-700">
                                                        {printUploadError}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-[#31323E]/10 px-4 py-4">
                                            <div className="grid grid-cols-1 gap-3">
                                                <div className="rounded-xl bg-[#31323E]/4 px-3 py-3">
                                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                        Pixel Size
                                                    </p>
                                                    <p className="text-sm font-semibold text-[#31323E] mt-1">
                                                        {String(workflowData?.source_master.metadata?.width_px || "-")} x{" "}
                                                        {String(workflowData?.source_master.metadata?.height_px || "-")}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl bg-[#31323E]/4 px-3 py-3">
                                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                        300 DPI Limit
                                                    </p>
                                                    <p className="text-sm font-semibold text-[#31323E] mt-1">
                                                        {String(sourceMaxPrint300.width || "-")}{" "}
                                                        x{" "}
                                                        {String(sourceMaxPrint300.height || "-")} in
                                                    </p>
                                                </div>
                                                <label className="flex items-center gap-3 rounded-xl border border-[#31323E]/10 px-3.5 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(
                                                            formData.print_workflow_config.source_master_reviewed
                                                        )}
                                                        onChange={(event) =>
                                                            void updateSourceReviewed(event.target.checked)
                                                        }
                                                        className="w-4 h-4 accent-[#31323E]"
                                                    />
                                                    <span className="text-sm font-semibold text-[#31323E]">
                                                        Source approved for production
                                                    </span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 space-y-3">
                                        <IssueList
                                            title="Source blockers"
                                            items={workflowData?.source_master.issues}
                                            tone="danger"
                                        />
                                        <IssueList
                                            title="Source warnings"
                                            items={workflowData?.source_master.warnings}
                                            tone="warning"
                                        />
                                    </div>

                                    <input
                                        ref={printFileRef}
                                        type="file"
                                        accept="image/tiff,image/png,image/jpeg,image/webp,.tif,.tiff"
                                        className="hidden"
                                        onChange={async (event) => {
                                            const file = event.target.files?.[0];
                                            if (!file || !editingId) {
                                                return;
                                            }

                                            setPrintUploading(true);
                                            setPrintUploadError(null);
                                            try {
                                                const body = new FormData();
                                                body.append("file", file);
                                                const response = await apiFetch(
                                                    `${getApiUrl()}/artworks/${editingId}/print-image`,
                                                    {
                                                        method: "POST",
                                                        body,
                                                    }
                                                );
                                                if (!response.ok) {
                                                    const errorPayload = await response.json().catch(() => ({}));
                                                    throw new Error(JSON.stringify(errorPayload));
                                                }

                                                const payload = await response.json();
                                                setFormData((previous) => ({
                                                    ...previous,
                                                    print_quality_url: payload.url,
                                                }));
                                                await fetchWorkflow(editingId);
                                                await fetchData();
                                            } catch (error) {
                                                console.error(error);
                                                setPrintUploadError("Upload failed.");
                                            } finally {
                                                setPrintUploading(false);
                                                (event.target as HTMLInputElement).value = "";
                                            }
                                        }}
                                    />
                                </div>

                                {!hasPrintOfferings(formData) ? (
                                    <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                                        Enable at least one print family in the Offerings step to unlock the
                                        print workflow.
                                    </div>
                                ) : !editingId ? (
                                    <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-700">
                                        Save the artwork draft first. After that the admin workflow can calculate
                                        baked categories, size requirements and missing prepared assets.
                                    </div>
                                ) : workflowLoading ? (
                                    <div className="flex items-center gap-3 py-6">
                                        <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                                        <span className="text-sm font-semibold text-[#31323E]/55">
                                            Loading print workflow
                                        </span>
                                    </div>
                                ) : workflowError ? (
                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm font-semibold text-rose-700">
                                        {workflowError}
                                    </div>
                                ) : workflowData ? (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {workflowData.steps.map((step) => (
                                                <div
                                                    key={step.id}
                                                    className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="text-sm font-bold text-[#31323E]">
                                                            {step.label}
                                                        </p>
                                                        <StatusBadge status={step.status} />
                                                    </div>
                                                    <IssueList
                                                        title="Issues"
                                                        items={step.issues}
                                                        tone="danger"
                                                    />
                                                    <IssueList
                                                        title="Warnings"
                                                        items={step.warnings}
                                                        tone="warning"
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <StatusBadge status={workflowData.readiness_summary.status} />
                                            <span className="text-sm font-semibold text-[#31323E]/70">
                                                {workflowData.readiness_summary.message}
                                            </span>
                                            {workflowSaving ? (
                                                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/35">
                                                    Saving workflow...
                                                </span>
                                            ) : null}
                                        </div>

                                        <div className="rounded-[24px] border border-[#31323E]/10 bg-white px-5 py-5">
                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                <div>
                                                    <h4 className="text-base font-bold text-[#31323E]">
                                                        Preparation Matrix
                                                    </h4>
                                                    <p className="text-sm font-medium text-[#31323E]/50 mt-1">
                                                        Start here: prepare one production-safe master per enabled
                                                        category whenever possible, then let smaller slots validate
                                                        against it.
                                                    </p>
                                                </div>
                                                <StatusBadge status={workflowData.readiness_summary.status} />
                                            </div>

                                            <div className="space-y-3 mt-5">
                                                {workflowData.preparation_matrix.map((entry) => {
                                                    const uploadKey = `${entry.category_id}:category-master:${entry.required_asset_role || "none"}`;
                                                    const category = workflowData.category_workflows.find(
                                                        (item) => item.category_id === entry.category_id
                                                    );
                                                    const categoryMasterAsset =
                                                        category?.size_requirements.find(
                                                            (requirement) =>
                                                                requirement.asset_source === "category_master"
                                                        )?.asset || null;
                                                    const assetUrl = categoryMasterAsset?.file_url
                                                        ? `${getApiUrl().replace("/api", "")}${categoryMasterAsset.file_url}`
                                                        : null;

                                                    return (
                                                        <div
                                                            key={entry.category_id}
                                                            className={`rounded-2xl border px-4 py-4 ${
                                                                entry.status === "ready"
                                                                    ? "border-emerald-200 bg-emerald-50/40"
                                                                    : entry.status === "blocked"
                                                                    ? "border-rose-200 bg-rose-50/40"
                                                                    : "border-amber-200 bg-amber-50/40"
                                                            }`}
                                                        >
                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                <div>
                                                                    <div className="flex items-center gap-3 flex-wrap">
                                                                        <p className="text-sm font-bold text-[#31323E]">
                                                                            {entry.label}
                                                                        </p>
                                                                        <StatusBadge status={entry.status} />
                                                                        {!entry.enabled ? (
                                                                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                                                                                Disabled
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <p className="text-xs font-medium text-[#31323E]/50 mt-1">
                                                                        {entry.uses_source_master_only
                                                                            ? "This category can use the reviewed source master directly."
                                                                            : `Prepare one ${
                                                                                  entry.required_asset_label || "production"
                                                                              } at least as large as ${entry.suggested_master_size_label || "the largest baked slot"}.`}
                                                                    </p>
                                                                    {entry.suggested_master_dpi_policy_note ? (
                                                                        <p className="text-xs font-medium text-[#31323E]/45 mt-2">
                                                                            {entry.suggested_master_dpi_policy_note}
                                                                        </p>
                                                                    ) : null}
                                                                </div>

                                                                {entry.minimum_master_dimensions_px ? (
                                                                    <div className="rounded-xl bg-white/80 px-3 py-2 border border-[#31323E]/10">
                                                                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                            Minimum master px
                                                                        </p>
                                                                        <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                            {entry.minimum_master_dimensions_px.width} x{" "}
                                                                            {entry.minimum_master_dimensions_px.height}
                                                                        </p>
                                                                        {entry.suggested_master_target_dpi ? (
                                                                            <p className="text-[11px] font-medium text-[#31323E]/45 mt-1">
                                                                                {entry.suggested_master_target_dpi} DPI
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                ) : null}
                                                            </div>

                                                            {entry.client_selectable_attributes.length > 0 ? (
                                                                <div className="mt-4 rounded-xl bg-white/80 border border-[#31323E]/10 px-3.5 py-3">
                                                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                                        Customer options
                                                                    </p>
                                                                    <p className="text-xs font-medium text-[#31323E]/55 mt-2">
                                                                        These are chosen by the client, not by admin:
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-2 mt-3">
                                                                        {entry.client_selectable_attributes.map((choice) => (
                                                                            <span
                                                                                key={choice.key}
                                                                                className="rounded-full border border-[#31323E]/12 bg-white px-3 py-1.5 text-xs font-semibold text-[#31323E]"
                                                                            >
                                                                                {titleCase(choice.key)}:{" "}
                                                                                {choice.options.map(titleCase).join(", ")}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ) : null}

                                                            {entry.provider_submission_defaults &&
                                                            Object.keys(entry.provider_submission_defaults).length > 0 ? (
                                                                <div className="mt-4 rounded-xl bg-white/80 border border-[#31323E]/10 px-3.5 py-3">
                                                                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                                        Provider defaults
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-2 mt-3">
                                                                        {Object.entries(entry.provider_submission_defaults).map(
                                                                            ([key, value]) => (
                                                                                <span
                                                                                    key={key}
                                                                                    className="rounded-full border border-[#31323E]/12 bg-white px-3 py-1.5 text-xs font-semibold text-[#31323E]"
                                                                                >
                                                                                    {titleCase(key)}: {titleCase(String(value))}
                                                                                </span>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : null}

                                                            {!entry.uses_source_master_only &&
                                                            entry.category_master_supported &&
                                                            entry.enabled ? (
                                                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                                                    <input
                                                                        type="file"
                                                                        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                                                        onChange={(event) => {
                                                                            const file = event.target.files?.[0];
                                                                            if (file) {
                                                                                void uploadPreparedAsset(
                                                                                    entry.category_id,
                                                                                    entry.required_asset_role,
                                                                                    null,
                                                                                    file
                                                                                );
                                                                            }
                                                                            (event.target as HTMLInputElement).value = "";
                                                                        }}
                                                                        className="block text-sm font-medium text-[#31323E]"
                                                                    />

                                                                    {assetUploadingKey === uploadKey ? (
                                                                        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                            Uploading...
                                                                        </span>
                                                                    ) : null}

                                                                    {assetUrl ? (
                                                                        <a
                                                                            href={assetUrl}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E] underline"
                                                                        >
                                                                            Open current master
                                                                        </a>
                                                                    ) : null}

                                                                    {categoryMasterAsset ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                void deletePreparedAsset(categoryMasterAsset.id)
                                                                            }
                                                                            className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600"
                                                                        >
                                                                            Remove
                                                                        </button>
                                                                    ) : null}

                                                                    <span className="text-xs font-medium text-[#31323E]/45">
                                                                        Covers up to {entry.covered_size_count} baked size
                                                                        {entry.covered_size_count === 1 ? "" : "s"} in this
                                                                        category. Auto-generated smaller variants are stored as PNG.
                                                                    </span>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {workflowData.category_workflows.map((category) => {
                                                const currentConfig =
                                                    formData.print_workflow_config.categories?.[category.category_id] ||
                                                    {};
                                                const collapsed = Boolean(
                                                    collapsedCategories[category.category_id]
                                                );

                                                return (
                                                    <div
                                                        key={category.category_id}
                                                        className={`rounded-[24px] border px-5 py-5 ${
                                                            category.summary.status === "ready"
                                                                ? "border-emerald-200 bg-emerald-50/40"
                                                                : category.summary.status === "blocked"
                                                                ? "border-rose-200 bg-rose-50/40"
                                                                : "border-amber-200 bg-amber-50/40"
                                                        }`}
                                                    >
                                                        <div className="flex flex-wrap items-start justify-between gap-4">
                                                            <div>
                                                                <div className="flex items-center gap-3 flex-wrap">
                                                                    <h4 className="text-base font-bold text-[#31323E]">
                                                                        {category.label}
                                                                    </h4>
                                                                    <StatusBadge
                                                                        status={category.summary.status}
                                                                    />
                                                                </div>
                                                                <p className="text-sm font-medium text-[#31323E]/50 mt-1">
                                                                    {category.material_label} | {category.frame_label}
                                                                </p>
                                                            </div>

                                                            <div className="flex items-center gap-3">
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    <div className="rounded-xl bg-white/80 px-3 py-2 border border-[#31323E]/10">
                                                                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                            Required
                                                                        </p>
                                                                        <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                            {category.summary.required_count}
                                                                        </p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-white/80 px-3 py-2 border border-[#31323E]/10">
                                                                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                            Ready
                                                                        </p>
                                                                        <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                            {category.summary.ready_count}
                                                                        </p>
                                                                    </div>
                                                                    <div className="rounded-xl bg-white/80 px-3 py-2 border border-[#31323E]/10">
                                                                        <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                            Blockers
                                                                        </p>
                                                                        <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                            {category.summary.blocking_count}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setCollapsedCategories((previous) => ({
                                                                            ...previous,
                                                                            [category.category_id]:
                                                                                !previous[category.category_id],
                                                                        }))
                                                                    }
                                                                    className="rounded-xl border border-[#31323E]/12 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]"
                                                                >
                                                                    {collapsed ? "Expand" : "Collapse"}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {collapsed ? null : (
                                                            <>
                                                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
                                                                    <label className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={
                                                                                    currentConfig.enabled === undefined
                                                                                        ? category.enabled
                                                                                        : Boolean(currentConfig.enabled)
                                                                                }
                                                                                onChange={(event) =>
                                                                                    void updateCategoryConfig(category.category_id, {
                                                                                        enabled: event.target.checked,
                                                                                    })
                                                                                }
                                                                                className="w-4 h-4 accent-[#31323E]"
                                                                            />
                                                                            <span className="text-sm font-semibold text-[#31323E]">
                                                                                Enable this category for the artwork
                                                                            </span>
                                                                        </div>
                                                                    </label>

                                                                    <label className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-3">
                                                                        <div className="flex items-center gap-3">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={Boolean(currentConfig.reviewed)}
                                                                                onChange={(event) =>
                                                                                    void updateCategoryConfig(category.category_id, {
                                                                                        reviewed: event.target.checked,
                                                                                    })
                                                                                }
                                                                                className="w-4 h-4 accent-[#31323E]"
                                                                            />
                                                                            <span className="text-sm font-semibold text-[#31323E]">
                                                                                Manual production review completed
                                                                            </span>
                                                                        </div>
                                                                    </label>

                                                                    <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-3">
                                                                        <FieldLabel text="Asset strategy" valid={true} />
                                                                        <select
                                                                            value={
                                                                                currentConfig.asset_strategy ||
                                                                                category.asset_strategy
                                                                            }
                                                                            onChange={(event) =>
                                                                                void updateCategoryConfig(category.category_id, {
                                                                                    asset_strategy: event.target.value,
                                                                                })
                                                                            }
                                                                            className={INPUT_CLASS}
                                                                        >
                                                                            {category.medium === "paper" ? (
                                                                                <>
                                                                                    <option value="manual_white_border">
                                                                                        Manual white border file
                                                                                    </option>
                                                                                    <option value="source_master_only">
                                                                                        Source master only
                                                                                    </option>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <option value="manual_wrap_asset">
                                                                                        Manual wrap-ready file
                                                                                    </option>
                                                                                    <option value="source_master_only">
                                                                                        Source master only
                                                                                    </option>
                                                                                </>
                                                                            )}
                                                                        </select>
                                                                    </div>
                                                                </div>

                                                                {category.client_selectable_attributes.length > 0 ? (
                                                                    <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4 mt-5">
                                                                        <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                                            Customer-selectable options
                                                                        </p>
                                                                        <p className="text-xs font-medium text-[#31323E]/55 mt-2">
                                                                            Admin does not choose these. The customer can
                                                                            select them later in storefront and checkout.
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-2 mt-3">
                                                                            {category.client_selectable_attributes.map((choice) => (
                                                                                <span
                                                                                    key={choice.key}
                                                                                    className="rounded-full border border-[#31323E]/12 bg-[#FCFBF8] px-3 py-1.5 text-xs font-semibold text-[#31323E]"
                                                                                >
                                                                                    {titleCase(choice.key)}:{" "}
                                                                                    {choice.options.map(titleCase).join(", ")}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                {Object.keys(category.provider_submission_defaults || {})
                                                                    .length > 0 ? (
                                                                    <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4 mt-5">
                                                                        <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-[#31323E]/45">
                                                                            Provider body filled automatically
                                                                        </p>
                                                                        <div className="flex flex-wrap gap-2 mt-3">
                                                                            {Object.entries(
                                                                                category.provider_submission_defaults
                                                                            ).map(([key, value]) => (
                                                                                <span
                                                                                    key={key}
                                                                                    className="rounded-full border border-[#31323E]/12 bg-[#FCFBF8] px-3 py-1.5 text-xs font-semibold text-[#31323E]"
                                                                                >
                                                                                    {titleCase(key)}:{" "}
                                                                                    {titleCase(String(value))}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                <div className="space-y-3 mt-5">
                                                                    <IssueList
                                                                        title="Category blockers"
                                                                        items={category.issues}
                                                                        tone="danger"
                                                                    />

                                                                    {category.size_requirements.map((requirement) => {
                                                                        const uploadKey = `${category.category_id}:${requirement.slot_size_label}:${requirement.asset_role}`;
                                                                        const assetUrl = requirement.asset?.file_url
                                                                            ? `${getApiUrl().replace("/api", "")}${requirement.asset.file_url}`
                                                                            : null;

                                                                        return (
                                                                            <div
                                                                                key={`${category.category_id}-${requirement.slot_size_label}`}
                                                                                className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4"
                                                                            >
                                                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                                                    <div>
                                                                                        <div className="flex items-center gap-3 flex-wrap">
                                                                                            <p className="text-sm font-bold text-[#31323E]">
                                                                                                {requirement.slot_size_label}
                                                                                            </p>
                                                                                            <StatusBadge
                                                                                                status={
                                                                                                    requirement.validation
                                                                                                        .status
                                                                                                }
                                                                                            />
                                                                                        </div>
                                                                                        <p className="text-xs font-medium text-[#31323E]/45 mt-1">
                                                                                            Required file:{" "}
                                                                                            {requirement.asset_role_label ||
                                                                                                "Not required"}
                                                                                        </p>
                                                                                        {requirement.asset_source ===
                                                                                        "category_master" ? (
                                                                                            <p className="text-xs font-medium text-emerald-700 mt-2">
                                                                                                Validated via the shared category
                                                                                                master asset.
                                                                                            </p>
                                                                                        ) : null}
                                                                                    </div>

                                                                                    <div className="grid grid-cols-2 gap-2">
                                                                                        <div className="rounded-xl bg-[#31323E]/4 px-3 py-2">
                                                                                            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                                                Required px
                                                                                            </p>
                                                                                            <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                                                {
                                                                                                    requirement
                                                                                                        .required_dimensions_px
                                                                                                        .width
                                                                                                }{" "}
                                                                                                x{" "}
                                                                                                {
                                                                                                    requirement
                                                                                                        .required_dimensions_px
                                                                                                        .height
                                                                                                }
                                                                                            </p>
                                                                                        </div>
                                                                                        <div className="rounded-xl bg-[#31323E]/4 px-3 py-2">
                                                                                            <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-[#31323E]/40">
                                                                                                Target DPI
                                                                                            </p>
                                                                                            <p className="text-sm font-bold text-[#31323E] mt-1">
                                                                                                {requirement.target_dpi}
                                                                                            </p>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>

                                                                                {requirement.strategy === "manual_wrap_asset" ? (
                                                                                    <p className="text-xs font-medium text-[#31323E]/45 mt-3">
                                                                                        Wrap margin is currently{" "}
                                                                                        {requirement.wrap_margin_pct}%. Required
                                                                                        dimensions above already include the wrap
                                                                                        zone.
                                                                                    </p>
                                                                                ) : null}
                                                                                {requirement.dpi_policy_note ? (
                                                                                    <p className="text-xs font-medium text-[#31323E]/45 mt-2">
                                                                                        {requirement.dpi_policy_note}
                                                                                    </p>
                                                                                ) : null}

                                                                                <div className="mt-4 space-y-3">
                                                                                    <IssueList
                                                                                        title="Validation issues"
                                                                                        items={requirement.validation.issues}
                                                                                        tone="danger"
                                                                                    />
                                                                                    <IssueList
                                                                                        title="Validation warnings"
                                                                                        items={requirement.validation.warnings}
                                                                                        tone="warning"
                                                                                    />
                                                                                </div>

                                                                                {requirement.required ? (
                                                                                    <div className="mt-4 flex flex-wrap items-center gap-3">
                                                                                        <input
                                                                                            type="file"
                                                                                            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                                                                                            onChange={(event) => {
                                                                                                const file =
                                                                                                    event.target.files?.[0];
                                                                                                if (file) {
                                                                                                    void uploadPreparedAsset(
                                                                                                        category.category_id,
                                                                                                        requirement.asset_role,
                                                                                                        requirement.slot_size_label,
                                                                                                        file
                                                                                                    );
                                                                                                }
                                                                                                (
                                                                                                    event.target as HTMLInputElement
                                                                                                ).value = "";
                                                                                            }}
                                                                                            className="block text-sm font-medium text-[#31323E]"
                                                                                        />

                                                                                        {assetUploadingKey === uploadKey ? (
                                                                                            <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                                                                Uploading...
                                                                                            </span>
                                                                                        ) : null}

                                                                                        {requirement.asset ? (
                                                                                            <>
                                                                                                {assetUrl ? (
                                                                                                    <a
                                                                                                        href={assetUrl}
                                                                                                        target="_blank"
                                                                                                        rel="noreferrer"
                                                                                                        className="text-xs font-bold uppercase tracking-[0.14em] text-[#31323E] underline"
                                                                                                    >
                                                                                                        Open asset
                                                                                                    </a>
                                                                                                ) : null}

                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() =>
                                                                                                        void deletePreparedAsset(
                                                                                                            requirement.asset!.id
                                                                                                        )
                                                                                                    }
                                                                                                    className="text-xs font-bold uppercase tracking-[0.14em] text-rose-600"
                                                                                                >
                                                                                                    Remove
                                                                                                </button>

                                                                                                <span className="text-xs font-medium text-[#31323E]/45">
                                                                                                    Uploaded:{" "}
                                                                                                    {String(
                                                                                                        requirement.asset
                                                                                                            .file_metadata?.width_px ||
                                                                                                            "-"
                                                                                                    )}{" "}
                                                                                                    x{" "}
                                                                                                    {String(
                                                                                                        requirement.asset
                                                                                                            .file_metadata?.height_px ||
                                                                                                            "-"
                                                                                                    )}
                                                                                                </span>
                                                                                            </>
                                                                                        ) : null}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="mt-4 rounded-xl bg-[#31323E]/4 px-3.5 py-3 text-xs font-medium text-[#31323E]/55">
                                                                                        This size slot does not currently require a
                                                                                        dedicated prepared asset because the chosen
                                                                                        strategy is{" "}
                                                                                        {titleCase(requirement.strategy)}.
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
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
                                            <span>Ready categories: {readiness.ready_category_count}</span>
                                            <span>Blockers: {readiness.blocking_category_count}</span>
                                            <span>Attention steps: {readiness.attention_step_count}</span>
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
