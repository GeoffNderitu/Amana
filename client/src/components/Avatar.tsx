import { AVATAR_COLOR_HEX } from '../lib/themes';

export function Avatar({
  emoji,
  color,
  image,
  size = 36,
  className = '',
}: {
  emoji?: string | null;
  color?: string | null;
  /** Data URL of an uploaded profile photo. When present, takes priority over the emoji. */
  image?: string | null;
  size?: number;
  className?: string;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className={`rounded-full object-cover shrink-0 shadow-sm ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const hex = AVATAR_COLOR_HEX[color || 'brand'] || AVATAR_COLOR_HEX.brand;
  return (
    <div
      className={`rounded-full flex items-center justify-center shrink-0 shadow-sm ${className}`}
      style={{ width: size, height: size, background: hex, fontSize: size * 0.52 }}
    >
      <span style={{ lineHeight: 1 }}>{emoji || '🙂'}</span>
    </div>
  );
}
