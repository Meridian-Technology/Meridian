/**
 * Portal styling guard.
 *
 * Popup renders into document.body, and CSS custom properties inherit down the
 * DOM tree rather than the React tree. A `var(--jgz-…)` in popup content sits
 * outside `.jgz` and resolves to nothing — silently, with no error anywhere.
 * These read the stylesheet because that failure has no runtime signal.
 */

import fs from 'fs';
import path from 'path';

const popupCss = fs.readFileSync(path.join(__dirname, 'PivotCarouselPopup.scss'), 'utf8');
const popupJsx = fs.readFileSync(path.join(__dirname, 'PivotCarouselPopup.jsx'), 'utf8');
const pageCss = fs.readFileSync(path.join(__dirname, 'PivotCarouselPage.scss'), 'utf8');

describe('popup styles survive the portal', () => {
  test('no popup rule reads a token declared on .jgz', () => {
    const reached = popupCss.match(/var\(--jgz-[a-z-]+/g) || [];
    expect(reached).toEqual([]);
  });

  test('the portal root re-declares the ops token scope', () => {
    expect(popupJsx).toMatch(/className="pivot-ops/);
  });

  test('the token wrapper does not become a layout box', () => {
    expect(popupCss).toMatch(/\.jgz-popup__body\s*\{[^}]*display:\s*contents/);
  });

  test('popup styles live with the popup, not on the page', () => {
    expect(popupCss).toMatch(/\.jgz-picker\b/);
    expect(popupCss).toMatch(/\.jgz-voice\b/);
    expect(popupCss).toMatch(/\.jgz-export-panel\b/);
    expect(pageCss).not.toMatch(/\.jgz-picker\b/);
    expect(pageCss).not.toMatch(/\.jgz-export-panel\b/);
  });

  test('the page keeps the styles that render inside .jgz', () => {
    expect(pageCss).toMatch(/\.jgz-editor__slots\b/);
    expect(pageCss).toMatch(/\.jgz-editable\b/);
  });
});

/**
 * The edit affordance must cost no layout. A box property on `.jgz-editable`
 * overrides whatever padding the template had already set on that same element,
 * and the slide silently reflows the moment editing is switched on — which is
 * the one thing an edit mode may not do.
 */
describe('the edit affordance is layout-neutral', () => {
  const block = (() => {
    const start = pageCss.indexOf('.jgz-editable {');
    // Scan from the opening brace, not the selector, or depth never rises.
    let i = pageCss.indexOf('{', start);
    let depth = 0;
    do {
      if (pageCss[i] === '{') depth += 1;
      else if (pageCss[i] === '}') depth -= 1;
      i += 1;
    } while (depth > 0 && i < pageCss.length);
    return pageCss.slice(start, i);
  })();

  // Everything inside ::before is the tint's own box, not the slot's.
  const ownDeclarations = block.slice(0, block.indexOf('&::before'));

  test.each([
    'margin', 'padding', 'border', 'width', 'height',
    'font-size', 'line-height', 'display',
  ])('the slot itself declares no %s', (prop) => {
    expect(ownDeclarations).not.toMatch(new RegExp(`(^|[;{\\s])${prop}\\s*:`, 'm'));
  });

  test('the tint is drawn by a pseudo-element that bleeds outward', () => {
    expect(block).toMatch(/&::before/);
    expect(block).toMatch(/inset:\s*-[\d.]+cqw\s+calc\(var\(--jgz-slot-bleed\)\s*\*\s*-1\)/);
  });

  test('containers whose padding differs from the trim set their own bleed', () => {
    for (const sel of ['.jgz-posting__plate', '.jgz-card__plate', '.jgz-dispatch__instead']) {
      expect(pageCss).toMatch(new RegExp(`\\${sel}\\s*\\{[^}]*--jgz-slot-bleed`));
    }
  });
});

/**
 * The placeholder has to be driven by :empty, not by a class React computes.
 * The field commits on blur and does not re-render while focused, so a class
 * set at render time survives the first keystroke and the placeholder sits
 * there while typed text piles up beside it.
 */
describe('the slot placeholder', () => {
  test('is selected by :empty rather than by a rendered class', () => {
    expect(pageCss).toMatch(/\.jgz-editable:empty::after/);
    expect(pageCss).not.toMatch(/\.jgz-editable--empty::(before|after)/);
  });

  test('does not sit on ::before, which the tint owns', () => {
    // Source SCSS, so the tint's rule is written nested as `&::before`.
    expect(pageCss).toMatch(/&::before/);
    expect(pageCss).not.toMatch(/\.jgz-editable:empty::before/);
  });

  test('cannot swallow a click meant for the field', () => {
    const rule = pageCss.slice(pageCss.indexOf('.jgz-editable:empty::after'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/pointer-events:\s*none/);
  });
});

/**
 * A frame must carry its own palette. Export mounts one slide alone, outside
 * the light table, so anything declared only on `.jgz` resolves to nothing
 * there — a cover set in the fallback face, an accent that is not orange.
 */
describe('a frame is self-sufficient', () => {
  const sharedBlock = (() => {
    const start = pageCss.indexOf('.jgz,\n.jgz-frame {');
    return pageCss.slice(start, pageCss.indexOf('}', start));
  })();

  test('the palette and faces are declared on the frame, not only on the table', () => {
    for (const token of [
      '--jgz-ink', '--jgz-cream', '--jgz-accent', '--jgz-blue',
      '--jgz-pop', '--jgz-burst',
      '--jgz-font-display', '--jgz-font-mono', '--jgz-font-flos',
    ]) {
      expect(sharedBlock).toContain(token);
    }
  });

  test('the export surface is exactly 1080x1350 with nothing around it', () => {
    const frameCss = fs.readFileSync(path.join(__dirname, 'PivotCarouselFrame.scss'), 'utf8');
    expect(frameCss).toMatch(/width:\s*1080px/);
    expect(frameCss).toMatch(/height:\s*1350px/);
    expect(frameCss).toMatch(/overflow:\s*hidden/);
  });

  test('the table edge treatment stays on the table, out of the export', () => {
    // Scoped `.jgz .jgz-frame`, so a frame mounted alone gets no border.
    expect(pageCss).toMatch(/\.jgz \.jgz-frame \{/);
    const frameCss = fs.readFileSync(path.join(__dirname, 'PivotCarouselFrame.scss'), 'utf8');
    expect(frameCss).not.toMatch(/box-shadow[^;]*rgba\(26, 23, 20/);
  });
});

/**
 * A full-bleed overlay that is also translated bares the edges it moves away
 * from. That is invisible in a thumbnail and obvious in a 1080px export, which
 * is the worst place to find it.
 */
describe('full-bleed overlays stay covered', () => {
  const overlayBlocks = pageCss
    .split(/\n(?=\.)/)
    .filter((block) => /inset:\s*0\s*;/.test(block) && /position:\s*absolute/.test(block));

  test('the stylesheet has overlays to check', () => {
    expect(overlayBlocks.length).toBeGreaterThan(0);
  });

  test('none of them is translated away from an edge', () => {
    const offenders = overlayBlocks
      .filter((block) => /transform:\s*translate/.test(block))
      .map((block) => block.split('\n')[0].trim());
    expect(offenders).toEqual([]);
  });

  test('the newsprint ink plate covers the whole photograph', () => {
    const start = pageCss.indexOf('.jgz-frame--paper .jgz-photo::after');
    const block = pageCss.slice(start, pageCss.indexOf('}', start));
    expect(block).toMatch(/inset:\s*0/);
    expect(block).not.toMatch(/transform/);
  });
});

/**
 * Popup dismisses on a document-level mousedown outside its own content node,
 * and a nested Popup is portaled to document.body — outside by that test. The
 * voice panel's save confirmation is exactly that, so leaving dismissal on made
 * Confirm close the panel on mousedown and unmount the confirmation before its
 * click landed. The save silently never fired.
 *
 * Asserted against the source because Popup cannot be imported under jest:
 * it pulls @iconify-icon in as untransformed ESM, which is why every suite that
 * reaches it mocks it.
 */
describe('a popup that can contain another popup', () => {
  const popupJsx = fs.readFileSync(path.join(__dirname, 'PivotCarouselPopup.jsx'), 'utf8');

  test('does not dismiss on an outside click', () => {
    expect(popupJsx).toMatch(/disableOutsideClick/);
  });

  test('still offers a way out, so disabling dismissal does not trap anyone', () => {
    expect(popupJsx).not.toMatch(/hideCloseButton/);
    expect(popupJsx).toMatch(/onClose=\{onClose\}/);
  });

  test('every carousel popup goes through this shell rather than Popup directly', () => {
    for (const file of ['PivotCarouselVoicePanel.jsx', 'PivotCarouselEventPicker.jsx', 'PivotCarouselAddSlide.jsx']) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
      expect(source).toMatch(/PivotCarouselPopup/);
      expect(source).not.toMatch(/from '.*components\/Popup\/Popup'/);
    }
  });
});

/**
 * Every place that renders a frame must build its class the same way, or a
 * slide prints differently from the thumbnail it was approved in.
 */
describe('frame classes come from one place', () => {
  test.each([
    'PivotCarouselPage.jsx',
    'PivotCarouselEditor.jsx',
    'PivotCarouselFrame.jsx',
    'PivotCarouselAddSlide.jsx',
  ])('%s builds its class with the helper', (file) => {
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    expect(source).toMatch(/frameClass\(/);
    expect(source).not.toMatch(/`jgz-frame jgz-frame--\$\{/);
  });

  test('the stylesheet keys the switch on the modifier the helper emits', () => {
    expect(pageCss).toMatch(/\.jgz-frame--noink \.jgz-photo::after/);
  });
});

/**
 * App.scss paints every h2/p with `color: var(--text)` (#414141). Night press
 * titles that left colour to inherit printed that dark ink while cover/card
 * titles — which set `--jgz-type` themselves — stayed cream.
 */
describe('night press type is the frame’s own ink', () => {
  test('headings that used to inherit App.scss set the edition token', () => {
    for (const selector of [
      '.jgz-sheet__title',
      '.jgz-notice__title',
      '.jgz-dispatch__title',
      '.jgz-back__line',
    ]) {
      const start = pageCss.indexOf(`${selector} {`);
      expect(start).toBeGreaterThan(-1);
      const block = pageCss.slice(start, pageCss.indexOf('}', start));
      expect(block).toMatch(/color:\s*var\(--jgz-type\)/);
    }
  });

  test('a frame remaps --text so leftover App.scss rules take the edition colour', () => {
    expect(pageCss).toMatch(/\.jgz-frame \{[\s\S]*?--text:\s*var\(--jgz-type\)/);
    expect(pageCss).toMatch(/:where\(h1, h2, h3, p\)/);
  });
});

/**
 * Full screen has to hide chrome that lives outside this file — the dashboard
 * mobile heading and the tenant scrapbook header — or the 4:5 frame still
 * cannot fit.
 */
describe('full screen hides the surrounding chrome', () => {
  test('the focused page drops its own header', () => {
    expect(pageCss).toMatch(/pivot-carousel-page\.is-carousel-focused/);
    expect(pageCss).toMatch(/pivot-tenant-page__header/);
  });

  test('the dashboard heading and sidebar leave with it', () => {
    expect(pageCss).toMatch(/:has\(\.pivot-carousel-page\.is-carousel-focused\)/);
    expect(pageCss).toMatch(/mobile-heading/);
    expect(pageCss).toMatch(/dash-left/);
  });

  test('the focused stage sizes the frame from leftover space, not from column width', () => {
    expect(pageCss).toMatch(/\.jgz-editor\.is-focused/);
    expect(pageCss).toMatch(/100cqh/);
  });

  test('taps do not leave a focus ring, and the event dock sits under the slide', () => {
    expect(pageCss).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(pageCss).toMatch(/jgz-editor__dock-rest/);
    expect(pageCss).toMatch(/grid-template-rows:\s*0fr/);
  });

  test('the focused editor bar stays on one line', () => {
    expect(pageCss).toMatch(/\.jgz-editor\.is-focused[\s\S]*?\.jgz-editor__bar \{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(pageCss).toMatch(/jgz__action--icon/);
  });

  test('the event dock bleeds to the screen edges', () => {
    expect(pageCss).toMatch(/jgz-editor__dock[\s\S]*?100vw/);
  });

  test('full screen drops the export strip so the frame keeps the height', () => {
    expect(pageCss).toMatch(/\.jgz-editor\.is-focused[\s\S]*?\.jgz-export-line \{[\s\S]*?display:\s*none/);
  });
});
