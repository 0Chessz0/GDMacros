import Link from "next/link";
import { ArrowLeftIcon } from "../icons";

/** The way back to the portal from any of the three tools. */
export default function BackToAdmin() {
  return (
    <Link
      href="/admin"
      className="mb-5 inline-flex items-center gap-1.5 text-[12.5px] text-muted transition-colors hover:text-text-dim"
    >
      <ArrowLeftIcon className="h-3.5 w-3.5" />
      Admin
    </Link>
  );
}
