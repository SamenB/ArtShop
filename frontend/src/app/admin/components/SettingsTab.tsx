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
    global_print_price: number;
    hero_ken_burns_enabled: boolean;
    hero_slide_duration: number;
}

const COVER_FIELDS: { desktop: keyof SiteSettings; mobile: keyof SiteSettings }[] = [
    { desktop: "main_bg_desktop_url", mobile: "main_bg_mobile_url" },
    { desktop: "cover_2_desktop_url", mobile: "cover_2_mobile_url" },
    { desktop: "cover_3_desktop_url", mobile: "cover_3_mobile_url" },
];

export default function SettingsTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [cropperOpen, setCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState("");
    const [activeCoverSlot, setActiveCoverSlot] = useState<number>(0);

    useEffect(() => {
        const url = `${getApiUrl()}/settings`;
        apiFetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                return res.json();
            })
            .then((data) => {
                setSettings(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Settings fetch error:", err);
                setLoading(false);
            });
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
            const res = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST",
                body: formData,
            });
            if (res.ok) {
                const data = await res.json();
                setSettings(prev => prev ? { ...prev, [fieldName]: data.url } : null);
            } else {
                alert("Failed to upload image.");
            }
        } catch (err) {
            console.error("Upload error", err);
        }
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
            const resDesktop = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST", body: desktopForm,
            });
            const dData = await resDesktop.json();

            const mobileForm = new FormData();
            mobileForm.append("file", mobileBlob, `cover_${activeCoverSlot + 1}_mobile.webp`);
            const resMobile = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST", body: mobileForm,
            });
            const mData = await resMobile.json();

            setSettings(prev => prev ? { 
                ...prev, 
                [fields.desktop]: dData.url, 
                [fields.mobile]: mData.url 
            } : null);
            setCropperOpen(false);
            
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc("");
        } catch (e) {
            console.error(e);
            alert("Upload failed");
        }
    };

    const handleRemoveCover = (coverIndex: number) => {
        const fields = COVER_FIELDS[coverIndex];
        setSettings(prev => prev ? {
            ...prev,
            [fields.desktop]: null,
            [fields.mobile]: null,
        } : null);
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
            if (res.ok) {
                alert("Settings saved successfully!");
            } else {
                alert("Failed to save settings.");
            }
        } catch (err) {
            console.error("Save error", err);
        } finally {
            setSaving(false);
        }
    };

    if (loading || !settings) return <div className="text-zinc-500 font-sans text-sm tracking-wider animate-pulse">Loading settings...</div>;

    const coverSlots = COVER_FIELDS.map((fields, idx) => ({
        index: idx,
        desktopUrl: settings[fields.desktop] as string | null,
        mobileUrl: settings[fields.mobile] as string | null,
        hasImage: !!(settings[fields.desktop] || settings[fields.mobile]),
    }));

    const filledCount = coverSlots.filter(s => s.hasImage).length;
    const inputClasses = "w-full bg-white border border-gray-300 rounded-md p-3.5 text-[#31323E] focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none placeholder-gray-400 font-sans transition-all text-sm";
    const labelClasses = "block text-xs font-bold font-sans tracking-wider uppercase text-gray-600 mb-2";

    return (
        <div className="space-y-10 max-w-3xl pb-12">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-gray-100">
                <h2 className="text-3xl font-serif italic text-[#31323E]">Global Settings</h2>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="bg-[#31323E] text-white px-6 py-2.5 rounded-full uppercase tracking-wider font-sans text-xs disabled:opacity-50 hover:bg-[#434455] transition-all font-bold shadow-sm"
                >
                    {saving ? "Saving..." : "Save Settings"}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-8">
                    <div>
                        <label className={labelClasses}>About The Artist</label>
                        <textarea 
                            name="about_text"
                            value={settings.about_text || ""}
                            onChange={handleChange}
                            rows={6}
                            className={`${inputClasses} font-serif text-base resize-y`}
                            placeholder="Enter short bio..."
                        />
                    </div>

                    <div>
                        <label className={labelClasses}>Contact Email</label>
                        <input 
                            type="email"
                            name="contact_email"
                            value={settings.contact_email || ""}
                            onChange={handleChange}
                            className={inputClasses}
                            placeholder="artist@example.com"
                        />
                    </div>

                    <div>
                        <label className={labelClasses}>Social Link Handle</label>
                        <input 
                            type="text"
                            name="social_link"
                            value={settings.social_link || ""}
                            onChange={handleChange}
                            className={inputClasses}
                            placeholder="@artshop_studio"
                        />
                    </div>

                    <div>
                        <label className={labelClasses}>Studio Address</label>
                        <textarea 
                            name="studio_address"
                            value={settings.studio_address || ""}
                            onChange={handleChange}
                            rows={3}
                            className={`${inputClasses} resize-none`}
                            placeholder={"Kiev, Ukraine\nBy appointment only"}
                        />
                    </div>
                </div>

                <div className="space-y-8 p-6 bg-gray-50 border border-gray-100 rounded-2xl h-fit">
                    <div>
                        <label className={labelClasses}>Global Print Price ($)</label>
                        <input 
                            type="number"
                            name="global_print_price"
                            value={settings.global_print_price}
                            onChange={(e) => setSettings({ ...settings, global_print_price: parseInt(e.target.value) || 0 })}
                            className={inputClasses}
                            placeholder="150"
                        />
                        <p className="text-[10px] text-zinc-400 mt-2">Will be used as default base price for prints if artwork does not specify one.</p>
                    </div>

                    {/* Artist Photo (Home Page) */}
                    <div>
                        <label className={labelClasses}>Artist Photo (Home)</label>
                        <div className="border border-gray-200 bg-white border-dashed rounded-xl p-4 text-center relative group transition-all hover:border-[#31323E]">
                            {settings.artist_home_photo_url && (
                                <button
                                    onClick={() => setSettings(prev => prev ? { ...prev, artist_home_photo_url: null } : null)}
                                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 shadow-sm text-white text-[10px] uppercase font-mono tracking-widest rounded px-2 py-1 transition-all z-10"
                                >
                                    Remove
                                </button>
                            )}
                            {settings.artist_home_photo_url ? (
                                <img src={getImageUrl(settings.artist_home_photo_url)} alt="Artist Home" className="mx-auto mb-4 h-32 w-auto object-contain rounded-md" />
                            ) : (
                                <div className="h-32 bg-gray-50/50 mb-4 flex items-center justify-center text-zinc-400 font-mono text-xs rounded-md border border-gray-100">No image</div>
                            )}
                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_home_photo_url")} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-gray-100 file:text-[#31323E] hover:file:bg-gray-200 cursor-pointer" />
                        </div>
                    </div>

                    {/* Artist Photo (About Page) */}
                    <div>
                        <label className={labelClasses}>Artist Photo (About)</label>
                        <div className="border border-gray-200 bg-white border-dashed rounded-xl p-4 text-center relative group transition-all hover:border-[#31323E]">
                            {settings.artist_about_photo_url && (
                                <button
                                    onClick={() => setSettings(prev => prev ? { ...prev, artist_about_photo_url: null } : null)}
                                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 shadow-sm text-white text-[10px] uppercase font-mono tracking-widest rounded px-2 py-1 transition-all z-10"
                                >
                                    Remove
                                </button>
                            )}
                            {settings.artist_about_photo_url ? (
                                <img src={getImageUrl(settings.artist_about_photo_url)} alt="Artist About" className="mx-auto mb-4 h-32 w-auto object-contain rounded-md" />
                            ) : (
                                <div className="h-32 bg-gray-50/50 mb-4 flex items-center justify-center text-zinc-400 font-mono text-xs rounded-md border border-gray-100">No image</div>
                            )}
                            <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_about_photo_url")} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-[10px] file:font-semibold file:bg-gray-100 file:text-[#31323E] hover:file:bg-gray-200 cursor-pointer" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-8 border-t border-gray-100">
                <label className="block text-sm font-bold font-sans tracking-wider uppercase text-[#31323E] mb-1">Hero Slideshow Covers (up to 3)</label>
                <p className="text-xs text-gray-500 mb-6">Upload 1-3 images. Each is cropped for desktop (16:9) and mobile (9:16). Multiple images create an auto-rotating slideshow on the homepage.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {coverSlots.map((slot) => (
                        <div key={slot.index} className="border border-gray-200 bg-white rounded-xl p-5 shadow-sm hover:border-[#31323E] transition-colors">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold font-sans text-[#31323E] uppercase tracking-wider bg-gray-100 px-2.5 py-1 rounded">
                                    Cover {slot.index + 1}
                                    {slot.index === 0 && !slot.hasImage && " (Req)"}
                                </span>
                                {slot.hasImage && (
                                    <button
                                        onClick={() => handleRemoveCover(slot.index)}
                                        className="bg-red-50 text-red-600 hover:bg-red-500 hover:text-white text-[10px] uppercase font-mono tracking-widest rounded px-2 py-1 transition-colors"
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>

                            {slot.hasImage ? (
                                <div className="flex justify-center gap-4 mb-5">
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">Desktop</span>
                                        {slot.desktopUrl ? (
                                            <img src={getImageUrl(slot.desktopUrl)} alt={`Cover ${slot.index + 1} Desktop`} className="h-16 w-full object-cover border border-gray-200 rounded overflow-hidden" />
                                        ) : (
                                            <div className="h-16 w-full bg-gray-50 border border-gray-100 flex items-center justify-center text-zinc-400 font-mono text-[9px] rounded">None</div>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase">Mobile</span>
                                        {slot.mobileUrl ? (
                                            <img src={getImageUrl(slot.mobileUrl)} alt={`Cover ${slot.index + 1} Mobile`} className="h-16 w-10 object-cover border border-gray-200 rounded overflow-hidden" />
                                        ) : (
                                            <div className="h-16 w-10 bg-gray-50 border border-gray-100 flex items-center justify-center text-zinc-400 font-mono text-[9px] rounded">—</div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* Empty slot logic */
                                (slot.index === 0 || coverSlots[slot.index - 1]?.hasImage) ? (
                                    <div className="h-[92px] bg-gray-50 border border-gray-200 border-dashed rounded-lg flex flex-col items-center justify-center text-zinc-400 mb-5">
                                        <span className="text-xl mb-1">+</span>
                                        <span className="font-mono text-[9px] uppercase tracking-widest">No Image</span>
                                    </div>
                                ) : (
                                    <div className="h-[92px] bg-gray-50/50 border border-gray-100 rounded-lg flex items-center justify-center text-zinc-300 font-mono text-[10px] mb-5 text-center px-4">
                                        Upload cover {slot.index} first
                                    </div>
                                )
                            )}

                            {/* Upload button */}
                            {(slot.index === 0 || coverSlots[slot.index - 1]?.hasImage) && (
                                <div className="text-center">
                                    <label className="cursor-pointer inline-block w-full bg-[#31323E] hover:bg-[#434455] text-white font-sans text-xs uppercase font-bold tracking-wider px-4 py-2.5 rounded transition-colors shadow-sm">
                                        {slot.hasImage ? "Replace Image" : "Upload Image"}
                                        <input type="file" accept="image/*" onChange={(e) => handleBgFileSelect(e, slot.index)} className="hidden" />
                                    </label>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {filledCount > 1 && (
                    <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-xl">
                        <h4 className="text-xs font-bold font-sans tracking-wider uppercase text-[#31323E] mb-4">Slideshow Settings</h4>
                        
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={settings.hero_ken_burns_enabled}
                                onChange={(e) => setSettings(prev => prev ? { ...prev, hero_ken_burns_enabled: e.target.checked } : null)}
                                className="mt-1 w-4 h-4 accent-black cursor-pointer"
                            />
                            <div>
                                <span className="text-[12px] font-bold text-[#31323E] uppercase tracking-widest">Ken Burns Effect</span>
                                <p className="text-[11px] text-zinc-500 mt-1">Enable dramatic slow pan & zoom motion on hero covers</p>
                            </div>
                        </label>

                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold font-sans text-[#31323E] uppercase tracking-wider">Slide Duration</span>
                                <span className="text-xs font-sans font-bold text-[#31323E] px-2 py-1 bg-white border border-gray-200 rounded">{settings.hero_slide_duration}s</span>
                            </div>
                            <input
                                type="range"
                                min={3}
                                max={30}
                                step={1}
                                value={settings.hero_slide_duration}
                                onChange={(e) => setSettings(prev => prev ? { ...prev, hero_slide_duration: parseInt(e.target.value) } : null)}
                                className="w-full accent-black cursor-pointer h-1.5 bg-gray-200 rounded-lg appearance-none"
                            />
                            <div className="flex justify-between mt-2">
                                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">3s (Fast)</span>
                                <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400">30s (Slow)</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="pt-6">
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="w-full bg-[#31323E] text-white rounded-lg py-4 uppercase tracking-[0.15em] font-sans text-sm font-bold disabled:opacity-50 hover:bg-[#434455] transition-colors shadow-lg shadow-black/10"
                >
                    {saving ? "Saving Changes..." : "Save All Settings"}
                </button>
            </div>

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
