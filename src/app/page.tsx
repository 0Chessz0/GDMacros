import MacroBrowser from "@/components/MacroBrowser";
import { getAllMacros } from "@/lib/macros";
import { site } from "@/lib/site";

export default function HomePage() {
  const macros = getAllMacros();

  return (
    <div className="mx-auto w-full max-w-[940px] px-4 py-7 sm:px-6 sm:py-9">
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-text sm:text-[26px]">
          Macro catalog
        </h1>
        <p className="mt-1 text-[13.5px] text-muted">{site.description}</p>
      </div>

      <MacroBrowser macros={macros} />
    </div>
  );
}
