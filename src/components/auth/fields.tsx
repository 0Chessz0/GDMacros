"use client";

import { useId } from "react";

/** Text input with a label and its own error slot, styled like the search box. */
export function AuthField({
  label,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-text-dim">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`mt-1.5 h-10 w-full rounded-xl border bg-surface px-3.5 text-[13.5px] text-text outline-none transition-colors placeholder:text-muted ${
          error ? "border-rose/60 focus:border-rose" : "border-border focus:border-accent"
        }`}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-[12px] text-rose">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Whole-form failure, as opposed to a problem with one field. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose/40 bg-rose/10 px-3.5 py-2.5 text-[12.5px] text-rose"
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  busy,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      type="submit"
      // Disabled while in flight so a slow network cannot produce two signups.
      disabled={busy || props.disabled}
      className="h-10 w-full rounded-xl bg-accent text-[13.5px] font-semibold text-white transition-[background-color,transform] duration-200 ease-out hover:bg-accent-hover active:scale-[0.98] active:duration-75 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {busy ? "Working..." : children}
    </button>
  );
}
