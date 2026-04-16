"use client";

import React, { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X } from "lucide-react";

interface SimpleArtworkCropperModalProps {
    isOpen: boolean;
    imageSrc: string;
    onClose: () => void;
    onSaveCrop: (croppedBlob: Blob) => Promise<void>;
}

const ASPECT_RATIOS = [
    { label: "1:1 (Square)", value: 1 },
    { label: "4:5 (Vertical)", value: 4 / 5 },
    { label: "5:4 (Landscape)", value: 5 / 4 },
    { label: "3:4 (Vertical)", value: 3 / 4 },
    { label: "4:3 (Landscape)", value: 4 / 3 },
    { label: "16:9 (Landscape)", value: 16 / 9 },
    { label: "9:16 (Vertical)", value: 9 / 16 },
];

export default function SimpleArtworkCropperModal({ isOpen, imageSrc, onClose, onSaveCrop }: SimpleArtworkCropperModalProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [aspect, setAspect] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [saving, setSaving] = useState(false);

    const onCropComplete = useCallback((_croppedArea: any, currentCroppedAreaPixels: any) => {
        setCroppedAreaPixels(currentCroppedAreaPixels);
    }, []);

    const createImage = (url: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const image = new Image();
            image.addEventListener("load", () => resolve(image));
            image.addEventListener("error", (error) => reject(error));
            image.setAttribute("crossOrigin", "anonymous");
            image.src = url;
        });

    const getCroppedImg = async (src: string, pixelCrop: any, format = "image/webp"): Promise<Blob> => {
        const image = await createImage(src);
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
                else reject(new Error("Blob generation failed"));
            }, format, 0.98); 
        });
    };

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        setSaving(true);
        try {
            const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
            await onSaveCrop(blob);
        } catch (e) {
            console.error("Failed to crop image", e);
            alert("Error cropping image.");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-4xl h-[85vh] flex flex-col rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white">
                    <h2 className="text-2xl font-serif text-[#31323E] italic">Crop Artwork Photo</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-[#31323E] transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2.5 p-4 border-b border-gray-100 bg-gray-50/50">
                    <span className="text-zinc-500 font-mono text-[10px] uppercase font-bold tracking-widest flex items-center mr-2">Aspect Ratio:</span>
                    {ASPECT_RATIOS.map((ar) => (
                        <button
                            key={ar.label}
                            onClick={() => setAspect(ar.value)}
                            className={`px-3 py-1.5 text-[10px] font-bold font-mono tracking-widest uppercase transition-all rounded ${
                                aspect === ar.value 
                                ? "bg-[#31323E] text-white shadow-sm" 
                                : "bg-white border border-gray-200 text-zinc-500 hover:border-[#31323E] hover:text-[#31323E]"
                            }`}
                        >
                            {ar.label}
                        </button>
                    ))}
                </div>

                <div className="relative flex-1 bg-gray-100">
                    <div className="absolute inset-0">
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspect}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 bg-white flex justify-between items-center">
                    <div className="w-1/2 flex items-center gap-4 text-[11px] font-bold font-mono tracking-widest text-[#31323E] uppercase">
                        <span>Zoom</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="flex-1 accent-black h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-3.5 bg-[#31323E] text-white font-mono text-[11px] font-bold tracking-widest uppercase rounded-lg hover:bg-[#434455] transition-colors disabled:opacity-50 shadow-sm"
                    >
                        {saving ? "Processing..." : "Save Crop"}
                    </button>
                </div>
            </div>
        </div>
    );
}
