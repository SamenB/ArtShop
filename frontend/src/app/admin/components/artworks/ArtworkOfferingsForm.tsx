import { ArtworkFormState } from "./types";
import { FieldLabel, FormSection } from "./ui";
import {
    CANVAS_WRAP_OPTIONS,
    hasCanvasOfferings,
    hasMissingPrintRatio,
    hasPrintOfferings,
    INPUT_CLASS,
} from "./utils";

interface ArtworkOfferingsFormProps {
    formData: ArtworkFormState;
    setFormData: React.Dispatch<React.SetStateAction<ArtworkFormState>>;
    editingWhiteBorder: boolean;
    setEditingWhiteBorder: React.Dispatch<React.SetStateAction<boolean>>;
    whiteBorderDraft: string;
    setWhiteBorderDraft: React.Dispatch<React.SetStateAction<string>>;
}

export function ArtworkOfferingsForm({
    formData,
    setFormData,
    editingWhiteBorder,
    setEditingWhiteBorder,
    whiteBorderDraft,
    setWhiteBorderDraft,
}: ArtworkOfferingsFormProps) {
    const hasConfiguredPrintFamilies = Boolean(
        formData.has_canvas_print ||
            formData.has_canvas_print_limited ||
            formData.has_paper_print ||
            formData.has_paper_print_limited
    );

    return (
        <div className="space-y-6">
            <div>
                <FormSection
                    title="Offerings"
                    description="Define the provider-neutral selling intent for this artwork: which print families are enabled and whether limited editions exist."
                />

                {!formData.show_in_shop ? (
                    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                        Shop placement is off. These sale settings are preserved, but they will
                        not appear on the storefront until the artwork is shown in shop again.
                    </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                        {
                            key: "has_canvas_print",
                            label: "Canvas print",
                        },
                        {
                            key: "has_canvas_print_limited",
                            label: "Canvas print limited",
                        },
                        {
                            key: "has_paper_print",
                            label: "Paper print",
                        },
                        {
                            key: "has_paper_print_limited",
                            label: "Paper print limited",
                        },
                    ].map((item) => (
                        <label
                            key={item.key}
                            className={`rounded-2xl border px-4 py-3 cursor-pointer transition-colors ${
                                formData[item.key as keyof ArtworkFormState]
                                    ? "bg-[#31323E]/5 border-[#31323E]/25"
                                    : "bg-white border-[#31323E]/12 hover:bg-[#31323E]/3"
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={Boolean(
                                        formData[item.key as keyof ArtworkFormState]
                                    )}
                                    onChange={(event) =>
                                        setFormData((previous) => ({
                                            ...previous,
                                            [item.key]: event.target.checked,
                                        }))
                                    }
                                    className="w-4 h-4 accent-[#31323E]"
                                />
                                <span className="text-sm font-semibold text-[#31323E]">
                                    {item.label}
                                </span>
                            </div>

                            {item.key === "has_canvas_print_limited" &&
                            formData.has_canvas_print_limited ? (
                                <div className="mt-3">
                                    <FieldLabel text="Canvas edition size" valid={Boolean(formData.canvas_print_limited_quantity)} />
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.canvas_print_limited_quantity}
                                        onChange={(event) =>
                                            setFormData((previous) => ({
                                                ...previous,
                                                canvas_print_limited_quantity:
                                                    event.target.value,
                                            }))
                                        }
                                        className={INPUT_CLASS}
                                    />
                                </div>
                            ) : null}

                            {item.key === "has_paper_print_limited" &&
                            formData.has_paper_print_limited ? (
                                <div className="mt-3">
                                    <FieldLabel text="Paper edition size" valid={Boolean(formData.paper_print_limited_quantity)} />
                                    <input
                                        type="number"
                                        min={1}
                                        value={formData.paper_print_limited_quantity}
                                        onChange={(event) =>
                                            setFormData((previous) => ({
                                                ...previous,
                                                paper_print_limited_quantity:
                                                    event.target.value,
                                            }))
                                        }
                                        className={INPUT_CLASS}
                                    />
                                </div>
                            ) : null}
                        </label>
                    ))}
                </div>

                {hasCanvasOfferings(formData) ? (
                    <div className="mt-4 rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4">
                        <FieldLabel
                            text="Canvas wrap"
                            required
                            valid={Boolean(formData.canvas_wrap_style)}
                        />
                        <select
                            value={formData.canvas_wrap_style}
                            onChange={(event) =>
                                setFormData((previous) => ({
                                    ...previous,
                                    canvas_wrap_style: event.target.value,
                                }))
                            }
                            className={INPUT_CLASS}
                        >
                            <option value="">Select wrap</option>
                            {CANVAS_WRAP_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/50">
                            This wrap will be used for stretched and framed canvas variants of
                            this artwork.
                        </p>
                    </div>
                ) : null}

                {(formData.has_paper_print || formData.has_paper_print_limited) ? (
                    <div className="mt-4 rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4">
                        <FieldLabel
                            text="White border %"
                            valid={formData.white_border_pct >= 0 && formData.white_border_pct <= 15}
                        />

                        {editingWhiteBorder ? (
                            <div className="flex items-center gap-3 mt-1">
                                <input
                                    type="number"
                                    min={0}
                                    max={15}
                                    step={0.5}
                                    value={whiteBorderDraft}
                                    onChange={(event) => setWhiteBorderDraft(event.target.value)}
                                    className={`${INPUT_CLASS} w-28`}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const value = Number(whiteBorderDraft);
                                        if (!Number.isNaN(value) && value >= 0 && value <= 15) {
                                            setFormData((previous) => ({
                                                ...previous,
                                                white_border_pct: value,
                                            }));
                                            setEditingWhiteBorder(false);
                                        }
                                    }}
                                    className="px-4 py-2 rounded-xl bg-[#31323E] text-white text-xs font-bold uppercase tracking-[0.14em]"
                                >
                                    Save
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditingWhiteBorder(false)}
                                    className="px-4 py-2 rounded-xl border border-[#31323E]/15 bg-white text-[#31323E] text-xs font-bold uppercase tracking-[0.14em]"
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 mt-1">
                                <span className="inline-flex items-center rounded-xl border border-[#31323E]/12 bg-[#31323E]/4 px-4 py-2 text-sm font-bold text-[#31323E] tabular-nums">
                                    {formData.white_border_pct}%
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWhiteBorderDraft(String(formData.white_border_pct));
                                        setEditingWhiteBorder(true);
                                    }}
                                    className="px-4 py-2 rounded-xl border border-[#31323E]/15 bg-white text-[#31323E] text-xs font-bold uppercase tracking-[0.14em] hover:bg-[#31323E]/5 transition-colors"
                                >
                                    Change
                                </button>
                            </div>
                        )}

                        <p className="mt-3 text-xs font-medium leading-relaxed text-[#31323E]/50">
                            Recommended 5%. This white border is applied programmatically to paper
                            prints at order time. The artwork is scaled to{" "}
                            {Math.round(100 - 2 * formData.white_border_pct)}% of the artboard and
                            centered on a white background.
                        </p>
                    </div>
                ) : null}
            </div>

            {!formData.show_in_shop ? (
                <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/60">
                    <p className="font-semibold text-[#31323E]">Storefront sales are paused.</p>
                    <p className="mt-1">
                        Existing original, print, ratio, and edition settings stay here for later.
                        Switching back to Gallery and shop will restore the storefront flow.
                    </p>
                </div>
            ) : hasConfiguredPrintFamilies || hasPrintOfferings(formData) ? (
                <div className="rounded-2xl border border-[#31323E]/10 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/60">
                    <p className="font-semibold text-[#31323E]">Print ratio is chosen in Basics.</p>
                    <p className="mt-1">
                        Offerings only defines what this artwork can sell. The exact storefront
                        size grid is resolved later from the active provider catalog.
                    </p>
                    {hasMissingPrintRatio(formData) ? (
                        <p className="mt-2 text-amber-700">
                            Choose a print aspect ratio in Basics before continuing to the print
                            pipeline.
                        </p>
                    ) : null}
                </div>
            ) : (
                <div className="rounded-2xl border border-dashed border-[#31323E]/18 bg-white px-4 py-4 text-sm font-medium text-[#31323E]/55">
                    No print families are enabled yet. The print source and print workflow
                    steps will unlock automatically once you enable at least one paper or
                    canvas offering.
                </div>
            )}
        </div>
    );
}
