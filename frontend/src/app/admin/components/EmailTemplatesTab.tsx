"use client";

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch } from "@/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmailTemplate {
    id: number;
    key: string;
    trigger_event: string;
    send_to_customer: boolean;
    is_active: boolean;
    subject: string;
    body: string;
    note: string | null;
}

const EVENT_GROUP_LABELS: Record<string, { label: string; desc: string }> = {
    "fulfillment": { label: "Order Fulfillment", desc: "Emails sent during order processing and shipping" },
    "contact":     { label: "Contact Form",      desc: "Emails triggered by customer contact submissions" },
};

// ── Per-template metadata — trigger conditions and behaviour ──────────────────

type TemplateMeta = {
    triggerDesc: string;      // one-liner: when does this fire?
    triggeredBy: "auto" | "admin" | "customer"; // who causes the trigger
    triggerLabel: string;     // short actor label
    warning?: string;         // optional caution note
    infoTags?: string[];      // small pill badges shown on card
};

const TEMPLATE_META: Record<string, TemplateMeta> = {
    fulfillment_confirmed: {
        triggerDesc: "Fires automatically when Monobank confirms payment via webhook. The admin cannot trigger this manually — it is sent as soon as payment.status transitions to 'paid'.",
        triggeredBy: "auto",
        triggerLabel: "Auto — Monobank webhook",
        infoTags: ["Payment confirmed", "No admin action needed"],
    },
    fulfillment_print_ordered: {
        triggerDesc: "Fires when admin advances the order to 'Print Ordered' step in the Orders tab. Notifies the customer that production has started.",
        triggeredBy: "admin",
        triggerLabel: "Admin → Orders tab → Advance to Print Ordered",
        infoTags: ["Admin action required"],
    },
    fulfillment_print_received: {
        triggerDesc: "This status is marked as SILENT — no email is sent. It is an internal pipeline step (print returned from studio) that is not visible to the customer.",
        triggeredBy: "admin",
        triggerLabel: "Admin → Orders tab → Advance to Print Received",
        warning: "Email is suppressed for this status regardless of this template's Active toggle. This is hardcoded in the backend (_SILENT_FULFILLMENT_STATUSES).",
        infoTags: ["Silent — no email sent", "Internal step only"],
    },
    fulfillment_packaging: {
        triggerDesc: "This status is marked as SILENT — no email is sent. It is an internal pipeline step (packaging) not communicated to the customer.",
        triggeredBy: "admin",
        triggerLabel: "Admin → Orders tab → Advance to Packaging",
        warning: "Email is suppressed for this status regardless of this template's Active toggle. This is hardcoded in the backend (_SILENT_FULFILLMENT_STATUSES).",
        infoTags: ["Silent — no email sent", "Internal step only"],
    },
    fulfillment_shipped: {
        triggerDesc: "Fires when admin marks order as 'Shipped' in the Orders tab. Includes tracking number, carrier name, and tracking URL if provided.",
        triggeredBy: "admin",
        triggerLabel: "Admin → Orders tab → Mark as Shipped",
        infoTags: ["Admin action required", "Tracking data included"],
    },
    fulfillment_delivered: {
        triggerDesc: "Fires when admin marks order as 'Delivered' in the Orders tab. Final notification in the fulfillment pipeline.",
        triggeredBy: "admin",
        triggerLabel: "Admin → Orders tab → Advance to Delivered",
        infoTags: ["Admin action required"],
    },
    fulfillment_cancelled: {
        triggerDesc: "Fires when an order is cancelled. Can happen: (1) admin manually cancels in Orders tab, (2) payment fails or is refunded — cancellation is automatic in that case.",
        triggeredBy: "auto",
        triggerLabel: "Admin manual cancel OR auto on payment failure/refund",
        infoTags: ["Auto OR manual", "Inventory auto-released"],
    },
    contact_autoreply: {
        triggerDesc: "Fires when a visitor submits the Contact Form on the site. This copy goes to the customer — a confirmation that their message was received.",
        triggeredBy: "customer",
        triggerLabel: "Customer submits Contact Form",
        infoTags: ["Customer copy"],
    },
    contact_admin: {
        triggerDesc: "Fires when a visitor submits the Contact Form on the site. This copy goes to the admin inbox with all message details.",
        triggeredBy: "customer",
        triggerLabel: "Customer submits Contact Form",
        infoTags: ["Admin inbox copy"],
    },
};

// ── Shared Styles ─────────────────────────────────────────────────────────────

const inp = "w-full bg-white border border-[#31323E]/15 rounded-lg px-3.5 py-2.5 text-sm text-[#31323E] font-medium focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all";

// ── Template Editor ───────────────────────────────────────────────────────────

