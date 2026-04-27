import { AspectRatio, ArtworkFormState } from "./types";
import { FieldLabel, FormSection } from "./ui";
import { currentYear, hasPrintOfferings, INPUT_CLASS, STATUS_OPTIONS } from "./utils";

interface ArtworkBasicsFormProps {
    formData: ArtworkFormState;
    setFormData: React.Dispatch<React.SetStateAction<ArtworkFormState>>;
    aspectRatios: AspectRatio[];
}

export function ArtworkBasicsForm({ formData, setFormData, aspectRatios }: ArtworkBasicsFormProps) {
    return (
        <div className="space-y-6">
            <div>
                <FormSection
                    title="Artwork Basics"
                    description="Core identity, physical dimensions, original-sales information, and the normalized print ratio family for this artwork."
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <FieldLabel text="Title" required valid={Boolean(formData.title.trim())} />
                        <input
                            value={formData.title}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    title: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                            placeholder="Artwork title"
                        />
                    </div>

                    <div>
                        <FieldLabel text="Year" valid={Boolean(formData.year)} />
                        <input
                            type="number"
                            value={formData.year}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    year: Number(event.target.value || currentYear),
                                }))
                            }
                            className={INPUT_CLASS}
                        />
                    </div>

                    <div>
                        <FieldLabel
                            text="Orientation"
                            valid={Boolean(formData.orientation)}
                        />
                        <select
                            value={formData.orientation}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    orientation: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                        >
                            <option value="Horizontal">Horizontal</option>
                            <option value="Vertical">Vertical</option>
                            <option value="Square">Square</option>
                        </select>
                    </div>

                    <div>
                        <FieldLabel text="Original Status" valid={Boolean(formData.original_status)} />
                        <select
                            value={formData.original_status}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    original_status: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                        >
                            {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <FieldLabel text="Width cm" valid={Boolean(formData.width_cm)} />
                        <input
                            type="number"
                            step="0.1"
                            value={formData.width_cm}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    width_cm: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                            placeholder="e.g. 60"
                        />
                    </div>

                    <div>
                        <FieldLabel text="Height cm" valid={Boolean(formData.height_cm)} />
                        <input
                            type="number"
                            step="0.1"
                            value={formData.height_cm}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    height_cm: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                            placeholder="e.g. 80"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <FieldLabel
                            text="Print aspect ratio"
                            valid={!hasPrintOfferings(formData) || Boolean(formData.print_aspect_ratio_id)}
                        />
                        <select
                            value={formData.print_aspect_ratio_id || ""}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    print_aspect_ratio_id: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                }))
                            }
                            className={INPUT_CLASS}
                        >
                            <option value="">Select ratio</option>
                            {aspectRatios.map((ratio) => (
                                <option key={ratio.id} value={ratio.id}>
                                    {ratio.label}
                                    {ratio.description ? ` - ${ratio.description}` : ""}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs font-medium text-[#31323E]/45">
                            Choose the normalized ratio family here. Exact sizes and prices come
                            from the active provider snapshot.
                        </p>
                    </div>

                    <div className="md:col-span-2">
                        <label className="flex items-center gap-3 rounded-2xl border border-[#31323E]/12 bg-white px-4 py-3">
                            <input
                                type="checkbox"
                                checked={formData.has_original}
                                onChange={(event) =>
                                    setFormData((previous) => ({
                                        ...previous,
                                        has_original: event.target.checked,
                                    }))
                                }
                                className="w-4 h-4 accent-[#31323E]"
                            />
                            <span className="text-sm font-semibold text-[#31323E]">
                                Original artwork is offered for sale
                            </span>
                        </label>
                    </div>

                    <div>
                        <FieldLabel
                            text="Original price USD"
                            valid={
                                !formData.has_original ||
                                Number(formData.original_price || 0) > 0
                            }
                        />
                        <input
                            type="number"
                            min={0}
                            value={formData.original_price}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    original_price: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                            placeholder="e.g. 2400"
                        />
                    </div>

                    <div>
                        <FieldLabel text="Description" valid={Boolean(formData.description.trim())} />
                        <textarea
                            value={formData.description}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    description: event.target.value,
                                }))
                            }
                            rows={4}
                            className={INPUT_CLASS}
                            placeholder="Artwork story, mood, technique, collector notes"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
