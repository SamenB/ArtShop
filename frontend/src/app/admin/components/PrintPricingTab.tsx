"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, RefreshCcw, Save, X } from "lucide-react";

import { countries } from "@/countries";
import { apiFetch, apiJson, getApiUrl } from "@/utils";

interface PricingRegion {
    id: number;
    slug: string;
    label: string;
    country_codes: string[];
    default_multiplier: number;
    sort_order: number;
    is_fallback: boolean;
    category_multipliers: Record<string, number>;
    override_count: number;
}

interface RegionsPayload {
    regions: PricingRegion[];
    category_ids: string[];
}

type CountryAssignmentDraft = {
    countryCode: string;
    currentRegionSlug: string;
    targetRegionSlug: string;
};

const CATEGORY_LABELS: Record<string, string> = {
    paperPrintRolled: "Paper Rolled",
    paperPrintBoxFramed: "Paper Box Framed",
    paperPrintClassicFramed: "Paper Classic Framed",
    canvasRolled: "Canvas Rolled",
    canvasStretched: "Canvas Stretched",
    canvasClassicFrame: "Canvas Classic Frame",
    canvasFloatingFrame: "Canvas Floating Frame",
};

const CATEGORY_GROUP: Record<string, "paper" | "canvas"> = {
    paperPrintRolled: "paper",
    paperPrintBoxFramed: "paper",
    paperPrintClassicFramed: "paper",
    canvasRolled: "canvas",
    canvasStretched: "canvas",
    canvasClassicFrame: "canvas",
    canvasFloatingFrame: "canvas",
};

const REGION_META: Record<string, { tone: string; note: string }> = {
    premium: {
        tone: "border-emerald-200 bg-emerald-50/55 text-emerald-900",
        note: "High-income core and focus markets.",
    },
    mid: {
        tone: "border-blue-200 bg-blue-50/60 text-blue-950",
        note: "Expansion markets. Ukraine is intentionally listed first.",
    },
    budget: {
        tone: "border-stone-200 bg-stone-50 text-stone-800",
        note: "Fallback for every country not assigned above.",
    },
};

const COUNTRY_NAME_BY_CODE = new Map(countries.map((country) => [country.code, country.name]));

function formatMultiplier(value: number): string {
    return `x${value.toFixed(1)}`;
}

function formatCountry(code: string): string {
    const name = COUNTRY_NAME_BY_CODE.get(code);
    return name ? `${name} (${code})` : code;
}

