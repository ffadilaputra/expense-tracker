import { memo } from 'react';

export type IconName =
  | 'list'
  | 'wallet'
  | 'debt'
  | 'saving'
  | 'backup'
  | 'sheet'
  | 'theme'
  | 'calendar';

/**
 * Inline stroke icons rather than an icon package or emoji: they inherit
 * currentColor so they follow the active/muted states already in the CSS, and
 * they render identically on every platform, which emoji do not.
 */
const PATHS: Record<IconName, string> = {
  list: 'M4 7h16M4 12h16M4 17h10',
  wallet: 'M3 7.5A1.5 1.5 0 0 1 4.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5Zm13 4.5h3M3 8h15',
  debt: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h5',
  saving: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM12 8v8m3-5.5a3 3 0 0 0-3-1.5c-1.5 0-2.5.7-2.5 1.8s1 1.5 2.5 1.9 2.5.8 2.5 1.9-1 1.8-2.5 1.8a3 3 0 0 1-3-1.5',
  backup: 'M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  sheet: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  theme: 'M12 3a9 9 0 1 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2H18a3 3 0 0 0 3-3 9 9 0 0 0-9-8.6ZM7.5 11.5h.01M10.5 7.5h.01M15 8.5h.01',
  calendar: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3.5v3M16 3.5v3'
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
