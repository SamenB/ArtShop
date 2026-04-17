"use client";

/**
 * Print Partners Tab
 *
 * Manages print fulfillment partner configurations.
 * Partners are stored in localStorage (browser-only) so no backend changes are needed.
 * The Telegram Bot Token lives server-side (.env), so actual message dispatch goes
 * through the /telegram/send-print-order endpoint.
 *
 * Sections:
 *   ● Telegram — Active: full partner management + message template editor
 *   ○ Email    — Coming Soon teaser
 *   ○ API      — Coming Soon teaser
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramPartner {
    id: string;
    name: string;
    chatId: string;
    messageTemplate: string;
    isActive: boolean;
}

const STORAGE_KEY = "artshop_telegram_partners";

const DEFAULT_TEMPLATE = `🖨 <b>New Print Order #{{order_id}}</b>

👤 <b>Customer:</b> {{customer_name}}
📧 {{customer_email}}
📱 {{customer_phone}}

📦 <b>Items:</b>
{{items}}

📍 <b>Ship to:</b>
{{shipping_address}}

💬 <b>Notes:</b> {{notes}}`;

const TEMPLATE_VARS = [
    { key: "{{order_id}}", desc: "Order ID number" },
    { key: "{{customer_name}}", desc: "Full name" },
    { key: "{{customer_email}}", desc: "Email address" },
    { key: "{{customer_phone}}", desc: "Phone number" },
    { key: "{{items}}", desc: "List of print items" },
    { key: "{{shipping_address}}", desc: "Full shipping address" },
    { key: "{{notes}}", desc: "Shipping / admin notes" },
];

function generateId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Design primitives ─────────────────────────────────────────────────────────

const inputCls = "w-full border border-[#31323E]/15 rounded-lg px-3.5 py-2.5 text-sm text-[#31323E] font-medium bg-white focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all";

// ── Partner Card ──────────────────────────────────────────────────────────────

function PartnerCard({
    partner,
    onUpdate,
    onDelete,
    onTest,
}: {
    partner: TelegramPartner;
    onUpdate: (p: TelegramPartner) => void;
    onDelete: (id: string) => void;
    onTest: (p: TelegramPartner) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [editName, setEditName] = useState(partner.name);
    const [editChatId, setEditChatId] = useState(partner.chatId);
    const [editTemplate, setEditTemplate] = useState(partner.messageTemplate);

    const handleSave = () => {
        onUpdate({ ...partner, name: editName.trim(), chatId: editChatId.trim(), messageTemplate: editTemplate });
        setIsExpanded(false);
    };

    return (
        <div className={`rounded-xl border transition-all duration-200 overflow-hidden ${
            partner.isActive ? "border-[#31323E]/15 shadow-sm" : "border-[#31323E]/8 opacity-60"
        }`}>
            {/* Summary row */}
            <div className="flex items-center gap-3 px-5 py-4 bg-white">
                {/* Active toggle */}
                <button
                    onClick={() => onUpdate({ ...partner, isActive: !partner.isActive })}
                    title={partner.isActive ? "Deactivate" : "Activate"}
                    className={`w-4 h-4 rounded-full flex-shrink-0 border-2 transition-all ${
                        partner.isActive
                            ? "bg-emerald-500 border-emerald-500"
                            : "bg-white border-[#31323E]/25"
                    }`}
                />

                <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[#31323E]">{partner.name}</p>
                    <p className="text-[10px] font-mono text-[#31323E]/50 mt-0.5">{partner.chatId || "No chat ID"}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                    <button
                        onClick={() => onTest(partner)}
                        title="Send test message"
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        Test
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-[#31323E]/5 text-[#31323E] border border-[#31323E]/10 rounded-lg hover:bg-[#31323E]/10 transition-colors"
                    >
                        {isExpanded ? "Close" : "Edit"}
                    </button>
                    <button
                        onClick={() => {
                            if (!window.confirm(`Delete partner "${partner.name}"?`)) return;
                            onDelete(partner.id);
                        }}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-500 border border-red-100 rounded-lg hover:bg-red-100 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>

            {/* Edit panel */}
            {isExpanded && (
                <div className="px-5 pb-5 pt-3 bg-[#F9F9F8] border-t border-[#31323E]/8 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">
                                Studio / Partner Name
                            </label>
                            <input
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className={inputCls}
                                placeholder='e.g. "Typografia Kyiv"'
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">
                                Telegram Chat ID or @username
                            </label>
                            <input
                                value={editChatId}
                                onChange={e => setEditChatId(e.target.value)}
                                className={inputCls}
                                placeholder='e.g. "@printpartner" or "123456789"'
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">
                            Message Template (HTML supported)
                        </label>
                        <textarea
                            value={editTemplate}
                            onChange={e => setEditTemplate(e.target.value)}
                            rows={10}
                            className={`${inputCls} font-mono text-xs leading-relaxed`}
                        />
                        {/* Variable chips */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {TEMPLATE_VARS.map(v => (
                                <button
                                    key={v.key}
                                    onClick={() => setEditTemplate(prev => prev + v.key)}
                                    title={v.desc}
                                    className="px-2 py-0.5 bg-white border border-[#31323E]/15 rounded-md text-[9px] font-mono font-bold text-[#31323E]/60 hover:text-[#31323E] hover:border-[#31323E]/30 transition-colors"
                                >
                                    {v.key}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={handleSave}
                            disabled={!editName.trim() || !editChatId.trim()}
                            className="px-5 py-2.5 bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#434455] transition-colors shadow-sm disabled:opacity-40"
                        >
                            Save Partner
                        </button>
                        <button
                            onClick={() => { setIsExpanded(false); setEditName(partner.name); setEditChatId(partner.chatId); setEditTemplate(partner.messageTemplate); }}
                            className="px-4 py-2.5 bg-white border border-[#31323E]/15 text-[#31323E] text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#31323E]/5 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Add Partner Form ──────────────────────────────────────────────────────────

function AddPartnerForm({ onAdd }: { onAdd: (p: TelegramPartner) => void }) {
    const [name, setName] = useState("");
    const [chatId, setChatId] = useState("");
    const [show, setShow] = useState(false);

    const handleAdd = () => {
        if (!name.trim() || !chatId.trim()) return;
        onAdd({
            id: generateId(),
            name: name.trim(),
            chatId: chatId.trim(),
            messageTemplate: DEFAULT_TEMPLATE,
            isActive: true,
        });
        setName("");
        setChatId("");
        setShow(false);
    };

    if (!show) {
        return (
            <button
                onClick={() => setShow(true)}
                className="w-full py-3 border-2 border-dashed border-[#31323E]/20 rounded-xl text-[11px] font-bold uppercase tracking-wider text-[#31323E]/40 hover:text-[#31323E] hover:border-[#31323E]/40 transition-all"
            >
                + Add Telegram Partner
            </button>
        );
    }

    return (
        <div className="p-4 bg-white border-2 border-[#31323E]/15 rounded-xl space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50">New Partner</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={inputCls}
                    placeholder='Studio name (e.g. "Typografia UA")'
                />
                <input
                    value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    className={inputCls}
                    placeholder='Telegram chat_id or @username'
                />
            </div>
            <div className="flex gap-2">
                <button
                    onClick={handleAdd}
                    disabled={!name.trim() || !chatId.trim()}
                    className="px-5 py-2.5 bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#434455] transition-colors shadow-sm disabled:opacity-40"
                >
                    Add Partner
                </button>
                <button
                    onClick={() => setShow(false)}
                    className="px-4 py-2.5 bg-white border border-[#31323E]/15 text-[#31323E] text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-[#31323E]/5 transition-colors"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ── Coming Soon Teaser ────────────────────────────────────────────────────────

function ComingSoonSection({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="rounded-xl border border-[#31323E]/8 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 bg-[#31323E]/2">
                <span className="text-xl">{icon}</span>
                <div className="flex-1">
                    <p className="font-bold text-sm text-[#31323E]/50">{title}</p>
                    <p className="text-[10px] text-[#31323E]/35 font-medium mt-0.5">{description}</p>
                </div>
                <span className="px-2.5 py-1 bg-[#31323E]/5 text-[#31323E]/35 text-[9px] font-bold uppercase tracking-widest rounded-full">
                    Coming Soon
                </span>
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PrintPartnersTab() {
    const [partners, setPartners] = useState<TelegramPartner[]>([]);
    const [botStatus, setBotStatus] = useState<{ bot_configured: boolean; admin_chat_configured: boolean } | null>(null);
    const [testResult, setTestResult] = useState<string | null>(null);

    // Load from localStorage
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setPartners(JSON.parse(raw));
        } catch { /**/ }

        // Check bot configuration
        apiFetch(`${getApiUrl()}/telegram/status`)
            .then(r => r.json())
            .then(setBotStatus)
            .catch(() => {});
    }, []);

    // Persist to localStorage on every change
    const save = (updated: TelegramPartner[]) => {
        setPartners(updated);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /**/ }
    };

    const handleAdd = (p: TelegramPartner) => save([...partners, p]);

    const handleUpdate = (updated: TelegramPartner) =>
        save(partners.map(p => p.id === updated.id ? updated : p));

    const handleDelete = (id: string) =>
        save(partners.filter(p => p.id !== id));

    const handleTest = async (partner: TelegramPartner) => {
        setTestResult(null);
        const testMsg = `✅ <b>Test from ArtShop Admin</b>\n\nBot is connected and your chat ID is working.\nPartner: ${partner.name}`;
        try {
            const res = await apiFetch(`${getApiUrl()}/telegram/send-print-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: partner.chatId, message: testMsg }),
            });
            const data = await res.json();
            setTestResult(data.success ? `✅ Test sent to "${partner.name}"!` : `❌ ${data.detail}`);
        } catch {
            setTestResult("❌ Network error");
        }
        setTimeout(() => setTestResult(null), 5000);
    };

    return (
        <div className="max-w-3xl mx-auto text-[#31323E]">
            {/* Header */}
            <div className="pb-8 mb-8 border-b border-[#31323E]/8">
                <h2 className="text-2xl font-bold tracking-tight mb-1">Print Partners</h2>
                <p className="text-sm text-[#31323E]/50 font-medium">
                    Configure print studio contacts for order dispatch automation.
                </p>
            </div>

            {/* ── Section 1: Telegram ── */}
            <div className="mb-10">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                    <h3 className="text-base font-bold text-[#31323E]">Telegram</h3>
                    <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase tracking-widest rounded-full border border-emerald-200">
                        Active
                    </span>
                </div>

                {/* Bot status indicator */}
                {botStatus !== null && (
                    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border mb-5 ${
                        botStatus.bot_configured
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-amber-50 border-amber-200"
                    }`}>
                        <span className="text-lg flex-shrink-0 mt-0.5">{botStatus.bot_configured ? "✅" : "⚠️"}</span>
                        <div className="flex-1 space-y-0.5">
                            <p className={`text-[11px] font-bold ${botStatus.bot_configured ? "text-emerald-700" : "text-amber-700"}`}>
                                {botStatus.bot_configured ? "Bot token configured — ready to send." : "Bot token not set — cannot send messages yet."}
                            </p>
                            {!botStatus.bot_configured && (
                                <p className="text-[10px] text-amber-600 font-medium">
                                    Add <code className="bg-amber-100 px-1 rounded font-mono">TELEGRAM_BOT_TOKEN</code> to your <code className="bg-amber-100 px-1 rounded font-mono">.env</code> file and restart the backend.
                                </p>
                            )}
                            {botStatus.bot_configured && !botStatus.admin_chat_configured && (
                                <p className="text-[10px] text-emerald-600 font-medium">
                                    Tip: set <code className="bg-emerald-100 px-1 rounded font-mono">TELEGRAM_ADMIN_CHAT_ID</code> to receive new-order alerts.
                                </p>
                            )}
                            {botStatus.bot_configured && botStatus.admin_chat_configured && (
                                <p className="text-[10px] text-emerald-600 font-medium">
                                    New-order admin alerts are also active. ✓
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Test result toast */}
                {testResult && (
                    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border mb-4 text-[11px] font-bold ${
                        testResult.startsWith("✅")
                            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                            : "bg-red-50 border-red-200 text-red-700"
                    }`}>
                        {testResult}
                    </div>
                )}

                {/* Partner list */}
                <div className="space-y-3 mb-4">
                    {partners.length === 0 ? (
                        <div className="py-8 text-center rounded-xl border border-dashed border-[#31323E]/12 bg-[#31323E]/2">
                            <p className="text-sm font-semibold text-[#31323E]/30">No print partners added yet.</p>
                            <p className="text-xs text-[#31323E]/20 mt-1">Add your first Telegram print studio contact below.</p>
                        </div>
                    ) : (
                        partners.map(p => (
                            <PartnerCard
                                key={p.id}
                                partner={p}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                onTest={handleTest}
                            />
                        ))
                    )}
                </div>

                <AddPartnerForm onAdd={handleAdd} />

                {/* How it works */}
                <div className="mt-6 p-4 bg-[#31323E]/3 rounded-xl border border-[#31323E]/8">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/40 mb-2">How it works</p>
                    <ul className="text-[11px] text-[#31323E]/50 font-medium space-y-1 leading-relaxed">
                        <li>① Add your print studio's Telegram chat ID or @username.</li>
                        <li>② Customize the message template with available variables.</li>
                        <li>③ In the Orders tab, open a print order → click <strong>Order Print via Telegram</strong>.</li>
                        <li>④ Preview the message, then click <strong>Send via Telegram</strong>.</li>
                        <li>⑤ The fulfillment status auto-advances to <strong>Print Ordered</strong>. ✓</li>
                    </ul>
                    <p className="text-[10px] text-[#31323E]/35 font-medium mt-3 italic">
                        Partners are saved locally in your browser (localStorage). The bot token is kept securely on the server.
                    </p>
                </div>
            </div>

            {/* ── Section 2: Email (teaser) ── */}
            <div className="mb-5">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#31323E]/20" />
                    <h3 className="text-base font-bold text-[#31323E]/40">Email</h3>
                </div>
                <ComingSoonSection
                    icon="📧"
                    title="Email Integration"
                    description="Send print orders via email to partner studios using customizable templates."
                />
            </div>

            {/* ── Section 3: Prodigy API (teaser) ── */}
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#31323E]/20" />
                    <h3 className="text-base font-bold text-[#31323E]/40">Prodigy API</h3>
                </div>
                <ComingSoonSection
                    icon="⚡"
                    title="Prodigy Print API"
                    description="Direct API integration with Prodigy for automated print order placement and status tracking."
                />
            </div>
        </div>
    );
}
