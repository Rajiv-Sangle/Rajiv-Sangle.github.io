import { sideView, topView, light, zoneAt } from './ryr1_schematic.js';

const host = document.querySelector('d-figure#fig-parts');

const DG = 'des Georges et al. 2016';
const PARTS = [
  { name: 'CSol, the core solenoid', where: 'in the central tower', src: `${DG}; Yan et al. 2015; names matched by ChannelScope`, zones: ['tower-core'] },
  { name: 'TaF, the thumb-and-forefingers domain', where: 'in the central tower', src: `${DG}; Yan et al. 2015; names matched by ChannelScope`, zones: ['taf'], shape: 'taf' },
  { name: 'TMx, "a transmembrane helix of uncertain provenance"', where: 'in the membrane, beside the pseudo-voltage-sensor domain', src: DG, zones: ['tmx'], shape: 'tmx' },
  { name: 'pVSD, the pseudo-voltage-sensor domain (S1 to S4)', where: 'in the membrane, with a bundle of helices in the cytosol', src: DG, zones: ['pvsd', 's2s3'], shape: 'pvsd s2s3' },
  { name: 'The pore (S5 and S6)', where: 'in the membrane, on the four-fold axis', src: DG, zones: ['pore'], shape: 'pore' },
  { name: 'S6c, S6\'s extension into the cytosol', where: 'in the cytosol, from the pore', src: DG, zones: ['s6c'], shape: 's6c' },
  { name: 'CTD, the C-terminal domain', where: 'in the cytosol, at the end of S6\'s extension', src: DG, zones: ['ctd'], shape: 'ctd' },
];

