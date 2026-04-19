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
    has_original?: boolean;
    has_canvas_print?: boolean;
    has_canvas_print_limited?: boolean;
    has_paper_print?: boolean;
    has_paper_print_limited?: boolean;
    canvas_print_limited_quantity?: number | null;
    paper_print_limited_quantity?: number | null;
    print_aspect_ratio_id?: number | null;
    print_min_size_label?: string | null;
    print_max_size_label?: string | null;
    orientation?: string;
    print_quality_url?: string | null;
    labels?: { id: number; title: string; category_id?: number }[];
}

interface AspectRatio { id: number; label: string; description: string | null; }

interface Label { id: number; title: string; category_id?: number; }
interface LabelCategory { id: number; title: string; accent_color?: string; }

const STATUS_OPTIONS = [
    { value: "available",     label: "Available" },
    { value: "sold",          label: "Sold" },
    { value: "reserved",      label: "Reserved" },
    { value: "not_for_sale",  label: "Not for Sale" },
    { value: "on_exhibition", label: "On Exhibition" },
    { value: "archived",      label: "Archived" },
    { value: "digital",       label: "Digital" },
];

interface DragItem {
    type: "existing" | "new";
    url: string;
    existingData?: ImageEntry;
    file?: File;
}

// ── Shared Input Style ────────────────────────────────────────────────────────

const inp = "w-full bg-white border border-[#31323E]/15 rounded-lg px-3.5 py-2.5 text-sm font-medium text-[#31323E] focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all shadow-sm";

// ── Image Reorder Grid ────────────────────────────────────────────────────────

function ImageReorderGrid({ items, onReorder, onRemove, onAddFiles, onCropClick, maxItems = 10 }: {
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
                    <div key={i} draggable onDragStart={() => handleDragStart(i)} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(i)}
                        style={{
                            position: "relative", width: "100px", height: "100px",
                            border: i === 0 ? "2px solid #31323E" : "1px solid rgba(0,0,0,0.1)",
                            borderRadius: "10px", overflow: "hidden", cursor: "grab", flexShrink: 0,
                            transition: "box-shadow 0.2s",
                        }}>
                        <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                        {i === 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "#31323E", color: "#fff", fontSize: "8px", padding: "3px 7px", fontFamily: "var(--font-sans)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>
                                Cover
                            </div>
                        )}
                        {i > 0 && (
                            <div style={{ position: "absolute", top: 0, left: 0, backgroundColor: "rgba(255,255,255,0.85)", color: "#31323E", fontSize: "8px", padding: "3px 7px", fontFamily: "var(--font-sans)", fontWeight: 700 }}>
                                #{i + 1}
                            </div>
                        )}
                        <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); onRemove(i); }}
                            style={{ position: "absolute", top: "4px", right: "4px", width: "20px", height: "20px", borderRadius: "50%", backgroundColor: "rgba(239,68,68,1)", border: "none", color: "#fff", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                            title="Remove">×</button>
                        {item.type === "new" && onCropClick && (
                            <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); onCropClick(i); }}
                                style={{ position: "absolute", bottom: "4px", right: "4px", width: "22px", height: "22px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.85)", border: "none", color: "#fff", fontSize: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                                title="Crop Image">◩</button>
                        )}
                    </div>
                ))}
                {items.length < maxItems && (
                    <button type="button" onClick={e => { e.preventDefault(); inputRef.current?.click(); }}
                        style={{ width: "100px", height: "100px", border: "1.5px dashed rgba(49,50,62,0.2)", borderRadius: "10px", backgroundColor: "rgba(49,50,62,0.02)", color: "rgba(49,50,62,0.3)", fontSize: "2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(49,50,62,0.5)"; e.currentTarget.style.color = "rgba(49,50,62,0.7)"; e.currentTarget.style.backgroundColor = "rgba(49,50,62,0.04)" }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(49,50,62,0.2)"; e.currentTarget.style.color = "rgba(49,50,62,0.3)"; e.currentTarget.style.backgroundColor = "rgba(49,50,62,0.02)" }}
                    >+</button>
                )}
                <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }}
                    onClick={e => { (e.target as HTMLInputElement).value = ""; }}
                    onChange={e => {
                        const files = Array.from(e.target.files || []).slice(0, maxItems - items.length);
                        if (files.length > 0) onAddFiles(files);
                        (e.target as HTMLInputElement).value = "";
                    }}
                />
            </div>
            <p className="text-[10px] font-semibold text-[#31323E]/40 mt-2.5 tracking-wider">
                Drag to reorder · First image is cover · Up to {maxItems} photos
            </p>
        </div>
    );
}

