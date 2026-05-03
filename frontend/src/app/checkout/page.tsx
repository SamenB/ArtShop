"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useCart, type CartItem } from "@/context/CartContext";
import { usePreferences } from "@/context/PreferencesContext";
import { GoogleLogin } from "@react-oauth/google";
import { useUser } from "@/context/UserContext";
import { getApiUrl, apiFetch, apiJson } from "@/utils";
import {
  countries,
  getStateLabel,
  getPostalLabel,
  countryCodeToFlag,
} from "@/countries";

import { inputBase, sectionTitle, labelStyle } from "./styles";
import { SmartInput } from "./components/SmartInput";
import { PhoneInput } from "./components/PhoneInput";
import { CountrySelect } from "./components/CountrySelect";
import { AddressInput } from "./components/AddressInput";
import { StepIndicator } from "./components/StepIndicator";
import { OrderSummary } from "./components/OrderSummary";
import {
  loadArtworkStorefront,
  resolveRoundedCustomerPriceParts,
  resolveStorefrontCustomerTotal,
  resolveStorefrontProductPrice,
  resolveStorefrontShippingPrice,
  type StorefrontSizeOption,
} from "@/lib/artworkStorefront";
import { detectDeliveryCountry, storeDeliveryCountry } from "@/lib/deliveryCountry";

type PrintQuoteState = {
  status: "loading" | "ready" | "unavailable" | "error";
  message?: string;
  item?: Partial<CartItem>;
};

function resolvePrintProductPrice(size: StorefrontSizeOption): number | null {
  return resolveStorefrontProductPrice(size);
}

function resolvePrintShippingPrice(size: StorefrontSizeOption): number | null {
  return resolveStorefrontShippingPrice(size);
}

