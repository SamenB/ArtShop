"use client";

import { useEffect, useState } from "react";

import { apiFetch, apiJson, getApiUrl, getImageUrl } from "@/utils";

import ImageCropperModal from "./ImageCropperModal";

interface SiteSettings {
    about_text: string | null;
    contact_email: string | null;
    artist_home_photo_url: string | null;
    artist_about_photo_url: string | null;
    main_bg_desktop_url: string | null;
    main_bg_mobile_url: string | null;
    studio_address: string | null;
}

const inp =
    "w-full bg-white border border-[#31323E]/15 rounded-lg px-4 py-3 text-sm font-medium text-[#31323E] focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 focus:outline-none placeholder-[#31323E]/30 transition-all shadow-sm";
const labelCls =
    "block text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/50 mb-1.5";

function SectionCard({
    title,
    desc,
    children,
}: {
    title: string;
    desc?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white border border-[#31323E]/10 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#31323E]/8 bg-[#FAFAF9]">
                <h3 className="font-bold text-sm tracking-wide text-[#31323E]">{title}</h3>
                {desc ? <p className="text-xs text-[#31323E]/40 font-medium mt-0.5">{desc}</p> : null}
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
                {url ? (
                    <button
                        type="button"
                        onClick={onRemove}
                        className="absolute top-3 right-3 bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg px-2.5 py-1 transition-all z-10 shadow-sm"
                    >
                        Remove
                    </button>
                ) : null}
                {url ? (
                    <img
                        src={getImageUrl(url)}
                        alt={label}
                        className="mx-auto mb-3 h-28 w-auto object-contain rounded-lg"
                    />
                ) : (
                    <div className="h-28 mb-3 flex flex-col items-center justify-center text-[#31323E]/30 rounded-lg">
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

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then((res) => apiJson<SiteSettings>(res))
            .then((data) => {
                setSettings(data);
                setLoading(false);
            })
            .catch((error) => {
                console.error("Settings load failed", error);
                setLoading(false);
            });
    }, []);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (!settings) {
            return;
        }
        setSettings({ ...settings, [event.target.name]: event.target.value });
    };

    const handleFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>,
        fieldName: keyof SiteSettings
    ) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST",
                body: formData,
            });
            const data = await apiJson<{ url: string }>(response);
            setSettings((prev) => (prev ? { ...prev, [fieldName]: data.url } : null));
        } catch (error) {
            console.error("Upload error", error);
            alert(error instanceof Error ? error.message : "Failed to upload image.");
        } finally {
            event.target.value = "";
        }
    };

    const handleHeroFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setCropperImageSrc(URL.createObjectURL(file));
            setCropperOpen(true);
        }
        event.target.value = "";
    };

    const handleSaveCrops = async (desktopBlob: Blob, mobileBlob: Blob) => {
        try {
            const desktopForm = new FormData();
            desktopForm.append("file", desktopBlob, "homepage_hero_desktop.webp");
            const desktopResponse = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST",
                body: desktopForm,
            });
            const desktopData = await apiJson<{ url: string }>(desktopResponse);

            const mobileForm = new FormData();
            mobileForm.append("file", mobileBlob, "homepage_hero_mobile.webp");
            const mobileResponse = await apiFetch(`${getApiUrl()}/upload/image`, {
                method: "POST",
                body: mobileForm,
            });
            const mobileData = await apiJson<{ url: string }>(mobileResponse);

            setSettings((prev) =>
                prev
                    ? {
                          ...prev,
                          main_bg_desktop_url: desktopData.url,
                          main_bg_mobile_url: mobileData.url,
                      }
                    : null
            );
            setCropperOpen(false);
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc("");
        } catch (error) {
            console.error(error);
            alert(error instanceof Error ? error.message : "Upload failed");
        }
    };

    const handleSave = async () => {
        if (!settings) {
            return;
        }
        setSaving(true);
        try {
            const response = await apiFetch(`${getApiUrl()}/settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            await apiJson<SiteSettings>(response);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (error) {
            console.error("Save error", error);
            alert(error instanceof Error ? error.message : "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    if (loading || !settings) {
        return (
            <div className="flex items-center gap-3 py-10">
                <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">
                    Loading settings...
                </span>
            </div>
        );
    }

    const hasHeroPhoto = Boolean(settings.main_bg_desktop_url || settings.main_bg_mobile_url);

    return (
        <div className="space-y-8 max-w-3xl pb-12">
            <div className="flex justify-between items-start pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">
                        Global Settings
                    </h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Core configuration, artist profile, and homepage appearance
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
                    {saving ? "Saving..." : saved ? "Saved" : "Save Settings"}
                </button>
            </div>

            <SectionCard title="Artist Profile" desc="Text and contact info used across the site">
                <FieldGroup label="About the Artist">
                    <textarea
                        name="about_text"
                        value={settings.about_text || ""}
                        onChange={handleChange}
                        rows={5}
                        className={`${inp} resize-y leading-relaxed`}
                        placeholder="Enter short bio..."
                    />
                </FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <FieldGroup label="Contact Email">
                        <input
                            type="email"
                            name="contact_email"
                            value={settings.contact_email || ""}
                            onChange={handleChange}
                            className={inp}
                            placeholder="artist@example.com"
                        />
                    </FieldGroup>
                    <div className="md:col-span-2">
                        <FieldGroup label="Studio Address">
                            <textarea
                                name="studio_address"
                                value={settings.studio_address || ""}
                                onChange={handleChange}
                                rows={2}
                                className={`${inp} resize-none`}
                                placeholder={"Kiev, Ukraine\nBy appointment only"}
                            />
                        </FieldGroup>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title="Artist Photos" desc="Appears on Homepage and About page">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <PhotoUploadSlot
                        label="Homepage Photo"
                        url={settings.artist_home_photo_url}
                        onUpload={(event) => handleFileUpload(event, "artist_home_photo_url")}
                        onRemove={() =>
                            setSettings((prev) =>
                                prev ? { ...prev, artist_home_photo_url: null } : null
                            )
                        }
                    />
                    <PhotoUploadSlot
                        label="About Page Photo"
                        url={settings.artist_about_photo_url}
                        onUpload={(event) => handleFileUpload(event, "artist_about_photo_url")}
                        onRemove={() =>
                            setSettings((prev) =>
                                prev ? { ...prev, artist_about_photo_url: null } : null
                            )
                        }
                    />
                </div>
            </SectionCard>

            <SectionCard
                title="Homepage Hero Photo"
                desc="One static image for the homepage hero, cropped for desktop and mobile."
            >
                <div className="border border-[#31323E]/10 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div className="flex items-center justify-between px-4 py-3 bg-[#FAFAF9] border-b border-[#31323E]/8">
                        <span className="text-xs font-bold text-[#31323E] uppercase tracking-wider">
                            Main hero image{!hasHeroPhoto ? " (Required)" : ""}
                        </span>
                        {hasHeroPhoto ? (
                            <button
                                type="button"
                                onClick={() =>
                                    setSettings((prev) =>
                                        prev
                                            ? {
                                                  ...prev,
                                                  main_bg_desktop_url: null,
                                                  main_bg_mobile_url: null,
                                              }
                                            : null
                                    )
                                }
                                className="text-red-400 hover:text-red-600 text-[10px] font-bold uppercase tracking-wider transition-colors"
                            >
                                Remove
                            </button>
                        ) : null}
                    </div>
                    <div className="p-4">
                        {hasHeroPhoto ? (
                            <div className="flex gap-3 mb-4">
                                <div className="flex-1 flex flex-col items-center gap-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#31323E]/40">
                                        Desktop
                                    </span>
                                    {settings.main_bg_desktop_url ? (
                                        <img
                                            src={getImageUrl(settings.main_bg_desktop_url)}
                                            alt=""
                                            className="h-24 w-full object-cover rounded-lg border border-[#31323E]/10"
                                        />
                                    ) : (
                                        <div className="h-24 w-full bg-[#31323E]/5 rounded-lg flex items-center justify-center text-[#31323E]/20 text-xs">
                                            No desktop crop
                                        </div>
                                    )}
                                </div>
                                <div className="w-20 flex flex-col items-center gap-1.5">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#31323E]/40">
                                        Mobile
                                    </span>
                                    {settings.main_bg_mobile_url ? (
                                        <img
                                            src={getImageUrl(settings.main_bg_mobile_url)}
                                            alt=""
                                            className="h-24 w-14 object-cover rounded-lg border border-[#31323E]/10"
                                        />
                                    ) : (
                                        <div className="h-24 w-14 bg-[#31323E]/5 rounded-lg flex items-center justify-center text-[#31323E]/20 text-xs">
                                            -
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="h-28 mb-4 border border-dashed border-[#31323E]/15 rounded-lg flex flex-col items-center justify-center text-[#31323E]/25 bg-[#31323E]/2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider">
                                    No hero photo
                                </span>
                            </div>
                        )}
                        <label className="cursor-pointer flex items-center justify-center w-full bg-[#31323E] hover:bg-[#434455] text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg transition-colors shadow-sm">
                            {hasHeroPhoto ? "Replace Photo" : "Upload Photo"}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleHeroFileSelect}
                                className="hidden"
                            />
                        </label>
                    </div>
                </div>
            </SectionCard>

            <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full py-4 rounded-xl text-sm font-bold uppercase tracking-[0.15em] transition-colors shadow-md disabled:opacity-50 ${
                    saved ? "bg-emerald-500 text-white" : "bg-[#31323E] text-white hover:bg-[#434455]"
                }`}
            >
                {saving ? "Saving Changes..." : saved ? "Settings Saved" : "Save All Settings"}
            </button>

            {cropperOpen ? (
                <ImageCropperModal
                    isOpen={cropperOpen}
                    imageSrc={cropperImageSrc}
                    onClose={() => setCropperOpen(false)}
                    onSaveCrops={handleSaveCrops}
                />
            ) : null}
        </div>
    );
}
