import type { Metadata } from "next";
import FavoritesList from "@/components/FavoritesList";
import { getAllLevels } from "@/lib/macros";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Your saved Geometry Dash macros",
  description:
    "The macros you saved. No account needed, and synced to your account if you have one.",
  alternates: { canonical: "/favorites" },
  // Nothing here is the same for two visitors, so there is nothing to rank.
  robots: { index: false, follow: true },
  openGraph: {
    title: `Favorites | ${site.name}`,
    description: "The macros you saved.",
    url: "/favorites",
    type: "website",
  },
};

export default function FavoritesPage() {
  // The whole catalog is passed down so the client can resolve saved slugs
  // without a request. It is a static file already in the bundle.
  const levels = getAllLevels();

  return (
    <div className="mx-auto w-full max-w-[940px] px-4 py-7 sm:px-6 sm:py-9">
      <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
        Your favorites
      </h1>
      <p className="mt-1.5 mb-6 text-[13.5px] leading-relaxed text-muted">
        Signed out, this list is saved in this browser only and nothing is uploaded. Signed in, it
        is saved to your account as well, so it appears on your other devices. See the{" "}
        <a href="/privacy" className="text-accent-soft hover:underline">
          privacy page
        </a>{" "}
        for exactly what is stored.
      </p>

      <FavoritesList levels={levels} />
    </div>
  );
}
