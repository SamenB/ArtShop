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

    return (
        <div className="space-y-8 max-w-2xl text-left">
            <h2 className="text-lg font-serif italic text-white mb-6">Footer Text Content</h2>
            
            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Discover Collection Text</label>
                <textarea 
                    name="footer_text_discover"
                    value={settings.footer_text_discover || ""}
                    onChange={handleChange}
                    rows={4}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-serif"
                    placeholder="Welcome to a space where modern vision meets classical mastery..."
                />
            </div>

            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Collector Services Text</label>
                <textarea 
                    name="footer_text_services"
                    value={settings.footer_text_services || ""}
                    onChange={handleChange}
                    rows={4}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-serif"
                    placeholder="We pride ourselves on providing a premium experience..."
                />
            </div>

            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Join Circle Text</label>
                <textarea 
                    name="footer_text_circle"
                    value={settings.footer_text_circle || ""}
                    onChange={handleChange}
                    rows={4}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-serif"
                    placeholder="Subscribe for early access to new works..."
                />
            </div>

            <h2 className="text-lg font-serif italic text-white mb-6 mt-12">Social Media Links</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Instagram URL</label>
                    <input 
                        type="text"
                        name="social_instagram"
                        value={settings.social_instagram || ""}
                        onChange={handleChange}
                        className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                        placeholder="https://instagram.com/samen_bondarenko"
                    />
                </div>
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Telegram URL</label>
                    <input 
                        type="text"
                        name="social_telegram"
                        value={settings.social_telegram || ""}
                        onChange={handleChange}
                        className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                        placeholder="https://t.me/samen_bondarenko"
                    />
                </div>
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Threads URL</label>
                    <input 
                        type="text"
                        name="social_threads"
                        value={settings.social_threads || ""}
                        onChange={handleChange}
                        className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                        placeholder="https://threads.net/@samen_bondarenko"
                    />
                </div>
            </div>

            <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-white text-black rounded-md py-4 mt-8 uppercase tracking-widest font-mono text-sm disabled:opacity-50 hover:bg-zinc-200 transition-colors"
            >
                {saving ? "Saving..." : "Save Footer Settings"}
            </button>
        </div>
    );
}
