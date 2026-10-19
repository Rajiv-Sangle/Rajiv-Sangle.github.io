
const NAMES = '.fig-link[data-figure]';
const LIT = '.is-lit, [data-lit-mark]';
const EDGE = 12;
const FOOT = 64;

let note = null;
let noted = null;
let notedByKeys = false;
let visit = null;
let back = null;
let watch = null;
let still = null;
let last = null;
const pressed = new WeakMap();

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

function figureOf(link) {
  if (document.documentElement.classList.contains('fx-locked')) return null;
  const fig = document.getElementById(link.dataset.figure);
  return fig && fig._ready ? fig : null;
}

function litPart(fig) {
  const root = fig.querySelector('.figure-root') ?? fig;
  const boxes = [...root.querySelectorAll(LIT)].filter((e) => !e.matches(NAMES))
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0);
  return boxes.length ? { boxes, whole: false } : { boxes: [root.getBoundingClientRect()], whole: true };
}

function band() {
  const bar = document.querySelector('.toc-bar');
  return { top: bar ? bar.offsetHeight : 0, bottom: window.innerHeight };
}

function inView(part) {
  const { top, bottom } = band();
  if (!part.whole) return part.boxes.some((r) => Math.min(r.bottom, bottom) - Math.max(r.top, top) >= r.height / 2);
  const r = part.boxes[0];
  return Math.min(r.bottom, bottom) - Math.max(r.top, top) >= Math.min(r.height, bottom - top) / 2;
}

function spanOf(part) {
  return { top: Math.min(...part.boxes.map((r) => r.top)), bottom: Math.max(...part.boxes.map((r) => r.bottom)) };
}

function middle(r) {
  return (r.top + r.bottom) / 2;
}

function scrollToY(y) {
  try {
    window.scrollTo({ left: window.scrollX, top: y, behavior: 'instant' });
  } catch {
    window.scrollTo(window.scrollX, y);
  }
}


function hideNote() {
  if (note) note.hidden = true;
  noted = null;
}

function showNote(link, keys) {
  const fig = figureOf(link);
  const part = fig && litPart(fig);
  if (!part || inView(part)) {
    hideNote();
    return;
  }
  if (!note) {
    note = el('div', 'fj-note');
    note.setAttribute('aria-hidden', 'true');
    note.hidden = true;
    document.body.append(note);
  }
  const word = link.getClientRects()[0] ?? link.getBoundingClientRect();
  const above = middle(spanOf(part)) < middle(word);
  const where = link.closest('d-figure') === fig ? `Shown ${above ? 'above' : 'below'}, in this figure.`
    : `Shown in ${figureName(fig)}, ${above ? 'above' : 'below'}.`;
  note.textContent = `${above ? '↑' : '↓'} ${where} ${keys ? 'Press Enter to see it.' : 'Click to see it.'}`;
  note.hidden = false;
  const h = note.offsetHeight;
  const w = note.offsetWidth;
  let y = above ? word.top - h - 6 : word.bottom + 6;
  if (above && y < band().top + 4) y = word.bottom + 6;
  else if (!above && y + h > window.innerHeight - 4) y = word.top - h - 6;
  const x = Math.min(Math.max(8, word.left), window.innerWidth - w - 8);
  note.style.left = `${Math.round(Math.max(8, x))}px`;
  note.style.top = `${Math.round(y)}px`;
  noted = link;
  notedByKeys = keys;
}


function release() {
  if (!visit || !visit.holding) return;
  visit.holding = false;
  const { link } = visit;
  if (!link.matches(':hover')) link.dispatchEvent(new PointerEvent('pointerleave'));
  if (document.activeElement !== link) link.dispatchEvent(new FocusEvent('blur'));
}

function end({ restore = false } = {}) {
  if (!visit) return;
  const v = visit;
  release();
  visit = null;
  still = null;
  if (watch) {
    watch.disconnect();
    watch = null;
  }
  if (back) back.hidden = true;
  if (restore) {
    scrollToY(window.scrollY + v.link.getBoundingClientRect().top - v.top);
    if (v.keys) v.link.focus({ preventScroll: true });
  }
}

function showBack(up) {
  if (!back) {
    back = el('button', 'fj-back');
    back.type = 'button';
    back.hidden = true;
    back.addEventListener('click', () => end({ restore: true }));
    document.body.append(back);
  }
  back.textContent = `${up ? '↑' : '↓'} Back to the text`;
  back.hidden = false;
}

