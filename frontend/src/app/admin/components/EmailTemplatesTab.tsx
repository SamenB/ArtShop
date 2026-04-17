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

// Group label → trigger_event prefix mapping for visual grouping
const EVENT_GROUP_LABELS: Record<string, string> = {
    "fulfillment": "📦 Order Fulfillment",
    "contact": "✉️ Contact Form",
};

const RECIPIENT_BADGE = {
    true:  { label: "→ Customer", color: "#4B86C7", bg: "#EBF2FB" },
    false: { label: "→ Admin",    color: "#7B5E8A", bg: "#F5F0F8" },
};

// ── Template Editor ───────────────────────────────────────────────────────────

function TemplateEditor({
    template,
    onSaved,
}: {
    template: EmailTemplate;
    onSaved: (updated: EmailTemplate) => void;
}) {
    const [subject, setSubject] = useState(template.subject);
    const [body, setBody] = useState(template.body);
    const [isActive, setIsActive] = useState(template.is_active);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const isDirty =
        subject !== template.subject ||
        body !== template.body ||
        isActive !== template.is_active;

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

    const inp = "w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-[#31323E] focus:outline-none focus:border-[#31323E] focus:ring-1 focus:ring-black placeholder-gray-400 transition-all font-mono";

    return (
        <div className="space-y-3">
            {/* Active toggle */}
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setIsActive(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isActive ? "bg-green-500" : "bg-gray-300"}`}
                >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isActive ? "translate-x-5" : "translate-x-1"}`} />
                </button>
                <span className="font-mono text-xs text-zinc-500 uppercase tracking-wider">
                    {isActive ? "Active — email will be sent" : "Inactive — email is suppressed"}
                </span>
            </div>

            {/* Subject */}
            <div>
                <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest mb-1">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={inp} />
            </div>

            {/* Body */}
            <div>
                <label className="block text-[10px] uppercase font-mono text-zinc-500 tracking-widest mb-1">Body</label>
                <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={8}
                    className={inp}
                    style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: "0.78rem", lineHeight: 1.6 }}
                />
            </div>

            {/* Note / placeholder reference */}
            {template.note && (
                <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700 mb-1 font-semibold">Placeholders</p>
                    <p className="font-mono text-xs text-amber-800" style={{ whiteSpace: "pre-wrap" }}>{template.note}</p>
                </div>
            )}

            {/* Save button */}
            {isDirty && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 bg-[#31323E] text-white rounded-md font-mono text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-[#434455] transition-colors"
                    >
                        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
                    </button>
                </div>
            )}
            {saved && !isDirty && (
                <p className="text-right font-mono text-xs text-green-600">✓ Saved</p>
            )}
        </div>
    );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({
    template,
    onUpdated,
}: {
    template: EmailTemplate;
    onUpdated: (t: EmailTemplate) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const badge = RECIPIENT_BADGE[template.send_to_customer ? "true" : "false"];

    return (
        <div className={`border rounded-xl overflow-hidden transition-all ${template.is_active ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
            {/* Header row */}
            <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
            >
                {/* Active indicator */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${template.is_active ? "bg-green-500" : "bg-gray-300"}`} />

                {/* Key */}
                <code className="font-mono text-xs text-[#31323E] font-semibold bg-zinc-100 px-2 py-0.5 rounded shrink-0">{template.key}</code>

                {/* Subject preview */}
                <span className="text-sm text-zinc-600 truncate flex-1">{template.subject}</span>

                {/* Recipient badge */}
                <span
                    className="shrink-0 font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                    style={{ color: badge.color, backgroundColor: badge.bg }}
                >
                    {badge.label}
                </span>

                {/* Expand/Collapse */}
                <span className="text-zinc-400 text-sm ml-2 shrink-0">{expanded ? "▲" : "▼"}</span>
            </button>

            {/* Editor (expanded) */}
            {expanded && (
                <div className="px-6 pb-6 border-t border-gray-100">
                    <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest mt-4 mb-4">
                        Trigger: <span className="text-zinc-600">{template.trigger_event}</span>
                    </p>
                    <TemplateEditor template={template} onSaved={onUpdated} />
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

    // Group templates by their trigger_event prefix (e.g. "fulfillment" from "fulfillment.shipped")
    const groups = Object.entries(
        templates.reduce<Record<string, EmailTemplate[]>>((acc, tpl) => {
            const group = tpl.trigger_event.split(".")[0];
            if (!acc[group]) acc[group] = [];
            acc[group].push(tpl);
            return acc;
        }, {})
    );

    if (loading) return <div className="text-zinc-500 font-mono text-sm tracking-widest animate-pulse">Loading email templates...</div>;

    return (
        <div className="text-[#31323E]">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-serif italic text-[#31323E]">Email Templates</h2>
                    <p className="text-zinc-500 font-mono text-xs uppercase tracking-widest mt-1">
                        Edit the content of all automated emails — changes apply immediately without deployment
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-center">
                        <div className="font-mono text-xl font-bold text-green-600">
                            {templates.filter(t => t.is_active).length}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Active</div>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-center">
                        <div className="font-mono text-xl font-bold text-zinc-400">
                            {templates.filter(t => !t.is_active).length}
                        </div>
                        <div className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Inactive</div>
                    </div>
                </div>
            </div>

            <div className="space-y-10">
                {groups.map(([group, groupTemplates]) => (
                    <div key={group}>
                        <div className="flex items-center gap-4 mb-4">
                            <h3 className="font-serif italic text-xl text-[#31323E] shrink-0">
                                {EVENT_GROUP_LABELS[group] || group}
                            </h3>
                            <div className="flex-1 h-px bg-zinc-100" />
                            <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest shrink-0">
                                {groupTemplates.length} template{groupTemplates.length !== 1 ? "s" : ""}
                            </span>
                        </div>
                        <div className="space-y-2">
                            {groupTemplates.map(tpl => (
                                <TemplateCard key={tpl.id} template={tpl} onUpdated={handleUpdated} />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
