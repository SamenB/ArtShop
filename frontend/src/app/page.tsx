// page.tsx — the HOME PAGE ("/")
// Converted to Server Component for instant loading and SEO.

import Link from "next/link";
import { getApiUrl, getImageUrl } from "@/utils";

export const dynamic = "force-dynamic";

// FEATURED_WORKS will be fetched from API
type OriginalStatus = "available" | "sold" | "reserved";

interface Artwork {
  id: number;
  title: string;
  description: string;
  medium: string;
  size: string;
  original_price: number;
  original_status: OriginalStatus;
  images?: (string | { thumb: string; medium: string; original: string })[];
  // UI fallbacks
  aspectRatio?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

type FeaturedWork = Artwork;

const DEFAULT_GRADIENTS = [
  ["#6A9FB5", "#3A6E85"],
  ["#2A5F7A", "#1A3A55"],
  ["#8A7AB5", "#4A5A8A"],
  ["#5A8A8A", "#2A5A5A"],
  ["#D4905A", "#8A5030"],
];

// Fetch directly inside the Async Server Component
export default async function Home() {

  let settings: any = null;
  let featuredWorks: FeaturedWork[] = [];

  const settingsRes = await fetch(`${getApiUrl()}/settings`, { next: { revalidate: 60 } });
  if (!settingsRes.ok) throw new Error(`Failed to fetch settings: ${settingsRes.status}`);
  settings = await settingsRes.json();

  const worksRes = await fetch(`${getApiUrl()}/artworks?limit=3`, { next: { revalidate: 60 } });
  if (!worksRes.ok) throw new Error(`Failed to fetch artworks: ${worksRes.status}`);

  const data = await worksRes.json();
  const items = (data.items || data).map((item: any, idx: number) => ({
    ...item,
    gradientFrom: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][0],
    gradientTo: DEFAULT_GRADIENTS[idx % DEFAULT_GRADIENTS.length][1],
  }));
  featuredWorks = items;

  return (
    <>
      {/* ════════════════════════════════════════
          HERO SECTION
          Full-screen, text centered over image.
          ════════════════════════════════════════ */}
      <section
        style={{
          minHeight: "100svh",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: "clamp(115px, 18vh, 195px)", // Pushed even higher!
          overflow: "hidden",
        }}
      >
        {/* Background */}
        {settings?.main_bg_desktop_url || settings?.main_bg_mobile_url ? (
          <picture>
            {settings?.main_bg_mobile_url && (
              <source media="(max-width: 768px)" srcSet={getImageUrl(settings.main_bg_mobile_url, 'medium')} />
            )}
            <img
              src={getImageUrl(settings?.main_bg_desktop_url || settings?.main_bg_mobile_url, 'original')}
              alt="Hero Background"
              fetchPriority="high"
              decoding="sync"
              loading="eager"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              aria-hidden="true"
            />
          </picture>
        ) : (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(135deg, #0A1A1C 0%, #1A3638 40%, #254D4F 70%, #0A1A1C 100%)",
            }}
          />
        )}
        {/* Subtle texture overlay — adds depth */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 60% 40%, rgba(160, 210, 200, 0.1) 0%, transparent 65%)",
          }}
        />

        {/* Main Content Wrapper (Text + Buttons) */}
        <div
          style={{
            position: "relative",
            zIndex: 2, // Above the tracking dark panel and image
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "clamp(1.5rem, 3vh, 2.5rem)", // Tightly grouped
            width: "100%",
            padding: "0 2rem",
          }}
        >
          {/* Text Block */}
          <div style={{ textAlign: "center", maxWidth: "900px" }}>
          {/* Eyebrow label — serif, bright, beautiful */}
          <p
            className="animate-fade-up"
            style={{
              fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
              fontSize: "clamp(1rem, 2.2vw, 1.6rem)",
              fontWeight: 400,
              fontStyle: "italic",
              letterSpacing: "0.06em",
              color: "rgba(250, 250, 247, 0.92)",
              marginBottom: "0",
              animationDelay: "0.15s",
              animationFillMode: "forwards",
              lineHeight: 1.6,
            }}
          >
            Original Paintings &amp; Fine Art Prints
          </p>



          {/* Subtitle — dimmer, smaller */}
          <p
            className="animate-fade-up"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(0.75rem, 1.4vw, 0.95rem)",
              fontWeight: 300,
              letterSpacing: "0.06em",
              color: "rgba(250, 250, 247, 0.45)",
              maxWidth: "500px",
              margin: "0.75rem auto 0",
              lineHeight: 1.8,
              animationDelay: "0.3s",
              animationFillMode: "forwards",
            }}
          >
            Discover a collection of original works painted with passion.
            Each piece is a story waiting to hang on your wall.
          </p>

          </div>

          {/* CTA Buttons */}
          <div
            className="animate-fade-up"
            style={{
              display: "flex",
              gap: "2rem",
              justifyContent: "center",
              animationDelay: "0.5s",
              animationFillMode: "forwards",
              whiteSpace: "nowrap",
            }}
          >  <Link
            href="/gallery"
            className="hero-link"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              fontWeight: 400,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              borderBottom: "1px solid",
              paddingBottom: "4px",
              transition: "color 0.2s ease, border-color 0.2s ease",
            }}
          >
            Explore Gallery
          </Link>
          <Link
            href="/shop"
            className="hero-shop-link"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              fontWeight: 300,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              borderBottom: "1px solid",
              paddingBottom: "4px",
              transition: "color 0.2s ease, border-color 0.2s ease",
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
            className="home-section-link"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "0.875rem",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textDecoration: "none",
              borderBottom: "1px solid",
              paddingBottom: "2px",
              transition: "color 0.2s ease, border-color 0.2s ease",
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
          {featuredWorks.map((work) => (
            <Link
              key={work.id}
              href={`/gallery/${work.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {/* Card (Clean style matching gallery) */}
              <article
                className="home-art-card"
                style={{
                  backgroundColor: "transparent",
                  transition: "transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)",
                  cursor: "pointer",
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
                        background: (work.images && work.images.length > 0)
                          ? `url(${getImageUrl(work.images[0], 'medium')}) center/cover no-repeat`
                          : `linear-gradient(135deg, ${work.gradientFrom}, ${work.gradientTo})`,
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
                        backgroundColor: work.original_status === "available" ? "rgba(250,250,247,0.8)" : "currentColor",
                        opacity: work.original_status === "available" ? 1 : 0.5
                      }} />
                      {work.original_status === "available" ? "Available" : work.original_status === "sold" ? "Sold" : "Reserved"}
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
              overflow: "hidden"
            }}
          >
            {settings?.artist_home_photo_url ? (
              <img src={getImageUrl(settings.artist_home_photo_url, 'original')} alt="Artist" className="w-full h-full object-cover" />
            ) : "Artist Photo"}
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
              {settings?.about_text || ""}
            </p>
            <Link
              href="/about"
              className="home-about-link"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "0.75rem",
                fontWeight: 400,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                textDecoration: "none",
                borderBottom: "1px solid",
                paddingBottom: "4px",
                transition: "color 0.2s ease, border-color 0.2s ease",
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
