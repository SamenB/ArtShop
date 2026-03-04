import { ArtworkCard, Counter } from "@/components/ArtworkCard";


export default function Home() {
  const storeName = "ArtShop";
  const tagline = "Unique Artworks for Your Space";
  const currentYear = new Date().getFullYear();

  // Mock data for initial vibe check
  const featuredArtworks = [
    { title: "Ethereal Dreams", artist: "Elena Voce", price: 1200 },
    { title: "Urban Silence", artist: "Marcus Kane", price: 850 },
    { title: "Golden Hour", artist: "Sasha Gray", price: 2100 },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center p-8 bg-background text-foreground">
      {/* Hero section */}
      <header className="py-20 text-center space-y-4">
        <h1 className="text-5xl md:text-8xl font-black tracking-tighter uppercase italic">
          {storeName}
        </h1>
        <p className="text-xl text-zinc-500 dark:text-zinc-400 font-light tracking-widest uppercase">
          {tagline}
        </p>
      </header>

      {/* Artwork gallery */}
      <main className="w-full max-w-6xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {featuredArtworks.map((art, index) => (
            <ArtworkCard
              key={index}
              title={art.title}
              artist={art.artist}
              price={art.price}
            />
          ))}
        </div>
        <div className="flex justify-center">
          <Counter />
        </div>
      </main>

      <footer className="mt-20 py-8 text-xs text-zinc-400 uppercase tracking-widest">
        © {currentYear} {storeName}. Built for enthusiasts.
      </footer>
    </div>
  );
}
