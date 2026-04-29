"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Database, RefreshCcw, Save } from "lucide-react";

import { apiFetch, apiJson, getApiUrl } from "@/utils";

type ShippingPolicy = {
  checkout_shipping_cap: number;
  preferred_tier_order: string[];
  fallback_when_none_under_cap: string;
  fallback_tier: string;
};

type CategoryPolicy = Record<
  string,
  {
    label: string;
    fixed_attributes: Record<string, unknown>;
    allowed_attributes: Record<string, unknown[]>;
    recommended_defaults: Record<string, unknown>;
    shipping: {
      visible_methods?: string[];
      preferred_order?: string[];
      default_method?: string;
    };
    notes?: string[];
  }
>;

type SnapshotDefaults = {
  paper_material: string;
  include_notice_level: boolean;
};

type StorefrontSettingsPayload = {
  defaults: {
    shipping_policy: ShippingPolicy;
    category_policy: CategoryPolicy;
    snapshot_defaults: SnapshotDefaults;
    payload_policy_version: string;
  };
  settings: {
    updated_at?: string | null;
  };
  effective: {
    shipping_policy: ShippingPolicy;
    category_policy: CategoryPolicy;
    snapshot_defaults: SnapshotDefaults;
    payload_policy_version: string;
  };
  status: {
    active_bake?: {
      id: number;
      bake_key: string;
      paper_material: string;
      include_notice_level: boolean;
      ratio_count: number;
      country_count: number;
      offer_group_count: number;
      offer_size_count: number;
    } | null;
    materialized_payload_count: number;
  };
};

type CategoryDraft = {
  fixed: string;
  allowed: string;
  recommended: string;
  visibleMethods: string;
  preferredOrder: string;
  defaultMethod: string;
};

const tierOptions = ["overnight", "express", "standardplus", "standard", "budget"];
const fallbackModes = ["standard_then_cheapest", "cheapest", "block"];

