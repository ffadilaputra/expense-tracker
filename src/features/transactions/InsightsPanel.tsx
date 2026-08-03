import { memo, type ReactNode } from 'react';
import { useI18n } from '../../i18n/context';
import './InsightsPanel.css';

export interface InsightsPanelProps {
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Native <details> rather than a hand-rolled toggle: keyboard operation, the
 * right ARIA semantics and browser find-in-page all come free, and the only
 * state to carry is the open flag.
 */
function InsightsPanel({ open, onToggle, children }: InsightsPanelProps) {
  const { t } = useI18n();

  return (
    <details
      className="insights"
      open={open}
      onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="insights__summary">{t('insightsTitle')}</summary>
      <div className="insights__body">{children}</div>
    </details>
  );
}

export default memo(InsightsPanel);
