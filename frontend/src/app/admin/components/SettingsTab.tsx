"use client";

import { useState, useEffect } from "react";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";
import ImageCropperModal from "./ImageCropperModal";

interface SiteSettings {
    about_text: string | null;
    contact_email: string | null;
    artist_home_photo_url: string | null;
    artist_about_photo_url: string | null;
    main_bg_desktop_url: string | null;
    main_bg_mobile_url: string | null;
    cover_2_desktop_url: string | null;
    cover_2_mobile_url: string | null;
    cover_3_desktop_url: string | null;
    cover_3_mobile_url: string | null;
    social_link: string | null;
    studio_address: string | null;
    hero_ken_burns_enabled: boolean;
    hero_slide_duration: number;
}
const COVER_FIELDS: { desktop: keyof SiteSettings; mobile: keyof SiteSettings }[] = [
    { desktop: "main_bg_desktop_url", mobile: "main_bg_mobile_url" },
    { desktop: "cover_2_desktop_url", mobile: "cover_2_mobile_url" },
    { desktop: "cover_3_desktop_url", mobile: "cover_3_mobile_url" },
];

// Shared Primitives

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
function PhotoUploadSlot({
    label,
    url,
    onUpload,
    onRemove,
}: {
    label: string;
    url: string | null;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
}) {
    return (
        <div>
            <label className={labelCls}>{label}</label>
            <div className="border border-dashed border-[#31323E]/20 rounded-xl p-4 text-center relative group transition-all hover:border-[#31323E]/40 bg-[#FAFAF9]">
                {url && (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 transition-all z-10 shadow-sm"
                    >
                        Remove
                    </button>
                )}
                {url ? (
                    <img src={getImageUrl(url)} alt={label} className="mx-auto mb-3 h-28 w-auto object-contain rounded-lg" />
                ) : (
                    <div className="h-28 mb-3 flex flex-col items-center justify-center text-[#31323E]/30 rounded-lg">
                        <span className="text-3xl mb-2">📷</span>
                        <span className="text-xs font-semibold uppercase tracking-wider">No image</span>
                    </div>
                )}
                <input
                    type="file"
                    accept="image/*"
                    onChange={onUpload}
                    className="text-[11px] font-medium text-[#31323E]/50 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[#31323E] file:text-white hover:file:bg-[#434455] file:transition-colors file:uppercase file:tracking-wider cursor-pointer"
                />
            </div>
        </div>
    );
}
export default function SettingsTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [cropperOpen, setCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState("");
    const [activeCoverSlot, setActiveCoverSlot] = useState<number>(0);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then(res => { if (!res.ok) throw new Error(); return res.json(); })
            .then(data => { setSettings(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!settings) return;
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof SiteSettings) => {
        if (!e.target.files || !e.target.files[0]) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await apiFetch(`${getApiUrl()}/upload/image`, { method: "POST", body: formData });
            if (res.ok) {
                const data = await res.json();
                setSettings(prev => prev ? { ...prev, [fieldName]: data.url } : null);
            } else {
                alert("Failed to upload image.");
            }
        } catch (err) { console.error("Upload error", err); }
    };

    const handleBgFileSelect = (e: React.ChangeEvent<HTMLInputElement>, coverIndex: number) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageUrl = URL.createObjectURL(file);
            setCropperImageSrc(imageUrl);
            setActiveCoverSlot(coverIndex);
            setCropperOpen(true);
        }
        e.target.value = "";
    };

    const handleSaveCrops = async (desktopBlob: Blob, mobileBlob: Blob) => {
        try {
            const fields = COVER_FIELDS[activeCoverSlot];
            const desktopForm = new FormData();
            desktopForm.append("file", desktopBlob, `cover_${activeCoverSlot + 1}_desktop.webp`);
            const resDesktop = await apiFetch(`${getApiUrl()}/upload/image`, { method: "POST", body: desktopForm });
            const dData = await resDesktop.json();

            const mobileForm = new FormData();
            mobileForm.append("file", mobileBlob, `cover_${activeCoverSlot + 1}_mobile.webp`);
            const resMobile = await apiFetch(`${getApiUrl()}/upload/image`, { method: "POST", body: mobileForm });
            const mData = await resMobile.json();

            setSettings(prev => prev ? { ...prev, [fields.desktop]: dData.url, [fields.mobile]: mData.url } : null);
            setCropperOpen(false);
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc("");
        } catch (e) { console.error(e); alert("Upload failed"); }
    };

    const handleRemoveCover = (coverIndex: number) => {
        const fields = COVER_FIELDS[coverIndex];
        setSettings(prev => prev ? { ...prev, [fields.desktop]: null, [fields.mobile]: null } : null);
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
        } catch (err) { console.error("Save error", err); }
        finally { setSaving(false); }
    };

    if (loading || !settings) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading settings…</span>
        </div>
    );

    const coverSlots = COVER_FIELDS.map((fields, idx) => ({
        index: idx,
        desktopUrl: settings[fields.desktop] as string | null,
        mobileUrl: settings[fields.mobile] as string | null,
        hasImage: !!(settings[fields.desktop] || settings[fields.mobile]),
    }));

    const filledCount = coverSlots.filter(s => s.hasImage).length;

    return (
        <div className="space-y-8 max-w-3xl pb-12">
            {/* Page Header */}
            <div className="flex justify-between items-start pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Global Settings</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Core configuration, artist profile, and homepage appearance
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 ${
                        saved ? "bg-emerald-500 text-white" : "bg-[#31323E] text-white hover:bg-[#434455]"
                    }`}
                >
                    {saving ? "Saving…" : saved ? "✓ Saved" : "Save Settings"}
                </button>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 mb-0.5">Artwork Basics</p>
                <p className="text-sm text-blue-700 font-medium">
                    Artwork ratio families are now selected directly in the <span className="font-bold">Basics</span> step of the artwork editor.
                    Runtime print prices and exact options come from the active provider storefront snapshot.
                </p>
            </div>

            {/* Artist Profile */}
            <SectionCard title="Artist Profile" desc="Text and contact info used across the site">
                <FieldGroup label="About the Artist">
                    <textarea
                        name="about_text"
                        value={settings.about_text || ""}
                        onChange={handleChange}
                        rows={5}
                        className={`${inp} resize-y leading-relaxed`}
                        placeholder="Enter short bio…"
                    />
                </FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FieldGroup label="Contact Email">
                        <input type="email" name="contact_email" value={settings.contact_email || ""} onChange={handleChange} className={inp} placeholder="artist@example.com" />
                    </FieldGroup>
                    <FieldGroup label="Social Handle">
                        <input type="text" name="social_link" value={settings.social_link || ""} onChange={handleChange} className={inp} placeholder="@artshop_studio" />
                    </FieldGroup>
                    <div className="md:col-span-2">
                        <FieldGroup label="Studio Address">
                            <textarea name="studio_address" value={settings.studio_address || ""} onChange={handleChange} rows={2} className={`${inp} resize-none`} placeholder={"Kiev, Ukraine\nBy appointment only"} />
                        </FieldGroup>
                    </div>
                </div>
            </SectionCard>

            {/* Artist Photos */}
            <SectionCard title="Artist Photos" desc="Appears on Homepage and About page">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <PhotoUploadSlot
                        label="Homepage Photo"
                        url={settings.artist_home_photo_url}
                        onUpload={e => handleFileUpload(e, "artist_home_photo_url")}
                        onRemove={() => setSettings(prev => prev ? { ...prev, artist_home_photo_url: null } : null)}
                    />
                    <PhotoUploadSlot
                        label="About Page Photo"
                        url={settings.artist_about_photo_url}
                        onUpload={e => handleFileUpload(e, "artist_about_photo_url")}
                        onRemove={() => setSettings(prev => prev ? { ...prev, artist_about_photo_url: null } : null)}
                    />
                </div>
            </SectionCard>

            {/* Hero Covers */}
            <SectionCard title="Hero Slideshow Covers" desc="1–3 images for the homepage hero. Each is cropped for desktop (16:9) and mobile (9:16).">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {coverSlots.map(slot => (
                        <div key={slot.index} className="border border-[#31323E]/10 rounded-xl overflow-hidden bg-white shadow-sm">
                            <div className="flex items-center justify-between px-4 py-3 bg-[#FAFAF9] border-b border-[#31323E]/8">
                                <span className="text-xs font-bold text-[#31323E] uppercase tracking-wider">
                                    Cover {slot.index + 1}{slot.index === 0 && !slot.hasImage && " (Required)"}
                                </span>
                                {slot.hasImage && (
                                    <button onClick={() => handleRemoveCover(slot.index)} className="text-red-400 hover:text-red-600 text-[10px] font-bold uppercase tracking-wider transition-colors">
                                        Remove
                                    </button>
                                )}
                            </div>
                            <div className="p-4">
                                {slot.hasImage ? (
                                    <div className="flex gap-3 mb-4">
                                        <div className="flex-1 flex flex-col items-center gap-1.5">
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-[#31323E]/40">Desktop</span>
                                            {slot.desktopUrl
                                                ? <img src={getImageUrl(slot.desktopUrl)} alt="" className="h-16 w-full object-cover rounded-lg border border-[#31323E]/10" />
                                                : <div className="h-16 w-full bg-[#31323E]/5 rounded-lg flex items-center justify-center text-[#31323E]/20 text-xs">—</div>
                                            }
                                        </div>
                                        <div className="w-12 flex flex-col items-center gap-1.5">
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-[#31323E]/40">Mobile</span>
                                            {slot.mobileUrl
                                                ? <img src={getImageUrl(slot.mobileUrl)} alt="" className="h-16 w-10 object-cover rounded-lg border border-[#31323E]/10" />
                                                : <div className="h-16 w-10 bg-[#31323E]/5 rounded-lg flex items-center justify-center text-[#31323E]/20 text-xs">—</div>
                                            }
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-24 mb-4 border border-dashed border-[#31323E]/15 rounded-lg flex flex-col items-center justify-center text-[#31323E]/25 bg-[#31323E]/2">
                                        {slot.index === 0 || coverSlots[slot.index - 1]?.hasImage ? (
                                            <>
                                                <span className="text-2xl mb-1">+</span>
                                                <span className="text-[10px] font-semibold uppercase tracking-wider">No Image</span>
                                            </>
                                        ) : (
                                            <span className="text-xs font-medium px-3 text-center">Add cover {slot.index} first</span>
                                        )}
                                    </div>
                                )}
                                {(slot.index === 0 || coverSlots[slot.index - 1]?.hasImage) && (
                                    <label className="cursor-pointer flex items-center justify-center w-full bg-[#31323E] hover:bg-[#434455] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg transition-colors shadow-sm">
                                        {slot.hasImage ? "Replace" : "Upload Image"}
                                        <input type="file" accept="image/*" onChange={e => handleBgFileSelect(e, slot.index)} className="hidden" />
                                    </label>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Slideshow settings if multiple covers */}
                {filledCount > 1 && (
                    <div className="border border-[#31323E]/10 rounded-xl p-5 bg-[#FAFAF9] space-y-5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#31323E]">Slideshow Settings</h4>
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={settings.hero_ken_burns_enabled}
                                onChange={e => setSettings(prev => prev ? { ...prev, hero_ken_burns_enabled: e.target.checked } : null)}
                                className="mt-0.5 w-4 h-4 accent-[#31323E] cursor-pointer rounded"
                            />
                            <div>
                                <span className="text-sm font-bold text-[#31323E]">Ken Burns Effect</span>
                                <p className="text-xs text-[#31323E]/50 font-medium mt-0.5">Enable dramatic slow pan & zoom motion on hero covers</p>
                            </div>
                        </label>
                        <div>
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#31323E]">Slide Duration</span>
                                <span className="text-sm font-bold text-[#31323E] bg-white px-3 py-1 rounded-lg border border-[#31323E]/15 shadow-sm">{settings.hero_slide_duration}s</span>
                            </div>
                            <input
                                type="range" min={3} max={30} step={1}
                                value={settings.hero_slide_duration}
                                onChange={e => setSettings(prev => prev ? { ...prev, hero_slide_duration: parseInt(e.target.value) } : null)}
                                className="w-full accent-[#31323E] cursor-pointer h-1.5 bg-[#31323E]/15 rounded-full appearance-none"
                            />
                            <div className="flex justify-between mt-1.5">
                                <span className="text-[10px] font-semibold text-[#31323E]/40 uppercase tracking-wider">3s (Fast)</span>
                                <span className="text-[10px] font-semibold text-[#31323E]/40 uppercase tracking-wider">30s (Slow)</span>
                            </div>
                        </div>
                    </div>
                )}
            </SectionCard>

            {/* Save All */}
            <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full py-4 rounded-xl text-sm font-bold uppercase tracking-[0.15em] transition-colors shadow-md disabled:opacity-50 ${
                    saved ? "bg-emerald-500 text-white" : "bg-[#31323E] text-white hover:bg-[#434455]"
                }`}
            >
                {saving ? "Saving Changes…" : saved ? "✓ Settings Saved" : "Save All Settings"}
            </button>

            {cropperOpen && (
                <ImageCropperModal
                    isOpen={cropperOpen}
                    imageSrc={cropperImageSrc}
                    onClose={() => setCropperOpen(false)}
                    onSaveCrops={handleSaveCrops}
                />
            )}
        </div>
    );
}
