"use client";

/**
 * Global Site Settings Management.
 * Provides controls for artist biography, contact details, pricing defaults, and hero slideshow configuration.
 */

import { useState, useEffect } from "react";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";
import ImageCropperModal from "./ImageCropperModal";

/** Defines the structure of global configuration options. */
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

/** Maps sequential cover slots to their specific backend keys for desktop and mobile resolutions. */
const COVER_FIELDS: { desktop: keyof SiteSettings; mobile: keyof SiteSettings }[] = [
    { desktop: "main_bg_desktop_url", mobile: "main_bg_mobile_url" },
    { desktop: "cover_2_desktop_url", mobile: "cover_2_mobile_url" },
    { desktop: "cover_3_desktop_url", mobile: "cover_3_mobile_url" },
];

/**
 * Administrative panel for modifying site-wide behavior, imagery, and static copy.
 */
export default function SettingsTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Cropper State variables for managing hero image aspect ratios
    const [cropperOpen, setCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState("");
    const [activeCoverSlot, setActiveCoverSlot] = useState<number>(0);

    /** Loads settings from the backend. */
    useEffect(() => {
        const url = `${getApiUrl()}/settings`;
        console.log("Fetching settings from:", url);
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

    /** Synchronizes standard text input fields with local state. */
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!settings) return;
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    /** Processes direct file uploads that bypass the cropper tool (e.g., standard photos). */
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

    /** Initiates the image cropping workflow for hero covers. */
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

    /** Submits the processed viewport-specific blobs to the remote storage provider. */
    const handleSaveCrops = async (desktopBlob: Blob, mobileBlob: Blob) => {
        try {
            const fields = COVER_FIELDS[activeCoverSlot];

            // Primary Desktop Hero Cover upload
            const desktopForm = new FormData();
            desktopForm.append("file", desktopBlob, `cover_${activeCoverSlot + 1}_desktop.webp`);
            const resDesktop = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST", body: desktopForm,
            });
            const dData = await resDesktop.json();

            // Mobile Hero Cover variation upload
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

    /** Detaches an uploaded hero cover variant and resets logic cascades. */
    const handleRemoveCover = (coverIndex: number) => {
        const fields = COVER_FIELDS[coverIndex];
        setSettings(prev => prev ? {
            ...prev,
            [fields.desktop]: null,
            [fields.mobile]: null,
        } : null);
    };

    /** Persists all current configurations back to the central database. */
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

    if (loading || !settings) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading settings...</div>;

    /** Determines which cover slots have pre-populated images and their respective index. */
    const coverSlots = COVER_FIELDS.map((fields, idx) => ({
        index: idx,
        desktopUrl: settings[fields.desktop] as string | null,
        mobileUrl: settings[fields.mobile] as string | null,
        hasImage: !!(settings[fields.desktop] || settings[fields.mobile]),
    }));

    /** Metric referencing how many hero slides exist. Used to deduce auto-scrolling options. */
    const filledCount = coverSlots.filter(s => s.hasImage).length;

    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">About The Artist</label>
                <textarea 
                    name="about_text"
                    value={settings.about_text || ""}
                    onChange={handleChange}
                    rows={6}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-serif"
                    placeholder="Enter short bio..."
                />
            </div>

            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Contact Email</label>
                <input 
                    type="email"
                    name="contact_email"
                    value={settings.contact_email || ""}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                    placeholder="artist@example.com"
                />
            </div>

            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Social Link Handle</label>
                <input 
                    type="text"
                    name="social_link"
                    value={settings.social_link || ""}
                    onChange={handleChange}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                    placeholder="@artshop_studio"
                />
            </div>

            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Studio Address</label>
                <textarea 
                    name="studio_address"
                    value={settings.studio_address || ""}
                    onChange={handleChange}
                    rows={3}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                    placeholder={"Kiev, Ukraine\nBy appointment only"}
                />
            </div>
            
            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Global Print Price ($)</label>
                <input 
                    type="number"
                    name="global_print_price"
                    value={settings.global_print_price}
                    onChange={(e) => setSettings({ ...settings, global_print_price: parseInt(e.target.value) || 0 })}
                    className="w-full bg-white border border-zinc-300 rounded-md p-4 text-zinc-900 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none placeholder-zinc-400 font-sans"
                    placeholder="150"
                />
            </div>

            <div className="grid grid-cols-2 gap-8">
                {/* Artist Photo (Home Page) */}
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Artist Photo (Home)</label>
                    <div className="border border-zinc-300 border-dashed rounded-md p-4 text-center relative group">
                        {settings.artist_home_photo_url && (
                            <button
                                onClick={() => setSettings(prev => prev ? { ...prev, artist_home_photo_url: null } : null)}
                                className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white text-[10px] uppercase font-mono tracking-widest rounded-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                Remove
                            </button>
                        )}
                        {settings.artist_home_photo_url ? (
                            <img src={getImageUrl(settings.artist_home_photo_url)} alt="Artist Home" className="mx-auto mb-4 max-h-32 object-contain" />
                        ) : (
                            <div className="h-32 bg-zinc-50 mb-4 flex items-center justify-center text-zinc-400 font-mono text-xs">No image</div>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_home_photo_url")} className="text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20" />
                    </div>
                </div>

                {/* Artist Photo (About Page) */}
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Artist Photo (About)</label>
                    <div className="border border-zinc-300 border-dashed rounded-md p-4 text-center relative group">
                        {settings.artist_about_photo_url && (
                            <button
                                onClick={() => setSettings(prev => prev ? { ...prev, artist_about_photo_url: null } : null)}
                                className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white text-[10px] uppercase font-mono tracking-widest rounded-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                Remove
                            </button>
                        )}
                        {settings.artist_about_photo_url ? (
                            <img src={getImageUrl(settings.artist_about_photo_url)} alt="Artist About" className="mx-auto mb-4 max-h-32 object-contain" />
                        ) : (
                            <div className="h-32 bg-zinc-50 mb-4 flex items-center justify-center text-zinc-400 font-mono text-xs">No image</div>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_about_photo_url")} className="text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20" />
                    </div>
                </div>

                {/* HERO COVERS */}
                <div className="col-span-2">
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-1">Hero Slideshow Covers (up to 3)</label>
                    <p className="text-xs text-zinc-400 font-mono mb-4">Upload 1-3 images. Each is cropped for desktop (16:9) and mobile (9:16). Multiple images create an auto-rotating slideshow.</p>
                    
                    <div className="space-y-4">
                        {coverSlots.map((slot) => (
                            <div key={slot.index} className="border border-zinc-300 border-dashed rounded-sm p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                                        Cover {slot.index + 1}
                                        {slot.index === 0 && !slot.hasImage && " (required)"}
                                    </span>
                                    {slot.hasImage && (
                                        <button
                                            onClick={() => handleRemoveCover(slot.index)}
                                            className="bg-red-500/80 hover:bg-red-500 text-white text-[10px] uppercase font-mono tracking-widest rounded-sm px-2 py-1 transition-colors"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>

                                {slot.hasImage ? (
                                    <div className="flex justify-center gap-6 mb-4">
                                        {/* Desktop preview */}
                                        <div className="flex flex-col items-center gap-1.5">
                                            <span className="text-[10px] font-mono text-zinc-400 uppercase">Desktop</span>
                                            {slot.desktopUrl ? (
                                                <img src={getImageUrl(slot.desktopUrl)} alt={`Cover ${slot.index + 1} Desktop`} className="h-20 w-36 object-cover border border-zinc-300 rounded-sm" />
                                            ) : (
                                                <div className="h-20 w-36 bg-zinc-50 border border-zinc-300 flex items-center justify-center text-zinc-400 font-mono text-[10px] rounded-sm">None</div>
                                            )}
                                        </div>
                                        {/* Mobile preview */}
                                        <div className="flex flex-col items-center gap-1.5">
                                            <span className="text-[10px] font-mono text-zinc-400 uppercase">Mobile</span>
                                            {slot.mobileUrl ? (
                                                <img src={getImageUrl(slot.mobileUrl)} alt={`Cover ${slot.index + 1} Mobile`} className="h-20 w-12 object-cover border border-zinc-300 rounded-sm" />
                                            ) : (
                                                <div className="h-20 w-12 bg-zinc-50 border border-zinc-300 flex items-center justify-center text-zinc-400 font-mono text-[10px] rounded-sm">—</div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* Empty slot logic */
                                    (slot.index === 0 || coverSlots[slot.index - 1]?.hasImage) ? (
                                        <div className="h-20 bg-zinc-50 border border-zinc-200 rounded-sm flex items-center justify-center text-zinc-400 font-mono text-xs mb-4">
                                            No image
                                        </div>
                                    ) : (
                                        <div className="h-20 bg-zinc-50/50 border border-zinc-100 rounded-sm flex items-center justify-center text-zinc-300 font-mono text-xs mb-4">
                                            Upload cover {slot.index} first
                                        </div>
                                    )
                                )}

                                {/* Upload button */}
                                {(slot.index === 0 || coverSlots[slot.index - 1]?.hasImage) && (
                                    <div className="text-center">
                                        <label className="cursor-pointer inline-block bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-zinc-900 font-mono text-xs uppercase tracking-widest px-5 py-2.5 rounded-full transition-colors">
                                            {slot.hasImage ? "Replace & Crop" : "Upload & Crop"}
                                            <input type="file" accept="image/*" onChange={(e) => handleBgFileSelect(e, slot.index)} className="hidden" />
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {filledCount > 1 && (
                        <p className="text-xs text-zinc-400 font-mono mt-3 text-center">
                            ✓ {filledCount} covers - slideshow will auto-rotate every {settings.hero_slide_duration}s
                        </p>
                    )}

                    {/* Ken Burns motion toggle */}
                    <label className="flex items-center gap-3 mt-4 p-3 bg-zinc-50 border border-zinc-200 rounded-md cursor-pointer hover:bg-zinc-100 transition-colors">
                        <input
                            type="checkbox"
                            checked={settings.hero_ken_burns_enabled}
                            onChange={(e) => setSettings(prev => prev ? { ...prev, hero_ken_burns_enabled: e.target.checked } : null)}
                            className="w-4 h-4 accent-zinc-900 cursor-pointer"
                        />
                        <div>
                            <span className="text-xs font-mono text-zinc-700 uppercase tracking-widest">Ken Burns Effect</span>
                            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Enable subtle pan & zoom motion on hero covers</p>
                        </div>
                    </label>

                    {/* Slideshow speed */}
                    {filledCount > 1 && (
                        <div className="mt-4 p-3 bg-zinc-50 border border-zinc-200 rounded-md">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-mono text-zinc-700 uppercase tracking-widest">Slide Duration</span>
                                <span className="text-xs font-mono text-zinc-500">{settings.hero_slide_duration}s</span>
                            </div>
                            <input
                                type="range"
                                min={5}
                                max={30}
                                step={1}
                                value={settings.hero_slide_duration}
                                onChange={(e) => setSettings(prev => prev ? { ...prev, hero_slide_duration: parseInt(e.target.value) } : null)}
                                className="w-full accent-zinc-900 cursor-pointer"
                            />
                            <div className="flex justify-between mt-1">
                                <span className="text-[10px] font-mono text-zinc-400">5s (fast)</span>
                                <span className="text-[10px] font-mono text-zinc-400">30s (slow)</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-zinc-900 text-white rounded-md py-4 uppercase tracking-widest font-mono text-sm disabled:opacity-50 hover:bg-zinc-800 transition-colors"
            >
                {saving ? "Saving..." : "Save Settings"}
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
