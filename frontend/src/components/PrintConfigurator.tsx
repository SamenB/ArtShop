"use client";

import { useMemo, useState } from "react";

import type { CartItem } from "@/context/CartContext";
import { usePreferences } from "@/context/PreferencesContext";
import type {
  ArtworkPrintStorefront,
  MediumOffers,
  PurchaseType,
  StorefrontCard,
  StorefrontSizeOption,
} from "@/lib/artworkStorefront";

type CartEditionType =
  | "canvas_print"
  | "canvas_print_limited"
  | "paper_print"
  | "paper_print_limited";

interface PrintConfiguratorProps {
  artworkId: number;
  artworkTitle: string;
  purchaseType: PurchaseType;
  units: "cm" | "in";
  isSmall: boolean;
  onAddToCart: (item: Omit<CartItem, "quantity">) => void;
  imageGradientFrom: string;
  imageGradientTo: string;
  imageUrl?: string;
  hasHighResAsset?: boolean;
  storefront: ArtworkPrintStorefront | null;
  storefrontLoading: boolean;
  storefrontError: string | null;
}

function getSizeKey(size: StorefrontSizeOption): string {
  return String(size.sku || size.slot_size_label || size.size_label);
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAttributeValue(value: string): string {
  return titleCase(value);
}

function parseSizeLabel(
  label: string,
): { widthCm: number; heightCm: number } | null {
  const normalized = label.replace(/cm$/i, "").trim();
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/i);
  if (!match) {
    return null;
  }

  const widthCm = Number(match[1]);
  const heightCm = Number(match[2]);
  if (Number.isNaN(widthCm) || Number.isNaN(heightCm)) {
    return null;
  }

  return { widthCm, heightCm };
}

function formatSizeLabel(label: string, units: "cm" | "in"): string {
  const parsed = parseSizeLabel(label);
  if (!parsed) {
    return label;
  }

  if (units === "in") {
    const widthIn = (parsed.widthCm / 2.54).toFixed(1).replace(/\.0$/, "");
    const heightIn = (parsed.heightCm / 2.54).toFixed(1).replace(/\.0$/, "");
    return `${widthIn} x ${heightIn} in`;
  }

  const widthCm = parsed.widthCm
    .toFixed(parsed.widthCm % 1 === 0 ? 0 : 1)
    .replace(/\.0$/, "");
  const heightCm = parsed.heightCm
    .toFixed(parsed.heightCm % 1 === 0 ? 0 : 1)
    .replace(/\.0$/, "");
  return `${widthCm} x ${heightCm} cm`;
}

function formatInches(
  widthIn: number,
  heightIn: number,
  units: "cm" | "in",
): string {
  if (units === "cm") {
    const widthCm = (widthIn * 2.54).toFixed(1).replace(/\.0$/, "");
    const heightCm = (heightIn * 2.54).toFixed(1).replace(/\.0$/, "");
    return `${widthCm} x ${heightCm} cm`;
  }
  return `${widthIn.toFixed(1).replace(/\.0$/, "")} x ${heightIn
    .toFixed(1)
    .replace(/\.0$/, "")} in`;
}

function isMountedFrame(card: StorefrontCard | null): boolean {
  return Boolean(card?.category_id?.toLowerCase().includes("mounted"));
}

function isUkShippedBoxFrame(
  card: StorefrontCard | null,
  countryCode?: string | null,
): boolean {
  if (!card || card.category_id !== "paperPrintBoxFramed") {
    return false;
  }
  return Boolean(
    countryCode?.toUpperCase() !== "GB" &&
    card.source_countries?.map((item) => item.toUpperCase()).includes("GB"),
  );
}

