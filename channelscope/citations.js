
const STYLE = `
.citation-number, d-hover-box { display: none !important; }
.cite-numbers {
  white-space: nowrap;
  font-family: -apple-system, BlinkMacSystemFont, "Roboto", Helvetica, sans-serif;
  font-size: 75%;
  color: hsla(206, 90%, 20%, 0.7);
  display: inline-block;
  line-height: 1.1em;
  position: relative;
  top: -2px;
  margin: 0 2px;
}
.cite-n {
  cursor: pointer;
  border-radius: 2px;
  padding: 0 1px;
}
.cite-n:hover, .cite-n:focus-visible, .cite-n[aria-expanded="true"] {
  background: hsla(206, 90%, 20%, 0.12);
  color: hsla(206, 90%, 20%, 1);
  outline: none;
}
`;

const pop = document.createElement('div');
pop.className = 'cite-pop';
pop.setAttribute('role', 'dialog');
pop.hidden = true;
let current = null;
let pinned = false;
let timer = 0;

const plain = (s) => String(s || '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

function authors(field) {
  const names = plain(field).split(/\s+and\s+/).filter(Boolean).map((name) => {
    if (/^\{?The /.test(name) || !name.includes(',')) return name;
    const [last, first] = name.split(',').map((s) => s.trim());
    const initials = first.split(/[\s-]+/).filter(Boolean).map((w) => `${w[0]}.`).join(' ');
    return `${initials} ${last}`.trim();
  });
  const cut = names[names.length - 1] === 'others';
  if (cut) names.pop();
  return names.length > 6 || cut ? `${names.slice(0, 6).join(', ')} et al.` : names.join(', ');
}

function fill(n, entry) {
  pop.replaceChildren();
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cite-pop-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => hide(true));
  const number = document.createElement('p');
  number.className = 'cite-pop-number';
  number.textContent = `Reference ${n}`;
  const title = document.createElement('p');
  title.className = 'cite-pop-title';
  title.textContent = plain(entry.title);
  const meta = document.createElement('p');
  meta.className = 'cite-pop-meta';
  const venue = plain(entry.journal || entry.booktitle || entry.howpublished || entry.publisher);
  meta.textContent = [authors(entry.author), [venue, plain(entry.year)].filter(Boolean).join(', ')]
    .filter(Boolean).join('. ') + '.';
  pop.append(close, number, title, meta);
  const doi = plain(entry.doi);
  const url = plain(entry.url);
  if (doi || url) {
    const p = document.createElement('p');
    p.className = 'cite-pop-link';
    const a = document.createElement('a');
    a.href = doi ? `https://doi.org/${doi}` : url;
    a.textContent = doi ? `DOI: ${doi}` : url.replace(/^https?:\/\//, '');
    p.append(a);
    pop.append(p);
  }
  pop.setAttribute('aria-label', `Reference ${n}`);
}

function place(target) {
  const r = target.getBoundingClientRect();
  const width = Math.min(340, document.documentElement.clientWidth - 32);
  pop.style.width = `${width}px`;
  const left = Math.max(16, Math.min(r.left + window.scrollX - 12, window.scrollX + document.documentElement.clientWidth - width - 16));
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  const box = pop.getBoundingClientRect();
  if (box.bottom > window.innerHeight - 8 && r.top - box.height - 6 > 8) {
    pop.style.top = `${r.top + window.scrollY - box.height - 6}px`;
  }
}

function show(target, pin) {
  clearTimeout(timer);
  if (current && current !== target) current.setAttribute('aria-expanded', 'false');
  current = target;
  pinned = pinned || pin;
  fill(target.dataset.n, target.entry);
  pop.hidden = false;
  place(target);
  target.setAttribute('aria-expanded', 'true');
}

function hide(now) {
  clearTimeout(timer);
  const go = () => {
    pop.hidden = true;
    pinned = false;
    if (current) current.setAttribute('aria-expanded', 'false');
    current = null;
  };
  if (now) go();
  else timer = setTimeout(() => { if (!pinned) go(); }, 300);
}

function wire(span) {
  span.addEventListener('mouseenter', () => show(span, false));
  span.addEventListener('mouseleave', () => hide(false));
  span.addEventListener('focus', () => show(span, false));
  span.addEventListener('blur', () => { if (!pop.contains(document.activeElement)) hide(false); });
  span.addEventListener('click', (event) => {
    event.stopPropagation();
    if (current === span && pinned) hide(true);
    else show(span, true);
  });
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      show(span, true);
    }
  });
}

