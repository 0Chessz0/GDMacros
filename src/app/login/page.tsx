import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your GDMacros account.",
  alternates: { canonical: "/login" },
  robots: { index: false, follow: true },
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Log in"
      footer={
        <>
          <Link href="/signup" className="font-medium text-accent-soft hover:underline">
            Create an account
          </Link>
          <span className="mx-2 text-muted/40">·</span>
          <Link href="/forgot-password" className="font-medium text-accent-soft hover:underline">
            Forgot password
          </Link>
        </>
      }
    >
      {/* useSearchParams needs a Suspense boundary to prerender. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
