"use client";

/**
 * Reusable Display Component for Artworks.
 * Renders an abstract representation of an artwork with its title, artist, and pricing.
 */

import React from 'react';

/** Defines the core data structure expected by the ArtworkCard component. */
interface ArtworkProps {
    title: string;
    artist: string;
    price: number;
    imageUrl?: string;
}

/**
 * Renders a stylized card for an artwork item, complete with hover interactions and price display.
 */
export const ArtworkCard = ({ title, artist, price, imageUrl }: ArtworkProps) => {
    return (
        <div className="group relative overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all hover:shadow-2xl hover:-translate-y-2">
            <div className="aspect-4/5 w-full bg-zinc-200 dark:bg-zinc-800 animate-pulse">
                {imageUrl && <img src={imageUrl} alt={title} className="h-full w-full object-cover" />}
            </div>

            <div className="p-4 space-y-1">
                <h3 className="font-semibold text-lg leading-tight text-foreground">
                    {title}
                </h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {artist}
                </p>
                <div className="pt-2 flex items-center justify-between">
                    <span className="font-bold text-lg">${price}</span>
                    <button className="px-4 py-1.5 rounded-full bg-foreground text-background text-sm font-medium transition-transform active:scale-95 hover:opacity-90">
                        View
                    </button>
                </div>
            </div>
        </div>
    );
};