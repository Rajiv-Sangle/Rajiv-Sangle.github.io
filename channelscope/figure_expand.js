
const SVG = 'http://www.w3.org/2000/svg';
const MIN_SCALE = 0.6;
const PHONE = 600;
const onPhone = () => Math.min(window.innerWidth, window.innerHeight) <= PHONE;
const FILL_MAX = 1600;
const REFIT = 0.08;
const FOCUSABLE = 'a[href], area[href], button, input, select, textarea, iframe, summary, audio[controls], video[controls], [contenteditable]';

let open = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function figureName(fig) {
  const b = fig.querySelector('figcaption > b.figure-number');
  const name = b ? b.textContent.trim().replace(/\.$/, '') : '';
  return name || 'the figure';
}

function layoutClasses(fig) {
  return [...fig.classList].filter((c) => c.startsWith('l-'));
}

function icon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'fx-icon');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M2.5 9.5 9.5 2.5M6 2.5h3.5V6M2.5 6v3.5H6');
  svg.append(path);
  return svg;
}

function addButton(fig) {
  const holder = el('div', 'fx-anchor');
  holder.classList.add(...layoutClasses(fig));
  const button = el('button', 'fx-expand');
  button.type = 'button';
  button.dataset.expands = fig.id;
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-label', 'Expand the figure');
  button.append(icon(), el('span', 'fx-expand-text', 'Expand'));
  button.addEventListener('click', () => expand(fig, button));
  holder.append(button);
  fig.before(holder);
  return button;
}

function nameButtons(buttons) {
  for (const [fig, button] of buttons) button.setAttribute('aria-label', `Expand ${figureName(fig)}`);
}


function within(container, node) {
  for (let n = node; n; n = n.parentNode || n.host) if (n === container) return true;
  return false;
}

function deepActive() {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return a;
}

function focusables(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.inert) continue;
      if ((child.hasAttribute('tabindex') || child.matches(FOCUSABLE)) && child.tabIndex >= 0 && !child.disabled
          && child.getClientRects().length && getComputedStyle(child).visibility !== 'hidden') out.push(child);
      if (child.shadowRoot) walk(child.shadowRoot);
      walk(child);
    }
  };
  walk(root);
  return out;
}

function trap(event) {
  const items = focusables(open.overlay);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = deepActive();
  const inside = within(open.overlay, active);
  if (event.shiftKey && (!inside || active === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!inside || active === last)) {
    event.preventDefault();
    first.focus();
  }
}

const citeBoxOpen = () => [...document.querySelectorAll('.cite-pop')].some((p) => !p.hidden);


function parts(o) {
  const figure = o.fig.querySelector(':scope > figure');
  const drawing = figure && figure.querySelector(':scope > .figure-root');
  return { figure, drawing };
}

function fit() {
  const o = open;
  if (!o) return;
  o.queued = false;
  const { figure, drawing } = parts(o);
  const pad = getComputedStyle(o.body);
  const availW = o.body.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const availH = o.body.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  const natural = o.placeholder.getBoundingClientRect().width;
  const stage = o.stage;
  stage.classList.remove('fx-scaled');
  const canvas = drawing && drawing.querySelector('canvas');
  const box = canvas ? canvas.parentElement : null;
  if (o.fill && o.fill !== box) o.fill.classList.remove('fx-fill');
  o.fill = box;
  if (box) {
    box.classList.add('fx-fill');
    stage.style.setProperty('--fx-width', `${Math.floor(Math.min(availW, FILL_MAX))}px`);
    const rest = drawing.offsetHeight - box.offsetHeight;
    const caption = figure.offsetHeight - drawing.offsetHeight;
    const room = availH - rest;
    const height = Math.max(0, Math.min(room, Math.max(room - caption, 0.6 * room)));
    stage.style.setProperty('--fx-fill-height', `${Math.floor(height)}px`);
  } else {
    stage.style.setProperty('--fx-width', `${Math.floor(Math.min(availW, natural))}px`);
    if (drawing) {
      const h = drawing.offsetHeight;
      const w = Math.max(drawing.offsetWidth, drawing.scrollWidth);
      const fits = h > 0 && w > 0 ? Math.min(1, availH / h, availW / w) : 1;
      const s = fits >= MIN_SCALE ? fits : (onPhone() ? 1 : MIN_SCALE);
      if (s < 0.995) {
        const margin = parseFloat(getComputedStyle(drawing).marginBottom) || 0;
        stage.style.setProperty('--fx-scale', s.toFixed(4));
        stage.style.setProperty('--fx-pull', `${(margin - (1 - s) * h).toFixed(1)}px`);
        stage.style.setProperty('--fx-origin', s * w > availW + 0.5 ? '0 0' : '50% 0');
        stage.classList.add('fx-scaled');
      }
    }
  }
  o.fitted = drawing ? { width: drawing.offsetWidth, height: drawing.offsetHeight, drawing } : null;
}

function refit() {
  if (open && !open.queued) {
    open.queued = true;
    requestAnimationFrame(fit);
  }
}


function innerScrolls(root) {
  const kept = [];
  for (const node of root.querySelectorAll('*')) {
    if (node.scrollLeft || node.scrollTop) kept.push([node, node.scrollLeft, node.scrollTop]);
  }
  return kept;
}

