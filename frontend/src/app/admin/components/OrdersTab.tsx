"use client";

/**
 * Orders Management Tab  Two-Phase Lifecycle Dashboard.
 */

import { useState, useEffect } from "react";
import { getApiUrl, apiFetch, apiJson, getImageUrl } from "@/utils";

//  Constants 

const PAYMENT_STATUSES = [
  {
    value: "pending",
    label: "Pending",
    bg: "#F9F9F9",
    border: "#E4E4E7",
    text: "#71717A",
    icon: "",
  },
  {
    value: "awaiting_payment",
    label: "Awaiting Bank",
    bg: "#FEFCE8",
    border: "#FDE047",
    text: "#854D0E",
    icon: "",
  },
  {
    value: "processing",
    label: "Processing",
    bg: "#EFF6FF",
    border: "#93C5FD",
    text: "#1D4ED8",
    icon: "",
  },
  {
    value: "hold",
    label: "On Hold",
    bg: "#F8FAFC",
    border: "#94A3B8",
    text: "#475569",
    icon: "",
  },
  {
    value: "paid",
    label: "Paid",
    bg: "#F0FDF4",
    border: "#22C55E",
    text: "#15803D",
    icon: "",
  },
  {
    value: "mock_paid",
    label: "Mock Paid",
    bg: "#F0FDF4",
    border: "#86EFAC",
    text: "#15803D",
    icon: "",
  },
  {
    value: "failed",
    label: "Failed",
    bg: "#FEF2F2",
    border: "#FCA5A5",
    text: "#991B1B",
    icon: "",
  },
  {
    value: "refunded",
    label: "Refunded",
    bg: "#FAF5FF",
    border: "#C4B5FD",
    text: "#6B21A8",
    icon: "",
  },
];

const PAYMENT_STATUS_MAP = Object.fromEntries(
  PAYMENT_STATUSES.map((s) => [s.value, s]),
);

// Print edition types that trigger print-specific fulfillment steps
const PRINT_EDITION_TYPES = new Set([
  "canvas_print",
  "canvas_print_limited",
  "paper_print",
  "paper_print_limited",
]);

function orderHasPrints(order: any): boolean {
  return (
    order.items?.some((item: any) =>
      PRINT_EDITION_TYPES.has(item.edition_type),
    ) ?? false
  );
}

// Base fulfillment steps (always present)
const BASE_STEPS = [
  {
    value: "confirmed",
    label: "Confirmed",
    icon: "",
    auto: true,
    desc: "Auto-set when payment received",
  },
  {
    value: "packaging",
    label: "Packaging",
    icon: "",
    auto: false,
    desc: "Preparing parcel",
  },
  {
    value: "shipped",
    label: "Shipped",
    icon: "",
    auto: false,
    desc: "Dispatched with TTN",
  },
  {
    value: "delivered",
    label: "Delivered",
    icon: "",
    auto: false,
    desc: "Received by buyer",
  },
];

// Extra steps inserted after "confirmed" when prints are present
const PRINT_STEPS = [
  {
    value: "print_ordered",
    label: "Print Ordered",
    icon: "",
    auto: false,
    desc: "Sent to print studio",
  },
  {
    value: "print_received",
    label: "Print Received",
    icon: "",
    auto: false,
    desc: "Artwork back from studio",
  },
];

function getFulfillmentSteps(hasPrints: boolean) {
  if (!hasPrints) return BASE_STEPS;
  // Insert print steps between "confirmed" and "packaging"
  return [
    BASE_STEPS[0], // confirmed
    ...PRINT_STEPS, // print_ordered, print_received
    ...BASE_STEPS.slice(1), // packaging, shipped, delivered
  ];
}

// Legacy flat array (used only for filter pills in the advanced filter UI)
const FULFILLMENT_STEPS = getFulfillmentSteps(true); // show all possible statuses in filter
const FULFILLMENT_STEP_VALUES = FULFILLMENT_STEPS.map((s) => s.value);

const CARRIERS = [
  { value: "nova_poshta", label: "Nova Poshta" },
  { value: "ukrposhta", label: "Ukrposhta" },
  { value: "dhl", label: "DHL" },
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "meest", label: "Meest Express" },
];

const PAID_STATUSES = new Set(["paid", "mock_paid"]);

type OrderDetailTab = "overview" | "lifecycle" | "prodigi" | "activity";

const ORDER_DETAIL_TABS: Array<{ id: OrderDetailTab; label: string; desc: string }> = [
  { id: "overview", label: "Overview", desc: "Customer, items, shipping" },
  { id: "lifecycle", label: "Lifecycle", desc: "Payment and fulfillment" },
  { id: "prodigi", label: "Prodigi", desc: "Provider gates and cost" },
  { id: "activity", label: "Activity", desc: "Timeline and admin actions" },
];

//  Shared Input Styles 

const inputCls =
  "w-full bg-white border border-[#31323E]/15 rounded-lg px-3 py-2 text-sm font-medium text-[#31323E] focus:outline-none focus:border-[#31323E]/50 focus:ring-2 focus:ring-[#31323E]/10 placeholder-[#31323E]/30 transition-all";

//  Tiny helpers 

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#31323E]/40 mb-2.5 leading-none">
      {text}
    </p>
  );
}

function PaymentBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "lg";
}) {
  const cfg = PAYMENT_STATUS_MAP[status] || {
    bg: "#F9F9F9",
    border: "#E4E4E7",
    text: "#71717A",
    label: status,
    icon: "?",
  };
  const cls =
    size === "lg"
      ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider border-2"
      : "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border";
  return (
    <span
      className={cls}
      style={{
        backgroundColor: cfg.bg,
        borderColor: cfg.border,
        color: cfg.text,
      }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function FulfillmentBadge({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-red-50 border border-red-200 text-red-600">
         Cancelled
      </span>
    );
  }
  const step = FULFILLMENT_STEPS.find((s) => s.value === status);
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#31323E]/5 border border-[#31323E]/15 text-[#31323E]">
      {step?.icon || ""} {step?.label || status}
    </span>
  );
}

//  Phase 1: Payment 

function PaymentPhase({
  order,
  onPaymentOverride,
  overrideSaving,
}: {
  order: any;
  onPaymentOverride: (status: string) => void;
  overrideSaving: boolean;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(order.payment_status);

  const cfg = PAYMENT_STATUS_MAP[order.payment_status] || PAYMENT_STATUSES[0];
  const isPaid = PAID_STATUSES.has(order.payment_status);
  const isAwaitingOrProcessing = [
    "awaiting_payment",
    "processing",
    "hold",
  ].includes(order.payment_status);

  return (
    <div className="space-y-3">
      {/* Status display */}
      <div
        className="p-4 rounded-xl border-2 flex items-start gap-3"
        style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
      >
        <span
          className="text-xl flex-shrink-0 mt-0.5"
          style={{ color: cfg.text }}
        >
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm" style={{ color: cfg.text }}>
            {cfg.label}
          </p>
          {isPaid && (
            <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
              Payment confirmed by Monobank 
            </p>
          )}
          {isAwaitingOrProcessing && (
            <p className="text-[11px] text-amber-700 mt-0.5 font-medium">
              Waiting for bank confirmation
            </p>
          )}
          {order.payment_status === "failed" && (
            <p className="text-[11px] text-red-700 mt-0.5 font-medium">
              Payment declined  fulfillment auto-cancelled
            </p>
          )}
          {order.payment_status === "refunded" && (
            <p className="text-[11px] text-purple-700 mt-0.5 font-medium">
              Payment reversed  fulfillment auto-cancelled
            </p>
          )}
          {order.payment_status === "pending" && (
            <p className="text-[11px] text-[#31323E]/50 mt-0.5 font-medium">
              Payment session not yet initiated
            </p>
          )}
        </div>
        <span
          className="flex-shrink-0 text-[9px] uppercase tracking-wider font-bold bg-white/60 border border-current/20 px-2 py-0.5 rounded-full"
          style={{ color: cfg.text }}
        >
          Auto
        </span>
      </div>

      {/* Invoice info */}
      {order.invoice_id && (
        <div className="bg-white border border-[#31323E]/10 rounded-xl p-3.5 space-y-1.5">
          <p className="text-[9px] uppercase tracking-widest font-bold text-[#31323E]/40">
            Monobank Invoice
          </p>
          <p className="text-[11px] font-mono font-semibold text-[#31323E] truncate">
            {order.invoice_id}
          </p>
          {order.payment_url && (
            <a
              href={order.payment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1 font-medium"
            >
              Payment URL 
            </a>
          )}
        </div>
      )}

      {/* Manual override */}
      <div className="border border-amber-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowOverride(!showOverride)}
          className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-amber-500 text-sm"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
              Manual Payment Override
            </span>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-amber-400 transition-transform ${showOverride ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {showOverride && (
          <div className="px-4 pb-4 pt-3 bg-white space-y-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                 Not recommended
              </p>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Payment status is automatically managed by the Monobank webhook.
                Only use this if payment was received outside the system (bank
                transfer, cash).
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-[9px] uppercase tracking-wider font-bold text-[#31323E]/50">
                Force Payment Status
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {PAYMENT_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSelectedStatus(s.value)}
                    className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider border-2 transition-all text-left flex items-center gap-1.5 ${selectedStatus === s.value ? "ring-2 ring-offset-1 ring-[#31323E]" : "opacity-60 hover:opacity-100"}`}
                    style={{
                      backgroundColor: s.bg,
                      borderColor:
                        selectedStatus === s.value ? s.border : "#E4E4E7",
                      color: s.text,
                    }}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  if (selectedStatus === order.payment_status) return;
                  if (
                    !window.confirm(
                      ` Force payment status to "${selectedStatus}"?\n\nThis overrides the Monobank webhook data.`,
                    )
                  )
                    return;
                  onPaymentOverride(selectedStatus);
                  setShowOverride(false);
                }}
                disabled={
                  overrideSaving || selectedStatus === order.payment_status
                }
                className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-40"
              >
                {overrideSaving ? "Saving" : "Apply Override"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

//  Phase 2: Fulfillment 

function FulfillmentPhase({
  order,
  onStatusChange,
  saving,
}: {
  order: any;
  onStatusChange: (
    status: string,
    extra?: { tracking_number?: string; carrier?: string; notes?: string },
  ) => void;
  saving: boolean;
}) {
  const hasPrints = orderHasPrints(order);
  const steps = getFulfillmentSteps(hasPrints);
  const stepValues = steps.map((s) => s.value);

  const [notes, setNotes] = useState(order.notes || "");
  const [trackingNum, setTrackingNum] = useState(order.tracking_number || "");
  const [carrier, setCarrier] = useState(order.carrier || "nova_poshta");
  const [showShipping, setShowShipping] = useState(false);

  const isPaid = PAID_STATUSES.has(order.payment_status);
  const isCancelled = order.fulfillment_status === "cancelled";
  const currentIdx = stepValues.indexOf(order.fulfillment_status);
  const nextStep =
    currentIdx >= 0 && currentIdx < stepValues.length - 1
      ? steps[currentIdx + 1]
      : null;

  const handleAdvance = () => {
    if (!nextStep) return;
    if (nextStep.value === "shipped") {
      setShowShipping(true);
      return;
    }
    if (!window.confirm(`Advance fulfillment to "${nextStep.label}"?`)) return;
    onStatusChange(nextStep.value, { notes: notes || undefined });
  };

  const handleConfirmShip = () => {
    if (
      !window.confirm(
        `Mark order as Shipped with carrier "${CARRIERS.find((c) => c.value === carrier)?.label}"?`,
      )
    )
      return;
    onStatusChange("shipped", {
      tracking_number: trackingNum || undefined,
      carrier: carrier || undefined,
      notes: notes || undefined,
    });
    setShowShipping(false);
  };

  if (!isPaid && !isCancelled) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[#31323E]/10 p-6 text-center bg-[#31323E]/2">
        <div className="text-3xl mb-2"></div>
        <p className="font-bold text-[#31323E] text-sm mb-1">
          Fulfillment Locked
        </p>
        <p className="text-xs text-[#31323E]/40 font-medium leading-relaxed">
          Awaiting payment confirmation.
          <br />
          Unlocks automatically when Monobank confirms.
        </p>
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
        <p className="text-red-600 text-sm font-bold mb-1">
           Order Cancelled
        </p>
        <p className="text-xs text-red-500 font-medium">
          {order.payment_status === "failed" ||
          order.payment_status === "refunded"
            ? "Auto-cancelled due to payment failure. Original artwork released back to inventory."
            : "This order has been cancelled."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pipeline steps rail */}
      <div>
        <SectionLabel text="Fulfillment Steps" />
        {!hasPrints && (
          <p className="text-[10px] text-[#31323E]/40 font-medium mb-2 leading-relaxed">
            Original-only order  print steps skipped.
          </p>
        )}
        <div className="space-y-1.5">
          {steps.map((step, idx) => {
            const isCurrent = step.value === order.fulfillment_status;
            const isPast = currentIdx > idx;
            const isClickable = !step.auto && !saving;

            return (
              <button
                key={step.value}
                onClick={() => {
                  if (!isClickable) return;
                  if (step.value === "shipped") {
                    setShowShipping(true);
                    return;
                  }
                  if (
                    !window.confirm(
                      `Set fulfillment status to "${step.label}"?`,
                    )
                  )
                    return;
                  onStatusChange(step.value, { notes: notes || undefined });
                }}
                disabled={saving || step.auto}
                title={step.auto ? `Auto-set: ${step.desc}` : step.desc}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                  isCurrent
                    ? "shadow-sm"
                    : isPast
                      ? "opacity-80 hover:opacity-100"
                      : "opacity-30 hover:opacity-50"
                } ${isClickable && !isCurrent ? "cursor-pointer" : "cursor-default"}`}
                style={{
                  backgroundColor: isCurrent
                    ? "#fff"
                    : isPast
                      ? "#F8FAFC"
                      : "#fff",
                  borderColor: isCurrent
                    ? "#31323E"
                    : isPast
                      ? "#A1A1AA"
                      : "#E4E4E7",
                  color: isCurrent ? "#31323E" : isPast ? "#52525B" : "#A1A1AA",
                }}
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 border-2 ${
                    isCurrent
                      ? "bg-[#31323E] text-white border-[#31323E]"
                      : isPast
                        ? "bg-white text-[#31323E] border-[#A1A1AA]"
                        : "bg-white text-[#D4D4D8] border-[#E4E4E7]"
                  }`}
                >
                  {isPast ? "" : idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold">
                      {step.icon} {step.label}
                    </span>
                    {step.auto && (
                      <span className="text-[8px] uppercase tracking-wider font-bold bg-blue-50 text-blue-500 border border-blue-100 px-1.5 py-0.5 rounded-full">
                        Auto
                      </span>
                    )}
                    {isCurrent && (
                      <span className="text-[8px] uppercase tracking-wider font-bold bg-[#31323E] text-white px-1.5 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] opacity-60 mt-0.5 font-medium">
                    {step.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick advance */}
      {nextStep && !showShipping && (
        <button
          onClick={handleAdvance}
          disabled={saving}
          className="w-full py-3 bg-[#31323E] text-white text-[11px] font-bold uppercase tracking-wider rounded-xl hover:bg-[#434455] transition-all shadow-sm disabled:opacity-50"
        >
          {saving ? "Updating" : ` Advance to: ${nextStep.label}`}
        </button>
      )}

      {/* Shipping input panel */}
      {showShipping && (
        <div className="p-4 bg-white border-2 border-[#31323E]/15 rounded-xl space-y-3">
          <SectionLabel text="Shipping Details" />
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className={inputCls}
          >
            {CARRIERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            <option value="">Other / Manual</option>
          </select>
          <input
            value={trackingNum}
            onChange={(e) => setTrackingNum(e.target.value)}
            placeholder="Tracking / TTN number"
            className={inputCls}
          />
          <div className="flex gap-2">
            <button
              onClick={handleConfirmShip}
              disabled={saving}
              className="flex-1 py-2.5 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-emerald-700 transition-all shadow-sm"
            >
              {saving ? "Saving" : " Mark as Shipped"}
            </button>
            <button
              onClick={() => setShowShipping(false)}
              className="px-4 py-2.5 border border-[#31323E]/15 text-[#31323E] text-[10px] font-bold rounded-lg hover:bg-[#31323E]/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tracking info */}
      {order.fulfillment_status === "shipped" && order.tracking_number && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <SectionLabel text="Tracking Info" />
          <p className="text-sm text-emerald-800 font-semibold">
            {CARRIERS.find((c) => c.value === order.carrier)?.label ||
              order.carrier}
            {"  "}
            <span className="font-bold font-mono">{order.tracking_number}</span>
          </p>
          {order.tracking_url && (
            <a
              href={order.tracking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-emerald-700 underline hover:text-emerald-900 mt-1.5 inline-block font-medium"
            >
              Track Parcel 
            </a>
          )}
        </div>
      )}

      {/* Cancel order */}
      {order.fulfillment_status !== "delivered" && (
        <button
          onClick={() => {
            if (
              !window.confirm(
                "Cancel this order? Original artworks will be returned to inventory.",
              )
            )
              return;
            onStatusChange("cancelled");
          }}
          disabled={saving}
          className="w-full text-[10px] uppercase tracking-widest font-bold text-red-300 hover:text-red-600 transition-colors py-1.5"
        >
          Cancel Order
        </button>
      )}

      {/* Admin notes */}
      <div>
        <SectionLabel text="Internal Notes (not visible to customer)" />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Fragile  bubble wrap. Packed 4 May."
          rows={2}
          className={inputCls}
        />
      </div>
    </div>
  );
}

// Order Timeline 

function OrderTimeline({ order }: { order: any }) {
  const steps = [
    { key: "created_at", label: "Order Placed", icon: "" },
    { key: "confirmed_at", label: "Payment & Confirmed", icon: "" },
    { key: "print_ordered_at", label: "Print Ordered", icon: "" },
    { key: "print_received_at", label: "Print Received", icon: "" },
    { key: "shipped_at", label: "Shipped", icon: "" },
    { key: "delivered_at", label: "Delivered", icon: "" },
  ];
  const activeSteps = steps.filter((s) => order[s.key]);
  if (activeSteps.length === 0) return null;

  return (
    <div>
      <SectionLabel text="Order Timeline" />
      <div className="relative pl-6 space-y-4">
        <div className="absolute left-[9px] top-1 bottom-1 w-px bg-[#31323E]/10" />
        {steps.map((step) => {
          const ts = order[step.key];
          if (!ts) return null;
          return (
            <div key={step.key} className="relative flex items-start gap-3">
              <div className="absolute -left-6 w-4 h-4 rounded-full bg-white border-2 border-[#31323E]/25 flex items-center justify-center text-[8px] flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-[#31323E]">
                  {step.label}
                </p>
                <p className="text-[10px] text-[#31323E]/50 font-medium">
                  {new Date(ts).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

//  Main Component 

function FlowStatusPill({ status }: { status: string }) {
  const normalized = status || "pending";
  const cls =
    normalized === "passed" || normalized === "submitted"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "failed" || normalized === "blocked"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : normalized === "skipped"
          ? "border-[#31323E]/10 bg-[#31323E]/4 text-[#31323E]/45"
          : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${cls}`}
    >
      {normalized === "passed" || normalized === "submitted" ? "OK " : ""}
      {normalized}
    </span>
  );
}

function formatFlowTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactJson(value: unknown) {
  if (!value || typeof value !== "object") return null;
  return JSON.stringify(value, null, 2);
}

function formatEuro(value: unknown) {
  const amount = Number(value ?? 0);
  return `EUR ${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

function prodigiItemCost(item: any) {
  return (
    Number(item.prodigi_wholesale_eur ?? 0) +
    Number(item.prodigi_shipping_eur ?? 0)
  );
}

function ProdigiFlowPanel({
  order,
  flow,
  loading,
  submitting,
  onRefresh,
  onSubmit,
}: {
  order: any;
  flow: any;
  loading: boolean;
  submitting: boolean;
  onRefresh: () => void;
  onSubmit: () => void;
}) {
  const hasPrints = orderHasPrints(order);
  const flowItems = flow?.items ?? [];
  const supplierTotal = flowItems.reduce(
    (sum: number, item: any) => sum + prodigiItemCost(item),
    0,
  );
  const customerPaid = Number(order.total_price ?? 0);
  const isUnderpaid = supplierTotal > 0 && supplierTotal > customerPaid;
  const margin = customerPaid - supplierTotal;
  return (
    <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <SectionLabel text="Prodigi API Flow" />
          <p className="text-xs font-medium leading-relaxed text-[#31323E]/50">
            Payment confirmation creates permission to fulfill. Prodigi
            submission either runs automatically or waits for the manual button
            here.
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded-md border border-[#31323E]/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/60 disabled:opacity-50"
        >
          {loading ? "Loading" : "Refresh"}
        </button>
      </div>

      {!hasPrints ? (
        <div className="rounded-lg border border-[#31323E]/10 bg-[#31323E]/3 p-4 text-xs font-semibold text-[#31323E]/50">
          This order has no Prodigi-backed print items.
        </div>
      ) : !flow ? (
        <div className="rounded-lg border border-[#31323E]/10 bg-[#31323E]/3 p-4 text-xs font-semibold text-[#31323E]/50">
          {loading
            ? "Loading Prodigi flow..."
            : "Open or refresh to load the Prodigi flow."}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                Execution
              </p>
              <p className="mt-1 font-bold text-[#31323E]">
                {flow.settings.fulfillment_mode}
              </p>
            </div>
            <div className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                Prodigi API
              </p>
              <p className="mt-1 font-bold text-[#31323E]">
                {flow.settings.prodigi_api_mode}
              </p>
            </div>
            <div className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                Paid
              </p>
              <p className="mt-1 font-bold text-[#31323E]">
                ${Number(order.total_price ?? 0).toFixed(0)}
              </p>
            </div>
            <div className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#31323E]/40">
                Prodigi Cost
              </p>
              <p className="mt-1 font-bold text-[#31323E]">
                {formatEuro(
                  supplierTotal,
                )}
              </p>
            </div>
          </div>

          <div
            className={`rounded-xl border p-4 ${
              isUnderpaid
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">
                  {isUnderpaid ? "Cost check failed" : "Cost check passed"}
                </p>
                <p className="mt-1 text-xs font-medium leading-relaxed opacity-80">
                  Customer paid ${customerPaid.toFixed(2)}. Prodigi supplier
                  total is {formatEuro(supplierTotal)}.
                </p>
              </div>
              <span className="rounded-md border border-current/20 bg-white/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em]">
                {isUnderpaid
                  ? `Under by ${formatEuro(Math.abs(margin))}`
                  : `Margin ${formatEuro(margin)}`}
              </span>
            </div>
            {isUnderpaid ? (
              <p className="mt-3 rounded-lg bg-white/70 p-3 text-xs font-semibold leading-relaxed">
                Prodigi submit is blocked. Fix the storefront price, collect an
                adjustment, or recreate the order with the current baked price
                before sending it to production.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            {(flow.summary ?? []).map((step: any) => (
              <div
                key={step.key}
                className="rounded-lg border border-[#31323E]/8 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#31323E]">
                      {step.label}
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#31323E]/50">
                      {step.detail}
                    </p>
                    {step.timestamp && (
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#31323E]/35">
                        {formatFlowTime(step.timestamp)}
                      </p>
                    )}
                  </div>
                  <FlowStatusPill status={step.status} />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onSubmit}
            disabled={!flow.can_submit_manually || submitting || isUnderpaid}
            className="w-full rounded-xl bg-[#31323E] py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white transition-all disabled:opacity-35"
          >
            {submitting
              ? "Submitting to Prodigi..."
              : isUnderpaid
                ? "Prodigi Submit Blocked By Cost Check"
                : "Submit This Order To Prodigi"}
          </button>

          <div className="space-y-3">
            <SectionLabel text="Prodigi Items And Cost Check" />
            {flowItems.map((item: any) => (
              <div
                key={item.id}
                className="rounded-lg border border-[#31323E]/8 bg-[#F7F7F5] p-3 text-xs"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-bold text-[#31323E]">
                      {item.title || `Item #${item.id}`}
                    </p>
                    <p className="mt-1 text-[#31323E]/50">
                      {item.prodigi_sku} / {item.prodigi_category_id} /{" "}
                      {item.prodigi_slot_size_label}
                    </p>
                    <p className="text-[#31323E]/50">
                      {item.prodigi_shipping_method || "Standard"} shipping /
                      customer paid ${Number(item.price ?? 0).toFixed(0)}
                    </p>
                  </div>
                  <div className="min-w-[170px] rounded-md border border-[#31323E]/10 bg-white p-2 text-right font-bold text-[#31323E]">
                    <p>{formatEuro(item.prodigi_wholesale_eur)}</p>
                    <p className="text-[10px] text-[#31323E]/45">product</p>
                    <p className="mt-1">
                      {formatEuro(item.prodigi_shipping_eur)}
                    </p>
                    <p className="text-[10px] text-[#31323E]/45">shipping</p>
                    <p className="mt-2 border-t border-[#31323E]/10 pt-2">
                      {formatEuro(prodigiItemCost(item))}
                    </p>
                    <p className="text-[10px] text-[#31323E]/45">
                      supplier total
                    </p>
                  </div>
                </div>
                {compactJson(item.prodigi_attributes) && (
                  <details className="mt-2 rounded-md bg-white p-2 text-[10px] text-[#31323E]/60">
                    <summary className="cursor-pointer font-bold uppercase tracking-[0.12em] text-[#31323E]/45">
                      Prodigi attributes
                    </summary>
                    <pre className="mt-2 max-h-28 overflow-auto leading-relaxed">
                      {compactJson(item.prodigi_attributes)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <SectionLabel text="Gate Details And API Events" />
            {(flow.gates ?? []).slice(-10).map((gate: any) => (
              <details
                key={gate.id}
                open={gate.status === "failed"}
                className="rounded-lg border border-[#31323E]/8 bg-white p-3 text-xs"
              >
                <summary className="cursor-pointer font-bold text-[#31323E]">
                  {gate.gate}:{" "}
                  <span
                    className={
                      gate.status === "failed"
                        ? "text-rose-600"
                        : "text-emerald-700"
                    }
                  >
                    {gate.status}
                  </span>
                </summary>
                {gate.error && (
                  <p className="mt-2 text-rose-700">{gate.error}</p>
                )}
                {compactJson({
                  measured: gate.measured,
                  expected: gate.expected,
                }) && (
                  <pre className="mt-2 max-h-44 overflow-auto rounded-md bg-[#F7F7F5] p-3 text-[10px] leading-relaxed text-[#31323E]/65">
                    {compactJson({
                      measured: gate.measured,
                      expected: gate.expected,
                    })}
                  </pre>
                )}
              </details>
            ))}
            {(flow.events ?? []).slice(-6).map((event: any) => (
              <details
                key={event.id}
                className="rounded-lg border border-[#31323E]/8 bg-white p-3 text-xs"
              >
                <summary className="cursor-pointer font-bold text-[#31323E]">
                  {event.event_type}/{event.stage}: {event.status}
                </summary>
                {event.error && (
                  <p className="mt-2 text-rose-700">{event.error}</p>
                )}
                {compactJson(
                  event.response_payload ||
                    event.request_payload ||
                    event.metadata,
                ) && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-[#121212] p-3 text-[10px] leading-relaxed text-emerald-300">
                    {compactJson(
                      event.response_payload ||
                        event.request_payload ||
                        event.metadata,
                    )}
                  </pre>
                )}
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [orderDetailTabs, setOrderDetailTabs] = useState<
    Record<number, OrderDetailTab>
  >({});
  const [mainTab, setMainTab] = useState<"active" | "completed" | "advanced">(
    "active",
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterType, setFilterType] = useState<"payment" | "fulfillment">(
    "fulfillment",
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [fulfillmentSaving, setFulfillmentSaving] = useState<number | null>(
    null,
  );
  const [paymentSaving, setPaymentSaving] = useState<number | null>(null);
  const [prodigiMode, setProdigiMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const [prodigiModeDraft, setProdigiModeDraft] = useState<
    "automatic" | "manual"
  >("automatic");
  const [modeSaving, setModeSaving] = useState(false);
  const [prodigiFlows, setProdigiFlows] = useState<Record<number, any>>({});
  const [flowLoading, setFlowLoading] = useState<number | null>(null);
  const [prodigiSubmitting, setProdigiSubmitting] = useState<number | null>(
    null,
  );

  const fetchOrders = async () => {
    try {
      const res = await apiFetch(`${getApiUrl()}/orders`);
      if (res.ok) setOrders(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchProdigiMode = async () => {
    try {
      const res = await apiFetch(
        `${getApiUrl()}/orders/prodigi/fulfillment-mode`,
      );
      if (res.ok) {
        const data = await res.json();
        const mode = data.mode === "manual" ? "manual" : "automatic";
        setProdigiMode(mode);
        setProdigiModeDraft(mode);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateProdigiMode = async () => {
    setModeSaving(true);
    try {
      const res = await apiFetch(
        `${getApiUrl()}/orders/prodigi/fulfillment-mode`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: prodigiModeDraft }),
        },
      );
      if (res.ok) setProdigiMode(prodigiModeDraft);
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Failed to save Prodigi mode.");
    } finally {
      setModeSaving(false);
    }
  };

  const loadProdigiFlow = async (orderId: number) => {
    setFlowLoading(orderId);
    try {
      const res = await apiFetch(
        `${getApiUrl()}/orders/${orderId}/prodigi-flow`,
      );
      if (res.ok) {
        const data = await res.json();
        setProdigiFlows((prev) => ({ ...prev, [orderId]: data }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFlowLoading(null);
    }
  };

  const submitOrderToProdigi = async (orderId: number) => {
    if (!window.confirm("Submit this paid order to Prodigi now?")) return;
    setProdigiSubmitting(orderId);
    try {
      const res = await apiFetch(
        `${getApiUrl()}/orders/${orderId}/prodigi-submit`,
        { method: "POST" },
      );
      const data = await apiJson<any>(res);
      setProdigiFlows((prev) => ({ ...prev, [orderId]: data }));
      await fetchOrders();
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : "Prodigi submit failed.");
    } finally {
      setProdigiSubmitting(null);
    }
  };

  useEffect(() => {
    void fetchOrders();
    void fetchProdigiMode();
  }, []);

  const handleFulfillmentChange = async (
    orderId: number,
    status: string,
    extra?: { tracking_number?: string; carrier?: string; notes?: string },
  ) => {
    setFulfillmentSaving(orderId);
    try {
      const body: any = { fulfillment_status: status };
      if (extra?.tracking_number) body.tracking_number = extra.tracking_number;
      if (extra?.carrier) body.carrier = extra.carrier;
      if (extra?.notes) body.notes = extra.notes;
      const res = await apiFetch(
        `${getApiUrl()}/orders/${orderId}/fulfillment`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (res.ok) await fetchOrders();
    } catch (e) {
      console.error(e);
    } finally {
      setFulfillmentSaving(null);
    }
  };

  const handlePaymentOverride = async (
    orderId: number,
    payment_status: string,
  ) => {
    setPaymentSaving(orderId);
    try {
      const res = await apiFetch(`${getApiUrl()}/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_status }),
      });
      if (res.ok) await fetchOrders();
    } catch (e) {
      console.error("Payment override failed:", e);
    } finally {
      setPaymentSaving(null);
    }
  };

  const handlePatch = async () => {
    if (!editData) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${getApiUrl()}/orders/${editData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        await fetchOrders();
        setIsEditing(null);
        setEditData(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !window.confirm(
        "Permanently delete this order? This cannot be undone.\n\nOriginal artworks will be returned to inventory.",
      )
    )
      return;
    try {
      await apiFetch(`${getApiUrl()}/orders/${id}`, { method: "DELETE" });
      setOrders(orders.filter((o) => o.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      console.error(e);
    }
  };

  const sortedOrders = [...orders].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const filteredOrders = (() => {
    if (mainTab === "active")
      return sortedOrders.filter(
        (o) => !["delivered", "cancelled"].includes(o.fulfillment_status),
      );
    if (mainTab === "completed")
      return sortedOrders.filter((o) =>
        ["delivered", "cancelled"].includes(o.fulfillment_status),
      );
    if (statusFilter === "all") return sortedOrders;
    return sortedOrders.filter((o) =>
      filterType === "payment"
        ? o.payment_status === statusFilter
        : o.fulfillment_status === statusFilter,
    );
  })();

  const paidCount = orders.filter((o) =>
    PAID_STATUSES.has(o.payment_status),
  ).length;
  const shippedCount = orders.filter((o) =>
    ["shipped", "delivered"].includes(o.fulfillment_status),
  ).length;
  const activeCount = orders.filter(
    (o) => !["delivered", "cancelled"].includes(o.fulfillment_status),
  ).length;

  if (loading)
    return (
      <div className="flex items-center gap-3 py-10">
        <div className="w-6 h-6 border-2 border-[#31323E]/20 border-t-[#31323E] rounded-full animate-spin" />
        <span className="text-sm font-bold text-[#31323E]/50 uppercase tracking-wider">
          Loading Orders
        </span>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1500px] font-sans text-[#31323E]">
      {/*  Header  */}
      <div className="pb-8 mb-8 border-b border-[#31323E]/8">
        <div className="flex flex-col md:flex-row justify-between items-start gap-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#31323E] mb-1">
              Orders
            </h2>
            <p className="text-sm text-[#31323E]/50 font-medium">
              {orders.length} total orders  manage payment & fulfillment
              lifecycle
            </p>
          </div>

          {/* Stats Row */}
          <div className="flex flex-wrap gap-3 flex-shrink-0">
            <div className="rounded-xl border border-[#31323E]/10 bg-white p-3 shadow-sm">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#31323E]/35">
                Prodigi submit mode
              </p>
              <div className="flex gap-1">
                {(["automatic", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setProdigiModeDraft(mode)}
                    disabled={modeSaving}
                    className={`px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] rounded-lg transition-all disabled:opacity-70 ${
                      prodigiModeDraft === mode
                        ? "bg-[#31323E] text-white"
                        : "text-[#31323E]/45 hover:bg-[#31323E]/5"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={updateProdigiMode}
                disabled={modeSaving || prodigiModeDraft === prodigiMode}
                className="mt-2 w-full rounded-lg bg-[#31323E] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition-all disabled:opacity-35"
              >
                {modeSaving ? "Saving" : "Save Mode"}
              </button>
            </div>
            <div className="bg-[#31323E] text-white rounded-xl px-4 py-3 text-center shadow-sm min-w-[70px]">
              <div className="text-xl font-bold leading-none">
                {activeCount}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60 mt-1">
                Active
              </div>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-center min-w-[70px]">
              <div className="text-xl font-bold text-emerald-600 leading-none">
                {paidCount}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80 mt-1">
                Paid
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-center min-w-[70px]">
              <div className="text-xl font-bold text-blue-600 leading-none">
                {shippedCount}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500/80 mt-1">
                Shipped
              </div>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6 items-start">
          <div className="flex bg-[#31323E]/5 rounded-xl p-1 gap-0.5">
            {(["active", "completed"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setMainTab(tab);
                  setShowAdvanced(false);
                }}
                className={`px-5 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                  mainTab === tab
                    ? "bg-white text-[#31323E] shadow-sm"
                    : "text-[#31323E]/50 hover:text-[#31323E]"
                }`}
              >
                {tab}
                {tab === "active" && activeCount > 0 && (
                  <span className="ml-1.5 bg-[#31323E] text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                    {activeCount}
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={() => {
                setMainTab("advanced");
                setShowAdvanced(!showAdvanced);
              }}
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5 ${
                mainTab === "advanced"
                  ? "bg-[#31323E] text-white shadow-sm"
                  : "text-[#31323E]/50 hover:text-[#31323E]"
              }`}
            >
              Filters
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {mainTab === "advanced" && showAdvanced && (
            <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-[#31323E]/10 shadow-sm">
              <div className="flex gap-2">
                {(["fulfillment", "payment"] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => {
                      setFilterType(ft);
                      setStatusFilter("all");
                    }}
                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-all ${
                      filterType === ft
                        ? "bg-[#31323E] text-white border-[#31323E]"
                        : "bg-white text-[#31323E]/60 border-[#31323E]/15 hover:border-[#31323E]/30"
                    }`}
                  >
                    {ft}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-lg border transition-all ${statusFilter === "all" ? "bg-[#31323E] text-white border-[#31323E]" : "bg-white text-[#31323E]/50 border-[#31323E]/12 hover:border-[#31323E]/25"}`}
                >
                  All
                </button>
                {(filterType === "fulfillment"
                  ? [
                      ...FULFILLMENT_STEPS.map((s) => s.value),
                      "cancelled",
                      "pending",
                    ]
                  : PAYMENT_STATUSES.map((s) => s.value)
                ).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-lg border transition-all ${statusFilter === st ? "bg-[#31323E] text-white border-[#31323E]" : "bg-white text-[#31323E]/50 border-[#31323E]/12 hover:border-[#31323E]/25"}`}
                  >
                    {filterType === "fulfillment"
                      ? FULFILLMENT_STEPS.find((s) => s.value === st)?.label ||
                        st
                      : PAYMENT_STATUS_MAP[st]?.label || st}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/*  Order List  */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="py-20 text-center bg-[#31323E]/2 border border-dashed border-[#31323E]/12 rounded-2xl">
            <div className="text-4xl mb-3 opacity-20"></div>
            <p className="text-sm font-semibold text-[#31323E]/40">
              No orders match this filter.
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const isThisEditing = isEditing === order.id;
            const isFulfillmentSaving = fulfillmentSaving === order.id;
            const isPaymentSaving = paymentSaving === order.id;
            const thumbnail = order.items?.[0]?.artwork?.images?.[0];
            const activeOrderTab = orderDetailTabs[order.id] ?? "overview";

            return (
              <div
                key={order.id}
                className={`bg-white border transition-all duration-300 overflow-hidden rounded-xl ${
                  isExpanded
                    ? "border-[#31323E]/25 shadow-lg"
                    : "border-[#31323E]/10 shadow-sm hover:border-[#31323E]/20 hover:shadow-md"
                }`}
              >
                {/* Summary Row */}
                <button
                  onClick={() => {
                    const nextExpanded = isExpanded ? null : order.id;
                    setExpandedId(nextExpanded);
                    if (nextExpanded) {
                      setOrderDetailTabs((prev) => ({
                        ...prev,
                        [order.id]: prev[order.id] ?? "overview",
                      }));
                    }
                    if (nextExpanded && orderHasPrints(order)) {
                      void loadProdigiFlow(order.id);
                    }
                  }}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#31323E]/1 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="relative w-12 h-12 flex-shrink-0">
                    {thumbnail ? (
                      <img
                        src={getImageUrl(thumbnail, "thumb")}
                        className="w-full h-full object-cover rounded-lg border border-[#31323E]/10"
                        alt=""
                      />
                    ) : (
                      <div className="w-full h-full bg-[#31323E]/5 rounded-lg flex items-center justify-center text-[#31323E]/20 text-lg font-bold">
                        
                      </div>
                    )}
                    {order.items?.length > 1 && (
                      <span className="absolute -bottom-1 -right-1 bg-[#31323E] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow ring-2 ring-white">
                        +{order.items.length - 1}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#31323E]/40">
                        #{order.id}
                      </span>
                      <PaymentBadge status={order.payment_status} />
                      <FulfillmentBadge
                        status={order.fulfillment_status || "pending"}
                      />
                    </div>
                    <h3 className="font-bold text-base text-[#31323E] truncate leading-tight">
                      {order.first_name} {order.last_name}
                    </h3>
                    <p className="text-[11px] text-[#31323E]/50 font-semibold mt-0.5 truncate">
                      {order.items
                        ?.map((it: any) => it.artwork?.title || "Artwork")
                        .join("  ")}
                    </p>
                  </div>

                  {/* Right side */}
                  <div className="flex items-center gap-5">
                    <div className="text-right hidden lg:block">
                      <p className="text-[9px] uppercase tracking-wider text-[#31323E]/40 font-bold mb-0.5">
                        Date
                      </p>
                      <p className="text-xs text-[#31323E] font-semibold">
                        {new Date(order.created_at).toLocaleDateString(
                          "en-GB",
                          { day: "2-digit", month: "short", year: "numeric" },
                        )}
                      </p>
                    </div>
                    <div className="text-right min-w-[70px]">
                      <p className="text-[9px] uppercase tracking-wider text-[#31323E]/40 font-bold mb-0.5">
                        Total
                      </p>
                      <p className="text-lg font-bold text-[#31323E]">
                        ${order.total_price}
                      </p>
                    </div>
                    <div
                      className={`transition-transform duration-300 text-[#31323E]/25 ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-5 py-6 bg-[#EAEAEE] border-t border-[#31323E]/15 shadow-inner">
                    <div className="mb-5 rounded-xl border border-[#31323E]/10 bg-white p-2">
                      <div className="grid gap-2 md:grid-cols-4">
                        {ORDER_DETAIL_TABS.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() =>
                              setOrderDetailTabs((prev) => ({
                                ...prev,
                                [order.id]: tab.id,
                              }))
                            }
                            className={`rounded-lg px-4 py-3 text-left transition-all ${
                              activeOrderTab === tab.id
                                ? "bg-[#31323E] text-white shadow-sm"
                                : "bg-[#F7F7F5] text-[#31323E]/55 hover:bg-[#31323E]/6 hover:text-[#31323E]"
                            }`}
                          >
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em]">
                              {tab.label}
                            </span>
                            <span
                              className={`mt-1 block text-[10px] font-semibold leading-snug ${
                                activeOrderTab === tab.id
                                  ? "text-white/55"
                                  : "text-[#31323E]/38"
                              }`}
                            >
                              {tab.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {/*  Col 1: Customer + Items + Address  */}
                      <div
                        className={
                          activeOrderTab === "overview" ? "space-y-6" : "hidden"
                        }
                      >
                        {/* Customer */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <SectionLabel text="Customer" />
                          {isThisEditing ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className={inputCls}
                                  value={editData.first_name || ""}
                                  onChange={(e) =>
                                    setEditData({
                                      ...editData,
                                      first_name: e.target.value,
                                    })
                                  }
                                  placeholder="First Name"
                                />
                                <input
                                  className={inputCls}
                                  value={editData.last_name || ""}
                                  onChange={(e) =>
                                    setEditData({
                                      ...editData,
                                      last_name: e.target.value,
                                    })
                                  }
                                  placeholder="Last Name"
                                />
                              </div>
                              <input
                                className={inputCls}
                                value={editData.email || ""}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    email: e.target.value,
                                  })
                                }
                                placeholder="Email"
                              />
                              <input
                                className={inputCls}
                                value={editData.phone || ""}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    phone: e.target.value,
                                  })
                                }
                                placeholder="Phone"
                              />
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <p className="font-bold text-base text-[#31323E]">
                                {order.first_name} {order.last_name}
                              </p>
                              <p className="text-xs text-[#31323E]/60 font-medium">
                                {order.email}
                              </p>
                              <p className="text-xs text-[#31323E]/60 font-medium">
                                {order.phone}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Items */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <SectionLabel text="Items Ordered" />
                          <div className="space-y-2">
                            {(order.items || []).map(
                              (item: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex gap-3 p-3 bg-[#31323E]/2 rounded-lg border border-[#31323E]/8"
                                >
                                  {item.artwork?.images?.[0] && (
                                    <img
                                      src={getImageUrl(
                                        item.artwork.images[0],
                                        "thumb",
                                      )}
                                      className="w-11 h-11 object-cover rounded-lg border border-[#31323E]/10 flex-shrink-0"
                                      alt=""
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-[#31323E] truncate">
                                      {item.artwork?.title || "Untitled"}
                                    </p>
                                    <p className="text-[10px] font-semibold text-[#31323E]/50 uppercase tracking-wider mt-0.5">
                                      {item.edition_type === "original"
                                        ? "Original"
                                        : "Print"}
                                      {item.size ? `  ${item.size}` : ""}
                                      {item.finish ? `  ${item.finish}` : ""}
                                    </p>
                                  </div>
                                  <p className="text-sm font-bold text-[#31323E] flex-shrink-0">
                                    ${item.price}
                                  </p>
                                </div>
                              ),
                            )}
                          </div>
                        </div>

                        {/* Shipping Address */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <SectionLabel text="Shipping Address" />
                          {isThisEditing ? (
                            <div className="space-y-2">
                              <input
                                className={inputCls}
                                value={editData.shipping_address_line1 || ""}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    shipping_address_line1: e.target.value,
                                  })
                                }
                                placeholder="Street"
                              />
                              <input
                                className={inputCls}
                                value={editData.shipping_address_line2 || ""}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    shipping_address_line2: e.target.value,
                                  })
                                }
                                placeholder="Apt / Suite"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  className={inputCls}
                                  value={editData.shipping_city || ""}
                                  onChange={(e) =>
                                    setEditData({
                                      ...editData,
                                      shipping_city: e.target.value,
                                    })
                                  }
                                  placeholder="City"
                                />
                                <input
                                  className={inputCls}
                                  value={editData.shipping_postal_code || ""}
                                  onChange={(e) =>
                                    setEditData({
                                      ...editData,
                                      shipping_postal_code: e.target.value,
                                    })
                                  }
                                  placeholder="Postal"
                                />
                              </div>
                              <input
                                className={inputCls}
                                value={editData.shipping_country || ""}
                                onChange={(e) =>
                                  setEditData({
                                    ...editData,
                                    shipping_country: e.target.value,
                                  })
                                }
                                placeholder="Country"
                              />
                            </div>
                          ) : (
                            <div className="text-sm text-[#31323E] space-y-0.5">
                              {order.shipping_address_line1 ? (
                                <>
                                  <p className="font-semibold">
                                    {order.shipping_address_line1}
                                  </p>
                                  {order.shipping_address_line2 && (
                                    <p className="text-[#31323E]/60 font-medium">
                                      {order.shipping_address_line2}
                                    </p>
                                  )}
                                  <p className="text-[#31323E]/60 font-medium">
                                    {order.shipping_city}
                                    {order.shipping_postal_code
                                      ? `, ${order.shipping_postal_code}`
                                      : ""}
                                  </p>
                                  <p className="text-[10px] uppercase tracking-widest text-[#31323E]/40 font-bold pt-0.5">
                                    {order.shipping_country}{" "}
                                    {order.shipping_country_code
                                      ? `(${order.shipping_country_code})`
                                      : ""}
                                  </p>
                                  {order.shipping_notes && (
                                    <div className="mt-2 p-2.5 bg-[#31323E]/4 rounded-lg text-[#31323E]/70 text-[11px] font-medium border border-[#31323E]/8">
                                      &ldquo;{order.shipping_notes}&rdquo;
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-[#31323E]/25 font-medium italic">
                                  No shipping address.
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Discovery */}
                        {order.discovery_source && (
                          <div className="bg-white border border-[#31323E]/10 rounded-xl p-4">
                            <SectionLabel text="Discovery Source" />
                            <p className="text-sm text-[#31323E] font-medium">
                              {order.discovery_source}
                            </p>
                            {order.promo_code && (
                              <p className="text-xs font-bold text-[#31323E]/50 uppercase tracking-wider mt-1">
                                Promo: {order.promo_code}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {/*  Col 2: Payment + Fulfillment  */}
                      <div
                        className={
                          activeOrderTab === "lifecycle"
                            ? "grid gap-6 xl:grid-cols-2"
                            : "hidden"
                        }
                      >
                        {/* Phase 1 */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-6 h-6 rounded-lg bg-[#31323E] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              1
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#31323E]">
                              Payment Phase
                            </h4>
                          </div>
                          <PaymentPhase
                            order={order}
                            onPaymentOverride={(status) =>
                              handlePaymentOverride(order.id, status)
                            }
                            overrideSaving={isPaymentSaving}
                          />
                        </div>

                        {/* Phase 2 */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <span
                              className={`w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                                PAID_STATUSES.has(order.payment_status)
                                  ? "bg-[#31323E] text-white"
                                  : "bg-[#31323E]/10 text-[#31323E]/40"
                              }`}
                            >
                              2
                            </span>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-[#31323E]">
                              Fulfillment Phase
                            </h4>
                          </div>
                          <FulfillmentPhase
                            order={order}
                            onStatusChange={(status, extra) =>
                              handleFulfillmentChange(order.id, status, extra)
                            }
                            saving={isFulfillmentSaving}
                          />
                        </div>
                      </div>

                      {/*  Col 3: Timeline + Print Order + Actions  */}
                      <div
                        className={
                          activeOrderTab === "prodigi" ? "space-y-6" : "hidden"
                        }
                      >
                        <div className="rounded-xl border border-[#31323E]/10 bg-white p-5">
                          <SectionLabel text="Fulfillment Channel" />
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                                Active
                              </p>
                              <p className="mt-1 text-sm font-bold text-emerald-900">
                                Prodigi API
                              </p>
                              <p className="mt-1 text-[11px] font-medium leading-relaxed text-emerald-800/70">
                                Paid print orders are prepared, checked, and
                                submitted through Prodigi.
                              </p>
                            </div>
                            <div className="rounded-lg border border-[#31323E]/10 bg-[#F7F7F5] p-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#31323E]/45">
                                Removed
                              </p>
                              <p className="mt-1 text-sm font-bold text-[#31323E]">
                                Telegram print dispatch
                              </p>
                              <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#31323E]/50">
                                Order fulfillment via Telegram is not supported
                                now, so those controls were removed.
                              </p>
                            </div>
                            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">
                                Notifications
                              </p>
                              <p className="mt-1 text-sm font-bold text-blue-900">
                                Owner Telegram alerts
                              </p>
                              <p className="mt-1 text-[11px] font-medium leading-relaxed text-blue-800/70">
                                Managed in Admin Profile. This only notifies the
                                owner, it does not fulfill orders.
                              </p>
                            </div>
                          </div>
                        </div>

                        <ProdigiFlowPanel
                          order={order}
                          flow={prodigiFlows[order.id]}
                          loading={flowLoading === order.id}
                          submitting={prodigiSubmitting === order.id}
                          onRefresh={() => loadProdigiFlow(order.id)}
                          onSubmit={() => submitOrderToProdigi(order.id)}
                        />
                      </div>

                      <div
                        className={
                          activeOrderTab === "activity" ? "space-y-6" : "hidden"
                        }
                      >
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <OrderTimeline order={order} />
                        </div>
                        {/* Admin Actions */}
                        <div className="bg-white border border-[#31323E]/10 rounded-xl p-5">
                          <SectionLabel text="Admin Actions" />
                          {isThisEditing ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={handlePatch}
                                disabled={saving}
                                className="bg-[#31323E] text-white font-bold text-[11px] uppercase tracking-wider py-3 rounded-xl shadow-sm hover:bg-[#434455] transition-all disabled:opacity-50"
                              >
                                {saving ? "Saving" : "Save Changes"}
                              </button>
                              <button
                                onClick={() => {
                                  setIsEditing(null);
                                  setEditData(null);
                                }}
                                className="bg-[#31323E]/5 border border-[#31323E]/15 text-[#31323E] font-bold text-[11px] uppercase tracking-wider py-3 rounded-xl hover:bg-[#31323E]/10 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <button
                                onClick={() => {
                                  setEditData({ ...order });
                                  setIsEditing(order.id);
                                }}
                                className="w-full bg-[#31323E] text-white font-bold text-[11px] uppercase tracking-wider py-3 rounded-xl shadow-sm hover:bg-[#434455] transition-all"
                              >
                                Edit Order Data
                              </button>
                              <button
                                onClick={() => handleDelete(order.id)}
                                className="w-full bg-white text-red-500 hover:bg-red-500 hover:text-white font-bold text-[11px] uppercase tracking-wider py-3 rounded-xl border border-red-200 hover:border-red-500 transition-all shadow-sm"
                              >
                                Delete Permanently
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