function MultiplierInput({
    value,
    muted,
    disabled,
    onChange,
}: {
    value: number;
    muted?: boolean;
    disabled?: boolean;
    onChange: (value: number) => void;
}) {
    const [draft, setDraft] = useState(value.toFixed(1));

    useEffect(() => {
        setDraft(value.toFixed(1));
    }, [value]);

    const commit = () => {
        const parsed = Number.parseFloat(draft);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
            setDraft(value.toFixed(1));
            return;
        }
        onChange(Number(parsed.toFixed(2)));
    };

    return (
        <input
            type="number"
            min="1"
            max="10"
            step="0.1"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") {
                    event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                    setDraft(value.toFixed(1));
                    event.currentTarget.blur();
                }
            }}
            className={`h-8 w-16 rounded-md border px-2 text-center font-mono text-xs font-bold outline-none transition focus:ring-2 focus:ring-[#31323E]/18 disabled:cursor-wait disabled:opacity-50 ${
                muted
                    ? "border-[#31323E]/10 bg-[#31323E]/4 text-[#31323E]/55"
                    : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
            aria-label={`Multiplier ${formatMultiplier(value)}`}
        />
    );
}

export default function PrintPricingTab() {
    const [data, setData] = useState<RegionsPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingRegionId, setSavingRegionId] = useState<number | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [savedRegionId, setSavedRegionId] = useState<number | null>(null);
    const [countryDraft, setCountryDraft] = useState<CountryAssignmentDraft | null>(null);
    const [savingCountry, setSavingCountry] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const api = getApiUrl();

    const loadRegions = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await apiFetch(`${api}/print-pricing/regions`);
            setData(await apiJson(response));
        } catch {
            setError("Network error while loading print pricing regions.");
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        loadRegions();
    }, [loadRegions]);

    const syncDefaults = async () => {
        setSyncing(true);
        setError(null);
        try {
            const response = await apiFetch(`${api}/print-pricing/regions/seed`, {
                method: "POST",
            });
            if (!response.ok) {
                setError("Could not sync the managed pricing regions.");
                return;
            }
            await loadRegions();
        } catch {
            setError("Network error while syncing pricing regions.");
        } finally {
            setSyncing(false);
        }
    };

    const updateRegion = async (
        region: PricingRegion,
        payload: { default_multiplier?: number; category_multipliers?: Record<string, number> }
    ) => {
        setSavingRegionId(region.id);
        setError(null);
        try {
            const response = await apiFetch(
                `${api}/print-pricing/regions/${region.id}/multipliers`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            if (!response.ok) {
                const body = await apiJson<{ detail?: string }>(response).catch(
                    (): { detail?: string } => ({})
                );
                setError(body.detail || "Could not update multiplier.");
                return;
            }
            const updated = await apiJson<PricingRegion>(response);
            setData((previous) => {
                if (!previous) {
                    return previous;
                }
                return {
                    ...previous,
                    regions: previous.regions.map((item) =>
                        item.id === updated.id ? updated : item
                    ),
                };
            });
            setSavedRegionId(region.id);
            window.setTimeout(() => setSavedRegionId(null), 1200);
        } catch {
            setError("Network error while updating multiplier.");
        } finally {
            setSavingRegionId(null);
        }
    };

    const moveCountry = async () => {
        if (!countryDraft) {
            return;
        }
        setSavingCountry(true);
        setError(null);
        try {
            const response = await apiFetch(`${api}/print-pricing/regions/country-assignment`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    country_code: countryDraft.countryCode,
                    target_region_slug: countryDraft.targetRegionSlug,
                }),
            });
            if (!response.ok) {
                const body = await apiJson<{ detail?: string }>(response).catch(
                    (): { detail?: string } => ({})
                );
                setError(body.detail || "Could not move country.");
                return;
            }
            setData(await apiJson(response));
            setCountryDraft(null);
        } catch {
            setError("Network error while moving country.");
        } finally {
            setSavingCountry(false);
        }
    };

    const groupedCategories = useMemo(() => {
        const categoryIds = data?.category_ids ?? [];
        return {
            paper: categoryIds.filter((id) => CATEGORY_GROUP[id] === "paper"),
            canvas: categoryIds.filter((id) => CATEGORY_GROUP[id] === "canvas"),
        };
    }, [data]);

    const assignedCountryCodes = useMemo(() => {
        const explicitCodes = new Set<string>();
        for (const region of data?.regions ?? []) {
            if (region.is_fallback) {
                continue;
            }
            for (const code of region.country_codes) {
                explicitCodes.add(code);
            }
        }
        return explicitCodes;
    }, [data]);

    const fallbackCountryCodes = useMemo(() => {
        return countries
            .map((country) => country.code)
            .filter((code) => !assignedCountryCodes.has(code));
    }, [assignedCountryCodes]);

    if (loading) {
        return (
            <div className="flex items-center gap-3 py-10">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#31323E]/20 border-t-[#31323E]" />
                <span className="text-sm font-bold uppercase tracking-[0.18em] text-[#31323E]/45">
                    Loading pricing
                </span>
            </div>
        );
    }

    if (!data || data.regions.length === 0) {
        return (
            <div className="max-w-3xl space-y-5">
                <header className="border-b border-[#31323E]/8 pb-5">
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E]">
                        Print Pricing
                    </h2>
                    <p className="mt-1 text-sm font-medium text-[#31323E]/50">
                        Create the managed Premium, Mid, and Budget regions.
                    </p>
                </header>
                {error && <StatusMessage text={error} />}
                <button
                    type="button"
                    onClick={syncDefaults}
                    disabled={syncing}
                    className="inline-flex items-center gap-2 rounded-md bg-[#31323E] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#444552] disabled:opacity-50"
                >
                    <RefreshCcw size={14} />
                    {syncing ? "Creating" : "Create Regions"}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-7 pb-8">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#31323E]/8 pb-5">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E]">
                        Print Pricing
                    </h2>
                    <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-[#31323E]/50">
                        Global print prices use regional markups. Original artwork prices stay
                        per-artwork.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={syncDefaults}
                    disabled={syncing}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-[#31323E]/12 bg-white px-3 text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/65 transition hover:bg-[#31323E]/4 disabled:opacity-50"
                    title="Sync Premium, Mid, and Budget region definitions"
                >
                    <RefreshCcw size={14} />
                    Sync Regions
                </button>
            </header>

            {error && <StatusMessage text={error} />}

            <section className="grid gap-4 xl:grid-cols-3">
                {data.regions.map((region) => {
                    const meta = REGION_META[region.slug] ?? REGION_META.budget;
                    const isSaving = savingRegionId === region.id;
                    const isSaved = savedRegionId === region.id;
                    return (
                        <article
                            key={region.id}
                            className={`rounded-lg border p-4 ${meta.tone}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-bold tracking-tight">
                                        {region.label}
                                    </h3>
                                    <p className="mt-1 text-xs font-semibold opacity-65">
                                        {meta.note}
                                    </p>
                                </div>
                                {isSaved && (
                                    <span className="inline-flex h-7 items-center gap-1 rounded-md bg-white/70 px-2 text-[10px] font-bold uppercase tracking-[0.12em]">
                                        <Check size={13} />
                                        Saved
                                    </span>
                                )}
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-[0.14em] opacity-55">
                                    Default
                                </span>
                                <MultiplierInput
                                    value={region.default_multiplier}
                                    disabled={isSaving}
                                    muted
                                    onChange={(value) =>
                                        updateRegion(region, { default_multiplier: value })
                                    }
                                />
                            </div>

                            <CountryList
                                region={region}
                                fallbackCountryCodes={fallbackCountryCodes}
                                onSelect={(countryCode) =>
                                    setCountryDraft({
                                        countryCode,
                                        currentRegionSlug: region.slug,
                                        targetRegionSlug: region.slug,
                                    })
                                }
                            />
                        </article>
                    );
                })}
            </section>

            {countryDraft && (
                <CountryMovePanel
                    draft={countryDraft}
                    regions={data.regions}
                    saving={savingCountry}
                    onTargetChange={(targetRegionSlug) =>
                        setCountryDraft((previous) =>
                            previous ? { ...previous, targetRegionSlug } : previous
                        )
                    }
                    onCancel={() => setCountryDraft(null)}
                    onSave={moveCountry}
                />
            )}

            <MultiplierTable
                title="Paper Categories"
                categoryIds={groupedCategories.paper}
                regions={data.regions}
                savingRegionId={savingRegionId}
                onChange={(region, categoryId, value) =>
                    updateRegion(region, { category_multipliers: { [categoryId]: value } })
                }
            />

            <MultiplierTable
                title="Canvas Categories"
                categoryIds={groupedCategories.canvas}
                regions={data.regions}
                savingRegionId={savingRegionId}
                onChange={(region, categoryId, value) =>
                    updateRegion(region, { category_multipliers: { [categoryId]: value } })
                }
            />
        </div>
    );
}