function putScrolls(kept) {
  for (const [node, left, top] of kept) {
    node.scrollLeft = left;
    node.scrollTop = top;
  }
}

function expand(fig, button) {
  if (open) close();
  const name = figureName(fig);
  const scroll = { x: window.scrollX, y: window.scrollY };

  const overlay = el('div', 'fx-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'fx-title');
  const bar = el('div', 'fx-bar');
  const title = el('p', 'fx-title', name.charAt(0).toUpperCase() + name.slice(1));
  title.id = 'fx-title';
  const shut = el('button', 'fx-close');
  shut.type = 'button';
  shut.setAttribute('aria-label', 'Close');
  shut.title = 'Close (Escape)';
  const cross = el('span', null, '×');
  cross.setAttribute('aria-hidden', 'true');
  shut.append(cross);
  bar.append(title, shut);
  const body = el('div', 'fx-body');
  const stage = el('div', 'fx-stage');
  const context = el(fig.closest('d-article') ? 'd-article' : 'div', 'fx-context');
  stage.append(context);
  body.append(stage);
  overlay.append(bar, body);

  const placeholder = el('div', 'fx-placeholder');
  placeholder.classList.add(...layoutClasses(fig));
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.style.height = `${fig.getBoundingClientRect().height}px`;
  const kept = innerScrolls(fig);
  fig.before(placeholder);
  context.append(fig);
  document.body.append(overlay);

  const html = document.documentElement;
  const gutter = window.innerWidth - html.clientWidth;
  html.classList.add('fx-locked');
  if (gutter > 0) html.classList.add('fx-gutter');
  const inerted = [];
  for (const child of document.body.children) {
    if (child === overlay || child.classList.contains('cite-pop') || child.inert) continue;
    child.inert = true;
    inerted.push(child);
  }

  const figure = fig.querySelector(':scope > figure');
  open = { fig, figure, button, overlay, body, stage, context, placeholder, scroll, inerted, shut, fill: null,
    fitted: null, queued: false, downOnBackdrop: false, observer: null };
  const o = open;

  shut.addEventListener('click', () => close());
  const backdrop = (t) => t === overlay || t === body || t === stage || t === context || t === fig || t === figure;
  overlay.addEventListener('pointerdown', (event) => { o.downOnBackdrop = backdrop(event.target); });
  overlay.addEventListener('click', (event) => {
    const link = event.target.closest && event.target.closest('a[href^="#"]');
    if (link && link.getAttribute('href').length > 1 && !event.defaultPrevented) close({ restore: false });
    else if (o.downOnBackdrop && backdrop(event.target)) close();
    o.downOnBackdrop = false;
  });
  overlay.addEventListener('click', (event) => {
    if (event.target.closest && event.target.closest('[data-leaves-figure]')) close();
  }, true);

  fit();
  putScrolls(kept);
  body.scrollTo(0, 0);
  o.observer = new ResizeObserver(() => {
    const f = o.fitted;
    const now = parts(o).drawing;
    if (!f || !now || now !== f.drawing) return refit();
    if (now.offsetWidth !== f.width || Math.abs(now.offsetHeight - f.height) > REFIT * f.height) refit();
  });
  if (o.fitted) o.observer.observe(o.fitted.drawing);
  o.observer.observe(figure || fig);

  shut.focus({ preventScroll: true });
  window.dispatchEvent(new Event('resize'));
}

function close({ restore = true } = {}) {
  const o = open;
  if (!o) return;
  open = null;
  o.observer.disconnect();
  for (const node of o.inerted) node.inert = false;
  document.documentElement.classList.remove('fx-locked', 'fx-gutter');
  if (o.fill) o.fill.classList.remove('fx-fill');
  const kept = innerScrolls(o.fig);
  o.placeholder.replaceWith(o.fig);
  o.overlay.remove();
  putScrolls(kept);
  if (restore) {
    if (window.scrollX !== o.scroll.x || window.scrollY !== o.scroll.y) {
      try {
        window.scrollTo({ left: o.scroll.x, top: o.scroll.y, behavior: 'instant' });
      } catch {
        window.scrollTo(o.scroll.x, o.scroll.y);
      }
    }
    o.button.focus({ preventScroll: true });
  }
  window.dispatchEvent(new Event('resize'));
}


window.addEventListener('keydown', (event) => {
  if (!open) return;
  if (event.key === 'Escape') {
    if (!citeBoxOpen()) close();
  } else if (event.key === 'Tab') {
    trap(event);
  }
}, true);

document.addEventListener('focusin', (event) => {
  if (!open) return;
  const target = event.composedPath()[0];
  if (within(open.overlay, target) || (target.closest && target.closest('.cite-pop'))) return;
  open.shut.focus({ preventScroll: true });
});

window.addEventListener('resize', refit);
window.addEventListener('beforeprint', () => close());

const buttons = new Map();
for (const fig of document.querySelectorAll('d-figure')) buttons.set(fig, addButton(fig));
document.addEventListener('DOMContentLoaded', () => nameButtons(buttons));
window.addEventListener('load', () => nameButtons(buttons));
