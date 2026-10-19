
const article = document.querySelector('d-article');
const contents = document.getElementById('contents');
const bar = document.querySelector('.toc-bar');

if (article) numberFigures();
if (article && contents && bar) {
  const entries = collect();
  const links = new Map(entries.map(e => [e.id, []]));
  const panel = bar.querySelector('.toc-panel');
  fill(contents, entries, links, true);
  fill(panel, entries, links, false);
  wire(entries, links, panel);
}

function collect() {
  const entries = [];
  const intro = document.getElementById('introduction');
  if (intro) entries.push({ id: intro.id, number: '', title: 'Introduction', level: 2, target: intro });
  let major = 0;
  let minor = 0;
  for (const h of article.querySelectorAll('h2, h3')) {
    const level = h.tagName === 'H2' ? 2 : 3;
    if (level === 2) {
      major += 1;
      minor = 0;
    } else {
      minor += 1;
    }
    const number = level === 2 ? `${major}` : `${major}.${minor}`;
    const title = h.textContent.trim();
    if (!h.id) h.id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const span = document.createElement('span');
    span.className = 'section-number';
    span.textContent = number;
    h.prepend(span, ' ');
    entries.push({ id: h.id, number, title, level, target: h });
  }
  return entries;
}

function numberFigures() {
  const figures = [...document.querySelectorAll('d-title d-figure, d-article d-figure')];
  figures.forEach((f, i) => {
    const label = f.querySelector('figcaption > b.figure-number');
    if (label) label.textContent = `Figure ${i + 1}.`;
    else console.error(`site.js: the figure ${f.id || '(no id)'} has no caption number to fill.`);
  });
  for (const ref of document.querySelectorAll('.figure-ref')) {
    const i = figures.findIndex((f) => f.id === ref.dataset.figure);
    if (i < 0) {
      console.error(`site.js: a reference names no figure on the page (${ref.dataset.figure}).`);
      continue;
    }
    const a = document.createElement('a');
    a.className = 'figure-link';
    a.href = `#${ref.dataset.figure}`;
    a.textContent = `Figure ${i + 1}`;
    ref.replaceChildren(a);
  }
}

function fill(nav, entries, links, withHeading) {
  nav.replaceChildren();
  if (withHeading) {
    const h = document.createElement('h3');
    h.textContent = 'Contents';
    nav.append(h);
  }
  let sub = null;
  for (const e of entries) {
    const a = document.createElement('a');
    a.href = `#${e.id}`;
    if (e.number) a.append(numberSpan(e.number), ' ');
    a.append(e.title);
    links.get(e.id).push(a);
    if (e.level === 2) {
      const div = document.createElement('div');
      div.append(a);
      nav.append(div);
      sub = null;
    } else {
      if (!sub) {
        sub = document.createElement('ul');
        nav.append(sub);
      }
      const li = document.createElement('li');
      li.append(a);
      sub.append(li);
    }
  }
}

function numberSpan(number) {
  const n = document.createElement('span');
  n.className = 'toc-number';
  n.textContent = number;
  return n;
}

function downward(turn) {
  let last = null;
  let run = 0;
  let down = false;
  return y => {
    if (last !== null && y !== last) {
      const dy = y - last;
      run = (dy > 0) === (run > 0) ? run + dy : dy;
      if (run >= turn) down = true;
      if (run <= -turn) down = false;
    }
    last = y;
    return down;
  };
}

function wire(entries, links, panel) {
  const row = bar.querySelector('.toc-bar-row');
  const toggle = bar.querySelector('.toc-toggle');
  const current = bar.querySelector('.toc-current');
  const progress = bar.querySelector('.toc-progress i');
  const root = document.documentElement;
  const isDown = downward(6);
  let active = null;

  const setOpen = open => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    schedule();
  };
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel.addEventListener('click', e => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('click', e => {
    if (!panel.hidden && !bar.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  let queued = false;
  const update = () => {
    queued = false;
    const y = window.scrollY;
    const down = isDown(Math.min(Math.max(y, 0), root.scrollHeight - root.clientHeight));
    const past = contents.getBoundingClientRect().bottom <= 0;
    const held = !panel.hidden || row.querySelector(':focus-visible') !== null;
    const line = row.offsetHeight + 24;
    let now = entries[0];
    for (const e of entries) if (e.target.getBoundingClientRect().top - line <= 0) now = e;
    const top = article.getBoundingClientRect().top + y;
    const span = article.offsetHeight - window.innerHeight;
    const done = span > 0 ? (y - top) / span : 1;

    const show = past && (held || !down);
    bar.classList.toggle('shown', show);
    if (!show && !panel.hidden) setOpen(false);
    if (now !== active) {
      if (active) links.get(active.id).forEach(a => a.removeAttribute('aria-current'));
      links.get(now.id).forEach(a => a.setAttribute('aria-current', 'true'));
      current.replaceChildren(...(now.number ? [numberSpan(now.number), ' ', now.title] : [now.title]));
      active = now;
    }
    progress.style.width = `${Math.max(0, Math.min(1, done)) * 100}%`;
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  bar.addEventListener('focusin', schedule);
  bar.addEventListener('focusout', schedule);
  const leave = () => {
    if (panel.hidden && bar.contains(document.activeElement)) document.activeElement.blur();
  };
  window.addEventListener('wheel', leave, { passive: true });
  window.addEventListener('touchmove', leave, { passive: true });
  update();
}
