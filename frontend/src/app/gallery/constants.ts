import { SortKey } from "./types";

export const DEFAULT_GRADIENTS = [
    ["#6A9FB5", "#3A6E85"],
    ["#2A5F7A", "#1A3A55"],
    ["#8A7AB5", "#4A5A8A"],
    ["#5A8A8A", "#2A5A5A"],
    ["#D4905A", "#8A5030"],
];

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "default", label: "Collection" },
    { key: "year", label: "Newest" },
    { key: "title", label: "Title A–Z" },
    { key: "available", label: "Available" },
];

export const IMAGE_ZONE: Record<string, number> = { "1": 480, "2": 380, "3": 260 };

export const STATUS: Record<string, { label: string; badgeBg: string; badgeText: string; textColor: string }> = {
    available:     { label: "AVAILABLE",    badgeBg: "rgba(100,185,120,0.13)", badgeText: "#3a7a4a",  textColor: "#6DB87E" },
    sold:          { label: "SOLD",          badgeBg: "rgba(180,60,60,0.11)",   badgeText: "#9b2c2c",  textColor: "#C05050" },
    reserved:      { label: "RESERVED",      badgeBg: "rgba(200,160,50,0.13)",  badgeText: "#836a1a",  textColor: "#C8A32A" },
    not_for_sale:  { label: "NOT FOR SALE",  badgeBg: "rgba(120,120,120,0.11)", badgeText: "#555",     textColor: "#999" },
    on_exhibition: { label: "ON EXHIBITION", badgeBg: "rgba(50,130,200,0.11)",  badgeText: "#20527a",  textColor: "#4A90BE" },
    archived:      { label: "ARCHIVED",      badgeBg: "rgba(100,100,100,0.10)", badgeText: "#666",     textColor: "#7f8c8d" },
    digital:       { label: "DIGITAL ONLY",  badgeBg: "rgba(120,90,200,0.12)",  badgeText: "#5a3a9a",  textColor: "#8E44AD" },
};