function joinList(value?: string[]) {
  return (value || []).join(", ");
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function asPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseObject(value: string, label: string) {
  const parsed = JSON.parse(value || "{}");
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export default function ProdigiStorefrontSettingsTab() {
  const [payload, setPayload] = useState<StorefrontSettingsPayload | null>(null);
  const [shippingPolicy, setShippingPolicy] = useState<ShippingPolicy | null>(null);
  const [snapshotDefaults, setSnapshotDefaults] = useState<SnapshotDefaults | null>(null);
  const [payloadPolicyVersion, setPayloadPolicyVersion] = useState("");
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, CategoryDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoryIds = useMemo(
    () => Object.keys(payload?.effective.category_policy || {}),
    [payload],
  );

  const applyPayload = useCallback((nextPayload: StorefrontSettingsPayload) => {
    const effective = nextPayload.effective;
    setPayload(nextPayload);
    setShippingPolicy(effective.shipping_policy);
    setSnapshotDefaults(effective.snapshot_defaults);
    setPayloadPolicyVersion(effective.payload_policy_version);
    setCategoryDrafts(
      Object.fromEntries(
        Object.entries(effective.category_policy).map(([categoryId, policy]) => [
          categoryId,
          {
            fixed: asPrettyJson(policy.fixed_attributes),
            allowed: asPrettyJson(policy.allowed_attributes),
            recommended: asPrettyJson(policy.recommended_defaults),
            visibleMethods: joinList(policy.shipping.visible_methods),
            preferredOrder: joinList(policy.shipping.preferred_order),
            defaultMethod: policy.shipping.default_method || "",
          },
        ]),
      ),
    );
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(`${getApiUrl()}/v1/admin/prodigi/storefront-settings`);
      applyPayload(await apiJson<StorefrontSettingsPayload>(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load storefront settings.");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const buildSaveBody = () => {
    if (!shippingPolicy || !snapshotDefaults || !payload) {
      throw new Error("Settings are not loaded yet.");
    }
    const categoryPolicy: CategoryPolicy = Object.fromEntries(
      Object.entries(payload.effective.category_policy).map(([categoryId, policy]) => {
        const draft = categoryDrafts[categoryId];
        return [
          categoryId,
          {
            ...policy,
            fixed_attributes: parseObject(draft.fixed, `${categoryId}.fixed_attributes`),
            allowed_attributes: parseObject(
              draft.allowed,
              `${categoryId}.allowed_attributes`,
            ) as Record<string, unknown[]>,
            recommended_defaults: parseObject(
              draft.recommended,
              `${categoryId}.recommended_defaults`,
            ),
            shipping: {
              visible_methods: splitList(draft.visibleMethods),
              preferred_order: splitList(draft.preferredOrder),
              default_method: draft.defaultMethod.trim(),
            },
          },
        ];
      }),
    );
    return {
      shipping_policy: shippingPolicy,
      category_policy: categoryPolicy,
      snapshot_defaults: snapshotDefaults,
      payload_policy_version: payloadPolicyVersion.trim(),
    };
  };

  const saveSettings = async () => {
    setBusyAction("save");
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(`${getApiUrl()}/v1/admin/prodigi/storefront-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSaveBody()),
      });
      applyPayload(await apiJson<StorefrontSettingsPayload>(response));
      setMessage("Storefront settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save storefront settings.");
    } finally {
      setBusyAction(null);
    }
  };

  const runRebuild = async (mode: "payload" | "snapshot") => {
    setBusyAction(mode);
    setError(null);
    setMessage(null);
    try {
      const endpoint =
        mode === "payload"
          ? "rebuild-payload"
          : "rebuild-snapshot";
      const response = await apiFetch(
        `${getApiUrl()}/v1/admin/prodigi/storefront-settings/${endpoint}`,
        { method: "POST" },
      );
      const result = await apiJson<{ settings?: StorefrontSettingsPayload; status?: string }>(
        response,
      );
      if (result.settings) {
        applyPayload(result.settings);
      } else {
        await loadSettings();
      }
      setMessage(
        mode === "payload"
          ? "Payload rebuilt and runtime caches cleared."
          : "Snapshot and payload rebuilt from current storefront settings.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed.");
    } finally {
      setBusyAction(null);
    }
  };

  const updateCategoryDraft = (
    categoryId: string,
    key: keyof CategoryDraft,
    value: string,
  ) => {
    setCategoryDrafts((current) => ({
      ...current,
      [categoryId]: {
        ...current[categoryId],
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-sm font-semibold text-[#31323E]/50">
        Loading storefront settings...
      </div>
    );
  }

  if (!payload || !shippingPolicy || !snapshotDefaults) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        {error || "Storefront settings are unavailable."}
      </div>
    );
  }

  const activeBake = payload.status.active_bake;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Storefront Settings</h2>
          <p className="mt-1 max-w-3xl text-sm font-medium leading-relaxed text-[#31323E]/52">
            Runtime policy for Prodigi snapshot baking, materialized storefront payloads, and
            checkout-visible shipping selection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveSettings}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-2 rounded-md bg-[#31323E] px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white disabled:opacity-45"
          >
            <Save size={15} />
            {busyAction === "save" ? "Saving" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => runRebuild("payload")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-2 rounded-md border border-[#31323E]/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#31323E] disabled:opacity-45"
          >
            <RefreshCcw size={15} />
            Rebuild Payload
          </button>
          <button
            type="button"
            onClick={() => runRebuild("snapshot")}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-2 rounded-md border border-[#31323E]/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-[#31323E] disabled:opacity-45"
          >
            <Database size={15} />
            Rebuild Snapshot + Payload
          </button>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-md border px-4 py-3 text-sm font-semibold ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="rounded-lg border border-[#31323E]/10 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Active Payload Status</h3>
            <p className="text-xs font-semibold text-[#31323E]/45">
              Policy version {payload.effective.payload_policy_version}
            </p>
          </div>
          <div className="text-right text-xs font-bold text-[#31323E]/55">
            <div>{payload.status.materialized_payload_count} materialized payloads</div>
            <div>{payload.settings.updated_at ? `Updated ${payload.settings.updated_at}` : "Not saved yet"}</div>
          </div>
        </div>
        {activeBake ? (
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <StatusMetric label="Bake" value={`#${activeBake.id}`} />
            <StatusMetric label="Paper" value={activeBake.paper_material} />
            <StatusMetric label="Countries" value={String(activeBake.country_count)} />
            <StatusMetric label="Offer sizes" value={String(activeBake.offer_size_count)} />
          </div>
        ) : (
          <p className="text-sm font-semibold text-[#31323E]/50">No active bake exists yet.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[#31323E]/10 p-4">
          <h3 className="text-lg font-bold">Shipping Policy</h3>
          <div className="mt-4 grid gap-3">
            <FieldLabel label="Checkout Cap">
              <input
                type="number"
                min={0}
                step="0.01"
                value={shippingPolicy.checkout_shipping_cap}
                onChange={(event) =>
                  setShippingPolicy({
                    ...shippingPolicy,
                    checkout_shipping_cap: Number(event.target.value),
                  })
                }
                className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
              />
            </FieldLabel>
            <FieldLabel label="Preferred Tier Order">
              <input
                value={joinList(shippingPolicy.preferred_tier_order)}
                onChange={(event) =>
                  setShippingPolicy({
                    ...shippingPolicy,
                    preferred_tier_order: splitList(event.target.value),
                  })
                }
                className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
              />
            </FieldLabel>
            <div className="grid gap-3 md:grid-cols-2">
              <FieldLabel label="Fallback Mode">
                <select
                  value={shippingPolicy.fallback_when_none_under_cap}
                  onChange={(event) =>
                    setShippingPolicy({
                      ...shippingPolicy,
                      fallback_when_none_under_cap: event.target.value,
                    })
                  }
                  className="w-full rounded-md border border-[#31323E]/15 bg-white px-3 py-2 text-sm font-semibold"
                >
                  {fallbackModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <FieldLabel label="Fallback Tier">
                <select
                  value={shippingPolicy.fallback_tier}
                  onChange={(event) =>
                    setShippingPolicy({ ...shippingPolicy, fallback_tier: event.target.value })
                  }
                  className="w-full rounded-md border border-[#31323E]/15 bg-white px-3 py-2 text-sm font-semibold"
                >
                  {tierOptions.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </FieldLabel>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-[#31323E]/10 p-4">
          <h3 className="text-lg font-bold">Snapshot Defaults</h3>
          <div className="mt-4 grid gap-3">
            <FieldLabel label="Paper Material">
              <input
                value={snapshotDefaults.paper_material}
                onChange={(event) =>
                  setSnapshotDefaults({
                    ...snapshotDefaults,
                    paper_material: event.target.value,
                  })
                }
                className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
              />
            </FieldLabel>
            <FieldLabel label="Payload Policy Version">
              <input
                value={payloadPolicyVersion}
                onChange={(event) => setPayloadPolicyVersion(event.target.value)}
                className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
              />
            </FieldLabel>
            <label className="flex items-center gap-3 rounded-md border border-[#31323E]/10 px-3 py-2 text-sm font-bold">
              <input
                type="checkbox"
                checked={snapshotDefaults.include_notice_level}
                onChange={(event) =>
                  setSnapshotDefaults({
                    ...snapshotDefaults,
                    include_notice_level: event.target.checked,
                  })
                }
              />
              Include notice-level cross-border categories
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-bold">Category Storefront Policy</h3>
          <p className="mt-1 text-xs font-semibold text-[#31323E]/45">
            Fixed attributes, recommended defaults, allowed options, and visible shipping method hints.
          </p>
        </div>
        {categoryIds.map((categoryId) => {
          const policy = payload.effective.category_policy[categoryId];
          const draft = categoryDrafts[categoryId];
          if (!draft) return null;
          return (
            <div key={categoryId} className="rounded-lg border border-[#31323E]/10 p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-base font-bold">{policy.label}</h4>
                <span className="text-xs font-bold text-[#31323E]/40">{categoryId}</span>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <JsonField
                  label="Fixed Attributes"
                  value={draft.fixed}
                  onChange={(value) => updateCategoryDraft(categoryId, "fixed", value)}
                />
                <JsonField
                  label="Recommended Defaults"
                  value={draft.recommended}
                  onChange={(value) => updateCategoryDraft(categoryId, "recommended", value)}
                />
                <JsonField
                  label="Allowed Attributes"
                  value={draft.allowed}
                  onChange={(value) => updateCategoryDraft(categoryId, "allowed", value)}
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <FieldLabel label="Visible Methods">
                  <input
                    value={draft.visibleMethods}
                    onChange={(event) =>
                      updateCategoryDraft(categoryId, "visibleMethods", event.target.value)
                    }
                    className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
                  />
                </FieldLabel>
                <FieldLabel label="Preferred Order">
                  <input
                    value={draft.preferredOrder}
                    onChange={(event) =>
                      updateCategoryDraft(categoryId, "preferredOrder", event.target.value)
                    }
                    className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
                  />
                </FieldLabel>
                <FieldLabel label="Default Method">
                  <input
                    value={draft.defaultMethod}
                    onChange={(event) =>
                      updateCategoryDraft(categoryId, "defaultMethod", event.target.value)
                    }
                    className="w-full rounded-md border border-[#31323E]/15 px-3 py-2 text-sm font-semibold"
                  />
                </FieldLabel>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#F7F7F5] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#31323E]/38">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-[#31323E]">{value}</div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#31323E]/38">
        {label}
      </span>
      {children}
    </label>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.16em] text-[#31323E]/38">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-[#31323E]/15 bg-[#FAFAF8] px-3 py-2 font-mono text-xs leading-relaxed text-[#31323E]"
      />
    </label>
  );
}
