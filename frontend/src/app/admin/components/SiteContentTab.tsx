"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiJson, getApiUrl } from "@/utils";
import {
    FAQ_PAGE_COPY,
    PRIVACY_PAGE_COPY,
    SHIPPING_PAGE_COPY,
    TERMS_PAGE_COPY,
} from "@/content/siteCopy";
import FooterTab from "./FooterTab";
import SettingsTab from "./SettingsTab";

export type ContentSubtab = "global" | "footer" | "shipping" | "faq" | "terms" | "privacy";

interface SiteSettings {
    shipping_page_text?: string | null;
    faq_page_text?: string | null;
    terms_page_text?: string | null;
    privacy_page_text?: string | null;
    [key: string]: unknown;
}

const PAGE_FIELDS: Record<Exclude<ContentSubtab, "global" | "footer">, { title: string; field: keyof SiteSettings; fallback: string }> = {
    shipping: {
        title: "Shipping Page",
        field: "shipping_page_text",
        fallback: SHIPPING_PAGE_COPY,
    },
    faq: {
        title: "FAQ Page",
        field: "faq_page_text",
        fallback: FAQ_PAGE_COPY,
    },
    terms: {
        title: "Terms Page",
        field: "terms_page_text",
        fallback: TERMS_PAGE_COPY,
    },
    privacy: {
        title: "Privacy Page",
        field: "privacy_page_text",
        fallback: PRIVACY_PAGE_COPY,
    },
};

const inputClass =
    "w-full bg-white border border-[#31323E]/15 rounded-lg px-4 py-3 text-sm font-medium text-[#31323E] focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 focus:outline-none placeholder-[#31323E]/30 transition-all shadow-sm";

function LegalPageEditor({ page }: { page: Exclude<ContentSubtab, "global" | "footer"> }) {
    const meta = PAGE_FIELDS[page];
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then((res) => apiJson<SiteSettings>(res))
            .then((data) => setSettings(data))
            .catch((error) => console.error("Content settings load failed", error))
            .finally(() => setLoading(false));
    }, []);

    const value = String(settings?.[meta.field] || "");

    const save = async () => {
        if (!settings) {
            return;
        }
        setSaving(true);
        const nextSettings = { ...settings, [meta.field]: value || meta.fallback };
        try {
            const res = await apiFetch(`${getApiUrl()}/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextSettings),
            });
            setSettings(await apiJson<SiteSettings>(res));
            setSaved(true);
            window.setTimeout(() => setSaved(false), 2200);
        } catch (error) {
            console.error("Content settings save failed", error);
            window.alert(error instanceof Error ? error.message : "Failed to save page content.");
        } finally {
            setSaving(false);
        }
    };

    if (loading || !settings) {
        return (
            <div className="flex items-center gap-3 py-10">
                <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading content...</span>
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex justify-between items-start pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">{meta.title}</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Public page copy shown from the footer navigation.
                    </p>
                </div>
                <button
                    onClick={save}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 ${
                        saved ? "bg-emerald-500 text-white" : "bg-[#31323E] text-white hover:bg-[#434455]"
                    }`}
                >
                    {saving ? "Saving..." : saved ? "Saved" : "Save Page"}
                </button>
            </div>

            <textarea
                value={value}
                onChange={(event) =>
                    setSettings((previous) =>
                        previous ? { ...previous, [meta.field]: event.target.value } : previous
                    )
                }
                rows={14}
                className={`${inputClass} resize-y leading-relaxed`}
                placeholder={meta.fallback}
            />

            {!value ? (
                <button
                    type="button"
                    onClick={() =>
                        setSettings((previous) =>
                            previous ? { ...previous, [meta.field]: meta.fallback } : previous
                        )
                    }
                    className="rounded-lg border border-[#31323E]/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#31323E]/60 hover:text-[#31323E]"
                >
                    Fill with starter copy
                </button>
            ) : null}
        </div>
    );
}

export default function SiteContentTab({ active = "global" }: { active?: ContentSubtab }) {

    return (
        <div className="space-y-8 text-[#31323E]">
            {active === "global" ? <SettingsTab /> : null}
            {active === "footer" ? <FooterTab /> : null}
            {active === "shipping" ? <LegalPageEditor page="shipping" /> : null}
            {active === "faq" ? <LegalPageEditor page="faq" /> : null}
            {active === "terms" ? <LegalPageEditor page="terms" /> : null}
            {active === "privacy" ? <LegalPageEditor page="privacy" /> : null}
        </div>
    );
}
