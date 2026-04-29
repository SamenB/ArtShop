"use client";

import { useEffect, useMemo, useState } from "react";

import { apiFetch, apiJson, getApiUrl } from "@/utils";

const inputCls =
    "w-full border border-[#31323E]/15 rounded-md px-3 py-2 text-sm text-[#31323E] font-medium bg-white focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10";

interface SnapshotBake {
    id: number;
    bake_key: string;
    paper_material: string;
    include_notice_level: boolean;
    status: string;
    ratio_count: number;
    country_count: number;
    offer_group_count: number;
    offer_size_count: number;
    created_at?: string | null;
}

interface SnapshotRatio {
    ratio_label: string;
    ratio_title?: string | null;
    group_count: number;
    country_count: number;
}

interface SnapshotCategory {
    category_id: string;
    label: string;
    material_label?: string | null;
    frame_label?: string | null;
    baseline_size_labels: string[];
    fixed_attributes: Record<string, string>;
    recommended_defaults: Record<string, string>;
    allowed_attributes: Record<string, string[]>;
}

interface SnapshotSizeEntry {
    slot_size_label: string;
    size_label: string;
    available: boolean;
    source_country?: string | null;
    currency?: string | null;
    total_cost?: number | null;
    delivery_days?: string | null;
    default_shipping_tier?: string | null;
    shipping_method?: string | null;
    service_name?: string | null;
    service_level?: string | null;
    shipping_profiles: Array<{
        tier: string;
        shipping_method?: string | null;
        service_name?: string | null;
        service_level?: string | null;
        source_country?: string | null;
        currency?: string | null;
        shipping_price?: number | null;
        total_cost?: number | null;
        delivery_days?: string | null;
    }>;
    shipping_support: {
        status: "covered" | "blocked" | "unavailable";
        chosen_tier?: string | null;
        chosen_shipping_method?: string | null;
        chosen_shipping_price?: number | null;
        chosen_product_price?: number | null;
        chosen_currency?: string | null;
        chosen_delivery_days?: string | null;
        eligible_tiers?: string[];
        available_tiers?: string[];
        available_profiles?: Array<{
            tier: string;
            shipping_method?: string | null;
            service_name?: string | null;
            service_level?: string | null;
            source_country?: string | null;
            currency?: string | null;
            product_price?: number | null;
            shipping_price?: number | null;
            total_cost?: number | null;
            delivery_days?: string | null;
        }>;
        cheapest_tier?: string | null;
        cheapest_shipping_price?: number | null;
        note: string;
        reason?: string | null;
    };
    business_policy: {
        shipping_mode: "included" | "pass_through" | "hide";
        policy_family: "print_shipping_at_checkout" | "shipping_at_checkout" | "unknown";
        markup_multiplier?: number | null;
        retail_product_price?: number | null;
        customer_shipping_price?: number | null;
        shipping_price_for_margin?: number | null;
        shipping_reference_price?: number | null;
        shipping_credit_applied?: number | null;
        reason: string;
    };
}

interface SnapshotCell {
    category_id: string;
    available: boolean;
    storefront_action: "show" | "show_with_notice" | "hide";
    fulfillment_level: "local" | "regional" | "cross_border" | "unsupported";
    geography_scope: "domestic" | "europe" | "international" | "none";
    tax_risk: "low" | "elevated" | "none";
    effective_fulfillment_level: "local" | "regional" | "cross_border" | "mixed" | "unsupported";
    effective_geography_scope: "domestic" | "europe" | "international" | "mixed" | "none";
    effective_tax_risk: "low" | "elevated" | "none";
    source_mix: "local_only" | "regional_only" | "cross_border_only" | "mixed" | "none";
    source_countries: string[];
    fastest_delivery_days?: string | null;
    available_shipping_tiers?: string[];
    default_shipping_tier?: string | null;
    shipping_support: {
        status: "covered" | "blocked" | "unavailable";
        covered_size_count: number;
        review_size_count: number;
        blocked_size_count: number;
        unavailable_size_count: number;
        dominant_tier?: string | null;
        chosen_tier_counts?: Record<string, number>;
        min_supported_shipping_price?: number | null;
        max_supported_shipping_price?: number | null;
    };
    business_summary: {
        policy_family: "print_shipping_at_checkout" | "shipping_at_checkout";
        default_shipping_mode: "included" | "pass_through" | "hide";
        included_size_count: number;
        pass_through_size_count: number;
        hidden_size_count: number;
        available_size_count: number;
    };
    available_size_count: number;
    price_range: {
        currency?: string | null;
        min_total?: number | null;
        max_total?: number | null;
    };
    fixed_attributes: Record<string, string>;
    recommended_defaults: Record<string, string>;
    allowed_attributes: Record<string, string[]>;
    shipping_metrics: {
        currency?: string | null;
        avg_covered_shipping_price?: number | null;
        median_covered_shipping_price?: number | null;
    };
    size_entries: SnapshotSizeEntry[];
}

