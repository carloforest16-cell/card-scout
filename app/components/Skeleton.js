import "./skeleton.css";

/**
 * Composant skeleton cinématique avec animation shimmer.
 *
 * Variants :
 *   - "text"     : ligne de texte (par défaut 1em)
 *   - "line"     : ligne horizontale fine (status, métadonnées)
 *   - "avatar"   : cercle (headshot, badge)
 *   - "card"     : bloc rectangulaire (cards/sections)
 *   - "rect"     : rectangle générique
 *
 * Props :
 *   - width / height : CSS values (string ou number → px)
 *   - count : nombre de copies (utile pour text)
 *   - className : extension
 *
 * Le CLS est nul si on passe width+height explicites.
 */
export default function Skeleton({
  variant = "rect",
  width,
  height,
  count = 1,
  className = "",
  style = {},
}) {
  const styleFinal = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
    ...style,
  };
  const cls = `cs-skel cs-skel--${variant} ${className}`.trim();

  if (count === 1) {
    return <span className={cls} style={styleFinal} aria-hidden="true" />;
  }
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={cls}
          style={{
            ...styleFinal,
            width: i === count - 1 && variant === "text" ? "70%" : styleFinal.width,
          }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}
