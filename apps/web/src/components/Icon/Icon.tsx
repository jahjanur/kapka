import type { CSSProperties, SVGAttributes } from 'react';
import { cx } from '../../lib/cx';
import { ICON_NAMES, iconSymbol, type IconName } from './icons';
import styles from './Icon.module.css';

export type { IconName };
export { ICON_NAMES };

interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Multiplier on the surrounding font size. 1 = cap height of the text. */
  size?: number;
  /**
   * Only pass a label when the icon carries meaning on its own. An icon beside
   * a text label is decorative and must stay hidden from screen readers (§10).
   */
  label?: string;
}

export function Icon({ name, size, label, className, style, ...rest }: IconProps) {
  const decorative = label === undefined;
  return (
    <svg
      className={cx(styles.icon, className)}
      style={size ? ({ '--icon-size': `${size}em`, ...style } as CSSProperties) : style}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
      focusable="false"
      {...rest}
    >
      <use href={`#kapka-${name}`} />
    </svg>
  );
}

/**
 * Renders the sprite once, near the top of the app. Every <Icon> references
 * it by id, so an icon repeated across 200 feed rows costs one definition.
 */
export function IconSprite() {
  return (
    <svg className={styles.sprite} aria-hidden="true" focusable="false">
      {ICON_NAMES.map(iconSymbol)}
    </svg>
  );
}
