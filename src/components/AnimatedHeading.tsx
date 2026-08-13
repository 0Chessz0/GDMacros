import type { ElementType } from "react";

/**
 * Reveals a heading word by word. Each word is its own inline-block so it can
 * be transformed without breaking wrapping, and the stagger is driven by a --w
 * custom property rather than one class per index.
 *
 * The full text stays in the DOM as a single accessible label; the split is
 * presentational only.
 */
export default function AnimatedHeading({
  text,
  as: Tag = "h1",
  className = "",
}: {
  text: string;
  as?: ElementType;
  className?: string;
}) {
  const words = text.split(" ");

  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          aria-hidden="true"
          className="animate-word"
          style={{ "--w": i } as React.CSSProperties}
        >
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
