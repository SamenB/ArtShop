"use client";
// page.tsx — the HOME PAGE ("/")
// "use client" is required because this file uses onMouseEnter/onMouseLeave
// (browser event handlers). Client Components:
//   - Still render on the server first (SSR) for fast initial load + SEO
//   - Then "hydrate" in the browser to add interactivity
// So we don't lose SEO benefits — we just also get browser interactivity.

import Link from "next/link";
// NOTE: metadata export is NOT allowed in Client Components.
// Page title is set in layout.tsx default title instead.

// ─────────────────────────────────────────────
// Mock data — later this will come from the API/backend.
// Keeping it separate makes it easy to replace.
// ─────────────────────────────────────────────
const FEATURED_WORKS = [
  {
    id: "ethereal-dreams",
    title: "Ethereal Dreams",
    year: 2024,
    medium: "Oil on canvas",
    size: '24" × 30"',
    price: 1200,
    available: true,
    tag: "Landscape",
    // Gradient placeholder — will be replaced with real <img> tags later
    gradientFrom: "#8DB4C4",
    gradientTo: "#4A7A8A",
  },
  {
    id: "urban-silence",
    title: "Urban Silence",
    year: 2024,
    medium: "Watercolor",
    size: '16" × 20"',
    price: 850,
    available: true,
    tag: "Urban",
    gradientFrom: "#C4A882",
    gradientTo: "#8A6840",
  },
  {
    id: "golden-hour",
    title: "Golden Hour",
    year: 2023,
    medium: "Oil on canvas",
    size: '30" × 40"',
    price: 2100,
    available: false,  // Sold!
    tag: "Landscape",
    gradientFrom: "#D4B86A",
    gradientTo: "#C8965A",
  },
];

