"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/** Defines the source structure for responsive slideshow layers. */
interface CoverSlide {
  desktopUrl: string;
  mobileUrl: string;
}

/** Configures the pacing and visual effects for the Hero Slideshow. */
interface HeroSlideshowProps {
  covers: CoverSlide[];
  kenBurnsEnabled?: boolean;
  slideDuration?: number; // duration in seconds
}

/**
 * Precomputed Ken Burns cinematic directions.
 * Each progression gets a slightly different focal vector to prevent visual fatigue.
 */
const KEN_BURNS_PRESETS = [
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.08) translate(-1%, -0.3%)" },
  { from: "scale(1.10) translate(-0.5%, -0.5%)",   to: "scale(1.02) translate(0.3%, 0.3%)" },
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.07) translate(0.5%, -0.8%)" },
  { from: "scale(1.08) translate(0.5%, 0.5%)",     to: "scale(1.0) translate(-0.3%, 0.3%)" },
  { from: "scale(1.0) translate(0%, 0%)",          to: "scale(1.06) translate(0%, -0.5%)" },
];

const CROSSFADE_DURATION = 2000;    
const INITIAL_FADE_DURATION = 500;  
const KEN_BURNS_DURATION = 22000;   

/**
 * Dual-layer cinematic slideshow component.
 * Maintains Layer A and Layer B alternating visibility to perform seamless, flash-free image crossfades.
 */
export default function HeroSlideshow({
  covers,
  kenBurnsEnabled = true,
  slideDuration = 15,
}: HeroSlideshowProps) {
  // Track which slide index each rendering layer is currently projecting
  const [layerA, setLayerA] = useState(0);
  const [layerB, setLayerB] = useState(1 % covers.length);
  // Identifies the dominant (top) layer: "A" or "B"
  const [activeLayer, setActiveLayer] = useState<"A" | "B">("A");
  // Represents crossfade animation state execution
  const [fading, setFading] = useState(false);
  // Determines if initial hydration has completed to start fade-in
  const [mounted, setMounted] = useState(false);
  // Animation instance keys to reset Ken Burns vectors smoothly
  const [animKeyA, setAnimKeyA] = useState(0);
  const [animKeyB, setAnimKeyB] = useState(1);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideMs = slideDuration * 1000;
  const isSingle = covers.length <= 1;

  /** Triggers the introductory fade-in right after component hydration. */
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  /** Manages buffer swapping. Pushes the next asset into the inactive layer, then fades it in. */
  const advance = useCallback(() => {
    if (isSingle) return;

    if (activeLayer === "A") {
      const nextIdx = (layerA + 1) % covers.length;
      setLayerB(nextIdx);
      setAnimKeyB(prev => prev + 1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFading(true);
          setActiveLayer("B");
        });
      });
    } else {
      const nextIdx = (layerB + 1) % covers.length;
      setLayerA(nextIdx);
      setAnimKeyA(prev => prev + 1);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFading(true);
          setActiveLayer("A");
        });
      });
    }
  }, [activeLayer, layerA, layerB, covers.length, isSingle]);

  /** Resets fading state following a successful crossfade transition duration. */
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setFading(false), CROSSFADE_DURATION);
    return () => clearTimeout(t);
  }, [fading, activeLayer]);

  /** Mounts the autonomic advance timer. */
  useEffect(() => {
    if (isSingle) return;
    timerRef.current = setTimeout(advance, slideMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeLayer, fading, advance, slideMs, isSingle]);

  /** Function generator constructing standard image nodes for given configuration layers. */
  const renderLayer = (
    slideIndex: number,
    isOnTop: boolean,
    animKey: number,
  ) => {
    const cover = covers[slideIndex];
    if (!cover) return null;

    const presetIdx = animKey % KEN_BURNS_PRESETS.length;

    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: isOnTop ? 2 : 1,
          opacity: isOnTop ? 1 : (fading ? 0 : 1),
          transition: `opacity ${CROSSFADE_DURATION}ms ease-in-out`,
        }}
      >
        <picture>
          {cover.mobileUrl && (
            <source media="(max-width: 768px)" srcSet={cover.mobileUrl} />
          )}
          <img
            key={animKey}
            src={cover.desktopUrl || cover.mobileUrl}
            alt=""
            fetchPriority={isOnTop ? "high" : "auto"}
            loading="eager"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              willChange: kenBurnsEnabled ? "transform" : undefined,
              animation: kenBurnsEnabled
                ? `kenBurns${presetIdx} ${KEN_BURNS_DURATION}ms ease-in-out both`
                : undefined,
            }}
            aria-hidden="true"
          />
        </picture>
      </div>
    );
  };

  const isAOnTop = activeLayer === "A";

  return (
    <>
      {kenBurnsEnabled && (
        <style>{`
          @keyframes kenBurns0 {
            from { transform: ${KEN_BURNS_PRESETS[0].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[0].to}; }
          }
          @keyframes kenBurns1 {
            from { transform: ${KEN_BURNS_PRESETS[1].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[1].to}; }
          }
          @keyframes kenBurns2 {
            from { transform: ${KEN_BURNS_PRESETS[2].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[2].to}; }
          }
          @keyframes kenBurns3 {
            from { transform: ${KEN_BURNS_PRESETS[3].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[3].to}; }
          }
          @keyframes kenBurns4 {
            from { transform: ${KEN_BURNS_PRESETS[4].from}; }
            to   { transform: ${KEN_BURNS_PRESETS[4].to}; }
          }
        `}</style>
      )}

      {/* Main component constraint enforcing standard transition entry. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: mounted ? 1 : 0,
          transition: `opacity ${INITIAL_FADE_DURATION}ms ease-out`,
        }}
      >
        {renderLayer(layerA, isAOnTop, animKeyA)}
        {renderLayer(layerB, !isAOnTop, animKeyB)}
      </div>
    </>
  );
}

