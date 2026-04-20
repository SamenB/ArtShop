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
}

interface PreviewCountryRow {
    country_code: string;
    country_name: string;
    available_category_count: number;
    completion_status: "full" | "partial" | "missing";
    completion_percent: number;
    total_size_count: number;
    cells: PreviewCountryCell[];
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
    size_labels: string[];
}

interface PreviewOffer {
    sku: string;
    source_country?: string | null;
    product_price: number;
    shipping_price: number;
    total_cost: number;
    currency: string;
    delivery_days?: string | null;
}

interface PreviewSizeCell {
    size_label: string;
    available: boolean;
    offer?: PreviewOffer | null;
}

interface PreviewCountryCategoryRow {
    category_id: string;
    label: string;
    short_label: string;
    material_label: string;
    frame_label: string;
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
    ratios: PreviewRatio[];
    paper_materials: PreviewPaperMaterial[];
    categories: PreviewCategory[];
    ratio_cards: PreviewRatioCard[];
    selected_ratio_preview: SelectedRatioPreview;
    selected_country_preview: SelectedCountryPreview;
    country_count: number;
    generated_from_curated_routes: number;
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
    const [bakeLoading, setBakeLoading] = useState(false);
    const [bakeMessage, setBakeMessage] = useState<string | null>(null);

    const loadPreview = async (ratio: string, country: string, paperMaterial: string) => {
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const res = await apiFetch(
                `${getApiUrl()}/v1/admin/prodigi/catalog-preview?aspect_ratio=${encodeURIComponent(ratio)}&country=${encodeURIComponent(country)}&paper_material=${encodeURIComponent(paperMaterial)}`,
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
        void loadPreview("4:5", "DE", "hahnemuhle_german_etching");
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
            ["Categories ready", `${selectedRatioPreview.available_category_count}/${totalCategoryCount}`],
            ["Full countries", String(selectedRatioPreview.full_country_count)],
            ["Partial countries", String(selectedRatioPreview.partial_country_count)],
            ["Routes checked", previewData.generated_from_curated_routes.toLocaleString()],
        ];
    }, [previewData, selectedPaperMaterial, selectedPaperMaterialMeta, selectedRatioPreview, totalCategoryCount]);

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
                `${getApiUrl()}/v1/admin/prodigi/catalog-preview/create-database?aspect_ratio=${encodeURIComponent(selectedRatio)}&country=${encodeURIComponent(selectedCountry)}&paper_material=${encodeURIComponent(selectedPaperMaterial)}`,
                { method: "POST" },
            );
            if (!res.ok) {
                throw new Error(await res.text());
            }
            const data = await res.json();
            setBakeMessage(data.message ?? "Preview checkpoint accepted.");
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
                    <h2 className="text-2xl font-bold">Prodigi Hub</h2>
                    <p className="text-sm text-[#31323E]/55 mt-1">
                        Dense admin preview of the future baked catalog by ratio, country, category, and size.
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
                    <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1.3fr_auto_auto_auto] gap-3 items-end">
                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                Aspect ratio
                            </label>
                            <select
                                className={inputCls}
                                value={selectedRatio}
                                onChange={(event) =>
                                    void loadPreview(event.target.value, selectedCountry, selectedPaperMaterial)
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
                                    void loadPreview(selectedRatio, event.target.value, selectedPaperMaterial)
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
                                    void loadPreview(selectedRatio, selectedCountry, event.target.value)
                                }
                            >
                                {(previewData?.paper_materials ?? []).map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={() => void loadPreview(selectedRatio, selectedCountry, selectedPaperMaterial)}
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
                                                    void loadPreview(card.ratio, selectedCountry, selectedPaperMaterial)
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

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Sizes</th>
                                    <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-[0.18em]">Countries</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Source countries</th>
                                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.18em]">Baseline sizes</th>
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
                                        <td className="px-3 py-2 text-[#31323E]/70">
                                            {item.size_labels.join(", ") || "No matching sizes"}
                                        </td>
                                    </tr>
                                ))}
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
                                    Baseline size range is global for the selected ratio and category. Green cells are available in this country. Gray cells are missing for the current filters.
                                </div>
                                {selectedPaperMaterialMeta && (
                                    <div className="text-sm text-[#31323E]/60 mt-1">
                                        Paper filter: {selectedPaperMaterialMeta.label}. {selectedPaperMaterialMeta.description}
                                    </div>
                                )}
                                <div className="text-sm text-[#31323E]/60 mt-1">
                                    Canvas policy: metallic canvas is excluded, 19mm stretched is hidden, and classic frame is tracked separately from stretched canvas.
                                </div>
                            </div>

                            {selectedCountryPreview.category_rows.map((row) => (
                                <div key={row.category_id} className="border border-[#31323E]/10 bg-white">
                                    <div className="px-4 py-3 border-b border-[#31323E]/8">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="font-semibold">{row.label}</div>
                                                <div className="text-xs text-[#31323E]/55">
                                                    {row.material_label} / {row.frame_label}
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
                                                            className="min-w-[110px] px-2 py-2 text-[10px] font-bold uppercase tracking-[0.14em] border-r border-[#31323E]/8"
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
                                                            key={`${row.category_id}-${cell.size_label}`}
                                                            className={`align-top px-2 py-2 border-r border-t border-[#31323E]/8 text-xs ${
                                                                cell.available ? "bg-emerald-50" : "bg-[#F3F3F1] text-[#31323E]/35"
                                                            }`}
                                                            title={
                                                                cell.offer
                                                                    ? `${cell.offer.source_country || "-"} | ${cell.offer.currency} ${cell.offer.total_cost.toFixed(2)} | ${cell.offer.delivery_days || "delivery n/a"}`
                                                                    : "Unavailable for this country"
                                                            }
                                                        >
                                                            <div className="font-semibold">{cell.size_label}</div>
                                                            {cell.available && cell.offer ? (
                                                                <div className="mt-1 space-y-0.5 text-[#31323E]/75">
                                                                    <div>{cell.offer.source_country || "-"}</div>
                                                                    <div>
                                                                        {cell.offer.currency} {cell.offer.total_cost.toFixed(2)}
                                                                    </div>
                                                                    <div>{cell.offer.delivery_days || "-"}</div>
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1">-</div>
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
                                                    void loadPreview(selectedRatio, row.country_code, selectedPaperMaterial)
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
                                        </td>
                                        {previewData?.categories.map((category) => {
                                            const cell = row.cells.find((item) => item.category_id === category.id);
                                            return (
                                                <td key={`${row.country_code}-${category.id}`} className="px-3 py-2 text-right">
                                                    {cell?.size_count ?? 0}
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