// ── Label Multi Select ────────────────────────────────────────────────────────

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
                            padding: "5px 12px", borderRadius: "20px",
                            border: `1px solid ${active ? "#31323E" : "rgba(49,50,62,0.12)"}`,
                            backgroundColor: active ? "#31323E" : "#fff",
                            color: active ? "#fff" : "#52525b",
                            fontFamily: "var(--font-sans)", fontSize: "0.72rem",
                            cursor: "pointer", transition: "all 0.15s",
                            fontWeight: active ? 700 : 500,
                        }}>
                        {t.title}
                    </button>
                );
            })}
            {labels.length === 0 && (
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", color: "rgba(49,50,62,0.35)", fontStyle: "italic" }}>
                    {placeholder}
                </span>
            )}
        </div>
    );
}

// ── Form Section Components ───────────────────────────────────────────────────

function FormSection({ title, desc }: { title: string; desc?: string }) {
    return (
        <div className="mb-5">
            <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#31323E] flex-shrink-0">{title}</h3>
                <div className="flex-1 h-px bg-[#31323E]/8" />
            </div>
            {desc && <p className="text-xs text-[#31323E]/40 font-medium">{desc}</p>}
        </div>
    );
}

function FieldLabel({ text, required = false, valid = true }: { text: string; required?: boolean; valid?: boolean }) {
    return (
        <div className="flex items-center gap-1.5 mb-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${valid ? "bg-emerald-400" : "bg-amber-400"}`} />
            <label className="block text-[11px] uppercase font-bold text-[#31323E]/60 tracking-[0.12em]">
                {text} {required && "*"}
            </label>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

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
    const [printUploading, setPrintUploading] = useState(false);
    const [printUploadError, setPrintUploadError] = useState<string | null>(null);
    const printFileRef = useRef<HTMLInputElement>(null);

    const defaultForm = {
        title: "",
        description: "",
        year: new Date().getFullYear(),
        width_cm: "" as string | number,
        height_cm: "" as string | number,
        original_price: 1000,
        has_original: false,
        has_canvas_print: false,
        has_canvas_print_limited: false,
        has_paper_print: false,
        has_paper_print_limited: false,
        canvas_print_limited_quantity: "" as string | number,
        paper_print_limited_quantity: "" as string | number,
        print_aspect_ratio_id: null as number | null,
        print_min_size_label: "",
        print_max_size_label: "",
        orientation: "Horizontal",
        labels: [] as number[],
        original_status: "available",
        print_quality_url: "",
    };
    const [formData, setFormData] = useState<any>(defaultForm);
    const [aspectRatios, setAspectRatios] = useState<AspectRatio[]>([]);

    const resolveImageUrl = useCallback((img: ImageEntry): string => {
        if (typeof img === "string") return img.startsWith("http") ? img : `${getApiUrl().replace("/api", "")}${img}`;
        return getImageUrl(img, "thumb") || "";
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [artRes, catRes, lblRes, ratioRes] = await Promise.all([
                apiFetch(`${getApiUrl()}/artworks?limit=100`),
                apiFetch(`${getApiUrl()}/labels/categories`),
                apiFetch(`${getApiUrl()}/labels`),
                apiFetch(`${getApiUrl()}/print-pricing/aspect-ratios`),
            ]);
            if (artRes.ok) { const d = await artRes.json(); setArtworks(d.items || d); }
            if (catRes.ok) { const d = await catRes.json(); setCategories(d); }
            if (lblRes.ok) { const d = await lblRes.json(); setLabels(d); }
            if (ratioRes.ok) { const d = await ratioRes.json(); setAspectRatios(d); }
        } catch (e) { console.error("Fetch error:", e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const addFiles = (files: File[]) => {
        const newItems: DragItem[] = files.map(f => ({ type: "new", url: URL.createObjectURL(f), file: f }));
        setImageItems(prev => [...prev, ...newItems].slice(0, 10));
    };

    const removeImage = (idx: number) => setImageItems(prev => prev.filter((_, i) => i !== idx));

    const handleSaveCrop = async (croppedBlob: Blob) => {
        if (cropImageIndex === null) return;
        const newFile = new File([croppedBlob], `cropped-${Date.now()}.webp`, { type: "image/webp" });
        setImageItems(prev => {
            const next = [...prev];
            next[cropImageIndex] = { type: "new", url: URL.createObjectURL(newFile), file: newFile };
            return next;
        });
        setCropImageIndex(null);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title?.trim()) return alert("Title is required.");
        if (formData.original_status === "available" && Number(formData.original_price) <= 0) return alert("Original Price is required and must be > 0.");
        if (imageItems.length === 0) return alert("At least one photo is required.");

        setUploading(true);
        const apiUrl = getApiUrl();
        const payload = { ...formData };
        
        // Helper to convert empty strings to null or parse as number
        const toNum = (val: any, isFloat = false) => {
            if (val === "" || val === null || val === undefined) return null;
            const parsed = isFloat ? parseFloat(val.toString()) : parseInt(val.toString());
            return isNaN(parsed) ? null : parsed;
        };

        payload.original_price = toNum(payload.original_price);
        payload.year = toNum(payload.year);
        payload.width_cm = toNum(payload.width_cm, true);
        payload.height_cm = toNum(payload.height_cm, true);
        payload.canvas_print_limited_quantity = toNum(payload.canvas_print_limited_quantity);
        payload.paper_print_limited_quantity = toNum(payload.paper_print_limited_quantity);
        payload.print_aspect_ratio_id = toNum(payload.print_aspect_ratio_id);

        // Recalculate inches if cm is valid
        if (payload.width_cm !== null) payload.width_in = Number((payload.width_cm * 0.393701).toFixed(2));
        else payload.width_in = null;

        if (payload.height_cm !== null) payload.height_in = Number((payload.height_cm * 0.393701).toFixed(2));
        else payload.height_in = null;

        if (payload.original_status !== "available") payload.original_price = null;
        if (payload.original_status === "digital") {
            payload.width_cm = null; payload.height_cm = null; payload.width_in = null; payload.height_in = null;
        }

        const method = editingId ? "PUT" : "POST";
        const url = editingId ? `${apiUrl}/artworks/${editingId}` : `${apiUrl}/artworks`;

        try {
            const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!res.ok) { const err = await res.json().catch(() => ({})); alert(`Save failed: ${res.status} ${JSON.stringify(err)}`); return; }
            const data = await res.json();
            const targetId = editingId || data.data?.id;

            if (editingId) {
                const existingOrdered = imageItems.filter(it => it.type === "existing").map(it => it.existingData!);
                await apiFetch(`${apiUrl}/artworks/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: existingOrdered }) });
            }

            const newFiles = imageItems.filter(it => it.type === "new" && it.file).map(it => it.file!);
            if (newFiles.length > 0 && targetId) {
                const fd = new FormData();
                newFiles.forEach(f => fd.append("files", f));
                await apiFetch(`${apiUrl}/artworks/${targetId}/images`, { method: "POST", body: fd });
            }

            alert(`Artwork ${editingId ? "updated" : "created"}! Images processing in background.`);
            setIsFormOpen(false); setEditingId(null); setImageItems([]); setFormData({ ...defaultForm }); fetchData();
        } catch (err: any) {
            alert(`Network error: ${err.message}`);
        } finally { setUploading(false); }
    };

    const handleEditClick = async (art: Artwork) => {
        try {
            const res = await apiFetch(`${getApiUrl()}/artworks/${art.id}`);
            if (!res.ok) return;
            const full = await res.json();
            setFormData({
                title: full.title || "", description: full.description || "",
                year: full.year || new Date().getFullYear(),
                width_cm: full.width_cm || "", height_cm: full.height_cm || "",
                original_price: full.original_price || 0,
                has_original: full.has_original || false,
                has_canvas_print: full.has_canvas_print || false, has_canvas_print_limited: full.has_canvas_print_limited || false,
                has_paper_print: full.has_paper_print || false, has_paper_print_limited: full.has_paper_print_limited || false,
                canvas_print_limited_quantity: full.canvas_print_limited_quantity || "",
                paper_print_limited_quantity: full.paper_print_limited_quantity || "",
                print_aspect_ratio_id: full.print_aspect_ratio_id || null,
                print_min_size_label: full.print_min_size_label || "",
                print_max_size_label: full.print_max_size_label || "",
                orientation: full.orientation || "Horizontal",
                labels: (full.labels || []).map((t: any) => typeof t === "number" ? t : t.id),
                original_status: full.original_status || "available",
                print_quality_url: full.print_quality_url || "",
            });
            const existing: DragItem[] = (full.images || []).map((img: ImageEntry) => ({ type: "existing" as const, url: resolveImageUrl(img), existingData: img }));
            setImageItems(existing);
            setEditingId(full.id);
            setIsFormOpen(true);
        } catch (e) { console.error(e); alert("Error loading artwork details."); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Delete this artwork?")) return;
        const res = await apiFetch(`${getApiUrl()}/artworks/${id}`, { method: "DELETE" });
        if (res.ok) setArtworks(artworks.filter(a => a.id !== id));
        else alert("Delete failed");
    };

    if (loading) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Synchronizing catalog…</span>
        </div>
    );

    return (
        <div className="space-y-8 text-[#31323E]">
            {/* ── Header ─────────────────────────────────── */}
            <div className="flex justify-between items-start pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Artworks</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        {artworks.length} work{artworks.length !== 1 ? "s" : ""} in the catalog
                    </p>
                </div>
                <button
                    onClick={() => {
                        if (isFormOpen) { setIsFormOpen(false); setEditingId(null); setFormData({ ...defaultForm }); setImageItems([]); }
                        else setIsFormOpen(true);
                    }}
                    className={`px-5 py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition-all shadow-sm ${
                        isFormOpen
                            ? "bg-[#31323E]/10 text-[#31323E] hover:bg-[#31323E]/15 border border-[#31323E]/20"
                            : "bg-[#31323E] text-white hover:bg-[#434455]"
                    }`}
                >
                    {isFormOpen ? "✕ Cancel" : "+ Add New Artwork"}
                </button>
            </div>

            {/* ── Create / Edit Form ──────────────────────────────── */}
            {isFormOpen && (
                <form onSubmit={handleCreate} className="bg-[#FAFAF9] border border-[#31323E]/10 rounded-2xl shadow-sm overflow-hidden mb-2">
                    {/* Form Header */}
                    <div className="px-8 py-5 border-b border-[#31323E]/8 bg-white">
                        <h3 className="font-bold text-lg text-[#31323E]">{editingId ? "Edit Artwork" : "New Artwork"}</h3>
                        <p className="text-sm text-[#31323E]/40 font-medium mt-0.5">Fill in all required fields marked with *</p>
                    </div>

                    <div className="p-8 space-y-8">
                        {/* Identity */}
                        <div>
                            <FormSection title="Identity" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div>
                                    <FieldLabel text="Title" required valid={formData.title?.trim().length > 0} />
                                    <input required value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inp} placeholder="Artwork title" />
                                </div>
                                <div>
                                    <FieldLabel text="Year" valid={!!formData.year} />
                                    <input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: Number(e.target.value) })} className={inp} />
                                </div>
                                <div>
                                    <FieldLabel text="Orientation" valid={!!formData.orientation} />
                                    <select value={formData.orientation} onChange={e => setFormData({ ...formData, orientation: e.target.value })} className={inp}>
                                        <option value="Horizontal">Horizontal</option>
                                        <option value="Vertical">Vertical</option>
                                        <option value="Square">Square</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Original */}
                        <div>
                            <FormSection title="Original Artwork" desc="Status and price of the physical original" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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

                        {/* Dimensions */}
                        {formData.original_status !== "digital" && (
                            <div>
                                <FormSection title="Dimensions (cm)" />
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <FieldLabel text="Width" valid={!!formData.width_cm} />
                                        <input type="number" step="0.1" value={formData.width_cm} onChange={e => setFormData({ ...formData, width_cm: e.target.value })} className={inp} placeholder="e.g. 60" />
                                    </div>
                                    <div>
                                        <FieldLabel text="Height" valid={!!formData.height_cm} />
                                        <input type="number" step="0.1" value={formData.height_cm} onChange={e => setFormData({ ...formData, height_cm: e.target.value })} className={inp} placeholder="e.g. 80" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Print Availability */}
                        <div>
                            <FormSection title="Print Availability" desc="Select which print formats are available. Pricing is configured in the Print Pricing tab." />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {([
                                    { key: "has_canvas_print",         label: "Canvas Print" },
                                    { key: "has_canvas_print_limited", label: "Canvas Print — Limited Edition" },
                                    { key: "has_paper_print",          label: "Paper Print" },
                                    { key: "has_paper_print_limited",  label: "Paper Print — Limited Edition" },
                                ] as const).map(({ key, label }) => (
                                    <div key={key}>
                                        <label className={`flex items-center gap-3 cursor-pointer p-3.5 rounded-xl border transition-colors ${formData[key] ? "bg-[#31323E]/5 border-[#31323E]/25" : "bg-white border-[#31323E]/10 hover:bg-[#31323E]/2"}`}>
                                            <input
                                                type="checkbox"
                                                checked={!!formData[key]}
                                                onChange={e => setFormData({ ...formData, [key]: e.target.checked })}
                                                className="w-4 h-4 accent-[#31323E] cursor-pointer rounded"
                                            />
                                            <span className="text-sm font-semibold text-[#31323E]">{label}</span>
                                        </label>
                                        {key === "has_canvas_print_limited" && !!formData[key] && (
                                            <div className="mt-2 px-1">
                                                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#31323E]/50 mb-1.5">Edition Size (total prints in series)</label>
                                                <input type="number" min={1} value={formData.canvas_print_limited_quantity}
                                                    onChange={e => setFormData({ ...formData, canvas_print_limited_quantity: e.target.value ? Number(e.target.value) : "" })}
                                                    placeholder="e.g. 30" className={inp} />
                                            </div>
                                        )}
                                        {key === "has_paper_print_limited" && !!formData[key] && (
                                            <div className="mt-2 px-1">
                                                <label className="block text-[10px] font-bold uppercase tracking-widest text-[#31323E]/50 mb-1.5">Edition Size (total prints in series)</label>
                                                <input type="number" min={1} value={formData.paper_print_limited_quantity}
                                                    onChange={e => setFormData({ ...formData, paper_print_limited_quantity: e.target.value ? Number(e.target.value) : "" })}
                                                    placeholder="e.g. 30" className={inp} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Print Config */}
                        {(formData.has_canvas_print || formData.has_canvas_print_limited || formData.has_paper_print || formData.has_paper_print_limited) && (
                        <div>
                            <FormSection title="Print Configuration" desc="Link this artwork to a pricing grid and optionally restrict the available size range." />
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-[#31323E]/50 mb-1.5">Aspect Ratio</label>
                                    <select
                                        value={formData.print_aspect_ratio_id || ""}
                                        onChange={e => setFormData({ ...formData, print_aspect_ratio_id: e.target.value ? Number(e.target.value) : null })}
                                        className={inp}
                                    >
                                        <option value="">— No ratio selected (all sizes available) —</option>
                                        {aspectRatios.map(r => (
                                            <option key={r.id} value={r.id}>{r.label}{r.description ? ` — ${r.description}` : ""}</option>
                                        ))}
                                    </select>
                                </div>
                                {formData.print_aspect_ratio_id && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#31323E]/50 mb-1.5">Min Size Label</label>
                                            <input
                                                value={formData.print_min_size_label || ""}
                                                onChange={e => setFormData({ ...formData, print_min_size_label: e.target.value })}
                                                placeholder='e.g. "30×40 cm"'
                                                className={inp}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-widest text-[#31323E]/50 mb-1.5">Max Size Label</label>
                                            <input
                                                value={formData.print_max_size_label || ""}
                                                onChange={e => setFormData({ ...formData, print_max_size_label: e.target.value })}
                                                placeholder='e.g. "80×100 cm"'
                                                className={inp}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        )}

                        {/* High-Res print source */}
                        {(formData.has_canvas_print || formData.has_canvas_print_limited || formData.has_paper_print || formData.has_paper_print_limited) && (
                        <div>
                            <FormSection title="Source Image (Prodigi Fulfillment)" desc="High-resolution file sent to Prodigi for printing. No size reduction — upload TIFF, PNG, or JPEG at 300 DPI or higher. Max 500 MB." />
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {/* Preview strip when URL is set */}
                                {formData.print_quality_url && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px" }}>
                                        <img
                                            src={`${getApiUrl().replace("/api","")}${formData.print_quality_url}`}
                                            alt="Print source"
                                            style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}
                                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#15803d", margin: "0 0 2px" }}>✓ High-Res Image Linked</p>
                                            <p style={{ fontFamily: "monospace", fontSize: "0.68rem", color: "#555", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {formData.print_quality_url}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => printFileRef.current?.click()}
                                            style={{ fontFamily: "var(--font-sans)", fontSize: "0.7rem", fontWeight: 700, color: "#555", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", flexShrink: 0 }}
                                        >
                                            Replace
                                        </button>
                                    </div>
                                )}

                                {/* Manual Path entry for power-users */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <input
                                        type="text"
                                        value={formData.print_quality_url || ""}
                                        onChange={e => setFormData({ ...formData, print_quality_url: e.target.value })}
                                        placeholder="e.g. /static/print/my-file.tif"
                                        style={{ 
                                            flex: 1, 
                                            padding: "10px 14px", 
                                            borderRadius: "8px", 
                                            border: "1px solid rgba(0,0,0,0.1)", 
                                            fontSize: "0.8rem", 
                                            fontFamily: "monospace",
                                            background: "rgba(0,0,0,0.02)"
                                        }}
                                    />
                                    {!formData.print_quality_url && (
                                        <button
                                            type="button"
                                            disabled={!editingId || printUploading}
                                            onClick={() => printFileRef.current?.click()}
                                            style={{
                                                padding: "10px 20px", borderRadius: 8,
                                                background: editingId ? "var(--color-charcoal)" : "rgba(0,0,0,0.1)",
                                                color: "white",
                                                fontFamily: "var(--font-sans)", fontSize: "0.8rem", fontWeight: 600,
                                                cursor: editingId ? "pointer" : "not-allowed",
                                                display: "flex", alignItems: "center", gap: 6,
                                                border: "none"
                                            }}
                                        >
                                            {printUploading ? "..." : "📎 Upload"}
                                        </button>
                                    )}
                                </div>

                                {printUploadError && (
                                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "0.72rem", color: "#b91c1c", margin: 0 }}>⚠ {printUploadError}</p>
                                )}

                                {/* Hidden file input */}
                                <input
                                    ref={printFileRef}
                                    type="file"
                                    accept="image/tiff,image/png,image/jpeg,image/webp,.tif,.tiff"
                                    style={{ display: "none" }}
                                    onChange={async e => {
                                        const file = e.target.files?.[0];
                                        if (!file || !editingId) return;
                                        setPrintUploading(true);
                                        setPrintUploadError(null);
                                        try {
                                            const fd = new FormData();
                                            fd.append("file", file);
                                            const res = await apiFetch(`${getApiUrl()}/artworks/${editingId}/print-image`, { method: "POST", body: fd });
                                            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err)); }
                                            const data = await res.json();
                                            setFormData((prev: any) => ({ ...prev, print_quality_url: data.url }));
                                        } catch (err: any) {
                                            setPrintUploadError(`Upload failed: ${err.message}`);
                                        } finally {
                                            setPrintUploading(false);
                                            (e.target as HTMLInputElement).value = "";
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        )}

                        {/* Labels */}
                        <div>
                            <FormSection title="Labels & Categorization" desc="Tag this artwork to make it discoverable in filters" />
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
                            <div className="mt-5">
                                <FieldLabel text="Description" valid={formData.description?.trim().length > 0} />
                                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={4} className={inp} placeholder="Artwork description…" />
                            </div>
                        </div>

                        {/* Photos */}
                        <div>
                            <FormSection title="Photos (up to 10)" />
                            <ImageReorderGrid
                                items={imageItems}
                                onReorder={setImageItems}
                                onRemove={removeImage}
                                onAddFiles={addFiles}
                                onCropClick={idx => setCropImageIndex(idx)}
                                maxItems={10}
                            />
                        </div>

                        <button type="submit" disabled={uploading}
                            className="w-full bg-[#31323E] text-white py-4 rounded-xl uppercase tracking-[0.12em] text-sm font-bold disabled:opacity-50 hover:bg-[#434455] transition-colors shadow-lg shadow-[#31323E]/15">
                            {uploading ? "Saving Asset…" : editingId ? "Update Artwork" : "Create Artwork"}
                        </button>
                    </div>
                </form>
            )}

            <SimpleArtworkCropperModal
                isOpen={cropImageIndex !== null}
                imageSrc={cropImageIndex !== null && imageItems[cropImageIndex]?.url ? imageItems[cropImageIndex].url : ""}
                onClose={() => setCropImageIndex(null)}
                onSaveCrop={handleSaveCrop}
            />

            {/* ── Artworks Grid ──────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
                {artworks.map(art => (
                    <div key={art.id} className="border border-[#31323E]/10 rounded-2xl relative group bg-white shadow-sm hover:shadow-md transition-all overflow-hidden">
                        <div className="aspect-[4/5] bg-[#31323E]/5 overflow-hidden relative">
                            {art.images && art.images.length > 0 ? (
                                <img src={getImageUrl(art.images[0], "thumb")} alt={art.title} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity group-hover:scale-102" style={{ transition: "opacity 0.3s, transform 0.5s" }} />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center text-xs text-[#31323E]/30 font-semibold uppercase tracking-wider">No Image</div>
                            )}
                            {/* Hover Actions */}
                            <div className="absolute inset-0 bg-[#31323E]/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3 gap-2">
                                <button onClick={() => handleEditClick(art)} className="flex-1 bg-white text-[#31323E] text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg hover:bg-[#31323E] hover:text-white transition-all">Edit</button>
                                <button onClick={() => handleDelete(art.id)} className="flex-1 bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-2 rounded-lg hover:bg-red-600 transition-all">Delete</button>
                            </div>
                        </div>
                        <div className="px-4 py-3.5">
                            <h3 className="font-bold text-sm text-[#31323E] truncate leading-tight mb-0.5">{art.title}</h3>
                            <p className="text-xs font-semibold text-[#31323E]/40">${art.original_price}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
