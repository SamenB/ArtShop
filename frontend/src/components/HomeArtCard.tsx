"use client";

/**
 * Homepage Artwork Display Card.
 * Renders an abstract container that dynamically frames artwork based on its physical properties (orientation, gradient).
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { artworkUrl, getImageUrl } from "@/utils";

const STATUS: Record<string, { label: string; badgeBg: string; badgeText: string; textColor: string }> = {
  available: { label: "AVAILABLE", badgeBg: "rgba(100,185,120,0.13)", badgeText: "#3a7a4a", textColor: "#6DB87E" },
  sold: { label: "SOLD", badgeBg: "rgba(180,60,60,0.11)", badgeText: "#9b2c2c", textColor: "#C05050" },
  reserved: { label: "RESERVED", badgeBg: "rgba(200,160,50,0.13)", badgeText: "#836a1a", textColor: "#C8A32A" },
  not_for_sale: { label: "NOT FOR SALE", badgeBg: "rgba(120,120,120,0.11)", badgeText: "#555", textColor: "#999" },
  on_exhibition: { label: "ON EXHIBITION", badgeBg: "rgba(50,130,200,0.11)", badgeText: "#20527a", textColor: "#4A90BE" },
  archived: { label: "ARCHIVED", badgeBg: "rgba(100,100,100,0.10)", badgeText: "#666", textColor: "#7f8c8d" },
  digital: { label: "DIGITAL ONLY", badgeBg: "rgba(120,90,200,0.12)", badgeText: "#5a3a9a", textColor: "#8E44AD" },
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
  const [imgHovered, setImgHovered] = useState(false);

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
        /* Unified scale: image + text move as one glass plate */
        transform: imgHovered && !isMobile ? "scale(1.03)" : "scale(1)",
        transformOrigin: "center center",
        transition: "transform 0.2s ease-out",
        WebkitTapHighlightColor: "transparent",
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
          pointerEvents: "none",
        }}
      >
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={work.title}
            className="art-card-inner"
            onLoad={recalc}
            onMouseEnter={() => { if (!isMobile) setImgHovered(true); }}
            onMouseLeave={() => { if (!isMobile) setImgHovered(false); }}
            style={{
              display: "block",
              maxWidth: "76%",
              maxHeight: isHorizontal || isSquare ? `${zoneH * 0.76}px` : `${zoneH * 0.90}px`,
              width: "auto",
              height: "auto",
              borderRadius: "4px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: imgHovered && !isMobile
                  ? "4px 16px 40px rgba(28,25,22,0.58), 0 4px 12px rgba(28,25,22,0.35)"
                  : "2px 10px 28px rgba(28,25,22,0.48), 0 3px 8px rgba(28,25,22,0.25)",
              transition: "box-shadow 0.2s ease-out, transform 0.2s ease-out",
              pointerEvents: "auto",
            }}
          />
        ) : (
          <div
            className="art-card-inner"
            style={{
              width: isHorizontal || isSquare ? "76%" : "55%",
              height: isHorizontal ? "55%" : "85%",
              backgroundImage: `linear-gradient(160deg, ${work.gradientFrom} 0%, ${work.gradientTo} 100%)`,
              borderRadius: "4px",
              alignSelf: "center",
              flexShrink: 0,
              boxShadow: "2px 8px 22px rgba(28,25,22,0.36), 0 2px 6px rgba(28,25,22,0.20)",
              pointerEvents: "auto",
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
          pointerEvents: "none", // Container passes through, children capture
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.05rem", pointerEvents: "auto" }}>
        {(() => {
          const st = work.original_status ? STATUS[work.original_status] : null;

          return (
            <React.Fragment>
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
                  color: "#777",
                  margin: 0,
                  lineHeight: 1.2,
                }}>
                  {[work.medium, work.size].filter(Boolean).join(" · ")}
                </p>
              )}

              {/* Status pill */}
              {st && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "1px" }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: st.badgeBg,
                    border: `1px solid ${st.badgeText}33`,
                    borderRadius: "4px",
                    padding: "2px 7px 2px 5px",
                  }}>
                    <span style={{
                      display: "inline-block",
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      backgroundColor: st.badgeText,
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.58rem",
                      fontWeight: 600,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      color: st.badgeText,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}>
                      {st.label}
                    </span>
                  </span>
                </div>
              )}
              
              {/* Price */}
              {work.original_status === "available" && work.original_price && (
                <p style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.68rem",
                  fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                }}>
                  Original <span style={{ fontWeight: 500, color: "#555" }}>${work.original_price.toLocaleString()}</span>
                </p>
              )}
              {work.has_prints && work.base_print_price && (
                <p style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "0.68rem",
                  fontWeight: 400, color: "#777", lineHeight: 1.2, margin: 0
                }}>
                  Prints starting at <span style={{ fontWeight: 500, color: "#555" }}>${work.base_print_price.toLocaleString()}</span>
                </p>
              )}
            </React.Fragment>
          );
        })()}
      </div>
      </div>
    </Link>
  );
}