function buildImageWindowLabel(
  card: StorefrontCard | null,
  size: StorefrontSizeOption | null,
  units: "cm" | "in",
): string | null {
  if (
    !isMountedFrame(card) ||
    !size?.print_area?.width_px ||
    !size.print_area.height_px
  ) {
    return null;
  }

  const dimensions = size.print_area.dimensions || {};
  const targetDpi = Number(dimensions.target_dpi || dimensions.dpi || 300);
  if (!targetDpi || Number.isNaN(targetDpi)) {
    return null;
  }
  const widthIn = Number(size.print_area.width_px) / targetDpi;
  const heightIn = Number(size.print_area.height_px) / targetDpi;
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn)) {
    return null;
  }
  return formatInches(widthIn, heightIn, units);
}

function buildInitialAttributeSelection(
  card: StorefrontCard | null,
): Record<string, string> {
  if (!card) {
    return {};
  }

  const initial: Record<string, string> = {};
  for (const [key, options] of Object.entries(
    card.allowed_attribute_options || {},
  )) {
    if (!options.length) {
      continue;
    }
    initial[key] = card.default_prodigi_attributes[key] || options[0];
  }
  return initial;
}

function resolveEditionType(
  medium: PurchaseType,
  offers: MediumOffers | null,
): CartEditionType {
  if (medium === "canvas") {
    return offers?.open_available ? "canvas_print" : "canvas_print_limited";
  }
  return offers?.open_available ? "paper_print" : "paper_print_limited";
}

function buildFinishLabel(
  card: StorefrontCard,
  selectedAttributes: Record<string, string>,
  editionType: CartEditionType,
): string {
  const selectedDetails = Object.entries(selectedAttributes).map(
    ([key, value]) => `${titleCase(key)}: ${formatAttributeValue(value)}`,
  );
  let label = card.label;
  if (selectedDetails.length) {
    label += ` (${selectedDetails.join(", ")})`;
  }
  if (editionType.endsWith("_limited")) {
    label += " · Limited Edition";
  }
  return label;
}

function buildRouteSummary(
  card: StorefrontCard | null,
  size: StorefrontSizeOption | null,
): string {
  const parts: string[] = [];
  if (!card) {
    return "";
  }
  if (card.fulfillment_level) {
    parts.push(titleCase(card.fulfillment_level));
  }
  if (size?.delivery_days) {
    parts.push(size.delivery_days);
  }
  if (size?.source_country) {
    parts.push(`Source ${size.source_country}`);
  }
  return parts.join(" · ");
}

function buildShippingSummary(size: StorefrontSizeOption | null): string {
  if (!size) {
    return "Select a size to see delivery details.";
  }

  const mode = size.business_policy?.shipping_mode;
  const customerShipping = size.customer_shipping_price;
  if (mode === "included") {
    return "Delivery is already included in the displayed total.";
  }
  if (
    mode === "pass_through" &&
    customerShipping !== null &&
    customerShipping !== undefined
  ) {
    return `Displayed total includes ${customerShipping.toFixed(2)} shipping for this route.`;
  }

  return "Delivery has been pre-resolved from the active baked storefront snapshot.";
}

function buildProfileSummary(card: StorefrontCard | null): string {
  if (!card) {
    return "Production profile will appear once a format is selected.";
  }

  const profile = card.print_profile || {};
  const parts: string[] = [];
  if (profile.editor_mode) {
    parts.push(titleCase(profile.editor_mode));
  }
  if (profile.edge_extension_mode) {
    parts.push(titleCase(profile.edge_extension_mode));
  }
  if (profile.target_dpi) {
    parts.push(`${profile.target_dpi} DPI`);
  }
  if (profile.crop_strategy) {
    parts.push(titleCase(profile.crop_strategy));
  }
  return parts.length
    ? parts.join(" · ")
    : "No per-artwork print-profile overrides are active for this card yet.";
}

