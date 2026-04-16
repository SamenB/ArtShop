"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X } from "lucide-react";

interface ImageCropperModalProps {
    isOpen: boolean;
    imageSrc: string;
    onClose: () => void;
    onSaveCrops: (desktopBlob: Blob, mobileBlob: Blob) => Promise<void>;
}

export default function ImageCropperModal({ isOpen, imageSrc, onClose, onSaveCrops }: ImageCropperModalProps) {
    const [desktopCrop, setDesktopCrop] = useState({ x: 0, y: 0 });
    const [desktopZoom, setDesktopZoom] = useState(1);
    const [desktopCroppedArea, setDesktopCroppedArea] = useState<any>(null);

    const [mobileCrop, setMobileCrop] = useState({ x: 0, y: 0 });
    const [mobileZoom, setMobileZoom] = useState(1);
    const [mobileCroppedArea, setMobileCroppedArea] = useState<any>(null);

    const [activeTab, setActiveTab] = useState<"desktop" | "mobile">("desktop");
    const [saving, setSaving] = useState(false);

    const onDesktopCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setDesktopCroppedArea(croppedAreaPixels);
    }, []);

    const onMobileCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setMobileCroppedArea(croppedAreaPixels);
    }, []);

    const createImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const image = new Image();
            image.addEventListener("load", () => resolve(image));
            image.addEventListener("error", (error) => reject(error));
            image.setAttribute("crossOrigin", "anonymous");
            image.src = url;
        });

    const getCroppedImg = async (imageSrc: string, pixelCrop: any, format = "image/webp"): Promise<Blob> => {
        const image = await createImage(imageSrc);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) throw new Error("No 2d context available");

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
        );

        return new Promise((resolve, reject) => {
            canvas.toBlob((file) => {
                if (file) resolve(file);
                else reject(new Error("Canvas toBlob failed"));
            }, format, 0.98);
        });
    };

    const handleSave = async () => {
        if (!desktopCroppedArea || !mobileCroppedArea) return;
        setSaving(true);
        try {
            const desktopBlob = await getCroppedImg(imageSrc, desktopCroppedArea);
            const mobileBlob = await getCroppedImg(imageSrc, mobileCroppedArea);
            await onSaveCrops(desktopBlob, mobileBlob);
        } catch (e) {
            console.error("Failed to crop image", e);
            alert("Error cropping images.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-4xl h-[80vh] flex flex-col rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
                    <h2 className="text-2xl font-serif text-[#31323E] italic">Crop Background Image</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-[#31323E] transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex gap-4 p-4 border-b border-gray-100 bg-gray-50/50">
                    <button
                        onClick={() => setActiveTab("desktop")}
                        className={`px-5 py-2.5 text-[10px] font-bold font-mono tracking-widest uppercase transition-all rounded-full ${
                            activeTab === "desktop" 
                            ? "bg-[#31323E] text-white shadow-sm" 
                            : "bg-white border border-gray-200 text-zinc-500 hover:border-[#31323E] hover:text-[#31323E]"
                        }`}
                    >
                        Desktop (16:9)
                    </button>
                    <button
                        onClick={() => setActiveTab("mobile")}
                        className={`px-5 py-2.5 text-[10px] font-bold font-mono tracking-widest uppercase transition-all rounded-full ${
                            activeTab === "mobile" 
                            ? "bg-[#31323E] text-white shadow-sm" 
                            : "bg-white border border-gray-200 text-zinc-500 hover:border-[#31323E] hover:text-[#31323E]"
                        }`}
                    >
                        Mobile (9:16)
                    </button>
                    <div className="flex-1 text-right text-[11px] text-zinc-400 font-mono flex items-center justify-end font-medium">
                        Adjust both crops before saving.
                    </div>
                </div>

                <div className="relative flex-1 bg-gray-100">
                    {activeTab === "desktop" && (
                        <div className="absolute inset-0">
                            <Cropper
                                image={imageSrc}
                                crop={desktopCrop}
                                zoom={desktopZoom}
                                aspect={16 / 9}
                                onCropChange={setDesktopCrop}
                                onCropComplete={onDesktopCropComplete}
                                onZoomChange={setDesktopZoom}
                            />
                        </div>
                    )}
                    {activeTab === "mobile" && (
                        <div className="absolute inset-0">
                            <Cropper
                                image={imageSrc}
                                crop={mobileCrop}
                                zoom={mobileZoom}
                                aspect={9 / 16}
                                onCropChange={setMobileCrop}
                                onCropComplete={onMobileCropComplete}
                                onZoomChange={setMobileZoom}
                            />
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-white flex justify-between items-center">
                    <div className="w-1/2 flex items-center gap-4 text-[11px] font-bold font-mono tracking-widest text-[#31323E] uppercase">
                        <span>Zoom</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={activeTab === "desktop" ? desktopZoom : mobileZoom}
                            onChange={(e) => {
                                const val = Number(e.target.value);
                                if (activeTab === "desktop") setDesktopZoom(val);
                                else setMobileZoom(val);
                            }}
                            className="flex-1 accent-black h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3.5 bg-[#31323E] text-white font-mono text-[11px] font-bold tracking-widest uppercase rounded-lg hover:bg-[#434455] transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {saving ? "Processing..." : "Save Crops"}
                    </button>
                </div>
            </div>
        </div>
    );
}
