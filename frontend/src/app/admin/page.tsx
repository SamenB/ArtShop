"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Brush, ChevronRight, Globe2, PackageCheck, Printer, Settings, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

import ArtworksTab from "@/app/admin/components/ArtworksTab";
import AdminProfileTab from "@/app/admin/components/AdminProfileTab";
import EmailTemplatesTab from "@/app/admin/components/EmailTemplatesTab";
import LabelsTab from "@/app/admin/components/LabelsTab";
import OrdersTab from "@/app/admin/components/OrdersTab";
import PrintPricingTab from "@/app/admin/components/PrintPricingTab";
import ProdigiHubTab from "@/app/admin/components/ProdigiHubTab";
import ProdigiSnapshotTab from "@/app/admin/components/ProdigiSnapshotTab";
import SiteContentTab, { ContentSubtab } from "@/app/admin/components/SiteContentTab";
import { useUser } from "@/context/UserContext";

type AdminRoute =
    | "artworks"
    | "labels"
    | "print-pricing"
    | "orders"
    | "admin-profile"
    | "prodigi-snapshot"
    | "prodigi-catalog"
    | "website-global"
    | "website-footer"
    | "website-shipping"
    | "website-faq"
    | "website-terms"
    | "website-privacy"
    | "email-templates";

type AdminSection = {
    id: "artwork" | "orders" | "prodigi" | "website" | "profile";
    label: string;
    description: string;
    icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    items: Array<{ id: AdminRoute; label: string; description: string }>;
};

const ADMIN_SECTIONS: AdminSection[] = [
    {
        id: "artwork",
        label: "Artwork",
        description: "Catalog, taxonomy, visibility, and production readiness.",
        icon: Brush,
        items: [
            { id: "artworks", label: "Artwork Workbench", description: "Create, edit, place, and prepare works." },
            { id: "labels", label: "Labels", description: "Curated taxonomy for gallery and shop filtering." },
            { id: "print-pricing", label: "Print Pricing", description: "Regional markup multipliers for print-on-demand." },
        ],
    },
    {
        id: "orders",
        label: "Orders",
        description: "Customer orders, payment checks, and Prodigi fulfillment.",
        icon: ShoppingBag,
        items: [
            { id: "orders", label: "Orders", description: "Fulfillment states, payment, shipping, and history." },
        ],
    },
    {
        id: "prodigi",
        label: "Prodigi",
        description: "Baked storefront snapshots and catalog planning.",
        icon: Printer,
        items: [
            { id: "prodigi-snapshot", label: "Snapshot Visualization", description: "Active storefront matrix by country and category." },
            { id: "prodigi-catalog", label: "Catalog Planner", description: "Pre-bake preview and route coverage diagnostics." },
        ],
    },
    {
        id: "website",
        label: "Website",
        description: "Public content, legal pages, footer, and automated messages.",
        icon: Globe2,
        items: [
            { id: "website-global", label: "Global Settings", description: "Artist profile, homepage media, contacts." },
            { id: "website-footer", label: "Footer", description: "Footer copy and social links." },
            { id: "website-shipping", label: "Shipping", description: "Editable public shipping page." },
            { id: "website-faq", label: "FAQ", description: "Collector questions, print timing, customs, care." },
            { id: "website-terms", label: "Terms", description: "Editable terms page." },
            { id: "website-privacy", label: "Privacy", description: "Editable privacy page." },
            { id: "email-templates", label: "Email Templates", description: "Transactional email copy and triggers." },
        ],
    },
    {
        id: "profile",
        label: "Admin Profile",
        description: "Owner contacts and internal notification settings.",
        icon: Settings,
        items: [
            { id: "admin-profile", label: "Owner Profile", description: "Owner contact data and Telegram alert setup." },
        ],
    },
];

const ROUTE_TO_CONTENT_PAGE: Partial<Record<AdminRoute, ContentSubtab>> = {
    "website-global": "global",
    "website-footer": "footer",
    "website-shipping": "shipping",
    "website-faq": "faq",
    "website-terms": "terms",
    "website-privacy": "privacy",
};

function findSection(route: AdminRoute) {
    return ADMIN_SECTIONS.find((section) => section.items.some((item) => item.id === route)) ?? ADMIN_SECTIONS[0];
}

function renderRoute(route: AdminRoute) {
    if (route === "artworks") {
        return <ArtworksTab />;
    }
    if (route === "labels") {
        return <LabelsTab />;
    }
    if (route === "orders") {
        return <OrdersTab />;
    }
    if (route === "admin-profile") {
        return <AdminProfileTab />;
    }
    if (route === "print-pricing") {
        return <PrintPricingTab />;
    }
    if (route === "prodigi-snapshot") {
        return <ProdigiSnapshotTab />;
    }
    if (route === "prodigi-catalog") {
        return <ProdigiHubTab />;
    }
    if (route === "email-templates") {
        return <EmailTemplatesTab />;
    }

    const contentPage = ROUTE_TO_CONTENT_PAGE[route];
    return <SiteContentTab active={contentPage ?? "global"} />;
}