function buildPreflightMetrics(
  storefront: ArtworkPrintStorefront | null,
  card: StorefrontCard | null,
  size: StorefrontSizeOption | null,
) {
  if (!storefront || !card || !size) {
    return null;
  }

  const source = storefront.print_source_metadata || {};
  const widthPx = Number(source.width_px || 0);
  const heightPx = Number(source.height_px || 0);
  const parsedSize = parseSizeLabel(size.size_label || size.slot_size_label);
  if (!parsedSize) {
    return null;
  }

  const safeMarginPct = Number(card.print_profile?.safe_margin_pct || 0);
  const mountSafeMarginPct = Number(
    card.print_profile?.mount_safe_margin_pct || 0,
  );
  const wrapMarginPct = Number(card.print_profile?.wrap_margin_pct || 0);
  const targetDpi = Number(card.print_profile?.target_dpi || 300);
  const minimumDpi = Number(card.print_profile?.minimum_dpi || 150);
  const printAreaWidthPx = Number(size.print_area?.width_px || 0);
  const printAreaHeightPx = Number(size.print_area?.height_px || 0);
  const frontWidthIn = parsedSize.widthCm / 2.54;
  const frontHeightIn = parsedSize.heightCm / 2.54;
  const totalWidthIn = frontWidthIn * (1 + (wrapMarginPct / 100) * 2);
  const totalHeightIn = frontHeightIn * (1 + (wrapMarginPct / 100) * 2);

  const frontDpi =
    widthPx > 0 && heightPx > 0
      ? Math.min(widthPx / frontWidthIn, heightPx / frontHeightIn)
      : null;
  const totalDpi =
    widthPx > 0 && heightPx > 0
      ? Math.min(widthPx / totalWidthIn, heightPx / totalHeightIn)
      : null;
  const effectiveDpi = wrapMarginPct > 0 ? totalDpi : frontDpi;

  let status: "ready" | "caution" | "insufficient" | "missing_asset" =
    "missing_asset";
  if (effectiveDpi !== null) {
    if (effectiveDpi >= targetDpi) {
      status = "ready";
    } else if (effectiveDpi >= minimumDpi) {
      status = "caution";
    } else {
      status = "insufficient";
    }
  }

  return {
    safeMarginPct,
    mountSafeMarginPct,
    wrapMarginPct,
    targetDpi,
    minimumDpi,
    frontDpi,
    totalDpi,
    effectiveDpi,
    status,
    hasWrap:
      wrapMarginPct > 0 && card.print_profile?.editor_mode === "canvas_wrap",
    widthPx,
    heightPx,
    targetPrintAreaPxLabel:
      printAreaWidthPx > 0 && printAreaHeightPx > 0
        ? `${printAreaWidthPx} x ${printAreaHeightPx} px`
        : null,
    printAreaSource: size.print_area?.source || null,
    frontSizeLabel: `${parsedSize.widthCm} x ${parsedSize.heightCm} cm`,
    totalSizeLabel:
      wrapMarginPct > 0
        ? `${(parsedSize.widthCm * (1 + (wrapMarginPct / 100) * 2)).toFixed(1)} x ${(
            parsedSize.heightCm *
            (1 + (wrapMarginPct / 100) * 2)
          ).toFixed(1)} cm`
        : `${parsedSize.widthCm} x ${parsedSize.heightCm} cm`,
  };
}

function formatDpiValue(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "N/A";
  }
  return `${Math.round(value)} DPI`;
}

