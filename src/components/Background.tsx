/**
 * The decorative layer behind the page: a soft radial wash plus the flat
 * geometric shapes (diamond, spikes, slabs) that frame the content column on
 * wide screens. Purely ornamental, and hidden from AT and from narrow viewports.
 */
export default function Background() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Vertical wash: slightly lifted in the middle, deeper at the edges. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 7%, transparent) 0%, transparent 55%), " +
            "linear-gradient(180deg, var(--bg) 0%, var(--bg) 40%, var(--bg-deep) 100%)",
        }}
      />

      {/* Left cluster: outlined diamond + stepped spikes. */}
      <svg
        className="deco-parallax-up absolute top-[16%] left-2 hidden h-[560px] w-[320px] xl:block"
        viewBox="0 0 320 560"
        fill="none"
        style={{ color: "var(--deco)", opacity: "var(--deco-opacity)" }}
      >
        {/* Wrapped in its own group so the idle spin composes with the 45deg
            tilt on the rect rather than replacing it. */}
        <g className="deco-spin" stroke="currentColor" strokeWidth="7">
          <rect x="118" y="18" width="118" height="118" rx="10" transform="rotate(45 177 77)" />
        </g>
        <g fill="currentColor">
          <rect x="150" y="58" width="22" height="22" rx="4" />
          <rect x="182" y="90" width="22" height="22" rx="4" />
          <rect x="150" y="122" width="22" height="22" rx="4" />
        </g>
        {/* Stepped spikes, largest first, echoing GD's saw/pyramid shapes. */}
        <g fill="currentColor">
          <path d="M18 470 L106 470 L18 310 Z" />
          <path d="M112 470 L176 470 L112 354 Z" opacity="0.75" />
          <path d="M182 470 L228 470 L182 388 Z" opacity="0.5" />
        </g>
      </svg>

      {/* Right cluster: stacked slabs sliding off the edge. */}
      <svg
        className="deco-parallax-down absolute top-[8%] right-[-60px] hidden h-[680px] w-[300px] xl:block"
        viewBox="0 0 300 680"
        fill="none"
        style={{ color: "var(--deco)", opacity: "var(--deco-opacity)" }}
      >
        <g fill="currentColor">
          <path d="M60 40 L300 40 L262 128 L22 128 Z" />
          <path d="M96 168 L300 168 L262 256 L58 256 Z" opacity="0.8" />
          <path d="M40 296 L300 296 L262 384 L2 384 Z" opacity="0.6" />
          <path d="M120 424 L300 424 L262 512 L82 512 Z" opacity="0.45" />
          <path d="M70 552 L300 552 L262 640 L32 640 Z" opacity="0.3" />
        </g>
      </svg>

      {/* Fade the decorations out toward the bottom so long lists stay clean. */}
      <div
        className="absolute inset-x-0 bottom-0 h-64"
        style={{ background: "linear-gradient(180deg, transparent, var(--bg-deep))" }}
      />
    </div>
  );
}
