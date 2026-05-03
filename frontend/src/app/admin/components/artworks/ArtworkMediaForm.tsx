import { ArtworkFormState, DragItem, Label, LabelCategory } from "./types";
import { FieldLabel, FormSection, ImageReorderGrid, LabelMultiSelect } from "./ui";

interface ArtworkMediaFormProps {
    formData: ArtworkFormState;
    setFormData: React.Dispatch<React.SetStateAction<ArtworkFormState>>;
    categories: LabelCategory[];
    labels: Label[];
    imageItems: DragItem[];
    setImageItems: React.Dispatch<React.SetStateAction<DragItem[]>>;
    setCropImageIndex: React.Dispatch<React.SetStateAction<number | null>>;
}

export function ArtworkMediaForm({
    formData,
    setFormData,
    categories,
    labels,
    imageItems,
    setImageItems,
    setCropImageIndex,
}: ArtworkMediaFormProps) {
    return (
        <div className="space-y-6">
            <div>
                <FormSection
                    title="Labels and Photos"
                    description="Tag the artwork for discovery and manage the gallery imagery shown on the site."
                />

                <div className="space-y-5">
                    {categories.map((category) => {
                        const categoryLabels = labels.filter(
                            (label) => label.category_id === category.id
                        );
                        return (
                            <div key={category.id}>
                                <FieldLabel
                                    text={category.title}
                                    valid={Boolean(
                                        formData.labels.some((labelId) =>
                                            categoryLabels.find(
                                                (label) => label.id === labelId
                                            )
                                        )
                                    )}
                                />
                                <LabelMultiSelect
                                    labels={categoryLabels}
                                    selected={formData.labels}
                                    onChange={(selectedIds) =>
                                        setFormData((previous) => ({
                                            ...previous,
                                            labels: selectedIds,
                                        }))
                                    }
                                    placeholder={`No ${category.title} labels yet.`}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <FormSection title="Artwork Photos" description="Cover image first, supporting shots after that." />
                <ImageReorderGrid
                    items={imageItems}
                    onReorder={setImageItems}
                    onRemove={(index) =>
                        setImageItems((previous) =>
                            previous.filter((_, itemIndex) => itemIndex !== index)
                        )
                    }
                    onAddFiles={(files) => {
                        const nextItems = files.map((file) => ({
                            type: "new" as const,
                            url: URL.createObjectURL(file),
                            file,
                        }));
                        setImageItems((previous) => [...previous, ...nextItems].slice(0, 10));
                    }}
                    onCropClick={(index) => setCropImageIndex(index)}
                />
            </div>
        </div>
    );
}