function findMatchingPrintSize(
  item: CartItem,
  storefront: Awaited<ReturnType<typeof loadArtworkStorefront>>,
): StorefrontSizeOption | null {
  const cards = [
    ...(storefront.mediums.paper?.cards || []),
    ...(storefront.mediums.canvas?.cards || []),
  ];
  const card = cards.find((candidate) => candidate.category_id === item.prodigi_category_id);
  if (!card) {
    return null;
  }
  return (
    card.size_options.find((size) => {
      const slotMatch =
        Boolean(item.prodigi_slot_size_label) &&
        (size.slot_size_label === item.prodigi_slot_size_label ||
          size.size_label === item.prodigi_slot_size_label);
      const displayMatch = Boolean(item.size) && size.size_label === item.size;
      return slotMatch || displayMatch;
    }) || null
  );
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const { convertPrice } = usePreferences();
  const { user, refreshUser } = useUser();

  // --- Form state ---
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    // Shipping
    countryCode: "",
    state: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
    deliveryPhone: "",
    deliveryNotes: "",
    // Misc
    newsletter: "yes",
    discovery: "",
    promoCode: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoMessage, setPromoMessage] = useState({
    text: "",
    isError: false,
  });
  const [printQuotes, setPrintQuotes] = useState<Record<string, PrintQuoteState>>({});
  const formRef = useRef<HTMLDivElement>(null);

  const hasPrintItems = items.some((item) => item.type === "print");
  const initialPrintCountryCode = useMemo(() => {
    const country = items.find(
      (item) => item.type === "print" && item.prodigi_destination_country_code,
    )?.prodigi_destination_country_code;
    return country?.toUpperCase() || "";
  }, [items]);
  const effectiveCountryCode = formData.countryCode;

  const checkoutItems = useMemo(
    () =>
      items.map((item) => {
        const quote = printQuotes[item.id];
        if (item.type !== "print" || quote?.status !== "ready" || !quote.item) {
          return item;
        }
        return { ...item, ...quote.item };
      }),
    [items, printQuotes],
  );
  const printQuoteIssue = useMemo(() => {
    const quote = Object.values(printQuotes).find(
      (entry) => entry.status === "unavailable" || entry.status === "error",
    );
    return quote?.message || "";
  }, [printQuotes]);
  const printQuotesLoading = Object.values(printQuotes).some(
    (entry) => entry.status === "loading",
  );
  const hasUnresolvedPrintQuotes =
    hasPrintItems &&
    checkoutItems.some(
      (item) =>
        item.type === "print" &&
        item.prodigi_destination_country_code?.toUpperCase() !==
          formData.countryCode.toUpperCase(),
    );

  // Detect country on mount
  useEffect(() => {
    let cancelled = false;
    detectDeliveryCountry()
      .then((code) => {
        if (cancelled) {
          return;
        }
        setFormData((prev) => ({
          ...prev,
          countryCode: prev.countryCode || initialPrintCountryCode || code,
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setFormData((prev) => ({
          ...prev,
          countryCode: prev.countryCode || initialPrintCountryCode || "US",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [initialPrintCountryCode]);

  useEffect(() => {
    if (formData.countryCode) {
      storeDeliveryCountry(formData.countryCode);
    }
  }, [formData.countryCode]);

  useEffect(() => {
    if (!formData.countryCode || !hasPrintItems) {
      setPrintQuotes({});
      return;
    }

    let cancelled = false;
    const printItems = items.filter((item) => item.type === "print");
    setPrintQuotes((prev) => {
      const next = { ...prev };
      for (const item of printItems) {
        next[item.id] = { status: "loading" };
      }
      return next;
    });

    void Promise.all(
      printItems.map(async (item): Promise<[string, PrintQuoteState]> => {
        if (!item.prodigi_category_id || !item.prodigi_slot_size_label) {
          return [
            item.id,
            {
              status: "unavailable",
              message:
                "This print is missing its storefront selection. Please remove it and add it again from the product page.",
            },
          ];
        }

        try {
          const storefront = await loadArtworkStorefront(item.slug, formData.countryCode);
          if (!storefront.country_supported) {
            return [
              item.id,
              {
                status: "unavailable",
                message: `Sorry, this print is not available for delivery to ${formData.countryCode}.`,
              },
            ];
          }

          const size = findMatchingPrintSize(item, storefront);
          const productPrice = size ? resolvePrintProductPrice(size) : null;
          const shippingPrice = size ? resolvePrintShippingPrice(size) : null;
          const totalPrice = size ? resolveStorefrontCustomerTotal(size) : null;
          const roundedPriceParts = size ? resolveRoundedCustomerPriceParts(size) : null;
          if (!size || productPrice === null || shippingPrice === null || totalPrice === null || roundedPriceParts === null) {
            return [
              item.id,
              {
                status: "unavailable",
                message:
                  "This selected print format is not available for the new delivery country.",
              },
            ];
          }

          return [
            item.id,
            {
              status: "ready",
              item: {
                price: roundedPriceParts.total,
                customer_product_price: roundedPriceParts.product,
                customer_shipping_price: roundedPriceParts.shipping,
                customer_line_total: roundedPriceParts.total,
                customer_currency: "USD",
                prodigi_storefront_offer_size_id: size.id || undefined,
                prodigi_sku: size.sku || undefined,
                prodigi_shipping_method:
                  size.shipping_support?.chosen_shipping_method ||
                  size.shipping_support?.chosen_tier ||
                  size.shipping_method ||
                  size.default_shipping_tier ||
                  item.prodigi_shipping_method,
                prodigi_wholesale_eur: size.supplier_product_price || undefined,
                prodigi_shipping_eur: size.supplier_shipping_price || undefined,
                prodigi_supplier_total_eur: size.supplier_total_cost || undefined,
                prodigi_retail_eur: productPrice,
                prodigi_supplier_currency: size.currency || "EUR",
                prodigi_destination_country_code: formData.countryCode,
              },
            },
          ];
        } catch (error) {
          return [
            item.id,
            {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to recalculate print pricing for this delivery country.",
            },
          ];
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      setPrintQuotes(Object.fromEntries(results));
    });

    return () => {
      cancelled = true;
    };
  }, [formData.countryCode, hasPrintItems, items]);

  // Pre-fill from Google auth
  useEffect(() => {
    if (user) {
      const [first, ...rest] = (user.username || "").split(" ");
      setFormData((prev) => ({
        ...prev,
        firstName: prev.firstName || first || "",
        lastName: prev.lastName || rest.join(" ") || "",
        email: prev.email || user.email || "",
      }));
    }
  }, [user, user?.username, user?.email]);

  const handleGoogleSuccess = async (credentialResponse: any) => {
    try {
      const res = await fetch(`${getApiUrl()}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credentialResponse.credential }),
        credentials: "include",
      });
      if (res.ok) await refreshUser();
    } catch (err) {
      console.error("Google Auth failed:", err);
    }
  };

  /* ---- Country-aware labels ---- */
  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === effectiveCountryCode),
    [effectiveCountryCode],
  );
  const stateLabel = getStateLabel(effectiveCountryCode);
  const postalLabel = getPostalLabel(effectiveCountryCode);

  /* ---- Single-field validation helper ---- */
  const validateField = useCallback(
    (name: string, data: typeof formData): string => {
      const v = (data as any)[name] as string;
      switch (name) {
        case "firstName":
          if (!v.trim()) return "First name is required";
          return "";
        case "lastName":
          if (!v.trim()) return "Last name is required";
          return "";
        case "email":
          if (!v.trim()) return "Email is required";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()))
            return "Enter a valid email address";
          return "";
        case "phone":
          if (!v.trim()) return "Phone number is required";
          if (v.replace(/\D/g, "").length < 7)
            return "Enter a valid phone number (min 7 digits)";
          return "";
        case "countryCode":
          if (!v) return "Please select a country";
          return "";
        case "city":
          if (!v.trim()) return "City is required";
          return "";
        case "addressLine1":
          if (!v.trim()) return "Street address is required";
          return "";
        case "postalCode":
          if (!v.trim()) return `${postalLabel} is required`;
          if (v.trim().length < 3) return `${postalLabel} is too short`;
          return "";
        default:
          return "";
      }
    },
    [postalLabel],
  );

  /* ---- Mark field as touched and validate on blur ---- */
  const handleBlur = useCallback(
    (
      e: React.FocusEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      const { name } = e.target;
      setTouched((prev) => ({ ...prev, [name]: true }));
      setFormData((f) => {
        const err = validateField(name, f);
        setErrors((prev) => ({ ...prev, [name]: err }));
        return f;
      });
    },
    [validateField],
  );

  const handleInput = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Re-validate already touched fields on every keystroke
      if (touched[name]) {
        const err = validateField(name, next);
        setErrors((p) => ({ ...p, [name]: err }));
      } else if (errors[name]) {
        // Legacy: clear error if field was flagged but not yet in touched mode
        setErrors((p) => ({ ...p, [name]: "" }));
      }
      return next;
    });
  };

  /* ---- Track country code changes (no phone auto-fill — prefix is shown in PhoneInput) ---- */
  const prevCountryRef = useRef(formData.countryCode);
  useEffect(() => {
    if (
      formData.countryCode &&
      formData.countryCode !== prevCountryRef.current
    ) {
      prevCountryRef.current = formData.countryCode;
    }
  }, [formData.countryCode]);

  /* ---- Google Places address auto-fill ---- */
  const handlePlaceSelect = useCallback(
    (place: {
      address: string;
      city: string;
      state: string;
      postalCode: string;
      countryCode: string;
    }) => {
      setFormData((prev) => ({
        ...prev,
        addressLine1: place.address || prev.addressLine1,
        city: place.city || prev.city,
        state: place.state || prev.state,
        postalCode: place.postalCode || prev.postalCode,
        countryCode: place.countryCode || prev.countryCode,
      }));
      // Clear related errors
      setErrors((prev) => ({
        ...prev,
        addressLine1: "",
        city: "",
        postalCode: "",
        countryCode: "",
      }));
    },
    [],
  );

  /* ---- Step 1 validation ---- */
  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "countryCode",
    "city",
    "addressLine1",
    "postalCode",
  ];

  const validateStep1 = (): boolean => {
    // Mark all required fields as touched
    const allTouched: Record<string, boolean> = {};
    requiredFields.forEach((f) => {
      allTouched[f] = true;
    });
    setTouched((prev) => ({ ...prev, ...allTouched }));

    // Validate every required field
    const errs: Record<string, string> = {};
    requiredFields.forEach((f) => {
      const err = validateField(f, formData);
      if (err) errs[f] = err;
    });
    if (printQuotesLoading || hasUnresolvedPrintQuotes) {
      errs.countryCode = "Print pricing is still being recalculated for this country.";
    } else if (printQuoteIssue) {
      errs.countryCode = printQuoteIssue;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goToStep2 = () => {
    if (validateStep1()) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      // Scroll to first error field
      requestAnimationFrame(() => {
        const firstErr = formRef.current?.querySelector(
          '[data-error="true"]',
        ) as HTMLElement | null;
        firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  };

  /* ---- Promo logic ---- */
  const printTotal = checkoutItems
    .filter((i) => i.type === "print")
    .reduce(
      (s, i) => s + Number(i.customer_product_price ?? i.prodigi_retail_eur ?? i.price) * i.quantity,
      0,
    );
  const shippingTotal = checkoutItems
    .filter((i) => i.type === "print")
    .reduce((s, i) => s + Number(i.customer_shipping_price || 0) * i.quantity, 0);
  const discountAmount = promoApplied ? Math.round(printTotal * 0.1) : 0;
  const checkoutCartTotal = checkoutItems.reduce(
    (sum, item) =>
      sum +
      Number(
        item.type === "print"
          ? item.customer_product_price ?? item.prodigi_retail_eur ?? item.price
          : item.price,
      ) *
        item.quantity,
    0,
  );
  const currentTotal = checkoutCartTotal - discountAmount + shippingTotal;

  const applyPromo = () => {
    if (formData.promoCode.toUpperCase() === "ART10") {
      setPromoApplied(true);
      setPromoMessage({
        text: "10% discount applied to prints!",
        isError: false,
      });
    } else {
      setPromoMessage({ text: "Invalid promo code.", isError: true });
    }
  };

  /* ---- Submit: Create order → Monobank payment ---- */
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError("");

    try {
      if (printQuotesLoading || hasUnresolvedPrintQuotes || printQuoteIssue) {
        setSubmitError(
          printQuoteIssue || "Print pricing is still being recalculated. Please try again in a moment.",
        );
        return;
      }

      const country = countries.find((c) => c.code === formData.countryCode);
      const checkoutCountryCode = formData.countryCode;
      const checkoutCountry = countries.find((c) => c.code === checkoutCountryCode);

      const orderRequest = {
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        shipping_country: checkoutCountry?.name || country?.name || checkoutCountryCode,
        shipping_country_code: checkoutCountryCode,
        shipping_state: formData.state.trim() || null,
        shipping_city: formData.city.trim(),
        shipping_address_line1: formData.addressLine1.trim(),
        shipping_address_line2: null,
        shipping_postal_code: formData.postalCode.trim(),
        shipping_phone: formData.deliveryPhone.trim() || null,
        shipping_notes: formData.deliveryNotes.trim() || null,
        newsletter_opt_in: formData.newsletter === "yes",
        discovery_source: formData.discovery || null,
        promo_code: promoApplied ? formData.promoCode : null,
        items: checkoutItems.flatMap((item) =>
          Array.from({ length: item.quantity }, () => ({
            artwork_id: parseInt(item.slug) || 1,
            edition_type:
              item.edition_type ||
              (item.type === "original"
                ? "original"
                : item.finish?.toLowerCase().includes("canvas")
                  ? "canvas_print"
                  : "paper_print"),
            finish: item.finish || "Original",
            size: item.size,
            price: Math.round(item.price),
            prodigi_sku: item.prodigi_sku,
            prodigi_storefront_offer_size_id:
              item.prodigi_storefront_offer_size_id,
            prodigi_category_id: item.prodigi_category_id,
            prodigi_slot_size_label: item.prodigi_slot_size_label,
            prodigi_attributes: item.prodigi_attributes,
            prodigi_shipping_method: item.prodigi_shipping_method,
            prodigi_destination_country_code: item.prodigi_destination_country_code,
          })),
        ),
      };

      const orderRes = await apiFetch(`${getApiUrl()}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderRequest),
      });

      const orderData = await apiJson<{
        data?: { id?: number; total_price?: number };
      }>(orderRes);
      const orderId = orderData.data?.id;

      if (!orderId) {
        setSubmitError(
          "Order created but no ID returned. Please contact support.",
        );
        return;
      }

      const paymentRes = await apiFetch(`${getApiUrl()}/payments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          currency: "UAH",
        }),
      });

      const paymentData = await apiJson<{ payment_url: string }>(paymentRes);
      clearCart();
      window.location.href = paymentData.payment_url;
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Connection error. Please check your internet and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ---- Empty cart view ---- */
  if (items.length === 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "2rem",
              marginBottom: "1rem",
              fontStyle: "italic",
            }}
          >
            Your cart is empty
          </h2>
          <Link
            href="/shop"
            style={{
              color: "#ec4899",
              textDecoration: "underline",
              fontFamily: "var(--font-sans)",
            }}
          >
            Back to Shop
          </Link>
        </div>
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */

  return (
    <div style={{ minHeight: "100vh", padding: "2rem 1rem 4rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* ── Progress Bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            marginBottom: "3rem",
            marginTop: "1rem",
          }}
        >
          <StepIndicator
            num={1}
            label="Information"
            active={step === 1}
            done={step > 1}
            onClick={() => setStep(1)}
          />
          <div
            style={{
              width: "60px",
              height: "2px",
              backgroundColor: step > 1 ? "#ec4899" : "rgba(17,17,17,0.1)",
              borderRadius: "1px",
              transition: "background-color 0.3s",
            }}
          />
          <StepIndicator
            num={2}
            label="Review & Pay"
            active={step === 2}
            done={false}
          />
        </div>

        <div
          style={{ display: "grid", gridTemplateColumns: "1fr", gap: "3rem" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
              gap: "4rem",
            }}
            className="checkout-grid"
          >
            {/* ════════ LEFT COLUMN ════════ */}
            <div>
              {step === 1 && (
                <div
                  ref={formRef}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2.5rem",
                    animation: "fadeIn 0.3s ease",
                  }}
                >
                  {/* Google Auth */}
                  {!user && (
                    <div
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                        padding: "1.5rem 2rem",
                        borderRadius: "12px",
                        border: "1px solid rgba(236,72,153,0.12)",
                        textAlign: "center",
                      }}
                    >
                      <h2
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          marginBottom: "0.75rem",
                          color: "#666",
                        }}
                      >
                        Quick Checkout
                      </h2>
                      <div
                        style={{ display: "flex", justifyContent: "center" }}
                      >
                        <GoogleLogin
                          onSuccess={handleGoogleSuccess}
                          onError={() => console.log("Login Failed")}
                          theme="outline"
                          size="large"
                          text="signin_with"
                        />
                      </div>
                      <p
                        style={{
                          marginTop: "0.75rem",
                          fontSize: "0.75rem",
                          color: "#999",
                        }}
                      >
                        Sign in to auto-fill your details
                      </p>
                    </div>
                  )}

                  {user && (
                    <div
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                        padding: "1rem 1.5rem",
                        borderRadius: "12px",
                        border: "1px solid rgba(236,72,153,0.12)",
                        fontSize: "0.85rem",
                      }}
                    >
                      <p style={{ color: "#555" }}>
                        ✓ Signed in as <strong>{user.email}</strong>
                      </p>
                    </div>
                  )}

                  {/* ---- Contact Info ---- */}
                  <div>
                    <h2 style={sectionTitle}>Contact Information</h2>
                    <div
                      className="checkout-two-col"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "1rem",
                      }}
                    >
                      <SmartInput
                        label="First Name"
                        name="firstName"
                        required
                        placeholder="John"
                        value={formData.firstName}
                        onChange={handleInput}
                        onBlur={handleBlur}
                        error={touched.firstName ? errors.firstName : undefined}
                        valid={
                          formData.firstName.trim().length >= 1 &&
                          !errors.firstName
                        }
                        data-error={!!(touched.firstName && errors.firstName)}
                      />
                      <SmartInput
                        label="Last Name"
                        name="lastName"
                        required
                        placeholder="Doe"
                        value={formData.lastName}
                        onChange={handleInput}
                        onBlur={handleBlur}
                        error={touched.lastName ? errors.lastName : undefined}
                        valid={
                          formData.lastName.trim().length >= 1 &&
                          !errors.lastName
                        }
                        data-error={!!(touched.lastName && errors.lastName)}
                      />
                      <SmartInput
                        label="Email"
                        name="email"
                        type="email"
                        required
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={handleInput}
                        onBlur={handleBlur}
                        error={touched.email ? errors.email : undefined}
                        valid={
                          /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
                            formData.email.trim(),
                          ) && !errors.email
                        }
                        data-error={!!(touched.email && errors.email)}
                      />
                      <PhoneInput
                        label="Phone"
                        required
                        value={formData.phone}
                        onChange={(val) => {
                          setFormData((prev) => {
                            const next = { ...prev, phone: val };
                            if (touched.phone) {
                              const err = validateField("phone", next);
                              setErrors((p) => ({ ...p, phone: err }));
                            } else if (errors.phone) {
                              setErrors((p) => ({ ...p, phone: "" }));
                            }
                            return next;
                          });
                        }}
                        countryCode={effectiveCountryCode}
                        onChangeCountry={(code) => {
                          setFormData((prev) => ({
                            ...prev,
                            countryCode: code,
                          }));
                        }}
                        error={touched.phone ? errors.phone : undefined}
                        placeholder="Phone number"
                      />
                    </div>
                  </div>

                  {/* ---- Shipping Address ---- */}
                  <div>
                    <h2 style={sectionTitle}>Shipping Address</h2>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      <CountrySelect
                        value={formData.countryCode}
                        onChange={(code) => {
                          setFormData((prev) => ({
                            ...prev,
                            countryCode: code,
                          }));
                          setTouched((prev) => ({
                            ...prev,
                            countryCode: true,
                          }));
                          setErrors((prev) => ({ ...prev, countryCode: "" }));
                          setSubmitError("");
                        }}
                        error={
                          touched.countryCode ? errors.countryCode : undefined
                        }
                      />
                      {hasPrintItems && (printQuotesLoading || printQuoteIssue) && (
                        <p
                          style={{
                            margin: "-0.45rem 0 0",
                            fontFamily: "var(--font-sans)",
                            fontSize: "0.76rem",
                            lineHeight: 1.5,
                            color: printQuoteIssue ? "#C53030" : "#777",
                          }}
                        >
                          {printQuotesLoading
                            ? "Recalculating print price and delivery for this country..."
                            : printQuoteIssue}
                        </p>
                      )}
                      <AddressInput
                        label="Address Line 1"
                        value={formData.addressLine1}
                        onChange={handleInput}
                        onPlaceSelect={(place) => {
                          handlePlaceSelect(place);
                          // Mark auto-filled fields as touched & valid
                          setTouched((prev) => ({
                            ...prev,
                            addressLine1: true,
                            city: true,
                            postalCode: true,
                            countryCode: true,
                          }));
                        }}
                        countryCode={effectiveCountryCode}
                        required
                        placeholder="Start typing your address..."
                        error={
                          touched.addressLine1 ? errors.addressLine1 : undefined
                        }
                        valid={
                          formData.addressLine1.length > 5 &&
                          !errors.addressLine1
                        }
                      />
                      <div
                        className="checkout-two-col"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1rem",
                        }}
                      >
                        <SmartInput
                          label="City"
                          name="city"
                          required
                          placeholder="City / Town"
                          value={formData.city}
                          onChange={handleInput}
                          onBlur={handleBlur}
                          error={touched.city ? errors.city : undefined}
                          valid={formData.city.length > 1 && !errors.city}
                          data-error={!!(touched.city && errors.city)}
                        />
                        <SmartInput
                          label={stateLabel}
                          name="state"
                          placeholder={stateLabel}
                          value={formData.state}
                          onChange={handleInput}
                          valid={formData.state.length > 1}
                        />
                      </div>
                      <div
                        className="checkout-two-col"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "1rem",
                        }}
                      >
                        <SmartInput
                          label={postalLabel}
                          name="postalCode"
                          required
                          placeholder={postalLabel}
                          value={formData.postalCode}
                          onChange={handleInput}
                          onBlur={handleBlur}
                          error={
                            touched.postalCode ? errors.postalCode : undefined
                          }
                          valid={
                            formData.postalCode.length > 2 && !errors.postalCode
                          }
                          data-error={
                            !!(touched.postalCode && errors.postalCode)
                          }
                        />
                        <SmartInput
                          label="Delivery Phone"
                          name="deliveryPhone"
                          type="tel"
                          placeholder="If different from contact"
                          value={formData.deliveryPhone}
                          onChange={handleInput}
                          valid={formData.deliveryPhone.length > 5}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <label style={labelStyle}>Delivery Notes</label>
                        <textarea
                          name="deliveryNotes"
                          placeholder="Gate code, building entrance, special instructions... (optional)"
                          value={formData.deliveryNotes}
                          onChange={handleInput}
                          rows={3}
                          style={{
                            ...inputBase,
                            resize: "vertical",
                            minHeight: "80px",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ---- Newsletter ---- */}
                  <div
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(236,72,153,0.04), rgba(251,146,60,0.04))",
                      padding: "1.5rem 2rem",
                      borderRadius: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: "1.05rem",
                        fontStyle: "italic",
                        color: "var(--color-charcoal)",
                      }}
                    >
                      Sign up for the email newsletter?
                    </span>
                    <div style={{ display: "flex", gap: "2rem" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.9rem",
                        }}
                      >
                        <input
                          type="radio"
                          name="newsletter"
                          value="yes"
                          checked={formData.newsletter === "yes"}
                          onChange={handleInput}
                        />{" "}
                        Yes
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          cursor: "pointer",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.9rem",
                        }}
                      >
                        <input
                          type="radio"
                          name="newsletter"
                          value="no"
                          checked={formData.newsletter === "no"}
                          onChange={handleInput}
                        />{" "}
                        No
                      </label>
                    </div>
                  </div>

                  {/* ---- Discovery ---- */}
                  <SmartInput
                    label="How did you discover us?"
                    name="discovery"
                    placeholder="Instagram, Google, friend, gallery..."
                    value={formData.discovery}
                    onChange={handleInput}
                  />

                  {/* ---- Continue Button ---- */}
                  <button
                    type="button"
                    onClick={goToStep2}
                    className="premium-cta-btn"
                    style={{ width: "100%", padding: "1rem", fontSize: "1rem" }}
                  >
                    Continue to Review →
                  </button>
                </div>
              )}

              {step === 2 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2rem",
                    animation: "fadeIn 0.3s ease",
                  }}
                >
                  {/* ---- Shipping Summary ---- */}
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <h2 style={sectionTitle}>Shipping To</h2>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ec4899",
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          textDecoration: "underline",
                          padding: "0.25rem",
                        }}
                      >
                        Change
                      </button>
                    </div>
                    <div
                      style={{
                        background: "#FAFAF8",
                        border: "1px solid rgba(17,17,17,0.08)",
                        borderRadius: "12px",
                        padding: "1.5rem",
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.9rem",
                        lineHeight: 1.7,
                        color: "#444",
                      }}
                    >
                      <p
                        style={{
                          fontWeight: 600,
                          color: "#111",
                          marginBottom: "0.25rem",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        {formData.firstName} {formData.lastName}
                        {formData.countryCode && (
                          <span style={{ fontSize: "1.1rem" }}>
                            {countryCodeToFlag(formData.countryCode)}
                          </span>
                        )}
                      </p>
                      <p>{formData.addressLine1}</p>
                      <p>
                        {formData.city}
                        {formData.state ? `, ${formData.state}` : ""}{" "}
                        {formData.postalCode}
                      </p>
                      <p>{selectedCountry?.name || formData.countryCode}</p>
                      <p style={{ color: "#888", marginTop: "0.5rem" }}>
                        {formData.email} · {formData.phone}
                      </p>
                      {formData.deliveryNotes && (
                        <p
                          style={{
                            marginTop: "0.5rem",
                            fontStyle: "italic",
                            color: "#888",
                          }}
                        >
                          📝 {formData.deliveryNotes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ---- Promo Code ---- */}
                  <div>
                    <h2 style={sectionTitle}>Promo Code</h2>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        type="text"
                        name="promoCode"
                        placeholder="Enter code"
                        value={formData.promoCode}
                        onChange={handleInput}
                        style={{ ...inputBase, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={applyPromo}
                        className="premium-cta-btn"
                        style={{
                          padding: "0.85rem 1.5rem",
                          fontSize: "0.8rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    {promoMessage.text && (
                      <p
                        style={{
                          fontFamily: "var(--font-sans)",
                          fontSize: "0.8rem",
                          marginTop: "0.5rem",
                          color: promoMessage.isError ? "#E53E3E" : "#38A169",
                          fontWeight: 500,
                        }}
                      >
                        {promoMessage.text}
                      </p>
                    )}
                  </div>

                  {/* ---- Submit Error ---- */}
                  {submitError && (
                    <div
                      style={{
                        background: "rgba(229,62,62,0.06)",
                        border: "1px solid rgba(229,62,62,0.2)",
                        borderRadius: "8px",
                        padding: "1rem 1.5rem",
                        color: "#C53030",
                        fontFamily: "var(--font-sans)",
                        fontSize: "0.85rem",
                      }}
                    >
                      ⚠ {submitError}
                    </div>
                  )}

                  {/* ---- Pay Button ---- */}
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="premium-cta-btn"
                    style={{
                      width: "100%",
                      padding: "1.1rem",
                      fontSize: "1.05rem",
                    }}
                  >
                    {isSubmitting ? (
                      "Processing..."
                    ) : (
                      <>
                        Pay{" "}
                        <span className="font-price">
                          {convertPrice(currentTotal)}
                        </span>
                      </>
                    )}
                  </button>

                  {/* ---- Payment Method Badges ---- */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                      marginTop: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.65rem",
                        color: "#aaa",
                        fontFamily: "var(--font-sans)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      We accept
                    </span>
                    {/* Visa */}
                    <svg
                      width="34"
                      height="22"
                      viewBox="0 0 34 22"
                      fill="none"
                      style={{ opacity: 0.5 }}
                    >
                      <rect width="34" height="22" rx="4" fill="#1A1F71" />
                      <text
                        x="17"
                        y="14"
                        textAnchor="middle"
                        fill="white"
                        fontSize="9"
                        fontWeight="700"
                        fontFamily="Arial"
                      >
                        VISA
                      </text>
                    </svg>
                    {/* Mastercard */}
                    <svg
                      width="34"
                      height="22"
                      viewBox="0 0 34 22"
                      fill="none"
                      style={{ opacity: 0.5 }}
                    >
                      <rect width="34" height="22" rx="4" fill="#252525" />
                      <circle
                        cx="14"
                        cy="11"
                        r="6"
                        fill="#EB001B"
                        opacity="0.9"
                      />
                      <circle
                        cx="20"
                        cy="11"
                        r="6"
                        fill="#F79E1B"
                        opacity="0.9"
                      />
                    </svg>
                    {/* Google Pay */}
                    <svg
                      width="38"
                      height="22"
                      viewBox="0 0 38 22"
                      fill="none"
                      style={{ opacity: 0.5 }}
                    >
                      <rect
                        width="38"
                        height="22"
                        rx="4"
                        fill="#fff"
                        stroke="#ddd"
                        strokeWidth="0.5"
                      />
                      <text
                        x="19"
                        y="13.5"
                        textAnchor="middle"
                        fill="#5F6368"
                        fontSize="7"
                        fontWeight="600"
                        fontFamily="Arial"
                      >
                        G Pay
                      </text>
                    </svg>
                    {/* Apple Pay */}
                    <svg
                      width="38"
                      height="22"
                      viewBox="0 0 38 22"
                      fill="none"
                      style={{ opacity: 0.5 }}
                    >
                      <rect width="38" height="22" rx="4" fill="#000" />
                      <text
                        x="19"
                        y="13.5"
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="7"
                        fontWeight="600"
                        fontFamily="Arial"
                      >
                        {" "}
                        Pay
                      </text>
                    </svg>
                  </div>

                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.7rem",
                      color: "#999",
                      textAlign: "center",
                      lineHeight: 1.5,
                    }}
                  >
                    You will be redirected to a secure Monobank payment page.
                    Your financial information is never stored on our servers.
                  </p>
                </div>
              )}
            </div>

            {/* ════════ RIGHT COLUMN: Order Summary ════════ */}
            <OrderSummary
              items={checkoutItems}
              promoApplied={promoApplied}
              discountAmount={discountAmount}
              cartTotal={checkoutCartTotal}
              shippingTotal={shippingTotal}
              currentTotal={currentTotal}
              convertPrice={convertPrice}
            />
          </div>
        </div>
      </div>

      <style>{`
                @media (max-width: 768px) {
                    .checkout-grid {
                        grid-template-columns: 1fr !important;
                        gap: 2rem !important;
                    }
                    .checkout-summary {
                        order: -1;
                    }
                }
                @media (max-width: 480px) {
                    .checkout-two-col {
                        grid-template-columns: 1fr !important;
                    }
                }
                /* Override Google Places Autocomplete dropdown styling */
                .pac-container {
                    border-radius: 8px !important;
                    border: 1px solid rgba(17,17,17,0.12) !important;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
                    font-family: var(--font-sans) !important;
                    margin-top: 4px !important;
                }
                .pac-item {
                    padding: 8px 12px !important;
                    font-size: 0.85rem !important;
                    cursor: pointer !important;
                    border-top: 1px solid rgba(17,17,17,0.04) !important;
                }
                .pac-item:hover {
                    background-color: rgba(236,72,153,0.06) !important;
                }
                .pac-item-query {
                    font-size: 0.85rem !important;
                    color: #111 !important;
                }
                .pac-matched {
                    font-weight: 600 !important;
                }
                .pac-icon {
                    display: none !important;
                }
            `}</style>
    </div>
  );
}
