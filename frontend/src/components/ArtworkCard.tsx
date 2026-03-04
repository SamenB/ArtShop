"use client";
import React from 'react';

import { useState } from 'react';



// Defining the shape of data for our component (like a Pydantic model)
interface ArtworkProps {
    title: string;
    artist: string;
    price: number;
    imageUrl?: string;
}

export const ArtworkCard = ({ title, artist, price, imageUrl }: ArtworkProps) => {
    return (
        <div className="group relative overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all hover:shadow-2xl hover:-translate-y-2">
            {/* Image Placeholder - we will use real images later */}
            <div className="aspect-4/5 w-full bg-zinc-200 dark:bg-zinc-800 animate-pulse">
                {imageUrl && <img src={imageUrl} alt={title} className="h-full w-full object-cover" />}
            </div>

            {/* Content */}
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


export function Counter() {
    // [текущее значение, функция для изменения] = useState(начальное значение)
    const [count, setCount] = useState(0);
    return (
        <div className="mt-10 flex flex-col items-center gap-6 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl w-64 shadow-xl">
            <p className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Counter</p>
            <span className="text-7xl font-black tabular-nums text-white">
                {count}
            </span>
            {/* Кнопки в ряд */}
            <div className="flex gap-4">
                <button
                    className="w-14 h-14 rounded-full bg-zinc-800 text-white text-2xl font-bold
                               border border-zinc-700 hover:bg-zinc-700 hover:scale-110
                               active:scale-95 transition-all cursor-pointer"
                    onClick={() => setCount(prev => prev - 1)}
                >
                    -
                </button>
                <button
                    className="w-14 h-14 rounded-full bg-white text-zinc-900 text-2xl font-bold
                               hover:bg-zinc-200 hover:scale-110
                               active:scale-95 transition-all cursor-pointe"
                    onClick={() => setCount(count + 1)}
                >
                    +
                </button>

            </div>
            <button
                className="w-full py-3 rounded-xl bg-white text-zinc-900 font-bold text-lg
                           hover:bg-zinc-200 hover:scale-105
                           active:scale-95 transition-all cursor-pointer"
                onClick={() => setCount(0)}
            >
                Reset
            </button>
        </div>
    );
}