"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiJson, getApiUrl } from "@/utils";

interface ContentPageProps {
    title: string;
    field: "shipping_page_text" | "faq_page_text" | "terms_page_text" | "privacy_page_text";
    fallback: string;
}

function renderBlock(block: string, index: number) {
    const trimmed = block.trim();
    if (trimmed.startsWith("Q:")) {
        const [questionLine, ...answerLines] = trimmed.split("\n");
        const answer = answerLines.join("\n").replace(/^A:\s*/i, "").trim();
        return (
            <section key={index} className="rounded-xl border border-[#31323E]/10 bg-white px-5 py-5 shadow-sm">
                <h2 className="text-lg font-bold tracking-tight text-[#31323E]">
                    {questionLine.replace(/^Q:\s*/i, "")}
                </h2>
                {answer ? (
                    <p className="mt-3 text-base leading-8 text-[#31323E]/72 whitespace-pre-line">
                        {answer}
                    </p>
                ) : null}
            </section>
        );
    }

    if (trimmed.length < 80 && !trimmed.endsWith(".")) {
        return (
            <h2 key={index} className="pt-4 text-2xl font-bold tracking-tight text-[#31323E]">
                {trimmed}
            </h2>
        );
    }

    return <p key={index}>{trimmed}</p>;
}

export default function ContentPage({ title, field, fallback }: ContentPageProps) {
    const [copy, setCopy] = useState(fallback);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/settings`)
            .then((res) => apiJson<Record<string, unknown>>(res))
            .then((data) => {
                const nextCopy = data?.[field];
                if (typeof nextCopy === "string" && nextCopy.trim()) {
                    setCopy(nextCopy);
                }
            })
            .catch(() => {});
    }, [field]);

    return (
        <main className="min-h-screen bg-[#F4F4F2] px-6 pt-[150px] pb-24 text-[#31323E]">
            <div className="mx-auto max-w-3xl">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[#31323E]/40">
                    Collector Information
                </p>
                <h1 className="mb-8 text-4xl font-bold tracking-tight">{title}</h1>
                <div className="space-y-5 text-base leading-8 text-[#31323E]/72">
                    {copy.split(/\n{2,}/).map((paragraph, index) => renderBlock(paragraph, index))}
                </div>
            </div>
        </main>
    );
}