export default function PrintConfigurator({
  artworkId,
  artworkTitle,
  purchaseType,
  units,
  isSmall,
  onAddToCart,
  imageGradientFrom,
  imageGradientTo,
  imageUrl,
  hasHighResAsset = false,
  storefront,
  storefrontLoading,
  storefrontError,
}: PrintConfiguratorProps) {
  const { convertPrice } = usePreferences();
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedSizeKeys, setSelectedSizeKeys] = useState<
    Record<string, string>
  >({});
  const [attributeSelections, setAttributeSelections] = useState<
    Record<string, Record<string, string>>
  >({});
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const mediumOffers = storefront?.mediums?.[purchaseType] || null;
  const cards = useMemo(() => mediumOffers?.cards || [], [mediumOffers]);

  const selectedCard = useMemo(() => {
    if (!cards.length) {
      return null;
    }
    return (
      cards.find((card) => card.category_id === selectedCardId) || cards[0]
    );
  }, [cards, selectedCardId]);

  const selectedCardKey = selectedCard?.category_id || "";

  const selectedAttributes = useMemo(() => {
    if (!selectedCard) {
      return {};
    }
    return (
      attributeSelections[selectedCardKey] ||
      buildInitialAttributeSelection(selectedCard)
    );
  }, [attributeSelections, selectedCard, selectedCardKey]);

  const selectedSize = useMemo<StorefrontSizeOption | null>(() => {
    if (!selectedCard?.size_options?.length) {
      return null;
    }
    const selectedSizeKey = selectedSizeKeys[selectedCardKey];
    return (
      selectedCard.size_options.find(
        (size) => getSizeKey(size) === selectedSizeKey,
      ) || selectedCard.size_options[0]
    );
  }, [selectedCard, selectedCardKey, selectedSizeKeys]);

  const configurableAttributes = useMemo(() => {
    return Object.entries(selectedCard?.allowed_attribute_options || {}).filter(
      ([, options]) => options.length > 1,
    );
  }, [selectedCard]);

  const finalAttributes = useMemo(() => {
    return {
      ...(selectedSize?.provider_attributes || {}),
      ...(selectedCard?.default_prodigi_attributes || {}),
      ...selectedAttributes,
    };
  }, [selectedAttributes, selectedCard, selectedSize]);

  const editionType = resolveEditionType(purchaseType, mediumOffers);
  const finalPrice =
    selectedSize?.customer_total_price ??
    selectedSize?.retail_product_price ??
    selectedSize?.business_policy?.retail_product_price ??
    null;
  const formattedSize = selectedSize
    ? formatSizeLabel(
        selectedSize.size_label || selectedSize.slot_size_label,
        units,
      )
    : "Select...";
  const imageWindowLabel = buildImageWindowLabel(
    selectedCard,
    selectedSize,
    units,
  );
  const ukBoxNotice = isUkShippedBoxFrame(
    selectedCard,
    storefront?.country_code,
  );
  const finishLabel = selectedCard
    ? buildFinishLabel(selectedCard, selectedAttributes, editionType)
    : purchaseType === "canvas"
      ? "Canvas Print"
      : "Paper Print";
  const routeSummary = buildRouteSummary(selectedCard, selectedSize);
  const shippingSummary = buildShippingSummary(selectedSize);
  const profileSummary = buildProfileSummary(selectedCard);
  const preflight = buildPreflightMetrics(
    storefront,
    selectedCard,
    selectedSize,
  );
  const limitedOnly =
    !mediumOffers?.open_available && !!mediumOffers?.limited_available;
  const limitedAvailable = !!mediumOffers?.limited_available;

  const sourceQualityMessage =
    storefront?.source_quality_summary?.message ||
    "Upload a hi-res print source to validate exact print output safely.";

  if (storefrontLoading) {
    return (
      <div
        style={{
          padding: "2rem",
          color: "var(--color-muted)",
          textAlign: "center",
        }}
      >
        Loading print offers...
      </div>
    );
  }

  if (storefrontError) {
    return (
      <div style={{ padding: "2rem", color: "#C87070", textAlign: "center" }}>
        {storefrontError}
      </div>
    );
  }

  if (!storefront || !cards.length) {
    return (
      <div
        style={{
          padding: "2rem",
          color: "var(--color-muted)",
          textAlign: "center",
        }}
      >
        {storefront?.message ||
          "Prints are currently unavailable for this region."}
      </div>
    );
  }

  const preflightTone =
    preflight?.status === "ready"
      ? { accent: "#166534", bg: "#F0FDF4", border: "rgba(22, 101, 52, 0.15)" }
      : preflight?.status === "caution"
        ? {
            accent: "#9A6700",
            bg: "#FFF7E6",
            border: "rgba(154, 103, 0, 0.15)",
          }
        : preflight?.status === "insufficient"
          ? {
              accent: "#B42318",
              bg: "#FEF3F2",
              border: "rgba(180, 35, 24, 0.14)",
            }
          : {
              accent: "#475467",
              bg: "#F8FAFC",
              border: "rgba(71, 84, 103, 0.12)",
            };

  return (
    <div className="print-configurator-inner">
      <div className="pc-header" style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <p className="pc-title">
              Fine Art {purchaseType === "canvas" ? "Canvas" : "Paper"} Prints
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <p className="pc-subtitle">
                Baked storefront profile for{" "}
                {storefront.country_name || storefront.country_code}
              </p>
              {hasHighResAsset && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    padding: "2px 6px",
                    background: "rgba(16, 185, 129, 0.08)",
                    color: "#10B981",
                    borderRadius: "4px",
                    fontSize: "0.6rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.02em",
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Verified Full-Res
                </span>
              )}
            </div>
          </div>
          {limitedAvailable && (
            <div
              style={{
                background: limitedOnly
                  ? "linear-gradient(135deg, #FFD700 0%, #D4AF37 100%)"
                  : "linear-gradient(135deg, #F2E9D2 0%, #D8C3A5 100%)",
                color: "#1a1a1a",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "0.65rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                boxShadow: "0 2px 8px rgba(212, 175, 55, 0.2)",
                flexShrink: 0,
                textAlign: "center",
              }}
            >
              {limitedOnly ? "Limited Edition" : "Limited Available"}
              {mediumOffers?.limited_quantity ? (
                <div
                  style={{
                    fontSize: "0.55rem",
                    opacity: 0.8,
                    marginTop: "1px",
                  }}
                >
                  Edition size {mediumOffers.limited_quantity}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {cards.length > 1 && (
        <div className="step-row">
          <div className="step-label">
            <span className="step-number">1</span>
            <span className="step-text">Select Format</span>
          </div>
          <div className="step-select-wrap">
            <button
              className={`step-trigger ${openDropdown === "format" ? "open" : ""}`}
              onClick={() =>
                setOpenDropdown(openDropdown === "format" ? null : "format")
              }
              type="button"
            >
              <span>{selectedCard?.label || "Select..."}</span>
              <span className="step-chevron" />
            </button>
            <div
              className={`step-options ${openDropdown === "format" ? "open" : ""}`}
            >
              {cards.map((card) => (
                <button
                  key={card.category_id}
                  type="button"
                  className={`step-option ${
                    selectedCard?.category_id === card.category_id
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedCardId(card.category_id);
                    setOpenDropdown(null);
                  }}
                >
                  <span>{card.label}</span>
                  <span className="opt-check" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {configurableAttributes.map(([key, options], index) => {
        const stepNumber = cards.length > 1 ? index + 2 : index + 1;
        return (
          <div className="step-row step-reveal" key={key}>
            <div className="step-label">
              <span className="step-number">{stepNumber}</span>
              <span className="step-text">{titleCase(key)}</span>
            </div>
            <div className="step-select-wrap">
              <button
                className={`step-trigger ${openDropdown === key ? "open" : ""}`}
                onClick={() =>
                  setOpenDropdown(openDropdown === key ? null : key)
                }
                type="button"
              >
                <span>
                  {formatAttributeValue(selectedAttributes[key] || options[0])}
                </span>
                <span className="step-chevron" />
              </button>
              <div
                className={`step-options ${openDropdown === key ? "open" : ""}`}
              >
                {options.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`step-option ${
                      (selectedAttributes[key] || options[0]) === value
                        ? "active"
                        : ""
                    }`}
                    onClick={() => {
                      setAttributeSelections((prev) => ({
                        ...prev,
                        [selectedCardKey]: {
                          ...selectedAttributes,
                          [key]: value,
                        },
                      }));
                      setOpenDropdown(null);
                    }}
                  >
                    <span>{formatAttributeValue(value)}</span>
                    <span className="opt-check" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      <div className="step-row">
        <div className="step-label">
          <span className="step-number">
            {cards.length > 1
              ? configurableAttributes.length + 2
              : configurableAttributes.length + 1}
          </span>
          <span className="step-text">Select Size</span>
        </div>
        <div className="step-select-wrap">
          <button
            className={`step-trigger ${openDropdown === "size" ? "open" : ""}`}
            onClick={() =>
              setOpenDropdown(openDropdown === "size" ? null : "size")
            }
            type="button"
          >
            <span>
              {formattedSize}{" "}
              {finalPrice !== null ? (
                <>
                  {" "}
                  —{" "}
                  <span className="font-price font-medium">
                    {convertPrice(finalPrice)}
                  </span>
                </>
              ) : null}
            </span>
            <span className="step-chevron" />
          </button>
          <div
            className={`step-options ${openDropdown === "size" ? "open" : ""}`}
          >
            {selectedCard?.size_options.map((size) => {
              const sizePrice =
                size.customer_total_price ??
                size.retail_product_price ??
                size.business_policy?.retail_product_price;
              return (
                <button
                  key={getSizeKey(size)}
                  type="button"
                  className={`step-option ${
                    selectedSize &&
                    getSizeKey(selectedSize) === getSizeKey(size)
                      ? "active"
                      : ""
                  }`}
                  onClick={() => {
                    setSelectedSizeKeys((prev) => ({
                      ...prev,
                      [selectedCardKey]: getSizeKey(size),
                    }));
                    setOpenDropdown(null);
                  }}
                >
                  <span>
                    {formatSizeLabel(
                      size.size_label || size.slot_size_label,
                      units,
                    )}
                    {sizePrice !== null && sizePrice !== undefined ? (
                      <>
                        {" "}
                        —{" "}
                        <span className="font-price font-medium">
                          {convertPrice(sizePrice)}
                        </span>
                      </>
                    ) : null}
                  </span>
                  <span className="opt-check" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {imageWindowLabel && (
        <div className="info-badge" style={{ marginTop: "0.85rem" }}>
          <div className="info-badge-content">
            <p className="info-badge-title">Mounted Image Window</p>
            <p className="info-badge-desc">
              Customer size is the frame/glaze size ({formattedSize}). The
              production image target is {imageWindowLabel}.
            </p>
          </div>
        </div>
      )}

      {ukBoxNotice && (
        <div
          className="info-badge"
          style={{
            marginTop: "0.85rem",
            background: "#F8FAFC",
            borderColor: "rgba(15, 23, 42, 0.12)",
          }}
        >
          <div className="info-badge-content">
            <p className="info-badge-title">UK Fulfillment</p>
            <p className="info-badge-desc">
              This box frame ships from the UK. Delivery can take longer, and
              import duties or local taxes may apply.
            </p>
          </div>
        </div>
      )}

      <div className="info-badge" style={{ marginTop: "1rem" }}>
        <div className="info-badge-content">
          <p className="info-badge-title">Fulfillment Route</p>
          <p className="info-badge-desc">
            {routeSummary ||
              "Active baked storefront route is ready for this country."}
          </p>
        </div>
      </div>

      <div className="info-badge" style={{ marginTop: "0.85rem" }}>
        <div className="info-badge-content">
          <p className="info-badge-title">Production Profile</p>
          <p className="info-badge-desc">{profileSummary}</p>
        </div>
      </div>

      <div
        style={{
          marginTop: "0.85rem",
          background: preflightTone.bg,
          border: `1px solid ${preflightTone.border}`,
          borderRadius: "16px",
          padding: isSmall ? "1rem" : "1.15rem",
          display: "grid",
          gridTemplateColumns: isSmall
            ? "1fr"
            : "minmax(0, 1.05fr) minmax(0, 1fr)",
          gap: "1rem",
          alignItems: "center",
        }}
      >
        <div
          style={{
            background: "#fff",
            borderRadius: "14px",
            border: "1px solid rgba(15, 23, 42, 0.08)",
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "240px",
          }}
        >
          {preflight ? (
            <div
              style={{
                position: "relative",
                width: "min(100%, 280px)",
                aspectRatio: "4 / 5",
                background: preflight.hasWrap ? "#E8DDD0" : "#F5F1EA",
                borderRadius: "18px",
                border: "1px solid rgba(26, 26, 24, 0.08)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.35)",
                overflow: "hidden",
              }}
            >
              {preflight.hasWrap && (
                <div
                  style={{
                    position: "absolute",
                    inset: "0.65rem",
                    border: "1px dashed rgba(120, 53, 15, 0.28)",
                    borderRadius: "12px",
                    pointerEvents: "none",
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  inset: preflight.hasWrap
                    ? `${Math.max(preflight.wrapMarginPct, 4)}%`
                    : "0.8rem",
                  borderRadius: "12px",
                  overflow: "hidden",
                  background: imageUrl
                    ? `url(${imageUrl}) center / cover no-repeat`
                    : `linear-gradient(135deg, ${imageGradientFrom} 0%, ${imageGradientTo} 100%)`,
                  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.14)",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: `${Math.max(preflight.safeMarginPct, 1.5)}%`,
                    border: "2px solid rgba(255,255,255,0.78)",
                    borderRadius: "10px",
                    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.12)",
                  }}
                />
                {preflight.mountSafeMarginPct > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: `${Math.max(preflight.mountSafeMarginPct, 2.5)}%`,
                      border: "1px dashed rgba(15, 23, 42, 0.42)",
                      borderRadius: "10px",
                    }}
                  />
                )}
              </div>

              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  left: "12px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.92)",
                  color: "#6B4F35",
                  fontSize: "0.62rem",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {preflight.hasWrap ? "Wrap Zone" : "Front Only"}
              </div>
              <div
                style={{
                  position: "absolute",
                  bottom: "10px",
                  right: "12px",
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.92)",
                  color: "#1F2937",
                  fontSize: "0.62rem",
                  fontWeight: 600,
                }}
              >
                Safe Margin {preflight.safeMarginPct.toFixed(1)}%
              </div>
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "var(--color-muted)",
              }}
            >
              Preflight preview will appear after a valid size is selected.
            </p>
          )}
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "0.68rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: preflightTone.accent,
              }}
            >
              Print Preflight
            </p>
            <p
              style={{
                margin: "0.3rem 0 0",
                fontFamily: "var(--font-sans)",
                fontSize: "0.82rem",
                lineHeight: 1.55,
                color: "var(--color-charcoal-mid)",
              }}
            >
              {preflight
                ? "Safe margins, wrap consumption, and effective DPI are validated against the active artwork profile."
                : "Select a size and keep a hi-res source attached to unlock full print preflight validation."}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.75rem",
            }}
          >
            <div>
              <p
                className="info-badge-title"
                style={{ marginBottom: "0.15rem" }}
              >
                Effective DPI
              </p>
              <p
                className="info-badge-desc"
                style={{ color: preflightTone.accent }}
              >
                {formatDpiValue(preflight?.effectiveDpi ?? null)}
              </p>
            </div>
            <div>
              <p
                className="info-badge-title"
                style={{ marginBottom: "0.15rem" }}
              >
                Target
              </p>
              <p className="info-badge-desc">
                {preflight
                  ? `${preflight.targetDpi} / ${preflight.minimumDpi} DPI`
                  : "300 / 150 DPI"}
              </p>
            </div>
            <div>
              <p
                className="info-badge-title"
                style={{ marginBottom: "0.15rem" }}
              >
                Front Size
              </p>
              <p className="info-badge-desc">
                {preflight?.frontSizeLabel || "N/A"}
              </p>
            </div>
            <div>
              <p
                className="info-badge-title"
                style={{ marginBottom: "0.15rem" }}
              >
                Total Print Area
              </p>
              <p className="info-badge-desc">
                {preflight?.targetPrintAreaPxLabel ||
                  preflight?.totalSizeLabel ||
                  "N/A"}
              </p>
            </div>
          </div>

          <div
            className="info-badge"
            style={{ marginTop: 0, background: "rgba(255,255,255,0.62)" }}
          >
            <div className="info-badge-content">
              <p className="info-badge-title">Preflight Summary</p>
              <p className="info-badge-desc">
                {preflight
                  ? `${formatDpiValue(preflight.frontDpi)} on the visible front${
                      preflight.hasWrap
                        ? `, ${formatDpiValue(preflight.totalDpi)} after wrap allowance`
                        : ""
                    }.${
                      preflight.targetPrintAreaPxLabel
                        ? ` Exact provider target: ${preflight.targetPrintAreaPxLabel}.`
                        : ""
                    }`
                  : "A hi-res source and selected print size are both required for exact DPI validation."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="info-badge" style={{ marginTop: "0.85rem" }}>
        <div className="info-badge-content">
          <p className="info-badge-title">Source Validation</p>
          <p className="info-badge-desc">{sourceQualityMessage}</p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#F8F7F5",
          margin: isSmall ? "1rem -1.25rem -2rem" : "1rem -2rem -2rem",
          padding: isSmall ? "1.5rem 1.25rem" : "1.5rem 2rem",
          borderRadius: isSmall ? "0" : "0 0 24px 24px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.9rem 1.2rem",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.6rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-muted)",
                margin: "0 0 2px",
              }}
            >
              Total
            </p>
            <span
              className="font-price"
              style={{
                fontSize: "1.75rem",
                fontWeight: 600,
                color: "var(--color-charcoal)",
                letterSpacing: "-0.03em",
              }}
            >
              {finalPrice !== null ? convertPrice(finalPrice) : "..."}
            </span>
          </div>
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.6rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--color-muted)",
                margin: "0 0 2px",
              }}
            >
              Delivery
            </p>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-sans)",
                fontSize: "0.8rem",
                color: "var(--color-charcoal-mid)",
                lineHeight: 1.45,
              }}
            >
              {shippingSummary}
            </p>
          </div>
        </div>

        <button
          className="premium-cta-btn"
          disabled={!selectedCard || !selectedSize || finalPrice === null}
          onClick={() => {
            if (!selectedCard || !selectedSize || finalPrice === null) {
              return;
            }

            const cartId = [
              artworkId,
              purchaseType,
              selectedCard.category_id,
              getSizeKey(selectedSize),
              ...Object.entries(finalAttributes)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, value]) => `${key}:${value}`),
            ].join("-");

            onAddToCart({
              id: cartId,
              slug: String(artworkId),
              title: artworkTitle,
              type: "print",
              imageGradientFrom,
              imageGradientTo,
              imageUrl,
              price: Math.round(finalPrice),
              finish: finishLabel,
              size: formatSizeLabel(
                selectedSize.size_label || selectedSize.slot_size_label,
                units,
              ),
              edition_type: editionType,
              prodigi_sku: selectedSize.sku || undefined,
              prodigi_storefront_offer_size_id: selectedSize.id || undefined,
              prodigi_category_id: selectedCard.category_id,
              prodigi_slot_size_label:
                selectedSize.slot_size_label || selectedSize.size_label,
              prodigi_attributes: finalAttributes,
              prodigi_shipping_method:
                selectedSize.shipping_method ||
                selectedSize.default_shipping_tier ||
                selectedSize.shipping_support?.chosen_tier ||
                "Standard",
              prodigi_wholesale_eur:
                selectedSize.supplier_product_price || undefined,
              prodigi_shipping_eur:
                selectedSize.supplier_shipping_price || undefined,
              prodigi_retail_eur: finalPrice,
            });
          }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