export default function Home() {
  return (
    <>
      {/* ════════════════════════════════════════
          HERO SECTION
          Full-screen, text centered over image.
          ════════════════════════════════════════ */}
      <section
        style={{
          // svh = Small Viewport Height — accounts for mobile browser chrome
          // (address bar, bottom bar). 100vh can be too tall on iOS Safari.
          minHeight: "100svh",
          // Fallback for old browsers that don't support svh
          // minHeight: "calc(100vh - 72px)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          // Extra top padding on mobile so content isn't hidden behind navbar
          paddingTop: "80px",
          paddingBottom: "5rem",
        }}
      >
        {/* Background — rich dark teal/cyan gradient simulating a canvas texture */}
        {/* When we have a real hero image, just swap this div for <img> */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #0A1A1C 0%, #1A3638 40%, #254D4F 70%, #0A1A1C 100%)",
          }}
        />
        {/* Subtle texture overlay — adds depth */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 60% 40%, rgba(160, 210, 200, 0.1) 0%, transparent 65%)",
          }}
        />

        {/* Hero content */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            padding: "2rem",
            maxWidth: "900px",
          }}
        >
          {/* Eyebrow label */}
          <p
            className="animate-fade-up"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "rgba(250, 250, 247, 0.8)",
              marginBottom: "1.5rem",
              animationDelay: "0.1s",
              animationFillMode: "forwards",
            }}
          >
            Original Paintings & Fine Art Prints
          </p>

          {/* Main heading */}
          <h1
            className="animate-fade-up"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(3rem, 7vw, 7.5rem)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--color-cream)",
              lineHeight: 1,
              marginBottom: "1.5rem",
              animationDelay: "0.2s",
              animationFillMode: "forwards",
            }}
          >
            Where Art
            <br />
            <span style={{ color: "rgba(250, 250, 247, 0.7)" }}>Finds Its Home</span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-up"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(0.85rem, 2vw, 1.1rem)",
              fontWeight: 300,
              letterSpacing: "0.02em",
              color: "rgba(250, 250, 247, 0.55)",
              maxWidth: "500px",
              margin: "0 auto 3rem",
              lineHeight: 1.8,
              animationDelay: "0.35s",
              animationFillMode: "forwards",
            }}
          >
            Discover a collection of original works painted with passion.
            Each piece is a story waiting to hang on your wall.
          </p>

          {/* CTA Buttons */}
          <div
            className="animate-fade-up"
            style={{
              display: "flex",
              gap: "2rem",
              justifyContent: "center",
              flexWrap: "wrap",
              animationDelay: "0.5s",
              animationFillMode: "forwards",
            }}
          >
            {/* Minimalist Link instead of solid button */}
            <Link
              href="/gallery"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.75rem",
                fontWeight: 400,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--color-cream)",
                borderBottom: "1px solid rgba(250,250,247,0.4)",
                paddingBottom: "4px",
                transition: "color 0.2s ease, border-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--color-cream)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--color-cream)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--color-cream)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(250,250,247,0.4)";
              }}
            >
              Explore Gallery
            </Link>

            <Link
              href="/shop"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.75rem",
                fontWeight: 300,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "rgba(250,250,247,0.6)",
                borderBottom: "1px solid transparent",
                paddingBottom: "4px",
                transition: "color 0.2s ease, border-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--color-cream)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(250,250,247,0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "rgba(250,250,247,0.6)";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }}
            >
              Shop Prints
            </Link>
          </div>
        </div>

        {/* Scroll indicator — animated bouncing arrow at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: "2rem",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.5rem",
            color: "rgba(250, 250, 247, 0.4)",
            fontSize: "0.7rem",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontFamily: "var(--font-sans)",
          }}
        >
          <span>Scroll</span>
          {/* Simple CSS bouncing arrow */}
          <span
            style={{
              display: "block",
              width: "1px",
              height: "40px",
              backgroundColor: "rgba(200, 150, 90, 0.5)",
              animation: "scrollPulse 1.5s ease-in-out infinite",
            }}
          />
          <style>{`
            @keyframes scrollPulse {
              0%, 100% { transform: scaleY(1); opacity: 0.5; }
              50%       { transform: scaleY(0.6); opacity: 1; }
            }
          `}</style>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FEATURED WORKS SECTION
          ════════════════════════════════════════ */}
      <section
        style={{
          padding: "6rem 2rem",
          maxWidth: "1280px",
          margin: "0 auto",
        }}
      >
        {/* Section header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "3rem",
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.65rem",
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--color-charcoal-mid)",
                marginBottom: "0.5rem",
              }}
            >
              Selected Works
            </p>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 4vw, 3rem)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--color-charcoal)",
              }}
            >
              Recent Paintings
            </h2>
          </div>
          <Link
            href="/gallery"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--color-charcoal-mid)",
              textDecoration: "none",
              borderBottom: "1px solid var(--color-border-dark)",
              paddingBottom: "2px",
              transition: "color 0.2s ease, border-color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-accent)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--color-charcoal-mid)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-dark)";
            }}
          >
            View All Works →
          </Link>
        </div>

        {/* Artwork grid — 3 columns on desktop, 1 on mobile */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: "2rem",
          }}
        >
          {FEATURED_WORKS.map((work) => (
            <Link
              key={work.id}
              href={`/gallery/${work.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {/* Card (Clean style matching gallery) */}
              <article
                style={{
                  backgroundColor: "transparent",
                  transition: "transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-6px)";
                  const innerImg = e.currentTarget.querySelector('.home-img-inner') as HTMLElement;
                  if (innerImg) innerImg.style.transform = "scale(1.02)";
                  const shadowBox = e.currentTarget.querySelector('.home-shadow-box') as HTMLElement;
                  if (shadowBox) shadowBox.style.boxShadow = "0 28px 64px rgba(26,26,24,0.32)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                  const innerImg = e.currentTarget.querySelector('.home-img-inner') as HTMLElement;
                  if (innerImg) innerImg.style.transform = "scale(1)";
                  const shadowBox = e.currentTarget.querySelector('.home-shadow-box') as HTMLElement;
                  if (shadowBox) shadowBox.style.boxShadow = "0 6px 24px rgba(26,26,24,0.18)";
                }}
              >
                {/* OUTER — shadow + lift */}
                <div
                  className="home-shadow-box"
                  style={{
                    width: "100%",
                    aspectRatio: "4/5",
                    borderRadius: "2px",
                    boxShadow: "0 6px 24px rgba(26,26,24,0.18)",
                    transition: "box-shadow 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)",
                  }}
                >
                  {/* INNER — overflow hidden for scale effect */}
                  <div style={{
                    width: "100%", height: "100%",
                    overflow: "hidden",
                    borderRadius: "2px",
                    position: "relative"
                  }}>
                    {/* The Image (Gradient) itself */}
                    <div
                      className="home-img-inner"
                      style={{
                        width: "100%", height: "100%",
                        background: `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
                        transition: "transform 0.5s cubic-bezier(0.165, 0.84, 0.44, 1)",
                      }}
                    />

                    {/* Available / Sold badge */}
                    <span
                      style={{
                        position: "absolute",
                        top: "1rem",
                        right: "1.2rem",
                        fontSize: "0.6rem",
                        fontWeight: 300,
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        fontFamily: "var(--font-sans)",
                        color: "var(--color-cream)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}
                    >
                      <span style={{
                        display: "inline-block", width: "4px", height: "4px", borderRadius: "50%",
                        backgroundColor: work.available ? "rgba(250,250,247,0.8)" : "currentColor",
                        opacity: work.available ? 1 : 0.5
                      }} />
                      {work.available ? "Available" : "Sold"}
                    </span>
                  </div>
                </div>

                {/* Card info — Elegant Typography */}
                <div style={{ paddingTop: "1rem" }}>
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.85rem",
                      fontWeight: 300,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: "var(--color-charcoal-mid)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {work.title}
                  </p>
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "0.75rem",
                      fontWeight: 300,
                      color: "var(--color-muted)",
                    }}
                  >
                    {work.medium} · {work.size}
                  </p>
                </div>
              </article>

            </Link>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          ABOUT PREVIEW SECTION
          ════════════════════════════════════════ */}
      <section
        style={{
          borderTop: "1px solid rgba(26,26,24,0.06)",
          backgroundColor: "var(--color-cream)", // Светлый фон
          padding: "8rem 2rem",
        }}
      >
        <div
          style={{
            maxWidth: "1280px",
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "5rem",
            alignItems: "center",
          }}
        >
          {/* Artist image placeholder */}
          <div
            style={{
              aspectRatio: "3 / 4",
              background: "linear-gradient(135deg, rgba(26,26,24,0.03), rgba(26,26,24,0.08))",
              borderRadius: "2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-muted)",
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: "1rem",
            }}
          >
            Artist Photo
          </div>

          {/* Text content */}
          <div>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.65rem",
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--color-charcoal-mid)",
                marginBottom: "1rem",
              }}
            >
              The Artist
            </p>
            <h2
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(2rem, 4vw, 3.5rem)",
                fontWeight: 400,
                fontStyle: "italic",
                color: "var(--color-charcoal)",
                marginBottom: "2rem",
                lineHeight: 1.1,
              }}
            >
              Painting the world
              <br />
              as I feel it
            </h2>
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "1rem",
                fontWeight: 300,
                color: "var(--color-charcoal-mid)",
                lineHeight: 1.8,
                marginBottom: "3rem",
                maxWidth: "480px",
              }}
            >
              Every painting begins with a feeling. I work primarily in oil,
              capturing light, texture, and emotion in each brushstroke.
              My work explores the dialogue between the natural world and
              the human experience.
            </p>
            <Link
              href="/about"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.75rem",
                fontWeight: 400,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "var(--color-charcoal)",
                borderBottom: "1px solid rgba(26,26,24,0.4)",
                paddingBottom: "4px",
                transition: "color 0.2s ease, border-color 0.2s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--color-charcoal)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--color-charcoal)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "var(--color-charcoal)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(26,26,24,0.4)";
              }}
            >
              Read My Story
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          QUOTE SECTION
          ════════════════════════════════════════ */}
      <section
        style={{
          padding: "6rem 2rem",
          textAlign: "center",
          backgroundColor: "var(--color-cream)",
        }}
      >
        <blockquote
          style={{
            maxWidth: "700px",
            margin: "0 auto",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--color-charcoal)",
              lineHeight: 1.5,
              marginBottom: "1.5rem",
            }}
          >
            "I paint not what I see, but what I feel when I look."
          </p>
          <cite
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              fontWeight: 400,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--color-charcoal-mid)",
              fontStyle: "normal",
            }}
          >
            — The Artist
          </cite>
        </blockquote>
      </section>
    </>
  );
}
