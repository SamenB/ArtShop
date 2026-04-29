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
import {
  resolveRoundedCustomerPriceParts,
  resolveStorefrontCustomerTotal,
  resolveStorefrontProductPrice,
  resolveStorefrontShippingPrice,
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
    label += " - Limited Edition";
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
  return parts.join(" - ");
}

function buildShippingSummary(size: StorefrontSizeOption | null): string {
  if (!size) {
    return "Select a size to see delivery details.";
  }

  const customerShipping = resolveStorefrontShippingPrice(size);
  if (customerShipping !== null && customerShipping !== undefined) {
    return customerShipping > 0
      ? "Calculated for the selected delivery country."
      : "Delivery cannot be quoted for this selection.";
  }

  return "Delivery cannot be quoted for this selection.";
}

function resolveShippingPrice(size: StorefrontSizeOption | null): number | null {
  return resolveStorefrontShippingPrice(size);
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
    ? parts.join(" - ")
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
  const productPrice = resolveStorefrontProductPrice(selectedSize);
  const shippingPrice = resolveShippingPrice(selectedSize);
  const roundedPriceParts = resolveRoundedCustomerPriceParts(selectedSize);
  const totalPrice = roundedPriceParts?.total ?? resolveStorefrontCustomerTotal(selectedSize);
  const displayProductPrice = roundedPriceParts?.product ?? productPrice;
  const displayShippingPrice = roundedPriceParts?.shipping ?? shippingPrice;
  const hasShippingQuote = shippingPrice !== null && totalPrice !== null;
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
              {roundedPriceParts !== null ? (
                <>
                  {" "}
                  -{" "}
                  <span className="font-price font-medium">
                    {convertPrice(roundedPriceParts.total)}
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
              const sizeTotal = resolveRoundedCustomerPriceParts(size)?.total ?? null;
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
                    {sizeTotal !== null ? (
                      <>
                        {" "}
                        -{" "}
                        <span className="font-price font-medium">
                          {convertPrice(sizeTotal)}
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



      <div
        style={{
          backgroundColor: "#F8F7F5",
          margin: isSmall ? "1rem -1.25rem -2rem" : "1rem -2rem -2rem",
          padding: isSmall ? "1.25rem 1.25rem" : "1.25rem 2rem",
          borderRadius: isSmall ? "0" : "0 0 24px 24px",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <div>
            <span
              className="font-price"
              style={{
                fontSize: isSmall ? "2rem" : "2.2rem",
                fontWeight: 700,
                color: "var(--color-charcoal)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {totalPrice !== null ? convertPrice(totalPrice) : "—"}
            </span>
          </div>
          <div style={{ textAlign: "right", paddingBottom: "0.15rem" }}>
            {displayProductPrice !== null && (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.68rem",
                  color: "var(--color-muted)",
                  lineHeight: 1.4,
                }}
              >
                Print{" "}
                <span className="font-price" style={{ fontWeight: 500 }}>
                  {convertPrice(displayProductPrice)}
                </span>
                {hasShippingQuote ? (
                  <>
                    {" + Delivery "}
                    <span className="font-price" style={{ fontWeight: 500 }}>
                      {convertPrice(displayShippingPrice!)}
                    </span>
                  </>
                ) : null}
              </p>
            )}
            {!hasShippingQuote && productPrice !== null && (
              <p
                style={{
                  margin: "0.15rem 0 0",
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.62rem",
                  color: "#B42318",
                  lineHeight: 1.3,
                }}
              >
                Delivery not available
              </p>
            )}
          </div>
        </div>

        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-sans)",
            fontSize: "0.65rem",
            color: "var(--color-muted)",
            lineHeight: 1.4,
          }}
        >
          {hasShippingQuote
              ? `Delivery to ${storefront.country_name || storefront.country_code}`
              : `Delivery to ${storefront.country_name || storefront.country_code}`}
        </p>

        <button
          className="premium-cta-btn"
          disabled={
            !selectedCard ||
            !selectedSize ||
            productPrice === null ||
            totalPrice === null ||
            !hasShippingQuote
          }
          onClick={() => {
            if (
              !selectedCard ||
              !selectedSize ||
              productPrice === null ||
              totalPrice === null ||
              roundedPriceParts === null ||
              !hasShippingQuote
            ) {
              return;
            }

            const cartId = [
              artworkId,
              purchaseType,
              selectedCard.category_id,
              getSizeKey(selectedSize),
              storefront.country_code?.toUpperCase() || "XX",
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
              price: roundedPriceParts.total,
              customer_product_price: roundedPriceParts.product,
              customer_shipping_price: roundedPriceParts.shipping,
              customer_line_total: roundedPriceParts.total,
              customer_currency: "USD",
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
                selectedSize.shipping_support?.chosen_shipping_method ||
                selectedSize.shipping_support?.chosen_tier ||
                selectedSize.shipping_method ||
                selectedSize.default_shipping_tier ||
                "Standard",
              prodigi_wholesale_eur:
                selectedSize.supplier_product_price || undefined,
              prodigi_shipping_eur:
                selectedSize.supplier_shipping_price || undefined,
              prodigi_supplier_total_eur:
                selectedSize.supplier_total_cost || undefined,
              prodigi_retail_eur: productPrice,
              prodigi_supplier_currency: selectedSize.currency || "EUR",
              prodigi_destination_country_code:
                storefront.country_code?.toUpperCase() || undefined,
            });
          }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
