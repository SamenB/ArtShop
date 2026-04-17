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

    if (loading || !user) return (
        <div className="min-h-screen pt-[150px] flex items-center justify-center font-sans bg-[#F4F4F2]">
            <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#31323E]/30 border-t-[#31323E] rounded-full animate-spin" />
                <span className="text-sm font-semibold tracking-widest uppercase text-[#31323E]">Authenticating…</span>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F4F4F2] pb-24 font-sans">
            {/* Hero Header */}
            <div className="w-full bg-[#31323E] pt-[150px] pb-20 px-6 lg:px-12">
                <div className="max-w-[1400px] mx-auto">
                    <p className="text-white/40 text-[10px] font-bold tracking-[0.25em] uppercase mb-3">
                        Admin Control Panel
                    </p>
                    <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-white leading-none mb-3">
                        Dashboard
                    </h1>
                    <p className="text-white/50 text-sm font-medium tracking-wider">
                        {user.username} · ArtShop Management System
                    </p>
                </div>
            </div>

            <main className="max-w-[1400px] mx-auto px-6 lg:px-12 -mt-10">
                <div className="bg-white border border-[#31323E]/8 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.10)] overflow-hidden">
                    {/* Tabs Navigation */}
                    <div className="flex border-b border-[#31323E]/10 overflow-x-auto bg-[#FAFAF9] hidden-scrollbar px-1 pt-1">
                        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
                            <button
                                key={tab}
                                id={`admin-tab-${tab}`}
                                onClick={() => setActiveTab(tab)}
                                className={`px-5 py-3.5 text-[11px] font-bold tracking-[0.15em] uppercase transition-all whitespace-nowrap border-b-2 relative flex-shrink-0 ${
                                    activeTab === tab
                                    ? "text-[#31323E] border-[#31323E] bg-white rounded-t-lg -mb-px"
                                    : "text-[#31323E]/40 border-transparent hover:text-[#31323E]/70 hover:bg-white/60"
                                }`}
                            >
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content Area */}
                    <div className="p-8 md:p-10 min-h-[600px] bg-white">
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
