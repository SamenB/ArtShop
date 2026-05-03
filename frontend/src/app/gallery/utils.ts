import { Artwork, SortKey } from "./types";

export const sortWorks = (works: Artwork[], key: SortKey): Artwork[] => {
    const c = [...works];
    if (key === "year") c.sort((a, b) => b.id - a.id);
    if (key === "title") c.sort((a, b) => a.title.localeCompare(b.title));
    if (key === "available") c.sort((a, b) => (a.original_status === "available" ? 0 : 1) - (b.original_status === "available" ? 0 : 1));
    return c;
};
