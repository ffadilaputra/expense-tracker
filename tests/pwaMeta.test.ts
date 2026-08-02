import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Lives outside src because tsconfig only includes src and has no Node types.
// A ?raw import of the stylesheet comes back empty - Vite handles .css
// specially - so these read from disk, like the Apps Script harness does.
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
// index.css holds only tokens and element defaults now; the shell rules that
// carry the safe-area insets live beside AppShell.
const css = readFileSync(join(root, 'src', 'AppShell.css'), 'utf8');
const manifest = JSON.parse(
  readFileSync(join(root, 'public', 'manifest.webmanifest'), 'utf8')
);

describe('installed-app chrome', () => {
  it('does not render the page underneath the iOS status bar', () => {
    // black-translucent puts web content below the status bar, which hid the
    // header once the app was added to the home screen, and forces white
    // status-bar text that disappears against the light header.
    //
    // Matched on the tag's own value, not the file: the comment above that
    // meta names the bad value, and a substring check trips over it.
    const tag = html.match(
      /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="([^"]+)"/
    );
    expect(tag).not.toBeNull();
    expect(tag![1]).toBe('default');
  });

  it('keeps viewport-fit=cover so the safe-area insets report real values', () => {
    expect(html).toContain('viewport-fit=cover');
  });

  it('declares itself installable to both platforms', () => {
    expect(html).toContain('name="apple-mobile-web-app-capable"');
    expect(html).toContain('name="mobile-web-app-capable"');
  });

  it('gives the system bar a colour per scheme rather than one fixed value', () => {
    expect(html).toContain('media="(prefers-color-scheme: light)"');
    expect(html).toContain('media="(prefers-color-scheme: dark)"');
  });

  it('paints the launch splash in a colour the app actually uses', () => {
    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.display).toBe('standalone');
  });
});

describe('safe areas', () => {
  it('insets the header from the top, which nothing did before', () => {
    expect(css).toMatch(/\.app__header\s*\{[^}]*env\(safe-area-inset-top\)/);
  });

  it('insets the content column on both sides for landscape cutouts', () => {
    for (const side of ['left', 'right']) {
      expect(css).toContain(`max(var(--space-4), env(safe-area-inset-${side}))`);
    }
  });

  it('still clears the home indicator at the bottom', () => {
    expect(css).toContain('env(safe-area-inset-bottom)');
  });
});
