"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getApiUrl, getImageUrl, apiFetch } from "@/utils";
import SimpleArtworkCropperModal from "./SimpleArtworkCropperModal";

interface ArtworkImage { thumb: string; medium: string; original: string; }
type ImageEntry = string | ArtworkImage;

interface Artwork {
    id: number;
    title: string;
    original_price: number;
    images?: ImageEntry[];
    description?: string;
    has_prints?: boolean;
    orientation?: string;
    base_print_price?: number;
    labels?: { id: number; title: string; category_id?: number }[];
}


interface Label { id: number; title: string; category_id?: number; }
interface LabelCategory { id: number; title: string; accent_color?: string; }

const STATUS_OPTIONS = [
    { value: "available", label: "Available" },
    { value: "sold", label: "Sold" },
    { value: "reserved", label: "Reserved" },
    { value: "not_for_sale", label: "Not for Sale" },
    { value: "on_exhibition", label: "On Exhibition" },
    { value: "archived", label: "Archived" },
    { value: "digital", label: "Digital" },
];

interface DragItem {
    type: "existing" | "new";
    url: string;
    existingData?: ImageEntry;
    file?: File;
}

function ImageReorderGrid({
    items,
    onReorder,
    onRemove,
    onAddFiles,
    onCropClick,
    maxItems = 10,
}: {
    items: DragItem[];
    onReorder: (next: DragItem[]) => void;
    onRemove: (idx: number) => void;
    onAddFiles: (files: File[]) => void;
    onCropClick?: (idx: number) => void;
    maxItems?: number;
}) {
    const dragIdx = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragStart = (idx: number) => { dragIdx.current = idx; };
    const handleDrop = (idx: number) => {
        if (dragIdx.current === null || dragIdx.current === idx) return;
        const next = [...items];
        const [moved] = next.splice(dragIdx.current, 1);
        next.splice(idx, 0, moved);
        onReorder(next);
        dragIdx.current = null;
    };

    return (
        <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "12px" }}>
                {items.map((item, i) => (
                    <div
                        key={i}
                        draggable
                        onDragStart={() => handleDragStart(i)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        style={{
                            position: "relative", width: "100px", height: "100px",
                            border: "1px solid rgba(0,0,0,0.1)", borderRadius: "6px",
                            overflow: "hidden", cursor: "grab", flexShrink: 0,
                            boxShadow: i === 0 ? "0 0 0 2px #111" : "none",
                            transition: "box-shadow 0.2s",
                        }}
                    >
                        <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                        {i === 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "#111", color: "#fff", fontSize: "8px", padding: "3px 6px", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottomRightRadius: "4px" }}>
                                Cover
                            </div>
                        )}
                        {i > 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "rgba(255,255,255,0.8)", color: "#111", fontSize: "8px", padding: "3px 6px", fontFamily: "var(--font-mono)", borderBottomRightRadius: "4px", fontWeight: 600 }}>
                                #{i + 1}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(i); }}
                            style={{ position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "rgba(239,68,68,1)", border: "none", color: "#fff", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                            title="Remove"
                        >×</button>
                        {item.type === "new" && onCropClick && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCropClick(i); }}
                                style={{ position: "absolute", bottom: "4px", right: "4px", width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.9)", border: "none", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                title="Crop Image"
                            >◩</button>
                        )}
                    </div>
                ))}

                {items.length < maxItems && (
                    <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); inputRef.current?.click(); }}
                        style={{ width: "100px", height: "100px", border: "1px dashed rgba(0,0,0,0.2)", borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.02)", color: "rgba(0,0,0,0.4)", fontSize: "2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.5)"; e.currentTarget.style.color = "rgba(0,0,0,0.7)"; e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.04)" }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.2)"; e.currentTarget.style.color = "rgba(0,0,0,0.4)"; e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.02)" }}
                    >+</button>
                )}
                <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }}
                    onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
                    onChange={e => {
                        const files = Array.from(e.target.files || []).slice(0, maxItems - items.length);
                        if (files.length > 0) onAddFiles(files);
                        (e.target as HTMLInputElement).value = "";
                    }}
                />
            </div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "0.6rem", color: "rgba(0,0,0,0.5)", marginTop: "8px", letterSpacing: "0.05em" }}>
                Drag to reorder · First image is cover · Up to {maxItems} photos
            </p>
        </div>
    );
}

