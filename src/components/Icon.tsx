import { memo } from 'react';

export type IconName = 'list' | 'wallet' | 'debt' | 'backup' | 'sheet';

/**
 * Inline stroke icons rather than an icon package or emoji: they inherit
 * currentColor so they follow the active/muted states already in the CSS, and
 * they render identically on every platform, which emoji do not.
 */
const PATHS: Record<IconName, string> = {
  list: 'M4 7h16M4 12h16M4 17h10',
  wallet: 'M3 7.5A1.5 1.5 0 0 1 4.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Zm13 4.5h3M3 8h15',
  debt: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  backup: 'M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  sheet: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14'
};

interface IconProps {
  name: IconName;
  className?: string;
}

function Icon({ name, className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export default memo(Icon);
