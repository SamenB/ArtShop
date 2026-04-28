"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiUrl } from "@/utils";

const inputCls =
    "w-full border border-[#31323E]/15 rounded-md px-3 py-2 text-sm text-[#31323E] font-medium bg-white focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10";

type HubMode = "preview" | "probe";

interface ProbeResult {
    sku: string;
    description: string;
    aspect_ratio: string;
    width_in: number;
    height_in: number;
    applied_attributes: Record<string, string>;
    shipping_tiers: Array<{
        method: string;
        wholesale_cost_eur: number;
        shipping_cost_eur: number;
        delivery_estimate: string;
    }>;
    quote_outcome: string;
    quote_issues: Array<{ description?: string }>;
    is_ideal_match: boolean;
    raw_quote: unknown;
}

interface PreviewRatio {
    label: string;
    title: string;
    description: string;
    sort_order: number;
}

interface PreviewCategory {
    id: string;
    label: string;
    short_label: string;
    material_label: string;
    frame_label: string;
    sort_order: number;
}

interface PreviewRatioCard {
    ratio: string;
    title: string;
    description: string;
    available_category_count: number;
    country_count: number;
    full_country_count: number;
    partial_country_count: number;
}

interface PreviewPaperMaterial {
    id: string;
    label: string;
    description: string;
    is_default: boolean;
}

interface PreviewCountryOption {
    country_code: string;
    country_name: string;
}

interface PreviewCountryCell {
    category_id: string;
    status: "available" | "missing";
    size_count: number;
    fulfillment: PreviewFulfillmentPolicy;
}

interface PreviewCountryRow {
    country_code: string;
    country_name: string;
    available_category_count: number;
    completion_status: "full" | "partial" | "missing";
    completion_percent: number;
    total_size_count: number;
    primary_category_count: number;
    notice_category_count: number;
    cells: PreviewCountryCell[];
}

interface PreviewSizeSlot {
    recommended_size_label: string;
    strongest_size_label: string;
    centroid_size_label: string;
    member_size_labels: string[];
    country_count: number;
    score: number;
    row_count: number;
}

interface PreviewCategoryOverview {
    category_id: string;
    label: string;
    short_label: string;
    material_label: string;
    frame_label: string;
    available: boolean;
    available_size_count: number;
    country_coverage_count: number;
    source_countries: string[];
    storefront_policy?: PreviewStorefrontPolicy | null;
    fulfillment_summary: PreviewFulfillmentSummary;
    recommended_size_labels: string[];
    size_slots: PreviewSizeSlot[];
}

interface PreviewFulfillmentSummary {
    local_country_count: number;
    regional_country_count: number;
    cross_border_country_count: number;
    unsupported_country_count: number;
    domestic_geography_country_count: number;
    europe_geography_country_count: number;
    international_geography_country_count: number;
    no_geography_country_count: number;
    low_tax_country_count: number;
    elevated_tax_country_count: number;
    no_tax_country_count: number;
    show_country_count: number;
    notice_country_count: number;
    hidden_country_count: number;
}

interface PreviewStorefrontPolicy {
    label: string;
    fixed_attributes: Record<string, string>;
    allowed_attributes: Record<string, string[]>;
    recommended_defaults: Record<string, string>;
    shipping: {
        visible_methods: string[];
        preferred_order: string[];
        default_method?: string | null;
    };
    notes: string[];
    kept_route_count: number;
    removed_route_count: number;
}

interface PreviewFulfillmentPolicy {
    fulfillment_level: "local" | "regional" | "cross_border" | "unsupported";
    geography_scope: "domestic" | "europe" | "international" | "none";
    storefront_action: "show" | "show_with_notice" | "hide";
    source_countries: string[];
    tax_risk: "low" | "elevated" | "none";
    row_count: number;
    fastest_delivery_days?: string | null;
    note: string;
}

interface PreviewOffer {
    sku: string;
    source_country?: string | null;
    product_price: number;
    shipping_price: number;
    total_cost: number;
    currency: string;
    delivery_days?: string | null;
    shipping_method?: string | null;
    service_name?: string | null;
    service_level?: string | null;
    default_shipping_tier?: string | null;
    available_shipping_tiers?: string[];
    shipping_profiles?: Array<{
        tier: string;
        shipping_method?: string | null;
        service_name?: string | null;
        service_level?: string | null;
        source_country?: string | null;
        currency?: string | null;
        total_cost?: number | null;
        delivery_days?: string | null;
    }>;
}

interface PreviewSizeCell {
    slot_size_label: string;
    size_label: string;
    available: boolean;
    is_exact_match: boolean;
    centroid_size_label: string;
    member_size_labels: string[];
    offer?: PreviewOffer | null;
}

interface PreviewCountryCategoryRow {
    category_id: string;
    label: string;
    short_label: string;
    material_label: string;
    frame_label: string;
    fulfillment_policy: PreviewFulfillmentPolicy;
    baseline_sizes: string[];
    available_size_count: number;
    size_cells: PreviewSizeCell[];
    sample_offers: PreviewOffer[];
}

interface SelectedCountryPreview {
    ratio?: string;
    country_code: string;
    country_name: string;
    category_rows: PreviewCountryCategoryRow[];
}

interface SelectedRatioPreview {
    ratio: string;
    ratio_meta: PreviewRatio;
    available_category_count: number;
    countries: PreviewCountryOption[];
    country_rows: PreviewCountryRow[];
    category_previews: PreviewCategoryOverview[];
    full_country_count: number;
    partial_country_count: number;
}

interface CatalogPreviewResponse {
    selected_ratio: string;
    selected_country: string;
    selected_paper_material: string;
    storefront_mode?: "primary_only" | "include_notice_level";
    ratios: PreviewRatio[];
    paper_materials: PreviewPaperMaterial[];
    categories: PreviewCategory[];
    ratio_cards: PreviewRatioCard[];
    selected_ratio_preview: SelectedRatioPreview;
    selected_country_preview: SelectedCountryPreview;
    selected_country_storefront_preview?: SelectedCountryStorefrontPreview;
    country_count: number;
    generated_from_curated_routes: number;
    policy_filtered_out_routes: number;
}

