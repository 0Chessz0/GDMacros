import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a GDMacros account. Optional: every macro is free to download without one.",
  alternates: { canonical: "/signup" },
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create an account"
      intro="Accounts are optional and free. You do not need one to browse or download anything."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-soft hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </AuthShell>
  );
}
