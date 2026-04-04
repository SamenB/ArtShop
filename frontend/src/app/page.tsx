// page.tsx — the HOME PAGE ("/")
// Converted to Server Component for instant loading and SEO.

import Link from "next/link";
import { getApiUrl, getImageUrl, artworkUrl } from "@/utils";
import HeroSlideshow from "@/components/HeroSlideshow";
import HomeArtCard from "@/components/HomeArtCard";

export const dynamic = "force-dynamic";

// FEATURED_WORKS will be fetched from API
type OriginalStatus = "available" | "sold" | "reserved" | "not_for_sale" | "on_exhibition" | "archived" | "digital";

interface Artwork {
  id: number;
  slug?: string;
  title: string;
  description: string;
  medium: string;
  materials?: string;
  size: string;
  orientation?: string;
  original_price: number;
  original_status: OriginalStatus;
  has_prints?: boolean;
  base_print_price?: number;
  images?: (string | { thumb: string; medium: string; original: string })[];
  // UI fallbacks
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
        {/* Background — Slideshow with Ken Burns + Crossfade */}
        {(() => {
          const coverSlots = [
            { desktop: settings?.main_bg_desktop_url, mobile: settings?.main_bg_mobile_url },
            { desktop: settings?.cover_2_desktop_url, mobile: settings?.cover_2_mobile_url },
            { desktop: settings?.cover_3_desktop_url, mobile: settings?.cover_3_mobile_url },
          ];
          const covers = coverSlots
            .filter(c => c.desktop || c.mobile)
            .map(c => ({
              desktopUrl: c.desktop ? getImageUrl(c.desktop, 'original') : '',
              mobileUrl: c.mobile ? getImageUrl(c.mobile, 'medium') : '',
            })) as { desktopUrl: string; mobileUrl: string }[];

          return covers.length > 0 ? (
            <HeroSlideshow
              covers={covers}
              kenBurnsEnabled={settings?.hero_ken_burns_enabled !== false}
              slideDuration={settings?.hero_slide_duration || 15}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(135deg, #0A1A1C 0%, #1A3638 40%, #254D4F 70%, #0A1A1C 100%)",
              }}
            />
          );
        })()}
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
            <div className="animate-fade-up" style={{ marginBottom: "0.5rem", animationDelay: "0.15s", animationFillMode: "forwards" }}>
              <p
                style={{
                  fontFamily: '"Didot", "Bodoni MT", "Times New Roman", serif',
                  fontSize: "clamp(1.5rem, 3.2vw, 2.5rem)",
                  fontWeight: 400,
                  fontStyle: "italic",
                  letterSpacing: "0.06em",
                  color: "#ffffff",
                  lineHeight: 1.6,
                  textShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.5)",
                }}
              >
                Original Paintings &amp; Fine Art Prints
              </p>
            </div>



            {/* Subtitle — dimmer, smaller */}
            <div className="animate-fade-up" style={{ maxWidth: "600px", margin: "1rem auto 0", animationDelay: "0.3s", animationFillMode: "forwards" }}>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "clamp(0.95rem, 1.5vw, 1.2rem)",
                  fontWeight: 400,
                  letterSpacing: "0.05em",
                  color: "#ffffff",
                  lineHeight: 1.8,
                  textShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.5)",
                }}
              >
                Discover a collection of original works painted with passion.
                Each piece is a story waiting to hang on your wall.
              </p>
            </div>

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
          padding: "clamp(3rem, 10vh, 6rem) 2rem",
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
            href="/shop"
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

        {/* Artwork grid — desktop: 3 in a row, mobile: horizontal scroll with peek */ /*
             We use a dedicated class here to manage the mobile layout transition. 
             "1.5 - 2 items" means we need a flex-basis around 65-70%.
          */}
        <style>{`
          .recent-paintings-scroll {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 4rem 100px;
            align-items: start;
          }
          @media (max-width: 768px) {
            .recent-paintings-scroll {
              display: flex !important;
              overflow-x: auto !important;
              scroll-snap-type: x mandatory !important;
              margin-left: -2rem !important;
              margin-right: -2rem !important;
              /* Increased top padding (1rem) for vertical shadows and kept bottom tight */
              padding: 1rem 0 0.75rem 0 !important; 
              gap: 1rem !important;
              scrollbar-width: none !important;
              align-items: center !important;
              scroll-padding: 0 2rem !important; /* Ensures snap respects the 2rem gutter */
            }
            .recent-paintings-scroll::-webkit-scrollbar {
              display: none !important;
            }
            .recent-paintings-item {
              flex: 0 0 72% !important; /* Stable size for 1.5 - 2 items peek */
              scroll-snap-align: start !important;
            }
            .recent-paintings-spacer {
              flex: 0 0 2rem !important;
              width: 2rem !important;
            }
          }
        `}</style>
        <div className="recent-paintings-scroll">
          {/* Start Spacer for mobile edge-to-edge bleeding with correct gutter */}
          <div className="recent-paintings-spacer" aria-hidden="true" />
          
          {featuredWorks.map((work) => (
            <div key={work.id} className="recent-paintings-item">
              <HomeArtCard work={work} zoneH={360} />
            </div>
          ))}

          {/* End Spacer to allow last item to be centered/aligned properly */}
          <div className="recent-paintings-spacer" aria-hidden="true" />
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