const ZONES = [
  { id: 'tower', shapes: ['tower-top', 'tower-core'], src: 'Yan et al. 2015; Ogawa et al. 2021; names matched by ChannelScope', label: 'the central tower', name: 'Central tower',
    text: 'The central tower, one of Yan et al.\'s zones: the N-terminal domains, the core solenoid with TaF, and the pore. '
      + 'The N-terminal domains lie more than 120 ångströms from the membrane region. In Yan and colleagues\' terms, only '
      + 'the Central domain of the cytoplasmic part (in the names used here, the core solenoid with TaF) interacts '
      + 'directly with their channel domain, which includes the channel\'s own cytoplasmic elements as well as its '
      + 'membrane segments, so the cytoplasmic part\'s movements are thought to reach the gate through it.',
    zones: ['tower-top', 'tower-core', 'taf', 'pore'] },
  { id: 'corona', shapes: ['corona'], src: 'Yan et al. 2015; names matched by ChannelScope', label: 'the corona', name: 'Corona',
    text: 'The corona, one of Yan et al.\'s zones: the bridging solenoid, around the central tower.', zones: ['corona'] },
  { id: 'periphery', shapes: ['periphery'], src: 'Yan et al. 2015', label: 'the periphery', name: 'Periphery',
    text: 'The periphery, one of Yan et al.\'s zones: peripheral domains attached to the corona.', zones: ['periphery'] },
  { id: 'vestibule', shapes: ['vestibule'], src: 'Zalk et al. 2015', label: 'the vestibule', name: 'Vestibule',
    text: 'The vestibule: the N-terminal domains of the four subunits meet around it, at the centre of the cytoplasmic part.',
    zones: ['vestibule', 'tower-top'] },
  { id: 'membrane', shapes: ['membrane'], src: 'Zalk et al. 2015; des Georges et al. 2016', label: 'the membrane', name: 'Membrane',
    text: 'The membrane: the pore on the four-fold axis, and beside it the pseudo-voltage-sensor domain and TMx.',
    zones: ['membrane', 'pore', 'pvsd', 'tmx'] },
  { id: 'foot', shapes: ['foot'], src: 'des Georges et al. 2016', label: 'in the cytosol, by the membrane', name: 'In the cytosol, by the membrane',
    text: 'In the cytosol, by the membrane: S6\'s extension, ending in the CTD.',
    zones: ['foot', 's6c', 'ctd'] },
];
const PROMPT = 'Point at a part\'s name, or at a zone, to see where it sits.';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function build() {
  const root = host.querySelector('.figure-root');
  root.replaceChildren();

  const views = el('div', 'parts-views');
  const sideBox = el('div', 'parts-view parts-view-side');
  const side = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  side.id = 'parts-side';
  sideBox.append(sideView(side, { title: 'Side view of RyR1, schematic: the cap in the cytosol, the stalk across the membrane' }));
  const topBox = el('div', 'parts-view parts-view-top');
  const top = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  top.id = 'parts-top';
  topBox.append(el('p', 'parts-view-title', 'Seen from the cytoplasm: the four subunits around the four-fold axis'),
    topView(top, { title: 'RyR1 seen from the cytoplasm, schematic: four subunits around the four-fold axis' }));
  views.append(sideBox, topBox);
  const mark = el('p', 'sch-mark', 'Schematic, not to scale.');

  const readout = el('p', 'parts-readout', PROMPT);
  readout.setAttribute('aria-live', 'polite');
  root.append(views, mark, readout);

  const svgs = [side, top];
  let pinned = null;

  const say = (item, into = readout) => {
    into.replaceChildren();
    if (!item) {
      into.textContent = PROMPT;
      return;
    }
    if (item.kind === 'part') {
      const p = item.part;
      into.append(el('b', null, p.name), `: ${p.where}. `, el('span', 'parts-readout-src', `(${p.src})`));
    } else {
      into.append(item.zone.text, ' ', el('span', 'parts-readout-src', `(${item.zone.src})`));
    }
  };

  const zoneButtons = [];
  const list = host.querySelector('.parts-zones-list');
  if (list) {
    list.replaceChildren();
    for (const zone of ZONES) {
      const button = el('button', 'parts-zone-item', zone.name);
      button.type = 'button';
      button.setAttribute('aria-pressed', 'false');
      button.dataset.zone = zone.id;
      button.item = { kind: 'zone', zone };
      const li = el('li');
      li.append(button);
      list.append(li);
      zoneButtons.push(button);
    }
  }

  const show = (item) => {
    light(svgs, item ? (item.kind === 'part' ? item.part.zones : item.zone.zones) : []);
    say(item);
    for (const b of zoneButtons) b.classList.toggle('is-lit', Boolean(item && item.kind === 'zone' && item.zone === b.item.zone));
    root.dataset.state = item ? (item.kind === 'part' ? `part:${PARTS.indexOf(item.part)}` : `zone:${item.zone.id}`) : 'none';
  };
  const same = (a, b) => a && b && a.kind === b.kind && (a.part || a.zone) === (b.part || b.zone);
  const pin = (item) => {
    pinned = same(pinned, item) ? null : item;
    for (const b of zoneButtons) b.setAttribute('aria-pressed', String(Boolean(same(pinned, b.item))));
    show(pinned);
  };
  for (const b of zoneButtons) {
    b.addEventListener('pointerenter', () => show(b.item));
    b.addEventListener('pointerleave', () => show(pinned));
    b.addEventListener('focus', () => show(b.item));
    b.addEventListener('blur', () => show(pinned));
    b.addEventListener('click', () => pin(b.item));
  }

  const itemFor = (zone) => {
    const part = PARTS.find((p) => p.shape && p.shape.split(' ').includes(zone));
    if (part) return { kind: 'part', part };
    const z = ZONES.find((d) => d.shapes.includes(zone));
    return z ? { kind: 'zone', zone: z } : null;
  };
  for (const svg of svgs) {
    svg.addEventListener('pointerover', (e) => {
      const item = itemFor(zoneAt(e));
      if (item) show(item);
    });
    svg.addEventListener('pointerleave', () => show(pinned));
    svg.addEventListener('click', (e) => {
      const item = itemFor(zoneAt(e));
      if (item) pin(item);
    });
  }
  const takeKeys = (shape, label, item) => {
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('role', 'button');
    shape.setAttribute('aria-label', label);
    shape.addEventListener('focus', () => show(item));
    shape.addEventListener('blur', () => show(pinned));
    shape.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pin(item);
      }
    });
  };
  for (const z of ZONES) takeKeys(side.querySelector(`[data-zone="${z.shapes[0]}"]`), z.label, { kind: 'zone', zone: z });
  const middle = (node) => {
    const box = node.getBBox();
    return box.x + box.width / 2;
  };
  for (const part of PARTS.filter((p) => p.shape)) {
    const zone = part.shape.split(' ')[0];
    const name = middle(side.querySelector(`text[data-zone="${zone}"]`));
    const shapes = [...side.querySelectorAll(`[data-zone="${zone}"]:not(text):not(.sch-hit)`)];
    const nearest = shapes.reduce((a, b) => (Math.abs(middle(b) - name) <= Math.abs(middle(a) - name) + 1 ? b : a));
    takeKeys(nearest, part.name.split(',')[0], { kind: 'part', part });
  }
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pinned) pin(pinned);
  });
  show(null);

  const reserve = () => {
    const copy = el('p', 'parts-readout');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.cssText = `position: absolute; visibility: hidden; width: ${getComputedStyle(readout).width};`;
    root.append(copy);
    let tallest = 0;
    for (const item of [null, ...PARTS.map((part) => ({ kind: 'part', part })), ...ZONES.map((zone) => ({ kind: 'zone', zone }))]) {
      say(item, copy);
      tallest = Math.max(tallest, parseFloat(getComputedStyle(copy).height));
    }
    copy.remove();
    readout.style.minHeight = `${tallest}px`;
  };
  reserve();
  window.addEventListener('resize', reserve);

  const linkItem = (link) => {
    if (link.dataset.part) {
      const part = PARTS.find((p) => p.name.startsWith(link.dataset.part));
      return part ? { kind: 'part', part } : null;
    }
    const zone = ZONES.find((z) => z.id === link.dataset.zone);
    return zone ? { kind: 'zone', zone } : null;
  };
  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-parts"]')) {
    const item = linkItem(link);
    if (!item) {
      console.error(`parts.js: a name in the text links to no part or zone of the figure (${link.textContent}).`);
      continue;
    }
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => show(item));
    link.addEventListener('pointerleave', () => show(pinned));
    link.addEventListener('focus', () => show(item));
    link.addEventListener('blur', () => show(pinned));
  }
}

if (host) build();