function jump(link, part, keys, event) {
  hideNote();
  end();
  visit = { link, top: link.getBoundingClientRect().top, keys, holding: true };
  const bar = document.querySelector('.toc-bar');
  const top = (bar ? bar.offsetHeight : 0) + EDGE;
  const bottom = window.innerHeight - FOOT;
  const s = spanOf(part);
  const w = link.getBoundingClientRect();
  let lo;
  let hi;
  if (s.bottom - s.top <= bottom - top) [lo, hi] = [s.bottom - bottom, s.top - top];
  else if (s.top > w.top) lo = hi = s.top - top;
  else lo = hi = s.bottom - bottom;
  const nearest = (a, b) => Math.min(Math.max(0, a), b);
  const a = Math.max(lo, w.bottom - bottom);
  const b = Math.min(hi, w.top - top);
  scrollToY(window.scrollY + (a <= b ? nearest(a, b) : nearest(lo, hi)));
  if (!keys && event.pointerType !== 'touch') still = { x: event.clientX, y: event.clientY };
  else if (keys && last) still = { ...last };
  const now = link.getBoundingClientRect();
  if (now.bottom > top && now.top < bottom) return;
  showBack(middle(now) < window.innerHeight / 2);
  watch = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) end();
  }, { rootMargin: `-${top}px 0px -${FOOT}px 0px` });
  watch.observe(link);
  if (keys) back.focus();
}

function activate(link, event, keys) {
  const held = pressed.get(link);
  pressed.delete(link);
  if (held && !link.classList.contains('is-held')) {
    if (visit && visit.link === link) end();
    return;
  }
  const fig = figureOf(link);
  if (!fig) return;
  const part = litPart(fig);
  if (inView(part)) return;
  if (keys) event.preventDefault();
  jump(link, part, keys, event);
}


const nameOf = (target) => (target instanceof Element && target.matches(NAMES) ? target : null);

for (const type of ['pointerover', 'pointerout', 'pointerenter', 'pointerleave', 'pointermove',
  'mouseover', 'mouseout', 'mouseenter', 'mouseleave', 'mousemove']) {
  document.addEventListener(type, (e) => {
    if (type === 'pointermove' && e.isTrusted) last = { x: e.clientX, y: e.clientY };
    if (!still) return;
    if (Math.abs(e.clientX - still.x) < 2 && Math.abs(e.clientY - still.y) < 2) e.stopImmediatePropagation();
    else if (type === 'pointermove' || type === 'mousemove') still = null;
  }, true);
}

document.addEventListener('pointerenter', (e) => {
  const link = nameOf(e.target);
  if (!link) return;
  if (visit && visit.holding && visit.link !== link) release();
  if (e.pointerType === 'touch') return;
  requestAnimationFrame(() => {
    if (link.matches(':hover')) showNote(link, false);
  });
}, true);

document.addEventListener('pointerleave', (e) => {
  if (e.target === noted && !notedByKeys) hideNote();
  if (visit && visit.holding && e.target === visit.link) e.stopImmediatePropagation();
}, true);

document.addEventListener('focus', (e) => {
  const link = nameOf(e.target);
  if (!link) return;
  requestAnimationFrame(() => {
    if (document.activeElement === link && link.matches(':focus-visible')) showNote(link, true);
  });
}, true);

document.addEventListener('blur', (e) => {
  if (e.target === noted && notedByKeys) hideNote();
  if (visit && visit.holding && e.target === visit.link) e.stopImmediatePropagation();
}, true);

document.addEventListener('pointerdown', (e) => {
  const link = e.target instanceof Element ? e.target.closest(NAMES) : null;
  if (!link) return;
  pressed.set(link, link.classList.contains('is-held'));
  if (visit && visit.holding && visit.link === link) release();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideNote();
    release();
    return;
  }
  const link = nameOf(e.target);
  if (link && (e.key === 'Enter' || e.key === ' ')) pressed.set(link, link.classList.contains('is-held'));
}, true);

document.addEventListener('keydown', (e) => {
  const link = nameOf(e.target);
  if (link && (e.key === 'Enter' || e.key === ' ')) activate(link, e, true);
});

document.addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  if (!target || (back && back.contains(target))) return;
  const link = target.closest(NAMES);
  if (link) activate(link, e, false);
  else release();
});

let queued = false;
window.addEventListener('scroll', () => {
  if (!noted || queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (noted) showNote(noted, notedByKeys);
  });
}, { passive: true });
window.addEventListener('resize', hideNote);