const known = new Map();
function learn(cite) {
  const keys = (cite.getAttribute('key') || '').split(',').map((k) => k.trim());
  const numbers = cite.numbers || [];
  const entries = cite.entries || [];
  if (numbers.length === keys.length && entries.length === keys.length) {
    keys.forEach((k, i) => { if (numbers[i] >= 0) known.set(k, { index: numbers[i], entry: entries[i] }); });
  }
}

function render(cite) {
  const root = cite.shadowRoot;
  learn(cite);
  const keys = (cite.getAttribute('key') || '').split(',').map((k) => k.trim());
  let numbers = cite.numbers || [];
  let entries = cite.entries || [];
  if (numbers.length !== keys.length || entries.length !== keys.length) {
    if (!keys.every((k) => known.has(k))) return;
    numbers = keys.map((k) => known.get(k).index);
    entries = keys.map((k) => known.get(k).entry);
  }
  if (!root || !numbers.length) return;
  if (!root.querySelector('style.cite-style')) {
    const style = document.createElement('style');
    style.className = 'cite-style';
    style.textContent = STYLE;
    root.append(style);
  }
  const holder = root.querySelector('.citation');
  let label = root.querySelector('.cite-numbers');
  if (!label) {
    label = document.createElement('span');
    label.className = 'cite-numbers';
    holder.append(label);
  }
  const seen = new Set();
  const items = numbers.map((index, i) => ({ n: index + 1, entry: entries[i] }))
    .filter((it) => it.n > 0 && !seen.has(it.n) && seen.add(it.n))
    .sort((a, b) => a.n - b.n);
  if (items.length !== numbers.length) console.error(`citations.js: a citation names a key with no reference (${cite.getAttribute('key')}).`);
  const want = items.map((it) => it.n).join(',');
  if (label.dataset.numbers === want) return;
  label.dataset.numbers = want;
  label.replaceChildren('[');
  items.forEach((it, j) => {
    if (j) label.append(', ');
    const span = document.createElement('span');
    span.className = 'cite-n';
    span.tabIndex = 0;
    span.setAttribute('role', 'button');
    span.setAttribute('aria-label', `Reference ${it.n}`);
    span.setAttribute('aria-expanded', 'false');
    span.dataset.n = String(it.n);
    span.entry = it.entry;
    span.textContent = String(it.n);
    wire(span);
    label.append(span);
  });
  label.append(']');
}

function watch(cite) {
  const root = cite.shadowRoot;
  if (!root) return;
  const source = root.querySelector('.citation-number');
  render(cite);
  if (source) new MutationObserver(() => render(cite)).observe(source, { childList: true, characterData: true, subtree: true });
}

function elsewhere(event) {
  if (pop.hidden) return;
  const path = event.composedPath();
  if (path.includes(pop) || path.some((node) => node.classList && node.classList.contains('cite-n'))) return;
  hide(true);
}

document.body.append(pop);
pop.addEventListener('mouseenter', () => clearTimeout(timer));
pop.addEventListener('mouseleave', () => hide(false));
document.addEventListener('pointerdown', elsewhere, true);
document.addEventListener('click', elsewhere);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !pop.hidden) hide(true); });
window.addEventListener('resize', () => { if (!pop.hidden && current) place(current); });

function citations() {
  const found = [...document.querySelectorAll('d-cite')];
  for (const host of document.querySelectorAll('d-footnote-list, d-footnote')) {
    if (host.shadowRoot) found.push(...host.shadowRoot.querySelectorAll('d-cite'));
  }
  return found;
}
const watched = new WeakSet();
function watchAll() {
  const all = citations();
  for (const cite of all) learn(cite);
  for (const cite of all) {
    if (watched.has(cite)) render(cite);
    else { watched.add(cite); watch(cite); }
  }
}
customElements.whenDefined('d-cite').then(() => {
  watchAll();
  for (const ms of [1000, 3000, 8000]) setTimeout(watchAll, ms);
  const list = document.querySelector('d-footnote-list');
  if (list) {
    let frame = 0;
    new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(watchAll); })
      .observe(list, { childList: true, subtree: true });
  }
});