function LabelMultiSelect({ labels, selected, onChange, placeholder }: {
    labels: Label[];
    selected: number[];
    onChange: (ids: number[]) => void;
    placeholder: string;
}) {
    const toggle = (id: number) =>
        onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {labels.map(t => {
                const active = selected.includes(t.id);
                return (
                    <button key={t.id} type="button" onClick={() => toggle(t.id)}
                        style={{
                            padding: "4px 10px", borderRadius: "20px",
                            border: `1px solid ${active ? "#111" : "rgba(0,0,0,0.1)"}`,
                            backgroundColor: active ? "#111" : "#f4f4f5",
                            color: active ? "#fff" : "#52525b",
                            fontFamily: "var(--font-sans)", fontSize: "0.72rem",
                            cursor: "pointer", transition: "all 0.15s",
                            fontWeight: active ? 500 : 400
                        }}>
                        {t.title}
                    </button>
                );
            })}
            {labels.length === 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.65rem", color: "rgba(0,0,0,0.4)", fontStyle: "italic" }}>
                    {placeholder}
                </span>
            )}
        </div>
    );
}

function FieldLabel({ text, required = false, valid = true }: { text: string; required?: boolean; valid?: boolean }) {
    return (
        <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full shrink-0 ${valid ? "bg-green-500" : "bg-orange-500"}`} />
            <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest font-semibold">
                {text} {required && "*"}
            </label>
        </div>
    );
}

function FormSection({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-4 mb-5">
            <h3 className="text-lg font-serif italic text-[#31323E] shrink-0">{title}</h3>
            <div className="flex-1 h-px bg-zinc-200"></div>
        </div>
    );
}

export default function ArtworksTab() {
    const [artworks, setArtworks] = useState<Artwork[]>([]);
    const [categories, setCategories] = useState<LabelCategory[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [imageItems, setImageItems] = useState<DragItem[]>([]);
    const [cropImageIndex, setCropImageIndex] = useState<number | null>(null);

    const defaultForm = {
        title: "",
        description: "",
        materials: "",
        year: new Date().getFullYear(),
        width_cm: "" as string | number,
        height_cm: "" as string | number,
        original_price: 1000,
        has_prints: false,
        orientation: "Horizontal",
        base_print_price: 100,
        labels: [] as number[],
        original_status: "available",
    };
    const [formData, setFormData] = useState<any>(defaultForm);

    const resolveImageUrl = useCallback((img: ImageEntry): string => {
        if (typeof img === "string") return img.startsWith("http") ? img : `${getApiUrl().replace("/api", "")}${img}`;
        return getImageUrl(img, "thumb") || "";
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artRes, catRes, lblRes] = await Promise.all([
                apiFetch(`${getApiUrl()}/artworks?limit=100`),
                apiFetch(`${getApiUrl()}/labels/categories`),
                apiFetch(`${getApiUrl()}/labels`),
            ]);
            if (artRes.ok) { const d = await artRes.json(); setArtworks(d.items || d); }
            if (catRes.ok) { const d = await catRes.json(); setCategories(d); }
            if (lblRes.ok) { const d = await lblRes.json(); setLabels(d); }
        } catch (e) { console.error("Fetch error:", e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const addFiles = (files: File[]) => {
        const newItems: DragItem[] = files.map(f => ({
            type: "new", url: URL.createObjectURL(f), file: f,
        }));
        setImageItems(prev => [...prev, ...newItems].slice(0, 10));
    };

    const removeImage = (idx: number) => setImageItems(prev => prev.filter((_, i) => i !== idx));

    const handleSaveCrop = async (croppedBlob: Blob) => {
        if (cropImageIndex === null) return;
        const newFile = new File([croppedBlob], `cropped-${Date.now()}.webp`, { type: "image/webp" });
        setImageItems(prev => {
            const next = [...prev];
            next[cropImageIndex] = {
                type: "new",
                url: URL.createObjectURL(newFile),
                file: newFile,
            };
            return next;
        });
        setCropImageIndex(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.title?.trim()) return alert("Title is required.");
        if (formData.original_status === "available" && Number(formData.original_price) <= 0) return alert("Original Price is required and must be > 0 when status is Available.");
        if (formData.has_prints && Number(formData.base_print_price) <= 0) return alert("Base Print Price is required and must be > 0 when Prints are available.");
        if (imageItems.length === 0) return alert("At least one photo is required.");

        setUploading(true);
        const apiUrl = getApiUrl();
        const payload = { ...formData };
        if (payload.width_cm) payload.width_in = Number((parseFloat(payload.width_cm) * 0.393701).toFixed(2));
        if (payload.height_cm) payload.height_in = Number((parseFloat(payload.height_cm) * 0.393701).toFixed(2));

        if (payload.original_status !== "available") payload.original_price = null;
        if (!payload.has_prints) payload.base_print_price = null;
        
        if (payload.original_status === "digital") {
            payload.width_cm = null;
            payload.height_cm = null;
            payload.width_in = null;
            payload.height_in = null;
        } else {
            if (!payload.width_cm || payload.width_cm === "") {
                payload.width_cm = null;
                payload.width_in = null;
            }
            if (!payload.height_cm || payload.height_cm === "") {
                payload.height_cm = null;
                payload.height_in = null;
            }
        }

        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `${apiUrl}/artworks/${editingId}` : `${apiUrl}/artworks`;

        try {
            const res = await apiFetch(url, {
                method, headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(`Save failed: ${res.status} ${JSON.stringify(err)}`);
                return;
            }

            const data = await res.json();
            const targetId = editingId || data.data?.id;

            if (editingId) {
                const existingOrdered = imageItems
                    .filter(it => it.type === "existing")
                    .map(it => it.existingData!);
                await apiFetch(`${apiUrl}/artworks/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ images: existingOrdered }),
                });
            }

            const newFiles = imageItems.filter(it => it.type === "new" && it.file).map(it => it.file!);
            if (newFiles.length > 0 && targetId) {
                const fd = new FormData();
                newFiles.forEach(f => fd.append("files", f));
                await apiFetch(`${apiUrl}/artworks/${targetId}/images`, { method: "POST", body: fd });
            }

            alert(`Artwork ${editingId ? "updated" : "created"}! Images processing in background.`);
            setIsFormOpen(false);
            setEditingId(null);
            setImageItems([]);
            setFormData({ ...defaultForm });
            fetchData();
        } catch (err: any) {
            alert(`Network error: ${err.message}`);
        } finally {
            setUploading(false);
        }
    };

    const handleEditClick = async (art: Artwork) => {
        try {
            const res = await apiFetch(`${getApiUrl()}/artworks/${art.id}`);
            if (!res.ok) return;
            const full = await res.json();
            setFormData({
                title: full.title || "",
                description: full.description || "",
                materials: full.materials || "",
                year: full.year || new Date().getFullYear(),
                width_cm: full.width_cm || "",
                height_cm: full.height_cm || "",
                original_price: full.original_price || 0,
                has_prints: full.has_prints || false,
                orientation: full.orientation || "Horizontal",
                base_print_price: full.base_print_price || 0,
                labels: (full.labels || []).map((t: any) => typeof t === "number" ? t : t.id),
                original_status: full.original_status || "available",
            });
            const existing: DragItem[] = (full.images || []).map((img: ImageEntry) => ({
                type: "existing" as const,
                url: resolveImageUrl(img),
                existingData: img,
            }));
            setImageItems(existing);
            setEditingId(full.id);
            setIsFormOpen(true);
        } catch (e) {
            console.error(e);
            alert("Error loading artwork details.");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this artwork?")) return;
        const res = await apiFetch(`${getApiUrl()}/artworks/${id}`, { method: "DELETE" });
        if (res.ok) setArtworks(artworks.filter(a => a.id !== id));
        else alert("Delete failed");
    };

    const inp = "w-full bg-white border border-gray-200 rounded-md p-3 text-sm text-[#31323E] focus:outline-none focus:border-[#31323E] focus:ring-1 focus:ring-black placeholder-gray-400 transition-all";

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Synchronizing catalog database...</div>;

    return (
        <div className="space-y-6 text-[#31323E]">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-serif italic text-[#31323E]">Artworks ({artworks.length})</h2>
                <button
                    onClick={() => {
                        if (isFormOpen) { setIsFormOpen(false); setEditingId(null); setFormData({ ...defaultForm }); setImageItems([]); }
                        else setIsFormOpen(true);
                    }}
                    className="px-5 py-2.5 bg-[#31323E] text-white hover:bg-[#434455] rounded-full font-mono text-xs uppercase tracking-widest transition-colors font-medium shadow-sm"
                >
                    {isFormOpen ? "Cancel" : "Add New Artwork"}
                </button>
            </div>

            {isFormOpen && (
                <form onSubmit={handleCreate} className="p-8 border border-gray-100 bg-gray-50 rounded-2xl shadow-sm space-y-8 mb-10">
                    <div>
                        <FormSection title="Identity" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                            <div>
                                <FieldLabel text="Title" required valid={formData.title?.trim().length > 0} />
                                <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inp} placeholder="Artwork title" />
                            </div>
                            <div>
                                <FieldLabel text="Year" valid={!!formData.year} />
                                <input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: Number(e.target.value) })} className={inp} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <FormSection title="Classification" />
                            <div>
                                <FieldLabel text="Orientation" valid={!!formData.orientation} />
                                <select value={formData.orientation} onChange={e => setFormData({ ...formData, orientation: e.target.value })} className={inp}>
                                    <option value="Horizontal">Horizontal</option>
                                    <option value="Vertical">Vertical</option>
                                    <option value="Square">Square</option>
                                </select>
                            </div>
                    </div>

                    <div>
                        <FormSection title="Original" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                            <div>
                                <FieldLabel text="Status" required valid={!!formData.original_status} />
                                <select value={formData.original_status} onChange={e => setFormData({ ...formData, original_status: e.target.value })} className={inp}>
                                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            {formData.original_status === "available" && (
                                <div>
                                    <FieldLabel text="Original Price ($)" required valid={Number(formData.original_price) > 0} />
                                    <input type="number" value={formData.original_price || ""} onChange={e => setFormData({ ...formData, original_price: Number(e.target.value) })} className={inp} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <FormSection title="Prints" />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4 h-full">
                            <div className="flex flex-col justify-end">
                                <FieldLabel text="Prints Available" valid={true} />
                                <select value={formData.has_prints ? "yes" : "no"} onChange={e => setFormData({ ...formData, has_prints: e.target.value === "yes" })} className={inp}>
                                    <option value="yes">Available</option>
                                    <option value="no">Not Available</option>
                                </select>
                            </div>
                            {formData.has_prints && (
                                <div>
                                    <FieldLabel text="Base Print Price ($)" required valid={Number(formData.base_print_price) > 0} />
                                    <input type="number" value={formData.base_print_price || ""} onChange={e => setFormData({ ...formData, base_print_price: Number(e.target.value) })} className={inp} />
                                </div>
                            )}
                        </div>
                    </div>

                    {formData.original_status !== "digital" && (
                        <div>
                            <FormSection title="Dimensions (cm)" />
                            <div className="grid grid-cols-2 gap-6 mt-4">
                                <div>
                                    <FieldLabel text="Width" valid={!!formData.width_cm} />
                                    <input type="number" step="0.1" value={formData.width_cm} onChange={e => setFormData({ ...formData, width_cm: e.target.value })} className={inp} />
                                </div>
                                <div>
                                    <FieldLabel text="Height" valid={!!formData.height_cm} />
                                    <input type="number" step="0.1" value={formData.height_cm} onChange={e => setFormData({ ...formData, height_cm: e.target.value })} className={inp} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <FormSection title="Labels & Categorization" />
                        {categories.map(cat => {
                            const catLabels = labels.filter(l => l.category_id === cat.id);
                            return (
                                <div key={cat.id} className="mt-4">
                                    <FieldLabel text={cat.title} valid={formData.labels?.some((l: number) => catLabels.find(cl => cl.id === l))} />
                                    <LabelMultiSelect
                                        labels={catLabels}
                                        selected={formData.labels}
                                        onChange={ids => setFormData({ ...formData, labels: ids })}
                                        placeholder={`No ${cat.title} labels yet — create them in the Labels tab.`}
                                    />
                                </div>
                            );
                        })}
                        <div className="mt-4">
                            <FieldLabel text="Description" valid={formData.description?.trim().length > 0} />
                            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={4} className={inp} placeholder="Artwork description..." />
                        </div>
                    </div>

                    <div>
                        <FormSection title="Photos (up to 10)" />
                        <ImageReorderGrid
                            items={imageItems}
                            onReorder={setImageItems}
                            onRemove={removeImage}
                            onAddFiles={addFiles}
                            onCropClick={(idx) => setCropImageIndex(idx)}
                            maxItems={10}
                        />
                    </div>

                    <button type="submit" disabled={uploading} className="w-full bg-[#31323E] text-white py-3.5 rounded-md uppercase tracking-widest font-mono text-sm font-semibold disabled:opacity-50 hover:bg-[#434455] transition-colors shadow-lg shadow-black/10">
                        {uploading ? "Saving Asset..." : editingId ? "Update Artwork" : "Create Artwork"}
                    </button>
                </form>
            )}

            <SimpleArtworkCropperModal
                isOpen={cropImageIndex !== null}
                imageSrc={cropImageIndex !== null && imageItems[cropImageIndex]?.url ? imageItems[cropImageIndex].url : ""}
                onClose={() => setCropImageIndex(null)}
                onSaveCrop={handleSaveCrop}
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
                {artworks.map(art => (
                    <div key={art.id} className="border border-gray-100 p-3 rounded-xl relative group bg-white shadow-sm hover:shadow-md transition-shadow">
                        <div className="aspect-4/5 bg-gray-100 mb-4 overflow-hidden rounded-lg relative">
                            {art.images && art.images.length > 0 ? (
                                <img src={getImageUrl(art.images[0], "thumb")} alt={art.title} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-mono bg-gray-50">Image Missing</div>
                            )}
                        </div>
                        <div className="px-1">
                            <h3 className="font-serif italic text-lg text-[#31323E] truncate">{art.title}</h3>
                            <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest mt-1">${art.original_price}</p>
                        </div>
                        <div className="absolute top-5 right-5 flex gap-2">
                            <button onClick={() => handleEditClick(art)} className="bg-black/80 backdrop-blur text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-[#31323E] font-semibold shadow-sm">Edit</button>
                            <button onClick={() => handleDelete(art.id)} className="bg-red-500/90 backdrop-blur text-white text-[10px] font-mono px-3 py-1.5 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-500 font-semibold shadow-sm">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
