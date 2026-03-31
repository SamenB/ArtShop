"use client";
import { useState, useEffect } from "react";
import { getApiUrl, getImageUrl } from "@/utils";
import ImageCropperModal from "./ImageCropperModal";

interface SiteSettings {
    about_text: string | null;
    contact_email: string | null;
    artist_home_photo_url: string | null;
    artist_about_photo_url: string | null;
    main_bg_desktop_url: string | null;
    main_bg_mobile_url: string | null;
    global_print_price: number;
}

export default function SettingsTab() {
    const [settings, setSettings] = useState<SiteSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState("");

    useEffect(() => {
        const url = `${getApiUrl()}/settings`;
        console.log("Fetching settings from:", url);
        fetch(url)
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
            const res = await fetch(`${getApiUrl()}/upload/image`, {
                method: "POST",
                body: formData,
                credentials: "include"
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

    const handleBgFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageUrl = URL.createObjectURL(file);
            setCropperImageSrc(imageUrl);
            setCropperOpen(true);
        }
        e.target.value = "";
    };

    const handleSaveCrops = async (desktopBlob: Blob, mobileBlob: Blob) => {
        try {
            // Upload Desktop bg
            const desktopForm = new FormData();
            desktopForm.append("file", desktopBlob, "desktop_bg.webp");
            const resDesktop = await fetch(`${getApiUrl()}/upload/image`, {
                method: "POST", body: desktopForm, credentials: "include"
            });
            const dData = await resDesktop.json();

            // Upload Mobile bg
            const mobileForm = new FormData();
            mobileForm.append("file", mobileBlob, "mobile_bg.webp");
            const resMobile = await fetch(`${getApiUrl()}/upload/image`, {
                method: "POST", body: mobileForm, credentials: "include"
            });
            const mData = await resMobile.json();

            setSettings(prev => prev ? { 
                ...prev, 
                main_bg_desktop_url: dData.url, 
                main_bg_mobile_url: mData.url 
            } : null);
            setCropperOpen(false);
            
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc("");
        } catch (e) {
            console.error(e);
            alert("Upload failed");
        }
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            const res = await fetch(`${getApiUrl()}/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
                credentials: "include"
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

    return (
        <div className="space-y-8 max-w-2xl">
            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">About The Artist</label>
                <textarea 
                    name="about_text"
                    value={settings.about_text || ""}
                    onChange={handleChange}
                    rows={6}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-sm p-4 text-[#F7F3EC] focus:border-white/30 focus:outline-none placeholder-zinc-700 font-serif"
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
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-sm p-4 text-[#F7F3EC] focus:border-white/30 focus:outline-none placeholder-zinc-700 font-sans"
                    placeholder="artist@example.com"
                />
            </div>
            
            <div>
                <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Global Print Price ($)</label>
                <input 
                    type="number"
                    name="global_print_price"
                    value={settings.global_print_price}
                    onChange={(e) => setSettings({ ...settings, global_print_price: parseInt(e.target.value) || 0 })}
                    className="w-full bg-[#1A1A1A] border border-white/10 rounded-sm p-4 text-[#F7F3EC] focus:border-white/30 focus:outline-none placeholder-zinc-700 font-sans"
                    placeholder="150"
                />
            </div>

            <div className="grid grid-cols-2 gap-8">
                {/* Artist Photo (Home Page) */}
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Artist Photo (Home)</label>
                    <div className="border border-white/10 border-dashed rounded-sm p-4 text-center relative group">
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
                            <div className="h-32 bg-white/5 mb-4 flex items-center justify-center text-zinc-600 font-mono text-xs">No image</div>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_home_photo_url")} className="text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20" />
                    </div>
                </div>

                {/* Artist Photo (About Page) */}
                <div>
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Artist Photo (About)</label>
                    <div className="border border-white/10 border-dashed rounded-sm p-4 text-center relative group">
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
                            <div className="h-32 bg-white/5 mb-4 flex items-center justify-center text-zinc-600 font-mono text-xs">No image</div>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, "artist_about_photo_url")} className="text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20" />
                    </div>
                </div>

                <div className="col-span-2">
                    <label className="block text-sm font-sans tracking-widest uppercase text-zinc-500 mb-2">Home Background Photo (Desktop & Mobile)</label>
                    <div className="border border-white/10 border-dashed rounded-sm p-6 text-center">
                        <div className="flex justify-center gap-8 mb-6">
                            {/* Desktop Preview */}
                            <div className="flex flex-col items-center gap-2 relative group w-48">
                                <span className="text-xs font-mono text-zinc-500 uppercase">Desktop</span>
                                {settings.main_bg_desktop_url ? (
                                    <>
                                        <button
                                            onClick={() => setSettings(prev => prev ? { ...prev, main_bg_desktop_url: null } : null)}
                                            className="absolute top-8 right-2 bg-red-500/80 hover:bg-red-500 text-white text-[10px] uppercase font-mono tracking-widest rounded-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Remove
                                        </button>
                                        <img src={getImageUrl(settings.main_bg_desktop_url)} alt="Desktop BG" className="h-24 w-full object-cover border border-white/10" />
                                    </>
                                ) : (
                                    <div className="h-24 w-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-600 font-mono text-xs">None</div>
                                )}
                            </div>
                            {/* Mobile Preview */}
                            <div className="flex flex-col items-center gap-2 relative group w-24">
                                <span className="text-xs font-mono text-zinc-500 uppercase">Mobile</span>
                                {settings.main_bg_mobile_url ? (
                                    <>
                                        <button
                                            onClick={() => setSettings(prev => prev ? { ...prev, main_bg_mobile_url: null } : null)}
                                            className="absolute top-8 right-1 bg-red-500/80 hover:bg-red-500 text-white text-[10px] uppercase font-mono tracking-widest rounded-sm px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Remove
                                        </button>
                                        <img src={getImageUrl(settings.main_bg_mobile_url)} alt="Mobile BG" className="h-24 w-full object-cover border border-white/10" />
                                    </>
                                ) : (
                                    <div className="h-24 w-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-600 font-mono text-xs">None</div>
                                )}
                            </div>
                        </div>
                        
                        <label className="cursor-pointer inline-block bg-white/10 hover:bg-white/20 text-white font-mono text-xs uppercase tracking-widest px-6 py-3 rounded-full transition-colors">
                            Upload & Crop Background Photo
                            <input type="file" accept="image/*" onChange={handleBgFileSelect} className="hidden" />
                        </label>
                    </div>
                </div>
            </div>

            <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full bg-[#EAE5D9] text-[#111111] py-4 uppercase tracking-widest font-mono text-sm disabled:opacity-50 hover:bg-white transition-colors"
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