interface SnapshotCountry {
    country_code: string;
    country_name: string;
    market_priority: {
        rank: number;
        segment: "core" | "focus" | "expansion" | "long_tail";
        is_priority: boolean;
    };
    shipping_summary: {
        currency?: string | null;
        mixed_currency?: boolean;
        avg_covered_shipping_price?: number | null;
        median_covered_shipping_price?: number | null;
        suggested_badge_cap?: number | null;
        covered_category_count: number;
        category_summaries: Array<{
            category_id: string;
            currency?: string | null;
            avg_covered_shipping_price?: number | null;
            median_covered_shipping_price?: number | null;
            covered_size_count: number;
            blocked_size_count: number;
            available_size_count: number;
            shipping_mode?: "included" | "pass_through" | "hide";
            included_size_count: number;
            pass_through_size_count: number;
            hidden_size_count: number;
        }>;
    };
    entry_promo: {
        overall: {
            eligible: boolean;
            note: string;
            missing_categories: string[];
            blocked_categories: string[];
        };
        paper_print: {
            eligible: boolean;
            note: string;
            missing_categories: string[];
            blocked_categories: string[];
        };
        canvas: {
            eligible: boolean;
            note: string;
            missing_categories: string[];
            blocked_categories: string[];
        };
    };
    category_cells: SnapshotCell[];
}