export default function AdminDashboardPage() {
    const { user, loading } = useUser();
    const router = useRouter();
    const [activeRoute, setActiveRoute] = useState<AdminRoute>("artworks");

    useEffect(() => {
        if (!loading && (!user || !user.is_admin)) {
            router.push("/");
        }
    }, [user, loading, router]);

    const activeSection = useMemo(() => findSection(activeRoute), [activeRoute]);
    const activeItem = activeSection.items.find((item) => item.id === activeRoute) ?? activeSection.items[0];

    if (loading || !user) {
        return (
            <div className="min-h-screen pt-[150px] flex items-center justify-center font-sans bg-[#F4F4F2]">
                <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-[#31323E]/30 border-t-[#31323E] rounded-full animate-spin" />
                    <span className="text-sm font-semibold tracking-widest uppercase text-[#31323E]">Authenticating...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F4F4F2] pt-[112px] pb-10 font-sans text-[#31323E]">
            <main className="mx-auto flex w-full max-w-[1680px] gap-6 px-5 lg:px-8">
                <aside className="hidden lg:flex lg:w-[300px] xl:w-[340px] shrink-0 flex-col gap-4">
                    <div className="rounded-lg border border-[#31323E]/10 bg-white px-5 py-5 shadow-sm">
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#31323E]/35">
                            ArtShop Admin
                        </p>
                        <h1 className="mt-2 text-2xl font-bold tracking-tight">Control Center</h1>
                        <p className="mt-2 text-xs font-medium leading-relaxed text-[#31323E]/45">
                            Structured operations for catalog, orders, Prodigi, and public website content.
                        </p>
                    </div>

                    <nav className="rounded-lg border border-[#31323E]/10 bg-white p-2 shadow-sm">
                        {ADMIN_SECTIONS.map((section) => {
                            const Icon = section.icon;
                            const active = section.id === activeSection.id;
                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActiveRoute(section.items[0].id)}
                                    className={`mb-1 flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
                                        active ? "bg-[#31323E] text-white" : "text-[#31323E] hover:bg-[#31323E]/5"
                                    }`}
                                >
                                    <Icon
                                        size={18}
                                        strokeWidth={1.8}
                                        className={active ? "mt-0.5 text-white" : "mt-0.5 text-[#31323E]/45"}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-bold">{section.label}</span>
                                        <span className={`mt-0.5 block text-[11px] leading-snug ${active ? "text-white/58" : "text-[#31323E]/42"}`}>
                                            {section.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="rounded-lg border border-[#31323E]/10 bg-white p-2 shadow-sm">
                        <div className="px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#31323E]/35">
                                {activeSection.label}
                            </p>
                        </div>
                        {activeSection.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveRoute(item.id)}
                                className={`group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                                    activeRoute === item.id
                                        ? "bg-[#31323E]/8 text-[#31323E]"
                                        : "text-[#31323E]/62 hover:bg-[#31323E]/4 hover:text-[#31323E]"
                                }`}
                            >
                                <ChevronRight
                                    size={15}
                                    strokeWidth={2}
                                    className={activeRoute === item.id ? "text-[#31323E]" : "text-[#31323E]/25 group-hover:text-[#31323E]/50"}
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-bold">{item.label}</span>
                                    <span className="mt-0.5 block text-[11px] leading-snug text-[#31323E]/42">
                                        {item.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </aside>

                <section className="min-w-0 flex-1">
                    <div className="mb-4 rounded-lg border border-[#31323E]/10 bg-white p-3 shadow-sm lg:hidden">
                        <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40">
                            Admin Section
                        </label>
                        <select
                            value={activeRoute}
                            onChange={(event) => setActiveRoute(event.target.value as AdminRoute)}
                            className="w-full rounded-md border border-[#31323E]/15 bg-white px-3 py-2 text-sm font-bold text-[#31323E]"
                        >
                            {ADMIN_SECTIONS.map((section) => (
                                <optgroup key={section.id} label={section.label}>
                                    {section.items.map((item) => (
                                        <option key={item.id} value={item.id}>
                                            {item.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <div className="mb-4 rounded-lg border border-[#31323E]/10 bg-white px-6 py-5 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/35">
                                    <span>{activeSection.label}</span>
                                    <ChevronRight size={13} />
                                    <span>{activeItem.label}</span>
                                </div>
                                <h2 className="mt-2 text-2xl font-bold tracking-tight">{activeItem.label}</h2>
                                <p className="mt-1 text-sm font-medium text-[#31323E]/50">{activeItem.description}</p>
                            </div>
                            <div className="flex items-center gap-2 rounded-md border border-[#31323E]/10 bg-[#F7F7F5] px-3 py-2">
                                <PackageCheck size={15} strokeWidth={1.8} className="text-[#31323E]/45" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#31323E]/45">
                                    {user.username}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-lg border border-[#31323E]/10 bg-white p-6 shadow-sm md:p-8">
                        {renderRoute(activeRoute)}
                    </div>
                </section>
            </main>
        </div>
    );
}
