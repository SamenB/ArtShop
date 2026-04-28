"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch, apiJson } from "@/utils";

interface SiteSettings {
    social_instagram?: string | null;
    social_telegram?: string | null;
    social_threads?: string | null;
    footer_text_discover?: string | null;
    footer_text_services?: string | null;
    footer_text_circle?: string | null;
    [key: string]: any;
}

// ── Shared Primitives ─────────────────────────────────────────────────────────

const inp = "w-full bg-white border border-[#31323E]/15 rounded-lg px-4 py-3 text-sm font-medium text-[#31323E] focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 focus:outline-none placeholder-[#31323E]/30 transition-all shadow-sm";
const labelCls = "block text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/50 mb-1.5";

function SectionCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white border border-[#31323E]/10 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#31323E]/8 bg-[#FAFAF9]">
                <h3 className="font-bold text-sm tracking-wide text-[#31323E]">{title}</h3>
                {desc && <p className="text-xs text-[#31323E]/40 font-medium mt-0.5">{desc}</p>}
            </div>
            <div className="p-6 space-y-5">{children}</div>
        </div>
    );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className={labelCls}>{label}</label>
            {children}
        </div>
    );
}

export default function FooterTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => apiJson<SiteSettings>(res))
            .then(data => { setSettings(data); setLoading(false); })
            .catch(err => { console.error(err); setLoading(false); });
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!settings) return;
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
            else alert("Failed to save settings.");
        } catch (err) {
            console.error("Save error", err);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !settings) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading footer settings…</span>
        </div>
    );

    return (
        <div className="space-y-8 max-w-3xl pb-12">
            {/* Page Header */}
            <div className="flex justify-between items-start pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Footer Content</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Manage the footer text blocks and social links displayed site-wide
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 ${
                        saved
                            ? "bg-emerald-500 text-white"
                            : "bg-[#31323E] text-white hover:bg-[#434455]"
                    }`}
                >
                    {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
                </button>
            </div>

            {/* Footer Text Blocks */}
            <SectionCard title="Footer Text Blocks" desc="Text shown in the 3-column footer layout on the storefront">
                <FieldGroup label="Discover Collection — Column 1">
                    <textarea
                        name="footer_text_discover"
                        value={settings.footer_text_discover || ""}
                        onChange={handleChange}
                        rows={4}
                        className={`${inp} resize-y leading-relaxed`}
                        placeholder="Welcome to a space where modern vision meets classical mastery…"
                    />
                </FieldGroup>

                <FieldGroup label="Collector Services — Column 2">
                    <textarea
                        name="footer_text_services"
                        value={settings.footer_text_services || ""}
                        onChange={handleChange}
                        rows={4}
                        className={`${inp} resize-y leading-relaxed`}
                        placeholder="We pride ourselves on providing a premium experience…"
                    />
                </FieldGroup>

                <FieldGroup label="Join Circle — Column 3 (Newsletter)">
                    <textarea
                        name="footer_text_circle"
                        value={settings.footer_text_circle || ""}
                        onChange={handleChange}
                        rows={4}
                        className={`${inp} resize-y leading-relaxed`}
                        placeholder="Subscribe for early access to new works…"
                    />
                </FieldGroup>
            </SectionCard>

            {/* Social Media */}
            <SectionCard title="Social Media Links" desc="URLs for social icons shown in the footer">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FieldGroup label="Instagram URL">
                        <input
                            type="text"
                            name="social_instagram"
                            value={settings.social_instagram || ""}
                            onChange={handleChange}
                            className={inp}
                            placeholder="https://instagram.com/samen_bondarenko"
                        />
                    </FieldGroup>
                    <FieldGroup label="Telegram URL">
                        <input
                            type="text"
                            name="social_telegram"
                            value={settings.social_telegram || ""}
                            onChange={handleChange}
                            className={inp}
                            placeholder="https://t.me/samen_bondarenko"
                        />
                    </FieldGroup>
                    <div className="md:col-span-2">
                        <FieldGroup label="Threads URL">
                            <input
                                type="text"
                                name="social_threads"
                                value={settings.social_threads || ""}
                                onChange={handleChange}
                                className={inp}
                                placeholder="https://threads.net/@samen_bondarenko"
                            />
                        </FieldGroup>
                    </div>
                </div>
            </SectionCard>

            {/* Save Footer */}
            <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full py-4 rounded-xl text-sm font-bold uppercase tracking-[0.15em] transition-colors shadow-md disabled:opacity-50 ${
                    saved
                        ? "bg-emerald-500 text-white"
                        : "bg-[#31323E] text-white hover:bg-[#434455]"
                }`}
            >
                {saving ? "Saving Changes…" : saved ? "✓ Footer Updated" : "Save All Footer Settings"}
            </button>
        </div>
    );
}
