import { useRef } from "react";
import { DragItem, Label } from "./types";
import { getStatusClasses, titleCase } from "./utils";

export function FormSection({ title, description }: { title: string; description?: string }) {
    return (
        <div className="mb-5">
            <div className="flex items-center gap-3 mb-1.5">
                <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-[#31323E]">
                    {title}
                </h3>
                <div className="flex-1 h-px bg-[#31323E]/10" />
            </div>
            {description ? (
                <p className="text-xs text-[#31323E]/45 font-medium">{description}</p>
            ) : null}
        </div>
    );
}

export function FieldLabel({
    text,
    required = false,
    valid = true,
}: {
    text: string;
    required?: boolean;
    valid?: boolean;
}) {
    return (
        <div className="flex items-center gap-2 mb-1.5">
            <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    valid ? "bg-emerald-400" : "bg-amber-400"
                }`}
            />
            <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-[#31323E]/60">
                {text}
                {required ? " *" : ""}
            </label>
        </div>
    );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getStatusClasses(status)}`}
        >
            {label || titleCase(status)}
        </span>
    );
}

export function IssueList({
    title,
    items,
    tone,
}: {
    title: string;
    items?: string[];
    tone: "danger" | "warning";
}) {
    if (!items || items.length === 0) {
        return null;
    }

    const classes =
        tone === "danger"
            ? "bg-rose-50 border border-rose-200 text-rose-700"
            : "bg-amber-50 border border-amber-200 text-amber-700";

    return (
        <div className={`rounded-xl px-3.5 py-3 ${classes}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2">{title}</p>
            <ul className="space-y-1.5 text-xs font-medium">
                {items.map((item) => (
                    <li key={item}>- {item}</li>
                ))}
            </ul>
        </div>
    );
}

export function LabelMultiSelect({
    labels,
    selected,
    onChange,
    placeholder,
}: {
    labels: Label[];
    selected: number[];
    onChange: (ids: number[]) => void;
    placeholder: string;
}) {
    const toggle = (id: number) => {
        if (selected.includes(id)) {
            onChange(selected.filter((item) => item !== id));
            return;
        }
        onChange([...selected, id]);
    };

    return (
        <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
                const active = selected.includes(label.id);
                return (
                    <button
                        key={label.id}
                        type="button"
                        onClick={() => toggle(label.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            active
                                ? "bg-[#31323E] text-white border border-[#31323E]"
                                : "bg-white text-[#31323E]/70 border border-[#31323E]/15 hover:bg-[#31323E]/5"
                        }`}
                    >
                        {label.title}
                    </button>
                );
            })}
            {labels.length === 0 ? (
                <span className="text-xs font-medium text-[#31323E]/40 italic">{placeholder}</span>
            ) : null}
        </div>
    );
}

export function ImageReorderGrid({
    items,
    onReorder,
    onRemove,
    onAddFiles,
    onCropClick,
    maxItems = 10,
}: {
    items: DragItem[];
    onReorder: (next: DragItem[]) => void;
    onRemove: (index: number) => void;
    onAddFiles: (files: File[]) => void;
    onCropClick?: (index: number) => void;
    maxItems?: number;
}) {
    const dragIndexRef = useRef<number | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (index: number) => {
        if (dragIndexRef.current === null || dragIndexRef.current === index) {
            return;
        }
        const next = [...items];
        const [moved] = next.splice(dragIndexRef.current, 1);
        next.splice(index, 0, moved);
        dragIndexRef.current = null;
        onReorder(next);
    };

    return (
        <div>
            <div className="flex flex-wrap gap-3 mt-3">
                {items.map((item, index) => (
                    <div
                        key={`${item.url}-${index}`}
                        draggable
                        onDragStart={() => {
                            dragIndexRef.current = index;
                        }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        className={`relative w-[104px] h-[104px] rounded-xl overflow-hidden bg-[#31323E]/5 ${
                            index === 0 ? "ring-2 ring-[#31323E]" : "border border-[#31323E]/10"
                        }`}
                    >
                        <img
                            src={item.url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        />
                        <div className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-[0.14em] rounded-full px-2 py-1 bg-white/90 text-[#31323E]">
                            {index === 0 ? "Cover" : `#${index + 1}`}
                        </div>
                        <button
                            type="button"
                            onClick={() => onRemove(index)}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold"
                        >
                            x
                        </button>
                        {item.type === "new" && onCropClick ? (
                            <button
                                type="button"
                                onClick={() => onCropClick(index)}
                                className="absolute bottom-2 right-2 rounded-full bg-[#31323E] text-white text-[10px] font-bold px-2 py-1"
                            >
                                Crop
                            </button>
                        ) : null}
                    </div>
                ))}

                {items.length < maxItems ? (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="w-[104px] h-[104px] rounded-xl border border-dashed border-[#31323E]/20 text-[#31323E]/35 text-3xl font-light hover:bg-[#31323E]/5 transition-colors"
                    >
                        +
                    </button>
                ) : null}
            </div>

            <p className="text-[10px] font-semibold text-[#31323E]/40 mt-2 tracking-[0.14em] uppercase">
                Drag to reorder. First image becomes the cover. Up to {maxItems} photos.
            </p>

            <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onClick={(event) => {
                    (event.target as HTMLInputElement).value = "";
                }}
                onChange={(event) => {
                    const files = Array.from(event.target.files || []).slice(0, maxItems - items.length);
                    if (files.length > 0) {
                        onAddFiles(files);
                    }
                    (event.target as HTMLInputElement).value = "";
                }}
            />
        </div>
    );
}
