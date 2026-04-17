"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import ArtworksTab from "@/app/admin/components/ArtworksTab";
import SettingsTab from "@/app/admin/components/SettingsTab";
import OrdersTab from "@/app/admin/components/OrdersTab";
import LabelsTab from "@/app/admin/components/LabelsTab";
import FooterTab from "@/app/admin/components/FooterTab";
import EmailTemplatesTab from "@/app/admin/components/EmailTemplatesTab";
import PrintPricingTab from "@/app/admin/components/PrintPricingTab";

type Tab = "artwork" | "orders" | "print-pricing" | "email-templates" | "label" | "setting" | "footer";

const TAB_LABELS: Record<Tab, string> = {
    "artwork": "Artworks",
    "orders": "Orders",
    "print-pricing": "Print Pricing",
    "email-templates": "Email Templates",
    "label": "Labels",
    "setting": "Settings",
    "footer": "Footer",
};

export default function AdminDashboardPage() {
    const { user, loading } = useUser();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("artwork");

    useEffect(() => {
        if (!loading && (!user || !user.is_admin)) {
            router.push("/");
        }
    }, [user, loading, router]);

    if (loading || !user) return <div className="min-h-screen pt-[150px] flex items-center justify-center text-[var(--color-charcoal)] text-sm uppercase tracking-widest font-sans bg-[var(--color-cream)]">Authenticating...</div>;

    return (
        <div className="min-h-screen bg-[var(--color-cream)] pb-24 text-[var(--color-charcoal)] font-sans selection:bg-[#31323E] selection:text-white">
            <div className="w-full bg-[#31323E] pt-[150px] pb-24 px-6 lg:px-12">
                <div className="max-w-[1400px] mx-auto">
                    <h1 className="text-4xl lg:text-5xl font-serif italic mb-2 tracking-tight text-white">Dashboard</h1>
                    <p className="text-white/60 font-sans text-sm font-medium tracking-widest uppercase">
                        Admin Control Panel · {user.username}
                    </p>
                </div>
            </div>

            <main className="max-w-[1400px] mx-auto px-6 lg:px-12 -mt-12">
                <div className="bg-white border border-[rgba(26,26,24,0.06)] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.08)] overflow-hidden">
                    {/* Tabs Navigation */}
                    <div className="flex px-2 pt-2 border-b border-zinc-100 overflow-x-auto bg-zinc-50/50 hidden-scrollbar">
                        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-4 text-xs sm:text-sm font-sans font-bold tracking-wider uppercase transition-all whitespace-nowrap border-b-2 relative ${
                                    activeTab === tab
                                    ? "text-[#31323E] border-[#31323E] font-semibold bg-white rounded-t-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]"
                                    : "text-zinc-500 border-transparent hover:text-[#31323E] hover:bg-zinc-100/50"
                                }`}
                            >
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content Area */}
                    <div className="p-6 md:p-10 min-h-[600px] bg-white">
                        {activeTab === "artwork" && <ArtworksTab />}
                        {activeTab === "orders" && <OrdersTab />}
                        {activeTab === "print-pricing" && <PrintPricingTab />}
                        {activeTab === "email-templates" && <EmailTemplatesTab />}
                        {activeTab === "label" && <LabelsTab />}
                        {activeTab === "setting" && <SettingsTab />}
                        {activeTab === "footer" && <FooterTab />}
                    </div>
                </div>
            </main>
        </div>
    );
}
