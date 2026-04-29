"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiJson, getApiUrl } from "@/utils";

interface AdminProfileSettings {
  id?: number;
  owner_name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  owner_telegram_chat_id?: string | null;
  contact_email?: string | null;
}

interface TelegramStatus {
  bot_configured: boolean;
  owner_alert_chat_configured: boolean;
  owner_alert_chat_id?: string | null;
}

const inputClass =
  "w-full rounded-lg border border-[#31323E]/15 bg-white px-4 py-3 text-sm font-medium text-[#31323E] shadow-sm transition-all placeholder-[#31323E]/30 focus:border-[#31323E]/50 focus:outline-none focus:ring-2 focus:ring-[#31323E]/10";

export default function AdminProfileTab() {
  const [settings, setSettings] = useState<AdminProfileSettings | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, telegramRes] = await Promise.all([
          apiFetch(`${getApiUrl()}/settings`),
          apiFetch(`${getApiUrl()}/telegram/status`),
        ]);
        setSettings(await apiJson<AdminProfileSettings>(settingsRes));
        if (telegramRes.ok) {
          setTelegramStatus(await apiJson<TelegramStatus>(telegramRes));
        }
      } catch (error) {
        console.error("Admin profile load failed", error);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const update = (field: keyof AdminProfileSettings, value: string) => {
    setSettings((previous) =>
      previous ? { ...previous, [field]: value } : previous,
    );
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await apiFetch(`${getApiUrl()}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSettings(await apiJson<AdminProfileSettings>(response));
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to save admin profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#31323E]/20 border-t-[#31323E]" />
        <span className="text-sm font-semibold uppercase tracking-wider text-[#31323E]/50">
          Loading admin profile...
        </span>
      </div>
    );
  }

  const savedTelegramChat =
    settings.owner_telegram_chat_id || telegramStatus?.owner_alert_chat_id || "";
  const telegramReady =
    Boolean(telegramStatus?.bot_configured) && Boolean(savedTelegramChat);

  return (
    <div className="max-w-4xl space-y-7 text-[#31323E]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#31323E]/8 pb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Owner & Alerts</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-[#31323E]/50">
            Owner contact data and the Telegram alert channel used for internal
            new-order notifications. Print fulfillment remains Prodigi-only.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={`rounded-lg px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition-all disabled:opacity-50 ${
            saved ? "bg-emerald-500" : "bg-[#31323E] hover:bg-[#434455]"
          }`}
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save Profile"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg border border-[#31323E]/10 bg-white p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
            Owner Contact
          </p>
          <div className="mt-4 grid gap-3">
            <input
              value={settings.owner_name || ""}
              onChange={(event) => update("owner_name", event.target.value)}
              className={inputClass}
              placeholder="Owner name"
            />
            <input
              value={settings.owner_email || ""}
              onChange={(event) => update("owner_email", event.target.value)}
              className={inputClass}
              placeholder="Owner email"
            />
            <input
              value={settings.owner_phone || ""}
              onChange={(event) => update("owner_phone", event.target.value)}
              className={inputClass}
              placeholder="Owner phone"
            />
            <input
              value={settings.contact_email || ""}
              onChange={(event) => update("contact_email", event.target.value)}
              className={inputClass}
              placeholder="Public contact email"
            />
          </div>
        </section>

        <section className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                Telegram Owner Alerts
              </p>
              <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/50">
                Used only to notify the owner that a new order arrived.
              </p>
            </div>
            <span
              className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                telegramReady
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {telegramReady ? "Ready" : "Needs setup"}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={settings.owner_telegram_chat_id || ""}
              onChange={(event) =>
                update("owner_telegram_chat_id", event.target.value)
              }
              className={inputClass}
              placeholder="Telegram chat_id"
            />
            <div className="rounded-lg border border-[#31323E]/10 bg-white p-3 text-xs font-medium leading-relaxed text-[#31323E]/55">
              <p>
                Bot token:{" "}
                <strong className="text-[#31323E]">
                  {telegramStatus?.bot_configured ? "configured" : "missing"}
                </strong>
              </p>
              <p>
                Env fallback chat:{" "}
                <strong className="text-[#31323E]">
                  {telegramStatus?.owner_alert_chat_configured
                    ? "configured"
                    : "not set"}
                </strong>
              </p>
              <p className="mt-2">
                To connect: message your bot once, get your chat_id from
                @userinfobot, paste it here, then save.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