function TemplateEditor({ template, onSaved }: { template: EmailTemplate; onSaved: (updated: EmailTemplate) => void }) {
    const [subject, setSubject] = useState(template.subject);
    const [body, setBody] = useState(template.body);
    const [isActive, setIsActive] = useState(template.is_active);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const isDirty = subject !== template.subject || body !== template.body || isActive !== template.is_active;

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await apiFetch(`${getApiUrl()}/email-templates/${template.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject, body, is_active: isActive }),
            });
            if (res.ok) {
                const updated = await res.json();
                onSaved(updated);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } else {
                alert("Save failed");
            }
        } catch { alert("Network error"); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-4 pt-4">
            {/* Active toggle */}
            <div className="flex items-center gap-3 p-3 bg-[#31323E]/3 rounded-lg">
                <button
                    type="button"
                    onClick={() => setIsActive(v => !v)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors flex-shrink-0 ${isActive ? "bg-emerald-500" : "bg-[#31323E]/20"}`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
                <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isActive ? "text-emerald-600" : "text-[#31323E]/40"}`}>
                        {isActive ? "Active" : "Inactive"}
                    </p>
                    <p className="text-[11px] text-[#31323E]/40 font-medium">
                        {isActive ? "Email will be sent on trigger" : "Email is suppressed"}
                    </p>
                </div>
            </div>

            {/* Subject */}
            <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">Subject Line</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
            </div>

            {/* Body */}
            <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/50 mb-1.5">Email Body</label>
                <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={8}
                    className={`${inp} font-mono text-[12px] leading-relaxed`}
                    style={{ resize: "vertical" }}
                />
            </div>

            {/* Placeholders note */}
            {template.note && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-700 mb-1.5">Available Placeholders</p>
                    <p className="font-mono text-xs text-amber-800 leading-relaxed" style={{ whiteSpace: "pre-wrap" }}>{template.note}</p>
                </div>
            )}

            {/* Save button */}
            {isDirty && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 bg-[#31323E] text-white rounded-lg text-sm font-bold uppercase tracking-wider disabled:opacity-50 hover:bg-[#434455] transition-colors shadow-sm"
                    >
                        {saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            )}
            {saved && !isDirty && (
                <p className="text-right text-xs font-bold text-emerald-600 tracking-wider">✓ Saved successfully</p>
            )}
        </div>
    );
}

// ── Template Card ─────────────────────────────────────────────────────────────

const TRIGGER_BY_STYLE = {
    auto:     { label: "Auto",     cls: "bg-violet-50 text-violet-700 border border-violet-200" },
    admin:    { label: "Admin",    cls: "bg-blue-50 text-blue-700 border border-blue-200" },
    customer: { label: "Customer", cls: "bg-amber-50 text-amber-700 border border-amber-200" },
};

function TemplateCard({ template, onUpdated }: { template: EmailTemplate; onUpdated: (t: EmailTemplate) => void }) {
    const [expanded, setExpanded] = useState(false);
    const isCustomer = template.send_to_customer;
    const meta = TEMPLATE_META[template.key];
    const isSilent = meta?.infoTags?.some(t => t.toLowerCase().includes("silent"));

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${expanded ? "border-[#31323E]/20 shadow-md" : "border-[#31323E]/10 hover:border-[#31323E]/20"} ${!template.is_active && !isSilent ? "opacity-60" : ""}`}>
            {/* Header row */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left bg-white hover:bg-[#31323E]/2 transition-colors"
            >
                {/* Active / Silent indicator */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isSilent
                        ? "bg-[#31323E]/15"
                        : template.is_active
                            ? "bg-emerald-500 shadow-sm shadow-emerald-400/50"
                            : "bg-[#31323E]/20"
                }`} />

                {/* Key badge */}
                <code className="text-[10px] font-bold text-[#31323E] bg-[#31323E]/8 px-2.5 py-1 rounded-md flex-shrink-0 tracking-wide">
                    {template.key}
                </code>

                {/* Subject preview */}
                <span className={`text-sm font-medium truncate flex-1 ${isSilent ? "text-[#31323E]/35 line-through" : "text-[#31323E]/70"}`}>
                    {isSilent ? "[ No email sent — internal step ]" : template.subject}
                </span>

                {/* Recipient badge */}
                <span className={`flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                    isCustomer
                        ? "bg-blue-50 text-blue-600 border border-blue-100"
                        : "bg-purple-50 text-purple-600 border border-purple-100"
                }`}>
                    {isCustomer ? "→ Customer" : "→ Admin"}
                </span>

                {/* Chevron */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-[#31323E]/30 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {/* Expanded editor */}
            {expanded && (
                <div className="px-5 pb-5 border-t border-[#31323E]/8 bg-[#FAFAF9]">

                    {/* ── Trigger metadata block ───────────────────────── */}
                    {meta && (
                        <div className="mt-4 mb-5 space-y-3">

                            {/* Silent warning — prominent orange banner */}
                            {meta.warning && (
                                <div className="flex gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3.5">
                                    <span className="text-orange-500 text-lg flex-shrink-0 mt-0.5">⚠️</span>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-orange-700 mb-1">
                                            Email Suppressed — Silent Status
                                        </p>
                                        <p className="text-xs text-orange-800 font-medium leading-relaxed">{meta.warning}</p>
                                    </div>
                                </div>
                            )}

                            {/* Trigger description card */}
                            <div className="bg-white border border-[#31323E]/10 rounded-xl p-4 space-y-3">
                                {/* Who triggers it */}
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-0.5">
                                        <span className={`text-[9px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full ${TRIGGER_BY_STYLE[meta.triggeredBy].cls}`}>
                                            {TRIGGER_BY_STYLE[meta.triggeredBy].label}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/40 mb-0.5">Triggered by</p>
                                        <p className="text-xs font-semibold text-[#31323E]/70">{meta.triggerLabel}</p>
                                    </div>
                                </div>

                                {/* Separator */}
                                <div className="border-t border-[#31323E]/6" />

                                {/* When does it fire */}
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/40 mb-1.5">When this email fires</p>
                                    <p className="text-xs text-[#31323E]/70 font-medium leading-relaxed">{meta.triggerDesc}</p>
                                </div>

                                {/* Info tags */}
                                {meta.infoTags && meta.infoTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {meta.infoTags.map(tag => (
                                            <span key={tag} className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                                                tag.toLowerCase().includes("silent") || tag.toLowerCase().includes("no email")
                                                    ? "bg-orange-50 text-orange-600 border-orange-200"
                                                    : tag.toLowerCase().includes("auto")
                                                        ? "bg-violet-50 text-violet-600 border-violet-200"
                                                        : tag.toLowerCase().includes("admin")
                                                            ? "bg-blue-50 text-blue-600 border-blue-200"
                                                            : "bg-[#31323E]/5 text-[#31323E]/50 border-[#31323E]/10"
                                            }`}>{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Technical trigger key */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#31323E]/30">Backend key:</span>
                                <code className="text-[11px] font-bold text-[#31323E]/50 bg-white px-2 py-0.5 rounded-lg border border-[#31323E]/10">
                                    {template.trigger_event}
                                </code>
                            </div>
                        </div>
                    )}

                    {/* ── Editor (hidden for silent templates) ──────────── */}
                    {isSilent ? (
                        <div className="py-4 text-center border border-dashed border-[#31323E]/10 rounded-xl bg-white">
                            <p className="text-sm text-[#31323E]/30 font-medium">No editor — this template is never sent to customers.</p>
                        </div>
                    ) : (
                        <TemplateEditor template={template} onSaved={onUpdated} />
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function EmailTemplatesTab() {
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiFetch(`${getApiUrl()}/email-templates`)
            .then(res => res.ok ? res.json() : [])
            .then(data => setTemplates(data))
            .finally(() => setLoading(false));
    }, []);

    const handleUpdated = (updated: EmailTemplate) =>
        setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));

    const groups = Object.entries(
        templates.reduce<Record<string, EmailTemplate[]>>((acc, tpl) => {
            const group = tpl.trigger_event.split(".")[0];
            if (!acc[group]) acc[group] = [];
            acc[group].push(tpl);
            return acc;
        }, {})
    );

    const activeCount = templates.filter(t => t.is_active).length;
    const inactiveCount = templates.filter(t => !t.is_active).length;

    if (loading) return (
        <div className="flex items-center gap-3 py-10">
            <div className="w-5 h-5 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
            <span className="text-sm font-semibold text-[#31323E]/50 uppercase tracking-wider">Loading email templates…</span>
        </div>
    );

    return (
        <div className="text-[#31323E]">
            {/* Page Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b border-[#31323E]/8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">Email Templates</h2>
                    <p className="text-sm text-[#31323E]/50 font-medium">
                        Edit automated emails — changes apply immediately without deployment
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center">
                        <div className="text-xl font-bold text-emerald-600 leading-none">{activeCount}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/70 mt-1">Active</div>
                    </div>
                    <div className="bg-[#31323E]/5 border border-[#31323E]/10 rounded-xl px-4 py-3 text-center">
                        <div className="text-xl font-bold text-[#31323E]/40 leading-none">{inactiveCount}</div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#31323E]/30 mt-1">Inactive</div>
                    </div>
                </div>
            </div>

            <div className="space-y-10">
                {groups.map(([group, groupTemplates]) => {
                    const meta = EVENT_GROUP_LABELS[group];
                    return (
                        <div key={group}>
                            {/* Group Header */}
                            <div className="mb-4">
                                <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-base font-bold tracking-tight text-[#31323E]">
                                        {meta?.label || group}
                                    </h3>
                                    <div className="flex-1 h-px bg-[#31323E]/8" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#31323E]/35">
                                        {groupTemplates.length} template{groupTemplates.length !== 1 ? "s" : ""}
                                    </span>
                                </div>
                                {meta?.desc && (
                                    <p className="text-xs text-[#31323E]/40 font-medium ml-0">{meta.desc}</p>
                                )}
                            </div>

                            {/* Template cards */}
                            <div className="space-y-2">
                                {groupTemplates.map(tpl => (
                                    <TemplateCard key={tpl.id} template={tpl} onUpdated={handleUpdated} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
