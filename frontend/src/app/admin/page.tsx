"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import ArtworksTab from "@/app/admin/components/ArtworksTab";
import SettingsTab from "@/app/admin/components/SettingsTab";
import OrdersTab from "@/app/admin/components/OrdersTab";
import LabelsTab from "@/app/admin/components/LabelsTab";
import TagsTab from "@/app/admin/components/TagsTab";
import FooterTab from "@/app/admin/components/FooterTab";

export default function AdminDashboardPage() {
    const { user, loading } = useUser();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"artwork" | "setting" | "footer" | "label" | "tags" | "orders">("artwork");

    useEffect(() => {
        if (!loading && (!user || !user.is_admin)) {
            router.push("/");
        }
    }, [user, loading, router]);

    if (loading || !user) return <div className="min-h-screen flex items-center justify-center text-zinc-500 font-sans text-sm tracking-wider bg-gray-100">Authenticating...</div>;

    return (
        <div className="min-h-screen bg-gray-100 pt-[150px] pb-24 text-zinc-900 font-sans selection:bg-zinc-800 selection:text-white">
            <main className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <h1 className="text-4xl lg:text-5xl font-serif italic mb-2 tracking-tight text-[#111111]">Dashboard</h1>
                        <p className="text-zinc-500 font-sans text-sm font-medium tracking-widest uppercase">
                            Admin Control Panel · {user.username}
                        </p>
                    </div>
                </header>

                <div className="bg-white border border-zinc-200 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
                    {/* Tabs Navigation */}
                    <div className="flex px-2 pt-2 border-b border-zinc-100 overflow-x-auto bg-zinc-50/50 hidden-scrollbar">
                        {(["artwork", "setting", "footer", "label", "tags", "orders"] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-4 text-xs sm:text-sm font-sans font-bold tracking-wider uppercase transition-all whitespace-nowrap border-b-2 relative ${
                                    activeTab === tab 
                                    ? "text-black border-black font-semibold bg-white rounded-t-lg shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]" 
                                    : "text-zinc-500 border-transparent hover:text-black hover:bg-zinc-100/50"
                                }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content Area */}
                    <div className="p-6 md:p-10 min-h-[600px] bg-white">
                        {activeTab === "artwork" && <ArtworksTab />}
                        {activeTab === "setting" && <SettingsTab />}
                        {activeTab === "footer" && <FooterTab />}
                        {activeTab === "label" && <LabelsTab />}
                        {activeTab === "tags" && <TagsTab />}
                        {activeTab === "orders" && <OrdersTab />}
                    </div>
                </div>
            </main>
        </div>
    );
}