interface StorefrontCardSize {
    slot_size_label: string;
    size_label: string;
    is_exact_match: boolean;
    source_country?: string | null;
    currency?: string | null;
    total_cost?: number | null;
    delivery_days?: string | null;
    sku?: string | null;
    shipping_method?: string | null;
    service_name?: string | null;
    service_level?: string | null;
    default_shipping_tier?: string | null;
    shipping_profiles?: Array<{
        tier: string;
        shipping_method?: string | null;
        service_name?: string | null;
        service_level?: string | null;
        source_country?: string | null;
        currency?: string | null;
        total_cost?: number | null;
        delivery_days?: string | null;
    }>;
    shipping_support: {
        status: "covered" | "blocked" | "unavailable";
        chosen_tier?: string | null;
        chosen_shipping_price?: number | null;
        chosen_delivery_days?: string | null;
        note: string;
    };
}

interface StorefrontCardPreview {
    category_id: string;
    label: string;
    short_label: string;
    material_label: string;
    frame_label: string;
    storefront_action: "show" | "show_with_notice" | "hide";
    fulfillment_level: PreviewFulfillmentPolicy["fulfillment_level"];
    geography_scope: PreviewFulfillmentPolicy["geography_scope"];
    tax_risk: PreviewFulfillmentPolicy["tax_risk"];
    source_countries: string[];
    fastest_delivery_days?: string | null;
    note: string;
    storefront_policy: {
        fixed_attributes: Record<string, string>;
        recommended_defaults: Record<string, string>;
        allowed_attributes: Record<string, string[]>;
    };
    available_shipping_tiers?: string[];
    default_shipping_tier?: string | null;
    shipping_support: {
        status: "covered" | "blocked" | "unavailable";
        covered_size_count: number;
        review_size_count: number;
        blocked_size_count: number;
        unavailable_size_count: number;
        dominant_tier?: string | null;
        min_supported_shipping_price?: number | null;
        max_supported_shipping_price?: number | null;
    };
    available_size_count: number;
    size_labels: string[];
    price_range: {
        currency?: string | null;
        min_total?: number | null;
        max_total?: number | null;
    };
    size_options: StorefrontCardSize[];
}

interface HiddenStorefrontCard {
    category_id: string;
    label: string;
    reason: string;
    storefront_action: "show" | "show_with_notice" | "hide";
    fulfillment_level: PreviewFulfillmentPolicy["fulfillment_level"];
    geography_scope: PreviewFulfillmentPolicy["geography_scope"];
    tax_risk: PreviewFulfillmentPolicy["tax_risk"];
}

interface SelectedCountryStorefrontPreview {
    storefront_mode: "primary_only" | "include_notice_level";
    country_code: string;
    country_name: string;
    ratio: string;
    visible_cards: StorefrontCardPreview[];
    hidden_cards: HiddenStorefrontCard[];
}

const denseButton =
    "px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] rounded-md border transition-all";

function countryStatusClass(status: PreviewCountryRow["completion_status"]) {
    if (status === "full") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (status === "partial") {
        return "bg-amber-50 text-amber-700";
    }
    return "bg-rose-50 text-rose-700";
}

function buildSlotTooltip(slot: PreviewSizeSlot) {
    const members = slot.member_size_labels.join(", ") || slot.recommended_size_label;
    return `Recommended slot: ${slot.recommended_size_label}
Centroid: ${slot.centroid_size_label}
Strongest real size: ${slot.strongest_size_label}
Cluster members: ${members}
Coverage countries: ${slot.country_count}`;
}

function formatAttributePairs(values: Record<string, string>) {
    const entries = Object.entries(values);
    if (!entries.length) {
        return "None";
    }
    return entries.map(([key, value]) => `${key}: ${value}`).join(" | ");
}

function formatAllowedAttributes(values: Record<string, string[]>) {
    const entries = Object.entries(values);
    if (!entries.length) {
        return "None";
    }
    return entries.map(([key, list]) => `${key}: ${list.join(", ")}`).join(" | ");
}

function fulfillmentLevelClass(level: PreviewFulfillmentPolicy["fulfillment_level"]) {
    if (level === "local") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (level === "regional") {
        return "bg-sky-50 text-sky-700";
    }
    if (level === "cross_border") {
        return "bg-amber-50 text-amber-700";
    }
    return "bg-rose-50 text-rose-700";
}

function storefrontActionClass(action: PreviewFulfillmentPolicy["storefront_action"]) {
    if (action === "show") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (action === "show_with_notice") {
        return "bg-amber-50 text-amber-700";
    }
    return "bg-rose-50 text-rose-700";
}

function fulfillmentLevelLabel(level: PreviewFulfillmentPolicy["fulfillment_level"]) {
    if (level === "local") {
        return "local";
    }
    if (level === "regional") {
        return "regional";
    }
    if (level === "cross_border") {
        return "cross-border";
    }
    return "unsupported";
}

function storefrontActionLabel(action: PreviewFulfillmentPolicy["storefront_action"]) {
    if (action === "show") {
        return "primary";
    }
    if (action === "show_with_notice") {
        return "notice";
    }
    return "hide";
}

function geographyScopeClass(scope: PreviewFulfillmentPolicy["geography_scope"]) {
    if (scope === "domestic") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (scope === "europe") {
        return "bg-sky-50 text-sky-700";
    }
    if (scope === "international") {
        return "bg-stone-100 text-stone-700";
    }
    return "bg-rose-50 text-rose-700";
}

