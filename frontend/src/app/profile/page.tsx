"use client";
import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SettingsTab from "@/app/admin/components/SettingsTab";
import ArtworksTab from "@/app/admin/components/ArtworksTab";
import OrdersTab from "@/app/admin/components/OrdersTab";
import CollectionsTab from "@/app/admin/components/CollectionsTab";
import TagsTab from "@/app/admin/components/TagsTab";
import { getApiUrl } from "@/utils";

interface Order {
    id: number;
    artwork_id: number;
    edition_type: string;
    price: number;
    created_at: string;
    artwork?: any;
}

interface Artwork {
    id: number;
    title: string;
    medium: string;
    size: string;
    aspectRatio: string;
    gradientFrom: string;
    gradientTo: string;
    originalStatus: string;
}



export default function ProfilePage() {
    const { user, loading } = useUser();
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<"orders" | "likes" | "admin">("orders");
    const [adminSubTab, setAdminSubTab] = useState<"settings" | "artworks" | "collections" | "tags" | "orders">("settings");
    const [orders, setOrders] = useState<Order[]>([]);
    const [likes, setLikes] = useState<Artwork[]>([]);
    const [dataLoading, setDataLoading] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        }
    }, [user, loading, router]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                const [ordersRes, likesRes] = await Promise.all([
                    fetch(`${getApiUrl()}/orders/me`, { credentials: "include" }),
                    fetch(`${getApiUrl()}/users/me/likes`, { credentials: "include" })
                ]);
                if (ordersRes.ok) setOrders(await ordersRes.json());
                if (likesRes.ok) setLikes(await likesRes.json());
            } catch (err) {
                console.error("Error fetching user data", err);
            } finally {
                setDataLoading(false);
            }
        };
        fetchData();
    }, [user]);

    if (loading || !user) return <div className="min-h-screen pt-[150px] flex justify-center text-[#F7F3EC]">Loading...</div>;

    return (
        <div className="min-h-screen bg-[#111111] pt-[150px] pb-24 text-[#F7F3EC]">
            <main className="max-w-[1200px] mx-auto px-6 lg:px-12">
                <header className="mb-12">
                    <h1 className="text-4xl lg:text-5xl font-serif italic mb-4">Account Overview</h1>
                    <p className="text-zinc-400 font-mono text-sm tracking-widest uppercase mb-4">
                        Welcome back, {user.username}
                    </p>
                </header>

                <div className="flex gap-8 mb-12 border-b border-white/10">
                    <button
                        onClick={() => setActiveTab("orders")}
                        className={`pb-4 text-sm font-sans tracking-widest uppercase transition-colors ${activeTab === "orders" ? "text-white border-b border-white" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                        Order History
                    </button>
                    <button
                        onClick={() => setActiveTab("likes")}
                        className={`pb-4 text-sm font-sans tracking-widest uppercase transition-colors ${activeTab === "likes" ? "text-white border-b border-white" : "text-zinc-500 hover:text-zinc-300"}`}
                    >
                        Saved Artworks
                    </button>
                    {user.is_admin && (
                        <button
                            onClick={() => setActiveTab("admin")}
                            className={`pb-4 text-sm font-sans tracking-widest uppercase transition-colors ${activeTab === "admin" ? "text-white border-b border-white" : "text-zinc-500 hover:text-zinc-300"}`}
                        >
                            Admin Dashboard
                        </button>
                    )}
                </div>

                {dataLoading ? (
                    <div className="text-center py-20 text-zinc-500 font-mono text-sm tracking-widest animate-pulse">
                        Loading your collection...
                    </div>
                ) : (
                    <div>
                        {activeTab === "orders" && (
                            <div className="space-y-6">
                                {orders.length === 0 ? (
                                    <div className="text-center py-20 border border-white/5 rounded-2xl bg-white/2">
                                        <p className="font-serif italic text-xl text-zinc-400 mb-4">No completed orders yet.</p>
                                        <Link href="/shop" className="text-sm font-sans uppercase tracking-widest hover:text-white transition-colors text-zinc-500 underline underline-offset-4">Browse Collection</Link>
                                    </div>
                                ) : (
                                    orders.map((o) => (
                                        <div key={o.id} className="p-6 border border-white/10 rounded-xl bg-white/2 flex justify-between items-center group hover:border-white/20 transition-colors">
                                            <div>
                                                <p className="font-mono text-xs uppercase tracking-widest text-zinc-500 mb-2">Order #{o.id} • {new Date(o.created_at).toLocaleDateString()}</p>
                                                <p className="font-serif text-lg text-white mb-1">Items Included: Artwork ID {o.artwork_id}</p>
                                                <p className="font-sans text-sm text-zinc-400">Edition: {o.edition_type}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-serif italic text-2xl text-[#EAE5D9]">${o.price}</p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === "likes" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 gap-y-16">
                                {likes.length === 0 ? (
                                    <div className="col-span-full text-center py-20 border border-white/5 rounded-2xl bg-white/2">
                                        <p className="font-serif italic text-xl text-zinc-400 mb-4">Your saved collection is empty.</p>
                                        <Link href="/gallery" className="text-sm font-sans uppercase tracking-widest hover:text-white transition-colors text-zinc-500 underline underline-offset-4">Explore Gallery</Link>
                                    </div>
                                ) : (
                                    likes.map((work) => (
                                        <div key={work.id} className="flex flex-col group cursor-pointer">
                                            <div className="w-full aspect-4/5 rounded-sm overflow-hidden mb-4 bg-zinc-900 border border-white/5 relative">
                                                {/* Placeholder for actual image or gradient */}
                                                <div className="absolute inset-0 opacity-80 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(160deg, ${work.gradientFrom || '#3A3A3A'} 0%, ${work.gradientTo || '#1A1A1A'} 100%)` }} />
                                            </div>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-serif text-lg italic text-[#F7F3EC] mb-1">{work.title}</p>
                                                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{work.medium} • {work.size}</p>
                                                </div>
                                                <button className="text-xs text-zinc-500 hover:text-red-400 transition-colors uppercase font-mono tracking-widest border border-white/10 px-3 py-1.5 rounded-full hover:border-red-400">
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {activeTab === "admin" && user.is_admin && (
                            <div className="mt-4 border border-white/5 rounded-2xl bg-black/40 p-6 lg:p-10 shadow-2xl">
                                <div className="flex gap-4 mb-8 border-b border-white/10 overflow-x-auto pb-4">
                                    {(["settings", "artworks", "collections", "tags", "orders"] as const).map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setAdminSubTab(tab)}
                                            className={`px-4 py-2 text-xs font-mono tracking-widest uppercase transition-all rounded-full whitespace-nowrap ${
                                                adminSubTab === tab ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                                            }`}
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>
                                <div className="min-h-[500px]">
                                    {adminSubTab === "settings" && <SettingsTab />}
                                    {adminSubTab === "artworks" && <ArtworksTab />}
                                    {adminSubTab === "collections" && <CollectionsTab />}
                                    {adminSubTab === "tags" && <TagsTab />}
                                    {adminSubTab === "orders" && <OrdersTab />}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