interface SnapshotResponse {
    has_active_bake: boolean;
    message: string;
    bake?: SnapshotBake;
    ratios: SnapshotRatio[];
    selected_ratio?: string | null;
    shipping_support_policy?: {
        checkout_shipping_cap: number;
        preferred_tier_order: string[];
    };
    business_policy?: {
        entry_badge_category_groups: Record<string, string[]>;
        print_shipping_at_checkout_categories: string[];
        print_delivery_subsidy_budget: number;
        policy_note: string;
    };
    categories: SnapshotCategory[];
    countries: SnapshotCountry[];
    entry_promo_summary?: {
        eligible_country_count: number;
        ineligible_country_count: number;
        eligible_country_codes: string[];
        paper_eligible_country_count: number;
        canvas_eligible_country_count: number;
        paper_eligible_country_codes: string[];
        canvas_eligible_country_codes: string[];
    };
    priority_market_summary?: {
        strategy_note: string;
        focus_countries: Array<{
            country_code: string;
            country_name: string;
            market_rank: number;
            market_segment: "core" | "focus" | "expansion" | "long_tail";
            currency?: string | null;
            mixed_currency?: boolean;
            avg_covered_shipping_price?: number | null;
            median_covered_shipping_price?: number | null;
            suggested_badge_cap?: number | null;
            entry_badge_eligible: boolean;
            entry_badge_note: string;
            paper_entry_badge_eligible: boolean;
            paper_entry_badge_note: string;
            canvas_entry_badge_eligible: boolean;
            canvas_entry_badge_note: string;
            covered_category_count: number;
            category_summaries: Array<{
                category_id: string;
                category_label: string;
                currency?: string | null;
                avg_covered_shipping_price?: number | null;
                median_covered_shipping_price?: number | null;
                covered_size_count: number;
                blocked_size_count: number;
                available_size_count: number;
                shipping_mode?: "included" | "pass_through" | "hide";
                included_size_count: number;
                pass_through_size_count: number;
                hidden_size_count: number;
            }>;
        }>;
    };
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

function badgeClass(kind: "green" | "blue" | "amber" | "red" | "neutral") {
    if (kind === "green") {
        return "bg-emerald-50 text-emerald-700";
    }
    if (kind === "blue") {
        return "bg-sky-50 text-sky-700";
    }
    if (kind === "amber") {
        return "bg-amber-50 text-amber-700";
    }
    if (kind === "red") {
        return "bg-rose-50 text-rose-700";
    }
    return "bg-[#F3F3F1] text-[#31323E]/70";
}

function effectiveFulfillmentBadge(level: SnapshotCell["effective_fulfillment_level"]) {
    if (level === "local") {
        return badgeClass("green");
    }
    if (level === "regional") {
        return badgeClass("blue");
    }
    if (level === "cross_border") {
        return badgeClass("neutral");
    }
    if (level === "mixed") {
        return badgeClass("amber");
    }
    return badgeClass("red");
}

function effectiveGeographyBadge(scope: SnapshotCell["effective_geography_scope"]) {
    if (scope === "domestic") {
        return badgeClass("green");
    }
    if (scope === "europe") {
        return badgeClass("blue");
    }
    if (scope === "international") {
        return badgeClass("neutral");
    }
    if (scope === "mixed") {
        return badgeClass("amber");
    }
    return badgeClass("red");
}

function taxBadge(risk: SnapshotCell["tax_risk"]) {
    if (risk === "low") {
        return badgeClass("green");
    }
    if (risk === "elevated") {
        return badgeClass("amber");
    }
    return badgeClass("red");
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
    const normalized = (tiers ?? []).filter((tier) => tier);
    const visible = normalized.some((tier) => tier !== "other")
        ? normalized.filter((tier) => tier !== "other")
        : normalized;
    return visible.map((tier) => shippingTierLabel(tier)).join(" | ") || "-";
}

function formatMoney(currency?: string | null, amount?: number | null) {
    if (!currency || amount === null || amount === undefined) {
        return "-";
    }
    return `${currency} ${amount.toFixed(2)}`;
}

function pickDisplayShippingProfile(size: SnapshotSizeEntry) {
    if (!size.available) {
        return null;
    }
    const profiles = size.shipping_profiles ?? [];
    if (!profiles.length) {
        return null;
    }
    if (size.shipping_support.chosen_tier) {
        const chosen = profiles.find((profile) => profile.tier === size.shipping_support.chosen_tier);
        if (chosen) {
            return chosen;
        }
    }
    if (size.shipping_support.cheapest_tier) {
        const cheapest = profiles.find((profile) => profile.tier === size.shipping_support.cheapest_tier);
        if (cheapest) {
            return cheapest;
        }
    }
    if (size.default_shipping_tier) {
        const preferred = profiles.find((profile) => profile.tier === size.default_shipping_tier);
        if (preferred) {
            return preferred;
        }
    }
    return profiles[0];
}

function visibleShippingProfiles(size: SnapshotSizeEntry) {
    const profiles = size.shipping_profiles ?? [];
    if (profiles.some((profile) => profile.tier !== "other")) {
        return profiles.filter((profile) => profile.tier !== "other");
    }
    return profiles;
}

function shippingSupportBadge(status: "covered" | "blocked" | "unavailable") {
    if (status === "covered") {
        return badgeClass("green");
    }
    if (status === "unavailable") {
        return badgeClass("neutral");
    }
    return badgeClass("red");
}

function marketSegmentBadge(segment: "core" | "focus" | "expansion" | "long_tail") {
    if (segment === "core") {
        return badgeClass("green");
    }
    if (segment === "focus") {
        return badgeClass("blue");
    }
    if (segment === "expansion") {
        return badgeClass("amber");
    }
    return badgeClass("neutral");
}

function sizeSupportClass(status: "covered" | "blocked" | "unavailable", available: boolean) {
    if (!available) {
        return "border-rose-200 bg-rose-50";
    }
    if (status === "covered") {
        return "border-emerald-200 bg-emerald-50";
    }
    return "border-[#D9D7D0] bg-[#F3F3F1]";
}

function businessModeBadge(mode: "included" | "pass_through" | "hide") {
    if (mode === "included") {
        return badgeClass("green");
    }
    if (mode === "pass_through") {
        return badgeClass("amber");
    }
    return badgeClass("neutral");
}

function businessModeLabel(mode: "included" | "pass_through" | "hide") {
    if (mode === "included") {
        return "included legacy";
    }
    if (mode === "pass_through") {
        return "checkout";
    }
    return "hidden";
}

function formatCountryShippingSummary(
    summary:
        | SnapshotCountry["shipping_summary"]
        | NonNullable<SnapshotResponse["priority_market_summary"]>["focus_countries"][number],
) {
    const base = formatMoney(summary.currency, summary.avg_covered_shipping_price);
    if (base === "-") {
        return summary.mixed_currency ? "Mixed" : "-";
    }
    return summary.mixed_currency ? `${base} (mixed)` : base;
}

function formatCountryBadgeCap(
    summary:
        | SnapshotCountry["shipping_summary"]
        | NonNullable<SnapshotResponse["priority_market_summary"]>["focus_countries"][number],
) {
    const base = formatMoney(summary.currency, summary.suggested_badge_cap);
    if (base === "-") {
        return summary.mixed_currency ? "Mixed" : "-";
    }
    return summary.mixed_currency ? `${base} (mixed)` : base;
}

function sizeCardClass(size: SnapshotSizeEntry) {
    if (!size.available) {
        return "border-rose-200 bg-rose-50";
    }
    if (size.business_policy.shipping_mode === "included") {
        return "border-emerald-200 bg-emerald-50";
    }
    if (size.business_policy.shipping_mode === "pass_through") {
        return "border-amber-200 bg-amber-50";
    }
    return "border-[#D9D7D0] bg-[#F3F3F1]";
}

function customerDeliveryLabel(size: SnapshotSizeEntry) {
    if (!size.available) {
        return "-";
    }
    if (size.business_policy.shipping_mode === "included") {
        return "Included legacy";
    }
    if (size.business_policy.shipping_mode === "pass_through") {
        return formatMoney(size.currency, size.business_policy.customer_shipping_price);
    }
    return "Hidden";
}

function formatTierCounts(counts: Record<string, number> | null | undefined) {
    const entries = Object.entries(counts ?? {});
    if (!entries.length) {
        return "-";
    }
    return entries
        .sort(([leftTier], [rightTier]) => leftTier.localeCompare(rightTier))
        .map(([tier, count]) => `${shippingTierLabel(tier)} ${count}`)
        .join(" / ");
}

export default function ProdigiSnapshotTab() {
    const [data, setData] = useState<SnapshotResponse | null>(null);
    const [selectedRatio, setSelectedRatio] = useState("4:5");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadSnapshot = async (ratio: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiFetch(
                `${getApiUrl()}/v1/admin/prodigi/storefront-snapshot?aspect_ratio=${encodeURIComponent(ratio)}`,
            );
            const nextData = await apiJson<SnapshotResponse>(res);
            setData(nextData);
            if (nextData.selected_ratio) {
                setSelectedRatio(nextData.selected_ratio);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load storefront snapshot.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadSnapshot("4:5");
    }, []);

    const summary = useMemo(() => {
        if (!data?.bake) {
            return [];
        }
        const shippingCounts = (data.countries ?? []).reduce(
            (acc, country) => {
                country.category_cells.forEach((cell) => {
                    acc.covered += cell.shipping_support.covered_size_count;
                    acc.blocked += cell.shipping_support.blocked_size_count;
                    Object.entries(cell.shipping_support.chosen_tier_counts ?? {}).forEach(
                        ([tier, count]) => {
                            acc.tiers[tier] = (acc.tiers[tier] ?? 0) + count;
                        },
                    );
                });
                return acc;
            },
            { covered: 0, blocked: 0, tiers: {} as Record<string, number> },
        );
        return [
            ["Bake key", data.bake.bake_key],
            ["Paper", data.bake.paper_material],
            ["Mode", data.bake.include_notice_level ? "Notice included" : "Primary only"],
            ["Countries", String(data.bake.country_count)],
            ["Groups", data.bake.offer_group_count.toLocaleString()],
            ["Sizes", data.bake.offer_size_count.toLocaleString()],
            ["Covered Routes", shippingCounts.covered.toLocaleString()],
            ["Hidden Routes", shippingCounts.blocked.toLocaleString()],
            ["Chosen Tiers", formatTierCounts(shippingCounts.tiers)],
        ];
    }, [data]);

    const categoryById = useMemo(
        () => new Map((data?.categories ?? []).map((item) => [item.category_id, item])),
        [data],
    );
    const priorityMarketSummary = data?.priority_market_summary;

    return (
        <div className="max-w-[1500px] mx-auto space-y-5 text-[#31323E]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#31323E]/10 pb-4">
                <div>
                    <h2 className="text-2xl font-bold">Snapshot Visualization</h2>
                    <p className="text-sm text-[#31323E]/55 mt-1">
                        Dense baked-storefront matrix for all countries. Each category cell shows the
                        full baseline size list and highlights what the active snapshot actually exposes.
                    </p>
                </div>
                <div className="flex items-end gap-2">
                    <div className="min-w-[200px]">
                        <label className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            Ratio
                        </label>
                        <select
                            className={inputCls}
                            value={selectedRatio}
                            onChange={(event) => void loadSnapshot(event.target.value)}
                        >
                            {(data?.ratios ?? []).map((item) => (
                                <option key={item.ratio_label} value={item.ratio_label}>
                                    {item.ratio_label}
                                    {item.ratio_title ? ` - ${item.ratio_title}` : ""}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={() => void loadSnapshot(selectedRatio)}
                        disabled={loading}
                        className="h-[42px] px-4 bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-[0.18em] rounded-md disabled:opacity-50"
                    >
                        {loading ? "Refreshing" : "Refresh"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm">
                    {error}
                </div>
            )}

            {loading && !data && (
                <div className="border border-[#31323E]/10 bg-[#F7F7F5] px-4 py-3 text-sm text-[#31323E]/70">
                    Loading active storefront snapshot matrix.
                </div>
            )}

            {data && !data.has_active_bake && (
                <div className="border border-[#31323E]/10 bg-[#F7F7F5] px-4 py-3 text-sm text-[#31323E]/70">
                    {data.message}
                </div>
            )}

            {summary.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {summary.map(([label, value]) => (
                        <div key={label} className="border border-[#31323E]/10 bg-white px-4 py-3">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                                {label}
                            </div>
                            <div className="text-base font-bold mt-2 break-all">{value}</div>
                        </div>
                    ))}
                </div>
            )}

            {data?.shipping_support_policy && (
                <div className="border border-[#31323E]/10 bg-[#F7F7F5] px-4 py-3 text-[11px] leading-relaxed text-[#31323E]/75">
                    Shipping support: speed-under-cap public checkout.
                    {" "}Preferred order: {data.shipping_support_policy.preferred_tier_order.join(" -> ")}.
                    {" "}Auto-checkout cap: {data.shipping_support_policy.checkout_shipping_cap.toFixed(2)}.
                    {" "}Express, overnight, StandardPlus and other tiers stay visible for analysis only.
                </div>
            )}

            {data?.business_policy && (
                <div className="border border-[#31323E]/10 bg-white px-4 py-3 text-[11px] leading-relaxed text-[#31323E]/75">
                    Shipping model:
                    {" "}{data.business_policy.policy_note}
                    {" "}Print categories charged at checkout:{" "}
                    {data.business_policy.print_shipping_at_checkout_categories.join(", ")}.
                </div>
            )}

            {data?.entry_promo_summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="border border-[#31323E]/10 bg-white px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            Paper Badge Countries
                        </div>
                        <div className="text-base font-bold mt-2">
                            {data.entry_promo_summary.paper_eligible_country_count}
                        </div>
                        <div className="text-[10px] text-[#31323E]/60 mt-1">
                            Print delivery promo disabled
                        </div>
                    </div>
                    <div className="border border-[#31323E]/10 bg-white px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            Canvas Badge Countries
                        </div>
                        <div className="text-base font-bold mt-2">
                            {data.entry_promo_summary.canvas_eligible_country_count}
                        </div>
                        <div className="text-[10px] text-[#31323E]/60 mt-1">
                            Print delivery promo disabled
                        </div>
                    </div>
                    <div className="border border-[#31323E]/10 bg-white px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            Both Badges
                        </div>
                        <div className="text-base font-bold mt-2">
                            {data.entry_promo_summary.eligible_country_count}
                        </div>
                        <div className="text-[10px] text-[#31323E]/60 mt-1">
                            Can show both entry promos
                        </div>
                    </div>
                    <div className="border border-[#31323E]/10 bg-white px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            No Entry Badge
                        </div>
                        <div className="text-base font-bold mt-2">
                            {data.entry_promo_summary.ineligible_country_count}
                        </div>
                        <div className="text-[10px] text-[#31323E]/60 mt-1">
                            Need checkout shipping or more filtering
                        </div>
                    </div>
                </div>
            )}

            {(priorityMarketSummary?.focus_countries?.length ?? 0) > 0 && (
                <div className="border border-[#31323E]/10 bg-white">
                    <div className="border-b border-[#31323E]/8 px-4 py-3">
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/45">
                            Priority Markets
                        </div>
                        <div className="mt-1 text-[11px] text-[#31323E]/70">
                            {priorityMarketSummary?.strategy_note}
                        </div>
                    </div>
                    <div className="overflow-auto">
                        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
                            <thead>
                                <tr className="bg-[#F7F7F5] border-b border-[#31323E]/8">
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[120px]">Market</th>
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[95px]">Segment</th>
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[110px]">Avg ship</th>
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[110px]">Badge cap</th>
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[120px]">Paper badge</th>
                                    <th className="px-2 py-2 text-left border-r border-[#31323E]/8 w-[120px]">Canvas badge</th>
                                    <th className="px-2 py-2 text-left">Category averages</th>
                                </tr>
                            </thead>
                            <tbody>
                                {priorityMarketSummary?.focus_countries.map((country) => (
                                    <tr key={`focus-${country.country_code}`} className="border-t border-[#31323E]/8 align-top">
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            <div className="font-semibold">{country.country_name}</div>
                                            <div className="text-[9px] text-[#31323E]/55">
                                                #{country.market_rank} / {country.country_code}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${marketSegmentBadge(country.market_segment)}`}>
                                                {country.market_segment}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            {formatCountryShippingSummary(country)}
                                        </td>
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            {formatCountryBadgeCap(country)}
                                        </td>
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${country.paper_entry_badge_eligible ? badgeClass("green") : badgeClass("neutral")}`}>
                                                {country.paper_entry_badge_eligible ? "show badge" : "no badge"}
                                            </span>
                                            <div className="text-[8px] text-[#31323E]/55 mt-1 break-words">
                                                {country.paper_entry_badge_note}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 border-r border-[#31323E]/8">
                                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${country.canvas_entry_badge_eligible ? badgeClass("green") : badgeClass("neutral")}`}>
                                                {country.canvas_entry_badge_eligible ? "show badge" : "no badge"}
                                            </span>
                                            <div className="text-[8px] text-[#31323E]/55 mt-1 break-words">
                                                {country.canvas_entry_badge_note}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="space-y-0.5 text-[9px] text-[#31323E]/72">
                                                {country.category_summaries.map((category) => (
                                                    <div key={`${country.country_code}-${category.category_id}`} className="break-words">
                                                        {category.category_label}: {formatMoney(category.currency, category.avg_covered_shipping_price)}
                                                        {" "}({category.pass_through_size_count} checkout / {category.hidden_size_count} hidden)
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {data?.has_active_bake && (
                <div className="overflow-auto border border-[#31323E]/10 bg-white">
                    <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
                        <thead>
                            <tr className="bg-[#F7F7F5] border-b border-[#31323E]/8">
                                <th className="sticky left-0 z-20 bg-[#F7F7F5] px-2 py-2 text-left text-[9px] font-bold uppercase tracking-[0.16em] border-r border-[#31323E]/8 w-[110px] min-w-[110px]">
                                    Country
                                </th>
                                {data.categories.map((category) => (
                                    <th
                                        key={category.category_id}
                                        className="align-top px-2 py-2 text-left border-r border-[#31323E]/8 w-[165px] min-w-[165px]"
                                    >
                                        <div className="text-[9px] font-bold uppercase tracking-[0.16em] leading-tight">
                                            {category.label}
                                        </div>
                                        <div className="mt-1 text-[9px] text-[#31323E]/65 normal-case leading-tight break-words">
                                            {category.material_label} / {category.frame_label}
                                        </div>
                                        <div className="mt-1 text-[9px] text-[#31323E]/55 leading-tight break-words">
                                            Sizes: {category.baseline_size_labels.join(", ") || "-"}
                                        </div>
                                        <div className="mt-1 text-[9px] text-[#31323E]/55 leading-tight break-words">
                                            Fixed: {formatAttributePairs(category.fixed_attributes)}
                                        </div>
                                        <div className="mt-1 text-[9px] text-[#31323E]/55 leading-tight break-words">
                                            Recommended:{" "}
                                            {formatAttributePairs(category.recommended_defaults)}
                                        </div>
                                        <div className="mt-1 text-[9px] text-[#31323E]/55 leading-tight break-words">
                                            Allowed: {formatAllowedAttributes(category.allowed_attributes)}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {data.countries.map((country) => (
                                <tr key={country.country_code} className="border-t border-[#31323E]/8 align-top">
                                    <td className="sticky left-0 z-10 bg-white px-2 py-2 border-r border-[#31323E]/8 w-[110px] min-w-[110px]">
                                        <div className="font-semibold text-[10px] leading-tight break-words">{country.country_name}</div>
                                        <div className="text-[9px] text-[#31323E]/50 mt-1">
                                            {country.country_code}
                                        </div>
                                        <div className="mt-1">
                                            <span className={`inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${marketSegmentBadge(country.market_priority.segment)}`}>
                                                {country.market_priority.segment}
                                            </span>
                                        </div>
                                        <div className="text-[8px] text-[#31323E]/50 mt-1">
                                            rank {country.market_priority.rank === 999 ? "tail" : `#${country.market_priority.rank}`}
                                        </div>
                                        <div className="text-[8px] text-[#31323E]/55 mt-1 break-words">
                                            avg ship: {formatCountryShippingSummary(country.shipping_summary)}
                                        </div>
                                        <div className="text-[8px] text-[#31323E]/55 break-words">
                                            badge cap: {formatCountryBadgeCap(country.shipping_summary)}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            <span className={`inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${country.entry_promo.paper_print.eligible ? badgeClass("green") : badgeClass("neutral")}`}>
                                                paper
                                            </span>
                                            <span className={`inline-block px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.1em] ${country.entry_promo.canvas.eligible ? badgeClass("green") : badgeClass("neutral")}`}>
                                                canvas
                                            </span>
                                        </div>
                                    </td>
                                    {country.category_cells.map((cell) => (
                                        <td
                                            key={`${country.country_code}-${cell.category_id}`}
                                            className="px-2 py-2 border-r border-[#31323E]/8 w-[165px] min-w-[165px] bg-white"
                                        >
                                            <div className="mb-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                                {categoryById.get(cell.category_id)?.label || cell.category_id}
                                            </div>
                                            <div className="flex flex-wrap gap-1 text-[9px] font-bold uppercase tracking-[0.1em]">
                                                <span className={`inline-block px-1.5 py-0.5 ${effectiveFulfillmentBadge(cell.effective_fulfillment_level)}`}>
                                                    {cell.effective_fulfillment_level}
                                                </span>
                                                <span className={`inline-block px-1.5 py-0.5 ${effectiveGeographyBadge(cell.effective_geography_scope)}`}>
                                                    {cell.effective_geography_scope}
                                                </span>
                                                <span className={`inline-block px-1.5 py-0.5 ${taxBadge(cell.effective_tax_risk)}`}>
                                                    tax {cell.effective_tax_risk}
                                                </span>
                                                <span className={`inline-block px-1.5 py-0.5 ${cell.available ? badgeClass("green") : badgeClass("red")}`}>
                                                    {cell.available ? "present" : "missing"}
                                                </span>
                                                <span className={`inline-block px-1.5 py-0.5 ${businessModeBadge(cell.business_summary.default_shipping_mode)}`}>
                                                    {businessModeLabel(cell.business_summary.default_shipping_mode)}
                                                </span>
                                            </div>

                                            <div className="mt-1.5 text-[9px] text-[#31323E]/65 space-y-0.5 leading-tight break-words">
                                                <div>action: {cell.storefront_action}</div>
                                                <div>source mix: {cell.source_mix}</div>
                                                <div>src: {cell.source_countries.join(", ") || "-"}</div>
                                                <div>fastest delivery: {cell.fastest_delivery_days || "-"}</div>
                                                <div>policy: {cell.business_summary.policy_family}</div>
                                                <div>
                                                    tiers: {formatShippingTierList(cell.available_shipping_tiers)}
                                                    {cell.default_shipping_tier ? ` (default ${shippingTierLabel(cell.default_shipping_tier)})` : ""}
                                                </div>
                                                <div>
                                                    covered {cell.shipping_support.covered_size_count} / blocked {cell.shipping_support.blocked_size_count}
                                                </div>
                                                <div>
                                                    checkout {cell.business_summary.pass_through_size_count} / hidden {cell.business_summary.hidden_size_count}
                                                </div>
                                                <div>
                                                    chosen: {formatTierCounts(cell.shipping_support.chosen_tier_counts)}
                                                </div>
                                                <div>
                                                    price:{" "}
                                                    {cell.price_range.currency && cell.price_range.min_total !== null
                                                        ? `${cell.price_range.currency} ${cell.price_range.min_total?.toFixed(2)} - ${cell.price_range.max_total?.toFixed(2)}`
                                                        : "-"}
                                                </div>
                                                <div>fixed: {formatAttributePairs(cell.fixed_attributes)}</div>
                                                <div>
                                                    recommended:{" "}
                                                    {formatAttributePairs(cell.recommended_defaults)}
                                                </div>
                                                <div>
                                                    allowed: {formatAllowedAttributes(cell.allowed_attributes)}
                                                </div>
                                            </div>

                                            <div className="mt-2 space-y-1">
                                                {cell.size_entries.map((size) => {
                                                    const displayProfile = pickDisplayShippingProfile(size);

                                                    return (
                                                        <div
                                                            key={`${country.country_code}-${cell.category_id}-${size.slot_size_label}`}
                                                            className={`border px-1.5 py-1 ${sizeCardClass(size)}`}
                                                        >
                                                            <div className="font-semibold text-[#31323E] text-[9px] leading-tight">
                                                                {size.slot_size_label}
                                                            </div>
                                                            {size.available && size.size_label !== size.slot_size_label && (
                                                                <div className="text-[8px] text-[#31323E]/62 mt-0.5 leading-tight break-words">
                                                                    supplier size: {size.size_label}
                                                                </div>
                                                            )}
                                                            {!size.available && (
                                                                <div className="text-[8px] text-[#31323E]/62 mt-0.5 leading-tight break-words">
                                                                    missing
                                                                </div>
                                                            )}
                                                            <div className="text-[9px] text-[#31323E]/70 leading-tight">
                                                                offer: {formatMoney(size.currency, size.total_cost)}
                                                            </div>
                                                            <div className="text-[9px] text-[#31323E]/70 leading-tight break-words">
                                                                mode: {businessModeLabel(size.business_policy.shipping_mode)}
                                                            </div>
                                                            {size.available && (
                                                                <div className="text-[9px] text-[#31323E]/70 leading-tight break-words">
                                                                    customer delivery: {customerDeliveryLabel(size)}
                                                                </div>
                                                            )}
                                                            {size.available && (
                                                                <div className="text-[9px] text-[#31323E]/70 leading-tight break-words">
                                                                    selected tier:{" "}
                                                                    {size.shipping_support.chosen_tier
                                                                        ? `${shippingTierLabel(size.shipping_support.chosen_tier)} / ${size.shipping_support.chosen_shipping_method || "-"}`
                                                                        : "hidden"}
                                                                </div>
                                                            )}
                                                            {size.available && size.shipping_support.status !== "covered" && (
                                                                <div className="text-[8px] text-rose-700 leading-tight break-words">
                                                                    hidden: {size.shipping_support.reason || size.shipping_support.note}
                                                                </div>
                                                            )}
                                                            <div className="text-[9px] text-[#31323E]/70 leading-tight break-words">
                                                                from: {size.source_country || "-"}
                                                            </div>
                                                            <div className="text-[9px] text-[#31323E]/70 leading-tight break-words">
                                                                supplier delivery:{" "}
                                                                {displayProfile
                                                                    ? `${formatMoney(displayProfile.currency, displayProfile.shipping_price)} / ${displayProfile.delivery_days || "-"}`
                                                                    : "-"}
                                                            </div>
                                                            {size.available && size.business_policy.shipping_credit_applied !== null && size.business_policy.shipping_credit_applied !== undefined && size.business_policy.shipping_credit_applied > 0 && (
                                                                <div className="text-[8px] text-[#31323E]/65 leading-tight break-words">
                                                                    gallery covers: {formatMoney(size.currency, size.business_policy.shipping_credit_applied)}
                                                                </div>
                                                            )}
                                                            {size.available && visibleShippingProfiles(size).length > 0 && (
                                                                <div className="mt-1 space-y-0.5 text-[8px] text-[#31323E]/65 leading-tight">
                                                                    {visibleShippingProfiles(size).map((profile) => (
                                                                        <div
                                                                            key={`${size.slot_size_label}-${profile.tier}`}
                                                                            className={
                                                                                size.shipping_support.chosen_tier === profile.tier
                                                                                    ? "font-bold text-emerald-700"
                                                                                    : undefined
                                                                            }
                                                                        >
                                                                            {shippingTierLabel(profile.tier)}
                                                                            {size.shipping_support.chosen_tier === profile.tier ? "*" : ""}:{" "}
                                                                            {formatMoney(profile.currency, profile.shipping_price)}
                                                                            {profile.delivery_days ? ` / ${profile.delivery_days}` : ""}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
