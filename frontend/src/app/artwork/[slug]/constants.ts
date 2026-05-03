import { OriginalStatus } from "./types";

export const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"],
    ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"],
    ["#5A8A8A", "#2A5A5A"],
    ["#D4905A", "#8A5030"],
];

export const STATUS_BADGE: Record<OriginalStatus, { label: string; bg: string; border: string; desc?: string } | null> = {
    available: { label: "AVAILABLE", bg: "#F0FDF4", border: "#166534", desc: "Ready to ship globally" },
    sold: { label: "SOLD", bg: "#FEF2F2", border: "#991B1B", desc: "This original has found a home" },
    reserved: { label: "RESERVED", bg: "#FFFBEB", border: "#92400E", desc: "Currently on hold for a collector" },
    not_for_sale: { label: "NOT FOR SALE", bg: "#F8FAFC", border: "#475569", desc: "Private collection" },
    on_exhibition: { label: "EXHIBITION", bg: "#EFF6FF", border: "#1E40AF", desc: "Currently on display at a gallery" },
    archived: null,
    digital: { label: "DIGITAL ONLY", bg: "#FAF5FF", border: "#6B21A8", desc: "Available as high-res digital file" },
};
