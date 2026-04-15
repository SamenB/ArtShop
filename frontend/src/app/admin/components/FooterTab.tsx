"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

interface SiteSettings {
    social_instagram?: string | null;
    social_telegram?: string | null;
    social_threads?: string | null;
    footer_text_discover?: string | null;
    footer_text_services?: string | null;
    footer_text_circle?: string | null;
    [key: string]: any;
}

export default function FooterTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => res.json())
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
            if (res.ok) alert("Footer settings saved successfully!");
            else alert("Failed to save settings.");
        } catch (err) {
            console.error("Save error", err);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !settings) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading footer settings...</div>;

    const inputClasses = "w-full bg-white border border-gray-300 rounded-md p-4 text-black focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none placeholder-gray-400 transition-all font-serif resize-y";
    const labelClasses = "block text-xs font-bold font-sans tracking-wider uppercase text-gray-600 mb-2";

    return (
        <div className="space-y-10 max-w-3xl pb-12">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
                <h2 className="text-3xl font-serif italic text-black">Footer Formatting</h2>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="bg-black text-white px-6 py-2.5 rounded-full uppercase tracking-wider font-sans text-xs disabled:opacity-50 hover:bg-gray-800 transition-all font-bold shadow-sm"
                >
                    {saving ? "Saving..." : "Save Config"}
                </button>
            </div>

            <div className="bg-gray-50 border border-gray-100 p-8 rounded-2xl shadow-sm space-y-8">
                <div>
                    <label className={labelClasses}>Discover Collection Text</label>
                    <textarea 
                        name="footer_text_discover"
                        value={settings.footer_text_discover || ""}
                        onChange={handleChange}
                        rows={4}
                        className={inputClasses}
                        placeholder="Welcome to a space where modern vision meets classical mastery..."
                    />
                </div>

                <div>
                    <label className={labelClasses}>Collector Services Text</label>
                    <textarea 
                        name="footer_text_services"
                        value={settings.footer_text_services || ""}
                        onChange={handleChange}
                        rows={4}
                        className={inputClasses}
                        placeholder="We pride ourselves on providing a premium experience..."
                    />
                </div>

                <div>
                    <label className={labelClasses}>Join Circle Text</label>
                    <textarea 
                        name="footer_text_circle"
                        value={settings.footer_text_circle || ""}
                        onChange={handleChange}
                        rows={4}
                        className={inputClasses}
                        placeholder="Subscribe for early access to new works..."
                    />
                </div>
            </div>

            <div className="pt-8 border-t border-gray-100">
                <h2 className="text-xl font-serif italic text-black mb-6">Social Media Links</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 border border-gray-100 p-8 rounded-2xl shadow-sm">
                    <div>
                        <label className={labelClasses}>Instagram URL</label>
                        <input 
                            type="text"
                            name="social_instagram"
                            value={settings.social_instagram || ""}
                            onChange={handleChange}
                            className={`${inputClasses} font-sans text-sm`}
                            placeholder="https://instagram.com/samen_bondarenko"
                        />
                    </div>
                    <div>
                        <label className={labelClasses}>Telegram URL</label>
                        <input 
                            type="text"
                            name="social_telegram"
                            value={settings.social_telegram || ""}
                            onChange={handleChange}
                            className={`${inputClasses} font-sans text-sm`}
                            placeholder="https://t.me/samen_bondarenko"
                        />
                    </div>
                    <div className="md:col-span-2">
                        <label className={labelClasses}>Threads URL</label>
                        <input 
                            type="text"
                            name="social_threads"
                            value={settings.social_threads || ""}
                            onChange={handleChange}
                            className={`${inputClasses} font-sans text-sm`}
                            placeholder="https://threads.net/@samen_bondarenko"
                        />
                    </div>
                </div>
            </div>

            <div className="pt-4">
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full bg-black text-white rounded-lg py-4 uppercase tracking-[0.15em] font-sans text-sm font-bold disabled:opacity-50 hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                >
                    {saving ? "Saving Changes..." : "Deploy Footer Revisions"}
                </button>
            </div>
        </div>
    );
}