function CountryList({
    region,
    fallbackCountryCodes,
    onSelect,
}: {
    region: PricingRegion;
    fallbackCountryCodes: string[];
    onSelect: (countryCode: string) => void;
}) {
    const countryCodes = region.is_fallback ? fallbackCountryCodes : region.country_codes;

    return (
        <div className="mt-4 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {countryCodes.map((code) => {
                const isUkraine = code === "UA";
                return (
                    <button
                        type="button"
                        key={code}
                        title={formatCountry(code)}
                        onClick={() => onSelect(code)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
                            isUkraine
                                ? "border-yellow-300 bg-yellow-100 text-yellow-950"
                                : "border-current/10 bg-white/55 hover:bg-white/85"
                        } transition`}
                    >
                        {isUkraine ? "Ukraine (UA)" : code}
                    </button>
                );
            })}
        </div>
    );
}

function CountryMovePanel({
    draft,
    regions,
    saving,
    onTargetChange,
    onCancel,
    onSave,
}: {
    draft: CountryAssignmentDraft;
    regions: PricingRegion[];
    saving: boolean;
    onTargetChange: (targetRegionSlug: string) => void;
    onCancel: () => void;
    onSave: () => void;
}) {
    const changed = draft.currentRegionSlug !== draft.targetRegionSlug;

    return (
        <section className="rounded-lg border border-[#31323E]/10 bg-[#FAFAF8] p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#31323E]/40">
                        Country Assignment
                    </p>
                    <h3 className="mt-1 text-base font-bold text-[#31323E]">
                        {formatCountry(draft.countryCode)}
                    </h3>
                </div>
                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#31323E]/10 bg-white text-[#31323E]/45 transition hover:text-[#31323E]"
                    title="Close"
                >
                    <X size={15} />
                </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
                {regions.map((region) => (
                    <button
                        key={region.slug}
                        type="button"
                        onClick={() => onTargetChange(region.slug)}
                        className={`rounded-md border px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${
                            draft.targetRegionSlug === region.slug
                                ? "border-[#31323E] bg-[#31323E] text-white"
                                : "border-[#31323E]/12 bg-white text-[#31323E]/55 hover:text-[#31323E]"
                        }`}
                    >
                        {region.label}
                    </button>
                ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!changed || saving}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-[#31323E] px-4 text-xs font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#444552] disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <Save size={14} />
                    {saving ? "Saving" : "Save"}
                </button>
                <span className="text-xs font-semibold text-[#31323E]/42">
                    Moving to Budget removes the country from explicit regional lists.
                </span>
            </div>
        </section>
    );
}

function MultiplierTable({
    title,
    categoryIds,
    regions,
    savingRegionId,
    onChange,
}: {
    title: string;
    categoryIds: string[];
    regions: PricingRegion[];
    savingRegionId: number | null;
    onChange: (region: PricingRegion, categoryId: string, value: number) => void;
}) {
    if (categoryIds.length === 0) {
        return null;
    }

    return (
        <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                {title}
            </h3>
            <div className="overflow-x-auto rounded-lg border border-[#31323E]/10 bg-white">
                <table className="w-full min-w-[760px] text-sm">
                    <thead>
                        <tr className="bg-[#31323E]/4">
                            <th className="border-b border-[#31323E]/8 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                Category
                            </th>
                            {regions.map((region) => (
                                <th
                                    key={region.id}
                                    className="border-b border-[#31323E]/8 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45"
                                >
                                    {region.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {categoryIds.map((categoryId) => (
                            <tr
                                key={categoryId}
                                className="border-b border-[#31323E]/5 last:border-b-0"
                            >
                                <td className="px-4 py-3 text-xs font-bold text-[#31323E]/70">
                                    {CATEGORY_LABELS[categoryId] ?? categoryId}
                                </td>
                                {regions.map((region) => {
                                    const value =
                                        region.category_multipliers[categoryId] ??
                                        region.default_multiplier;
                                    const isOverride =
                                        Math.abs(value - region.default_multiplier) > 0.001;
                                    return (
                                        <td key={region.id} className="px-4 py-3 text-center">
                                            <MultiplierInput
                                                value={value}
                                                disabled={savingRegionId === region.id}
                                                muted={!isOverride}
                                                onChange={(nextValue) =>
                                                    onChange(region, categoryId, nextValue)
                                                }
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function StatusMessage({ text }: { text: string }) {
    return (
        <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            <AlertCircle size={15} />
            {text}
        </div>
    );
}
