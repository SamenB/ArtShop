"use client";

/**
 * Homepage Artwork Display Card.
 * Renders an abstract container that dynamically frames artwork based on its physical properties (orientation, gradient).
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { artworkUrl, getImageUrl } from "@/utils";

const STATUS: Record<string, { label: string; color: string }> = {
  available: { label: "AVAILABLE", color: "#6DB87E" },
  sold: { label: "SOLD", color: "#C0392B" },
  reserved: { label: "RESERVED", color: "#D4A017" },
  not_for_sale: { label: "NOT FOR SALE", color: "#999" },
  on_exhibition: { label: "ON EXHIBITION", color: "#2980B9" },
  archived: { label: "ARCHIVED", color: "#7f8c8d" },
  digital: { label: "DIGITAL", color: "#8E44AD" },
};

interface Props {
  work: any;
  zoneH?: number;
}

export default function HomeArtCard({ work, zoneH = 380 }: Props) {
  const ori = (work.orientation || "vertical").toLowerCase();
  const isHorizontal = ori === "horizontal";
  const isSquare = ori === "square";
  const imgSrc = work.images?.[0] ? getImageUrl(work.images[0], "original") : "";

  const containerRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [textPad, setTextPad] = useState(0);
  const [emptyBottom, setEmptyBottom] = useState(0);
  const [measuredImgH, setMeasuredImgH] = useState(0);
  const [measuredImgW, setMeasuredImgW] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
      setIsMobile(window.innerWidth < 1024);
  }, []);

  const recalc = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const inner = c.querySelector(".art-card-inner") as HTMLElement;
    if (!inner) return;
    if (inner.tagName === "IMG") {
      const img = inner as HTMLImageElement;
      if (!img.complete || !img.naturalWidth) return;
    }
    setTextPad(Math.max(0, (c.clientWidth - inner.offsetWidth) / 2));
    setEmptyBottom(Math.max(0, (c.clientHeight - inner.offsetHeight) / 2));
    setMeasuredImgH(inner.offsetHeight);
    setMeasuredImgW(inner.offsetWidth);
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [recalc]);

  useEffect(() => {
    requestAnimationFrame(recalc);
  }, [zoneH, recalc]);

  return (
    <Link
      ref={linkRef}
      href={artworkUrl(work.slug || work.id)}
      className="art-card"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        width: "100%",
      }}
    >
      <div
        ref={containerRef}
        className="art-card-container"
        style={{
          width: "100%",
          height: `${zoneH}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
          zIndex: 10,
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={work.title}
            className="art-card-inner"
            onLoad={recalc}
            style={{
              display: "block",
              maxWidth: isHorizontal || isSquare ? "78%" : "80%",
              maxHeight: isHorizontal ? `${zoneH * 0.78}px` : `${zoneH * 0.90}px`,
              width: "auto",
              height: "auto",
              borderRadius: "4px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: "2px 10px 28px rgba(28,25,22,0.72), 0 3px 8px rgba(28,25,22,0.40)",
            }}
          />
        ) : (
          <div
            className="art-card-inner"
            style={{
              width: isHorizontal || isSquare ? "78%" : "55%",
              height: isHorizontal ? "55%" : "85%",
              backgroundImage: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
              borderRadius: "4px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: "2px 10px 28px rgba(28,25,22,0.72), 0 3px 8px rgba(28,25,22,0.40)",
            }}
          />
        )}
      </div>

      {/* Title, Medium & Status — frosted glass backplate */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          marginTop: measuredImgH > 0
            ? `-${emptyBottom + measuredImgH + 4}px`
            : `-${emptyBottom - (isMobile ? 10 : 8)}px`,
          marginLeft: `${textPad - 4}px`,
          marginRight: `${textPad - 4}px`,
          paddingTop: measuredImgH > 0
            ? `${measuredImgH + (isMobile ? 10 : 8) + 4}px`
            : "0.15rem",
          paddingBottom: "0.5rem",
          paddingLeft: "0.55rem",
          paddingRight: "0.55rem",
          flexShrink: 0,
          backgroundColor: "rgba(235, 235, 237, 0.82)",
          backdropFilter: "blur(12px) saturate(1.3)",
          WebkitBackdropFilter: "blur(12px) saturate(1.3)",
          borderTop: "1px solid rgba(255,255,255,0.75)",
          borderLeft: "1px solid rgba(255,255,255,0.55)",
          borderRight: "1px solid rgba(200,200,205,0.38)",
          borderBottom: "1px solid rgba(180,180,190,0.3)",
          borderRadius: "4px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.6) inset",
          display: "flex",
          flexDirection: "column",
          gap: "0.05rem",
        }}
      >
        {/* Title */}
        <p
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.90rem",
            fontWeight: 400,
            fontStyle: "italic",
            letterSpacing: "0.01em",
            color: "#333",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            lineHeight: 1.2,
          }}
        >
          {work.title}
        </p>

        {/* Medium / Size */}
        {(work.medium || work.size) && (
          <p style={{
            fontFamily: "var(--font-sans)",
            fontSize: "0.68rem",
            fontWeight: 400,
            color: "#999",
            margin: 0,
            lineHeight: 1.2,
          }}>
            {[work.medium, work.size].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Status pill + Price */}
        {work.original_status && STATUS[work.original_status] && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "2px", flexWrap: "wrap" }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              backgroundColor: STATUS[work.original_status].color + "18",
              border: `1px solid ${STATUS[work.original_status].color}44`,
              borderRadius: "4px",
              padding: "2px 7px 2px 5px",
            }}>
              <span style={{
                display: "inline-block",
                width: "5px", height: "5px",
                borderRadius: "50%",
                backgroundColor: STATUS[work.original_status].color,
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.58rem",
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: STATUS[work.original_status].color,
                lineHeight: 1,
              }}>
                {STATUS[work.original_status].label}
              </span>
            </span>
            {work.original_status === "available" && work.original_price && (
              <span style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.78rem",
                fontWeight: 500,
                color: "#555",
              }}>
                ${work.original_price.toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
