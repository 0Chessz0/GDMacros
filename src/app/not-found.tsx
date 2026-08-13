import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-4 py-24 text-center">
      <p className="text-[64px] leading-none font-extrabold text-accent-soft">404</p>
      <h1 className="mt-4 text-[22px] font-bold text-text">This macro doesn&apos;t exist</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        The entry may have been renamed or removed from the catalog.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
      >
        Back to catalog
      </Link>
    </div>
  );
}