function geographyScopeLabel(scope: PreviewFulfillmentPolicy["geography_scope"]) {
    if (scope === "domestic") {
        return "domestic";
    }
    if (scope === "europe") {
        return "europe";
    }
    if (scope === "international") {
        return "international";
    }
    return "none";
}

function taxRiskClass(risk: PreviewFulfillmentPolicy["tax_risk"]) {
    if (risk === "low") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (risk === "elevated") {
        return "bg-amber-50 text-amber-700";
    }
    return "bg-rose-50 text-rose-700";
}

function shippingTierLabel(tier: string | null | undefined) {
    if (tier === "express") {
        return "ex";
    }
    if (tier === "standard") {
        return "std";
    }
    if (tier === "budget") {
        return "bud";
    }
    if (tier === "overnight") {
        return "ovn";
    }
    return tier || "-";
}

function formatShippingTierList(tiers: string[] | null | undefined) {
    return (tiers ?? []).map((tier) => shippingTierLabel(tier)).join(" | ") || "-";
}

function shippingSupportClass(status: "covered" | "blocked" | "unavailable") {
    if (status === "covered") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (status === "unavailable") {
        return "bg-[#F3F3F1] text-[#31323E]/60";
    }
    return "bg-rose-50 text-rose-700";
}

export default function ProdigiHubTab() {
    const [mode, setMode] = useState<HubMode>("preview");

    const [probeCountry, setProbeCountry] = useState("DE");
    const [probeRatio, setProbeRatio] = useState("4:5");
    const [family, setFamily] = useState("HPR_ROLLED");
    const [probeLoading, setProbeLoading] = useState(false);
    const [results, setResults] = useState<ProbeResult[]>([]);
    const [probeError, setProbeError] = useState<string | null>(null);
    const [rawJson, setRawJson] = useState<unknown>(null);

    const [previewData, setPreviewData] = useState<CatalogPreviewResponse | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [selectedRatio, setSelectedRatio] = useState("4:5");
    const [selectedCountry, setSelectedCountry] = useState("DE");
    const [selectedPaperMaterial, setSelectedPaperMaterial] = useState("hahnemuhle_german_etching");
    const [includeNoticeLevel, setIncludeNoticeLevel] = useState(true);
    const [bakeLoading, setBakeLoading] = useState(false);
    const [bakeMessage, setBakeMessage] = useState<string | null>(null);

    const loadPreview = async (
        ratio: string,
        country: string,
        paperMaterial: string,
        includeNotice: boolean,
    ) => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const res = await apiFetch(
                `${getApiUrl()}/v1/admin/prodigi/catalog-preview?aspect_ratio=${encodeURIComponent(ratio)}&country=${encodeURIComponent(country)}&paper_material=${encodeURIComponent(paperMaterial)}&include_notice_level=${includeNotice ? "true" : "false"}`,
            );
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data: CatalogPreviewResponse = await res.json();
            setPreviewData(data);
            setSelectedRatio(data.selected_ratio);
            setSelectedCountry(data.selected_country);
            setSelectedPaperMaterial(data.selected_paper_material);
        } catch (err) {
            setPreviewError(err instanceof Error ? err.message : "Failed to load preview");
        } finally {
            setPreviewLoading(false);
        }
    };

    useEffect(() => {
        void loadPreview("4:5", "DE", "hahnemuhle_german_etching", true);
    }, []);

    const selectedRatioPreview = previewData?.selected_ratio_preview;
    const selectedCountryPreview = previewData?.selected_country_preview;
    const totalCategoryCount = previewData?.categories.length ?? 0;
    const selectedPaperMaterialMeta = useMemo(
        () => previewData?.paper_materials.find((item) => item.id === selectedPaperMaterial) ?? null,
        [previewData, selectedPaperMaterial],
    );

    const previewStats = useMemo(() => {
        if (!previewData || !selectedRatioPreview) {
            return [];
        }
        return [
            ["Paper material", selectedPaperMaterialMeta?.label ?? selectedPaperMaterial],
            ["Storefront mode", includeNoticeLevel ? "Notice included" : "Primary only"],
            ["Categories ready", `${selectedRatioPreview.available_category_count}/${totalCategoryCount}`],
            ["Full countries", String(selectedRatioPreview.full_country_count)],
            ["Partial countries", String(selectedRatioPreview.partial_country_count)],
            ["Routes checked", previewData.generated_from_curated_routes.toLocaleString()],
            ["Policy filtered", previewData.policy_filtered_out_routes.toLocaleString()],
        ];
    }, [
        includeNoticeLevel,
        previewData,
        selectedPaperMaterial,
        selectedPaperMaterialMeta,
        selectedRatioPreview,
        totalCategoryCount,
    ]);

    const exportCountryMatrix = () => {
        if (!previewData || !selectedRatioPreview) {
            return;
        }

        const headers = [
            "country_code",
            "country_name",
            "completion_status",
            "completion_percent",
            ...previewData.categories.map((item) => `${item.id}_size_count`),
        ];
        const lines = [headers.join(",")];

        for (const row of selectedRatioPreview.country_rows) {
            const cells = new Map(row.cells.map((cell) => [cell.category_id, cell]));
            const values = [
                row.country_code,
                row.country_name,
                row.completion_status,
                String(row.completion_percent),
                ...previewData.categories.map((item) => String(cells.get(item.id)?.size_count ?? 0)),
            ];
            lines.push(values.map((value) => `"${value.replaceAll('"', '""')}"`).join(","));
        }

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `prodigi-country-matrix-${selectedRatio}-${selectedPaperMaterial}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const handleBakeCheckpoint = async () => {
        setBakeLoading(true);
        setBakeMessage(null);
        try {
            const res = await apiFetch(
                `${getApiUrl()}/v1/admin/prodigi/catalog-preview/create-database?aspect_ratio=${encodeURIComponent(selectedRatio)}&country=${encodeURIComponent(selectedCountry)}&paper_material=${encodeURIComponent(selectedPaperMaterial)}&include_notice_level=${includeNoticeLevel ? "true" : "false"}`,
                { method: "POST" },
            );
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = await res.json();
            const summary = data?.bake
                ? ` Bake ${data.bake.bake_key}: ${data.bake.offer_group_count} groups / ${data.bake.offer_size_count} sizes.`
                : "";
            setBakeMessage((data.message ?? "Storefront bake completed.") + summary);
        } catch (err) {
            setBakeMessage(err instanceof Error ? err.message : "Failed to run checkpoint");
        } finally {
            setBakeLoading(false);
        }
    };

    const handleProbe = async () => {
        setProbeLoading(true);
        setProbeError(null);
        setResults([]);
        try {
            const res = await apiFetch(
                `${getApiUrl()}/v1/admin/prodigi/probe?country=${probeCountry}&aspect_ratio=${probeRatio}&family=${family}`,
            );
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = await res.json();
            setResults(data.results);
        } catch (err) {
            setProbeError(err instanceof Error ? err.message : "Probe failed");
        } finally {
            setProbeLoading(false);
        }
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 text-[#31323E]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#31323E]/10 pb-4">
                <div>
                    <h2 className="text-2xl font-bold">Prodigi Catalog Planner</h2>
                    <p className="text-sm text-[#31323E]/55 mt-1">
                        Operational preview for imported Prodigi CSV routes before they are baked into the storefront snapshot.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setMode("preview")}
                        className={`${denseButton} ${mode === "preview" ? "bg-[#31323E] text-white border-[#31323E]" : "bg-white border-[#31323E]/15"}`}
                    >
                        Catalog Preview
                    </button>
                    <button
                        onClick={() => setMode("probe")}
                        className={`${denseButton} ${mode === "probe" ? "bg-[#31323E] text-white border-[#31323E]" : "bg-white border-[#31323E]/15"}`}
                    >
                        Live Probe
                    </button>
                </div>
            </div>

            {mode === "preview" && (
                <div className="space-y-5">
                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1.3fr_1.1fr_auto_auto_auto] gap-3 items-end">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Aspect ratio
                            </label>
                            <select
                                className={inputCls}
                                value={selectedRatio}
                                onChange={(event) =>
                                    void loadPreview(
                                        event.target.value,
                                        selectedCountry,
                                        selectedPaperMaterial,
                                        includeNoticeLevel,
                                    )
                                }
                            >
                                {(previewData?.ratios ?? []).map((item) => (
                                    <option key={item.label} value={item.label}>
                                        {item.label} - {item.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Country detail
                            </label>
                            <select
                                className={inputCls}
                                value={selectedCountry}
                                onChange={(event) =>
                                    void loadPreview(
                                        selectedRatio,
                                        event.target.value,
                                        selectedPaperMaterial,
                                        includeNoticeLevel,
                                    )
                                }
                            >
                                {(selectedRatioPreview?.countries ?? []).map((item) => (
                                    <option key={item.country_code} value={item.country_code}>
                                        {item.country_name} ({item.country_code})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Paper material
                            </label>
                            <select
                                className={inputCls}
                                value={selectedPaperMaterial}
                                onChange={(event) =>
                                    void loadPreview(
                                        selectedRatio,
                                        selectedCountry,
                                        event.target.value,
                                        includeNoticeLevel,
                                    )
                                }
                            >
                                {(previewData?.paper_materials ?? []).map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Storefront mode
                            </label>
                            <select
                                className={inputCls}
                                value={includeNoticeLevel ? "include_notice_level" : "primary_only"}
                                onChange={(event) => {
                                    const nextValue = event.target.value === "include_notice_level";
                                    setIncludeNoticeLevel(nextValue);
                                    void loadPreview(
                                        selectedRatio,
                                        selectedCountry,
                                        selectedPaperMaterial,
                                        nextValue,
                                    );
                                }}
                            >
                                <option value="include_notice_level">Include notice-level</option>
                                <option value="primary_only">Primary only</option>
                            </select>
                        </div>
                        <button
                            onClick={() =>
                                void loadPreview(
                                    selectedRatio,
                                    selectedCountry,
                                    selectedPaperMaterial,
                                    includeNoticeLevel,
                                )
                            }
                            disabled={previewLoading}
                            className="h-[42px] px-4 bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-[0.18em] rounded-md disabled:opacity-50"
                        >
                            {previewLoading ? "Refreshing" : "Refresh"}
                        </button>
                        <button
                            onClick={exportCountryMatrix}
                            disabled={!previewData}
                            className="h-[42px] px-4 border border-[#31323E]/15 text-[11px] font-bold uppercase tracking-[0.18em] rounded-md disabled:opacity-40"
                        >
                            Export CSV
                        </button>
                        <button
                            onClick={handleBakeCheckpoint}
                            disabled={!previewData || bakeLoading}
                            className="h-[42px] px-4 bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-[0.18em] rounded-md disabled:opacity-50"
                        >
                            {bakeLoading ? "Checking" : "Create Database"}
                        </button>
                    </div>

                    {bakeMessage && (
                        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                            {bakeMessage}
                        </div>
                    )}

                    {previewError && (
                        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                            {previewError}
                        </div>
                    )}

                    {previewLoading && !previewData && (
                        <div className="border border-[#31323E]/10 bg-[#F7F7F5] px-4 py-3 text-sm text-[#31323E]/70">
                            Loading curated catalog preview. We are calculating country coverage, sizes, and category availability from the imported Prodigi routes.
                        </div>
                    )}

                    <div className="overflow-auto border border-[#31323E]/10">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[#F7F7F5]">
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Ratio</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Description</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Categories</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Countries</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Full</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Partial</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(previewData?.ratio_cards ?? []).map((card) => (
                                    <tr
                                        key={card.ratio}
                                        className={card.ratio === selectedRatio ? "bg-[#EEF3F8]" : "bg-white"}
                                    >
                                        <td className="px-3 py-2 font-semibold">
                                            <button
                                                onClick={() =>
                                                    void loadPreview(
                                                        card.ratio,
                                                        selectedCountry,
                                                        selectedPaperMaterial,
                                                        includeNoticeLevel,
                                                    )
                                                }
                                                className="underline underline-offset-2"
                                            >
                                                {card.ratio}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2 text-[#31323E]/70">{card.title}</td>
                                        <td className="px-3 py-2 text-right">
                                            {card.available_category_count}/{totalCategoryCount}
                                        </td>
                                        <td className="px-3 py-2 text-right">{card.country_count}</td>
                                        <td className="px-3 py-2 text-right">{card.full_country_count}</td>
                                        <td className="px-3 py-2 text-right">{card.partial_country_count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                        {previewStats.map(([label, value]) => (
                            <div key={label} className="border border-[#31323E]/10 bg-white px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                    {label}
                                </div>
                                <div className="text-xl font-bold mt-2">{value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="overflow-auto border border-[#31323E]/10">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[#F7F7F5]">
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Category</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Material / frame</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Slots</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Countries</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Source countries</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Fulfillment split</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Geography</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Customs risk</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Reliable shortlist</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(selectedRatioPreview?.category_previews ?? []).map((item) => (
                                    <tr key={item.category_id} className="bg-white border-t border-[#31323E]/6">
                                        <td className="px-3 py-2 font-semibold">{item.label}</td>
                                        <td className="px-3 py-2 text-[#31323E]/70">
                                            {item.material_label} / {item.frame_label}
                                        </td>
                                        <td className="px-3 py-2 text-right">{item.available_size_count}</td>
                                        <td className="px-3 py-2 text-right">{item.country_coverage_count}</td>
                                        <td className="px-3 py-2 text-[#31323E]/70">
                                            {item.source_countries.join(", ") || "-"}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-[#31323E]/70 leading-relaxed">
                                            <div>local: {item.fulfillment_summary.local_country_count}</div>
                                            <div>regional: {item.fulfillment_summary.regional_country_count}</div>
                                            <div>cross-border: {item.fulfillment_summary.cross_border_country_count}</div>
                                            <div>hidden: {item.fulfillment_summary.hidden_country_count}</div>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-[#31323E]/70 leading-relaxed">
                                            <div>domestic: {item.fulfillment_summary.domestic_geography_country_count}</div>
                                            <div>europe: {item.fulfillment_summary.europe_geography_country_count}</div>
                                            <div>international: {item.fulfillment_summary.international_geography_country_count}</div>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-[#31323E]/70 leading-relaxed">
                                            <div>low: {item.fulfillment_summary.low_tax_country_count}</div>
                                            <div>elevated: {item.fulfillment_summary.elevated_tax_country_count}</div>
                                            <div>none: {item.fulfillment_summary.no_tax_country_count}</div>
                                        </td>
                                        <td className="px-3 py-2 text-[#31323E]/70">
                                            {item.size_slots.length ? (
                                                <div className="space-y-1">
                                                    {item.size_slots.map((slot) => (
                                                        <div
                                                            key={`${item.category_id}-${slot.recommended_size_label}`}
                                                            className="leading-snug"
                                                            title={buildSlotTooltip(slot)}
                                                        >
                                                            <span className="font-semibold text-[#31323E]">
                                                                {slot.recommended_size_label}
                                                            </span>
                                                            {slot.member_size_labels.length > 1 && (
                                                                <span className="text-[#31323E]/55">
                                                                    {" "}
                                                                    [{slot.member_size_labels.join(", ")}]
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                "No matching sizes"
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="overflow-auto border border-[#31323E]/10">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[#F7F7F5]">
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Storefront policy</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Fixed</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Recommended</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Allowed</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Shipping</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Kept</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Removed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(selectedRatioPreview?.category_previews ?? []).map((item) => {
                                    const policy = item.storefront_policy;
                                    return (
                                        <tr key={`policy-${item.category_id}`} className="bg-white border-t border-[#31323E]/6 align-top">
                                            <td className="px-3 py-2">
                                                <div className="font-semibold">{item.label}</div>
                                                <div className="text-xs text-[#31323E]/50 mt-1">
                                                    {(policy?.notes ?? []).join(" ") || "No storefront policy notes."}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-[#31323E]/70">
                                                {policy ? formatAttributePairs(policy.fixed_attributes) : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-[#31323E]/70">
                                                {policy ? formatAttributePairs(policy.recommended_defaults) : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-[#31323E]/70">
                                                {policy ? formatAllowedAttributes(policy.allowed_attributes) : "-"}
                                            </td>
                                            <td className="px-3 py-2 text-[#31323E]/70">
                                                {policy ? (
                                                    <div className="space-y-1">
                                                        <div>
                                                            visible: {policy.shipping.visible_methods.join(", ") || "-"}
                                                        </div>
                                                        <div>
                                                            default: {policy.shipping.default_method || "-"}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    "-"
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                {policy?.kept_route_count ?? 0}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <span className={policy && policy.removed_route_count > 0 ? "text-amber-700 font-semibold" : ""}>
                                                    {policy?.removed_route_count ?? 0}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {selectedCountryPreview && (
                        <div className="space-y-4">
                            <div className="border border-[#31323E]/10 bg-white px-4 py-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                    Selected country detail
                                </div>
                                <div className="text-lg font-bold mt-2">
                                    {selectedCountryPreview.country_name} ({selectedCountryPreview.country_code}) / {selectedRatio}
                                </div>
                                <div className="text-sm text-[#31323E]/60 mt-1">
                                    Column headers are global shortlist slots. Inside each green cell we show the exact supplier size that this country can actually ship for that slot.
                                </div>
                                {selectedPaperMaterialMeta && (
                                    <div className="text-sm text-[#31323E]/60 mt-1">
                                        Paper filter: {selectedPaperMaterialMeta.label}. {selectedPaperMaterialMeta.description}
                                    </div>
                                )}
                                <div className="text-sm text-[#31323E]/60 mt-1">
                                    Canvas policy: metallic canvas is excluded, 19mm stretched is hidden, and classic frame is tracked separately from stretched canvas.
                                </div>
                                <div className="text-sm text-[#31323E]/60 mt-1">
                                    Fulfillment policy: operational storefront status stays separate from geography. A route can still be geographically European while having elevated customs risk, like GB to EU destinations.
                                </div>
                            </div>

                            {previewData?.selected_country_storefront_preview && (
                                <div className="border border-[#31323E]/10 bg-white">
                                    <div className="px-4 py-3 border-b border-[#31323E]/8">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                            Final storefront preview
                                        </div>
                                        <div className="text-sm text-[#31323E]/60 mt-2">
                                            This is the exact category set the production card layer would consume for{" "}
                                            {previewData.selected_country_storefront_preview.country_name} in{" "}
                                            {previewData.selected_country_storefront_preview.ratio}, using the current storefront mode.
                                        </div>
                                    </div>
                                    <div className="overflow-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead className="bg-[#F7F7F5]">
                                                <tr>
                                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">
                                                        Card
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">
                                                        Badges
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">
                                                        Defaults
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">
                                                        Sizes
                                                    </th>
                                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">
                                                        Price range
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {previewData.selected_country_storefront_preview.visible_cards.map((card) => (
                                                    <tr
                                                        key={`storefront-${card.category_id}`}
                                                        className="bg-white border-t border-[#31323E]/6 align-top"
                                                    >
                                                        <td className="px-3 py-2">
                                                            <div className="font-semibold">{card.label}</div>
                                                            <div className="text-xs text-[#31323E]/55 mt-1">
                                                                {card.material_label} / {card.frame_label}
                                                            </div>
                                                            <div className="text-xs text-[#31323E]/55 mt-1">
                                                                src: {card.source_countries.join(", ") || "-"} / eta:{" "}
                                                                {card.fastest_delivery_days || "-"}
                                                            </div>
                                                            <div className="text-xs text-[#31323E]/55 mt-1">
                                                                ship: {formatShippingTierList(card.available_shipping_tiers)}
                                                                {card.default_shipping_tier ? ` / default ${shippingTierLabel(card.default_shipping_tier)}` : ""}
                                                            </div>
                                                            <div className="text-xs text-[#31323E]/55 mt-1">
                                                                free ship: {card.shipping_support.dominant_tier ? shippingTierLabel(card.shipping_support.dominant_tier) : "-"}
                                                                {card.shipping_support.min_supported_shipping_price !== null && card.shipping_support.min_supported_shipping_price !== undefined
                                                                    ? ` / ${card.price_range.currency || ""} ${card.shipping_support.min_supported_shipping_price?.toFixed(2)}${card.shipping_support.max_supported_shipping_price !== null && card.shipping_support.max_supported_shipping_price !== undefined && card.shipping_support.max_supported_shipping_price !== card.shipping_support.min_supported_shipping_price ? `-${card.shipping_support.max_supported_shipping_price?.toFixed(2)}` : ""}`
                                                                    : " / blocked"}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                                                                <span className={`inline-block px-2 py-1 ${fulfillmentLevelClass(card.fulfillment_level)}`}>
                                                                    {fulfillmentLevelLabel(card.fulfillment_level)}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${geographyScopeClass(card.geography_scope)}`}>
                                                                    {geographyScopeLabel(card.geography_scope)}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${taxRiskClass(card.tax_risk)}`}>
                                                                    tax {card.tax_risk}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${storefrontActionClass(card.storefront_action)}`}>
                                                                    {storefrontActionLabel(card.storefront_action)}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${shippingSupportClass(card.shipping_support.status)}`}>
                                                                    free {card.shipping_support.status}
                                                                </span>
                                                            </div>
                                                            <div className="text-xs text-[#31323E]/55 mt-2">{card.note}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-[#31323E]/70 leading-relaxed">
                                                            <div>fixed: {formatAttributePairs(card.storefront_policy.fixed_attributes)}</div>
                                                            <div>
                                                                recommended:{" "}
                                                                {formatAttributePairs(card.storefront_policy.recommended_defaults)}
                                                            </div>
                                                            <div>allowed: {formatAllowedAttributes(card.storefront_policy.allowed_attributes)}</div>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-[#31323E]/70">
                                                            <div className="space-y-1">
                                                                {card.size_options.map((size) => (
                                                                    <div key={`${card.category_id}-${size.slot_size_label}`}>
                                                                        <span className="font-semibold text-[#31323E]">
                                                                            {size.size_label}
                                                                        </span>{" "}
                                                                        <span className="text-[#31323E]/55">
                                                                            ({size.source_country || "-"} / {size.delivery_days || "-"})
                                                                        </span>
                                                                        <div className="text-[11px] text-[#31323E]/55">
                                                                            free: {size.shipping_support.chosen_tier ? shippingTierLabel(size.shipping_support.chosen_tier) : "-"}
                                                                            {size.shipping_support.chosen_shipping_price !== null && size.shipping_support.chosen_shipping_price !== undefined
                                                                                ? ` / ${size.currency || "-"} ${size.shipping_support.chosen_shipping_price.toFixed(2)}`
                                                                                : " / blocked"}
                                                                        </div>
                                                                        {size.shipping_profiles && size.shipping_profiles.length > 0 && (
                                                                            <div className="text-[11px] text-[#31323E]/55">
                                                                                {size.shipping_profiles.map((profile) => (
                                                                                    <span
                                                                                        key={`${size.slot_size_label}-${profile.tier}`}
                                                                                        className="mr-2 inline-block"
                                                                                    >
                                                                                        {shippingTierLabel(profile.tier)}
                                                                                        {size.default_shipping_tier === profile.tier ? "*" : ""}:{" "}
                                                                                        {profile.currency && profile.total_cost !== null
                                                                                            ? `${profile.currency} ${profile.total_cost?.toFixed(2)}`
                                                                                            : "-"}{" "}
                                                                                        / {profile.delivery_days || "-"}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-[#31323E]/70">
                                                            {card.price_range.currency && card.price_range.min_total !== null ? (
                                                                <div>
                                                                    {card.price_range.currency}{" "}
                                                                    {card.price_range.min_total?.toFixed(2)} -{" "}
                                                                    {card.price_range.max_total?.toFixed(2)}
                                                                </div>
                                                            ) : (
                                                                "-"
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {previewData.selected_country_storefront_preview.hidden_cards.map((card) => (
                                                    <tr
                                                        key={`storefront-hidden-${card.category_id}`}
                                                        className="bg-[#FAFAF9] border-t border-[#31323E]/6 align-top"
                                                    >
                                                        <td className="px-3 py-2 font-semibold text-[#31323E]/55">
                                                            {card.label}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                                                                <span className={`inline-block px-2 py-1 ${fulfillmentLevelClass(card.fulfillment_level)}`}>
                                                                    {fulfillmentLevelLabel(card.fulfillment_level)}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${geographyScopeClass(card.geography_scope)}`}>
                                                                    {geographyScopeLabel(card.geography_scope)}
                                                                </span>
                                                                <span className={`inline-block px-2 py-1 ${taxRiskClass(card.tax_risk)}`}>
                                                                    tax {card.tax_risk}
                                                                </span>
                                                                <span className="inline-block px-2 py-1 bg-rose-50 text-rose-700">
                                                                    hidden
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2 text-xs text-[#31323E]/55" colSpan={3}>
                                                            {card.reason}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {selectedCountryPreview.category_rows.map((row) => (
                                <div key={row.category_id} className="border border-[#31323E]/10 bg-white">
                                    <div className="px-4 py-3 border-b border-[#31323E]/8">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="font-semibold">{row.label}</div>
                                                <div className="text-xs text-[#31323E]/55">
                                                    {row.material_label} / {row.frame_label}
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
                                                    <span
                                                        className={`inline-block px-2 py-1 ${fulfillmentLevelClass(row.fulfillment_policy.fulfillment_level)}`}
                                                        title={row.fulfillment_policy.note}
                                                    >
                                                        {fulfillmentLevelLabel(row.fulfillment_policy.fulfillment_level)}
                                                    </span>
                                                    <span
                                                        className={`inline-block px-2 py-1 ${geographyScopeClass(row.fulfillment_policy.geography_scope)}`}
                                                        title={row.fulfillment_policy.note}
                                                    >
                                                        {geographyScopeLabel(row.fulfillment_policy.geography_scope)}
                                                    </span>
                                                    <span
                                                        className={`inline-block px-2 py-1 ${taxRiskClass(row.fulfillment_policy.tax_risk)}`}
                                                        title={row.fulfillment_policy.note}
                                                    >
                                                        tax {row.fulfillment_policy.tax_risk}
                                                    </span>
                                                    <span
                                                        className={`inline-block px-2 py-1 ${storefrontActionClass(row.fulfillment_policy.storefront_action)}`}
                                                        title={row.fulfillment_policy.note}
                                                    >
                                                        {storefrontActionLabel(row.fulfillment_policy.storefront_action)}
                                                    </span>
                                                    <span className="inline-block px-2 py-1 bg-[#F7F7F5] text-[#31323E]/70">
                                                        src: {row.fulfillment_policy.source_countries.join(", ") || "-"}
                                                    </span>
                                                    <span className="inline-block px-2 py-1 bg-[#F7F7F5] text-[#31323E]/70">
                                                        eta: {row.fulfillment_policy.fastest_delivery_days || "-"}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium">
                                                {row.available_size_count}/{row.baseline_sizes.length} sizes available
                                            </div>
                                        </div>
                                    </div>
                                    <div className="overflow-auto">
                                        <table className="border-collapse">
                                            <thead>
                                                <tr className="bg-[#F7F7F5]">
                                                    {row.baseline_sizes.map((size) => (
                                                        <th
                                                            key={size}
                                                            className="min-w-[120px] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] border-r border-[#31323E]/8"
                                                        >
                                                            {size}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    {row.size_cells.map((cell) => (
                                                        <td
                                                            key={`${row.category_id}-${cell.slot_size_label}`}
                                                            className={`align-top px-2 py-2 border-r border-t border-[#31323E]/8 text-xs ${
                                                                cell.available ? "bg-emerald-50" : "bg-[#F3F3F1] text-[#31323E]/35"
                                                            }`}
                                                            title={
                                                                cell.offer
                                                                    ? `${cell.slot_size_label} slot -> ${cell.size_label} exact | ${cell.offer.source_country || "-"} | ${cell.offer.currency} ${cell.offer.total_cost.toFixed(2)} | ${cell.offer.delivery_days || "delivery n/a"} | ship ${cell.offer.default_shipping_tier || "-"} | cluster: ${cell.member_size_labels.join(", ")}`
                                                                    : "Unavailable for this country"
                                                            }
                                                        >
                                                            <div className="font-semibold text-[#31323E]">
                                                                {cell.available ? cell.size_label : "-"}
                                                            </div>
                                                            {cell.available && cell.offer ? (
                                                                <div className="mt-1 space-y-0.5 text-[#31323E]/75">
                                                                    <div className={cell.is_exact_match ? "" : "text-amber-700"}>
                                                                        {cell.is_exact_match
                                                                            ? "exact match"
                                                                            : `slot ${cell.slot_size_label}`}
                                                                    </div>
                                                                    <div>{cell.offer.source_country || "-"}</div>
                                                                    <div>
                                                                        {cell.offer.currency} {cell.offer.total_cost.toFixed(2)}
                                                                    </div>
                                                                    <div>{cell.offer.delivery_days || "-"}</div>
                                                                    <div>
                                                                        {cell.offer.available_shipping_tiers?.map((tier) => shippingTierLabel(tier)).join(" | ") || "-"}
                                                                        {cell.offer.default_shipping_tier ? ` / ${shippingTierLabel(cell.offer.default_shipping_tier)}*` : ""}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1 text-[#31323E]/35">-</div>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="overflow-auto border border-[#31323E]/10">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[#F7F7F5]">
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Country</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Coverage</th>
                                    {(previewData?.categories ?? []).map((item) => (
                                        <th
                                            key={item.id}
                                            className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]"
                                        >
                                            {item.short_label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(selectedRatioPreview?.country_rows ?? []).map((row) => (
                                    <tr key={row.country_code} className="border-t border-[#31323E]/6 bg-white">
                                        <td className="px-3 py-2">
                                            <button
                                                onClick={() =>
                                                    void loadPreview(
                                                        selectedRatio,
                                                        row.country_code,
                                                        selectedPaperMaterial,
                                                        includeNoticeLevel,
                                                    )
                                                }
                                                className="font-semibold underline underline-offset-2"
                                            >
                                                {row.country_name}
                                            </button>
                                            <div className="text-xs text-[#31323E]/45">{row.country_code}</div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${countryStatusClass(row.completion_status)}`}>
                                                {row.completion_status}
                                            </span>
                                            <div className="text-xs text-[#31323E]/45 mt-1">
                                                {row.available_category_count}/{totalCategoryCount} categories
                                            </div>
                                            <div className="text-xs text-[#31323E]/45">
                                                primary {row.primary_category_count} / notice {row.notice_category_count}
                                            </div>
                                        </td>
                                        {previewData?.categories.map((category) => {
                                            const cell = row.cells.find((item) => item.category_id === category.id);
                                            return (
                                                <td
                                                    key={`${row.country_code}-${category.id}`}
                                                    className="px-3 py-2 text-right"
                                                    title={cell?.fulfillment.note}
                                                >
                                                    <div className="font-semibold">{cell?.size_count ?? 0}</div>
                                                    {cell && (
                                                        <div className="mt-1 space-y-1">
                                                            <div
                                                                className={`inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${geographyScopeClass(cell.fulfillment.geography_scope)}`}
                                                            >
                                                                {geographyScopeLabel(cell.fulfillment.geography_scope)}
                                                            </div>
                                                            <div
                                                                className={`inline-block px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${taxRiskClass(cell.fulfillment.tax_risk)}`}
                                                            >
                                                                {cell.fulfillment.tax_risk}
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {mode === "probe" && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Country
                            </label>
                            <input
                                className={inputCls}
                                value={probeCountry}
                                onChange={(event) => setProbeCountry(event.target.value.toUpperCase())}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Ratio
                            </label>
                            <input
                                className={inputCls}
                                value={probeRatio}
                                onChange={(event) => setProbeRatio(event.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Family
                            </label>
                            <select className={inputCls} value={family} onChange={(event) => setFamily(event.target.value)}>
                                <option value="HPR_ROLLED">HPR Rolled</option>
                                <option value="HPR_BOX_FRAME">HPR Box Frame</option>
                                <option value="CANVAS_ROLLED">Rolled Canvas</option>
                                <option value="CANVAS_STRETCHED">Stretched Canvas</option>
                                <option value="CANVAS_FLOATING">Floating Framed Canvas</option>
                            </select>
                        </div>
                        <button
                            onClick={handleProbe}
                            disabled={probeLoading}
                            className="h-[42px] self-end bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-[0.18em] rounded-md disabled:opacity-50"
                        >
                            {probeLoading ? "Probing" : "Probe Prodigi"}
                        </button>
                    </div>

                    {probeError && (
                        <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                            {probeError}
                        </div>
                    )}

                    <div className="overflow-auto border border-[#31323E]/10">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-[#F7F7F5]">
                                <tr>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">SKU</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Description</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Attributes</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Tiers</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((item) => (
                                    <tr key={`${item.sku}-${JSON.stringify(item.applied_attributes)}`} className="border-t border-[#31323E]/6 bg-white">
                                        <td className="px-3 py-2 align-top font-semibold">{item.sku}</td>
                                        <td className="px-3 py-2 align-top">
                                            <div>{item.description}</div>
                                            <div className="text-xs text-[#31323E]/45 mt-1">
                                                {item.width_in}x{item.height_in}&quot; / {item.aspect_ratio}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-top text-xs text-[#31323E]/75">
                                            {Object.entries(item.applied_attributes).map(([key, value]) => (
                                                <div key={key}>
                                                    {key}: {value}
                                                </div>
                                            ))}
                                        </td>
                                        <td className="px-3 py-2 align-top text-xs">
                                            {item.shipping_tiers.map((tier, index) => (
                                                <div key={`${tier.method}-${index}`} className="mb-2">
                                                    <div className="font-semibold">{tier.method}</div>
                                                    <div>
                                                        product {tier.wholesale_cost_eur.toFixed(2)} / shipping {tier.shipping_cost_eur.toFixed(2)}
                                                    </div>
                                                    <div>{tier.delivery_estimate}</div>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => setRawJson(item.raw_quote)}
                                                className="mt-2 underline underline-offset-2"
                                            >
                                                Quote JSON
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {Boolean(rawJson) && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#31323E]/90">
                    <div className="bg-white w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between border-b border-[#31323E]/10 px-5 py-3">
                            <div className="font-semibold">Raw Prodigi JSON</div>
                            <button onClick={() => setRawJson(null)} className="text-sm underline underline-offset-2">
                                Close
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-[#121212] p-5">
                            <pre className="text-[11px] leading-relaxed text-emerald-400 whitespace-pre-wrap">
                                {JSON.stringify(rawJson, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
