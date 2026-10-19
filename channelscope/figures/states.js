import { sideView } from './ryr1_schematic.js';

const host = document.querySelector('d-figure#fig-states');

const STATES = [
  { id: 'resting', button: 'Resting', heading: 'Resting (closed)', pore: 'closed', cap: null, tag: '',
    what: 'The pore is closed: its four S6 helices close it where it meets the cytosol.',
    src: 'Wei et al. 2025; Yan et al. 2015',
    condition: 'Wei et al. 2025\'s condition: no calcium.' },
  { id: 'primed', button: 'Primed', heading: 'Primed (pre-open)', pore: 'closed', cap: 'changed',
    tag: 'cytoplasmic part: changed shape',
    what: 'The cytoplasmic part has changed shape, but the pore is still closed.',
    src: 'Wei et al. 2025; des Georges et al. 2016',
    condition: 'Wei et al. 2025\'s conditions: nanomolar calcium, or micromolar calcium with ATP, with S0 lost; or '
      + 'nanomolar calcium with S0 kept, for part of the sample.',
    more: 'des Georges et al. 2016 reached a primed state with 30 micromolar calcium alone, or with ATP and caffeine and '
      + 'no calcium.' },
  { id: 'activated', button: 'Activated', heading: 'Activated (open)', pore: 'open', cap: 'moved',
    tag: 'cytoplasmic part: moved',
    what: 'Open: the whole cytoplasmic part moves, and in the membrane the pore\'s inner helices bend outward, widening '
      + 'the pore.',
    src: 'Wei et al. 2025; des Georges et al. 2016; Ogawa et al. 2021',
    condition: 'Wei et al. 2025\'s conditions: micromolar calcium with ATP, with S0 kept; or nanomolar calcium with S0 '
      + 'kept, for part of the sample.' },
  { id: 'inhibited', button: 'Inhibited', heading: 'Inhibited (closed)', pore: 'closed', cap: 'moved',
    tag: 'cytoplasmic part: moved toward the axis',
    what: 'Closed again: the cytoplasmic part moves toward the central axis, the reverse of the changes that activating '
      + 'calcium makes.',
    src: 'Wei et al. 2025',
    condition: 'Wei et al. 2025\'s condition: millimolar calcium, with S0 kept.',
    more: 'Nayak and Samsó 2022 call this state closed-inactivated.' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function build() {
  const root = host.querySelector('.figure-root');
  root.replaceChildren();

  const choice = el('div', 'states-choice');
  choice.setAttribute('role', 'radiogroup');
  choice.setAttribute('aria-label', 'Choose a state');
  const inputs = STATES.map((s, i) => {
    const label = el('label', 'states-option');
    const input = el('input');
    input.type = 'radio';
    input.name = 'ryr1-state';
    input.value = s.id;
    input.checked = i === 0;
    label.append(input, el('span', null, s.button));
    choice.append(label);
    return input;
  });

  const body = el('div', 'states-body');
  const drawing = el('div', 'states-drawing');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'states-side';
  drawing.append(svg);
  const text = el('div', 'states-text');
  text.setAttribute('aria-live', 'polite');
  body.append(drawing, text);
  root.append(choice, body);

  const lines = (s) => {
    const what = el('p', 'states-what');
    what.append(s.what, ' ', el('span', 'states-src', `(${s.src})`));
    const out = [el('p', 'states-heading', s.heading), what, el('p', 'states-condition', s.condition)];
    if (s.more) out.push(el('p', 'states-more', s.more));
    return out;
  };
  const show = (s) => {
    sideView(svg, {
      state: s.pore, inset: true, cap: s.cap, tag: s.tag,
      title: `Side view of RyR1, schematic, ${s.heading.toLowerCase()}`,
    });
    text.replaceChildren(...lines(s));
    root.dataset.state = s.id;
  };
  inputs.forEach((input, i) => input.addEventListener('change', () => { if (input.checked) show(STATES[i]); }));
  show(STATES[0]);

  const reserve = () => {
    const copy = el('div', 'states-text');
    copy.setAttribute('aria-hidden', 'true');
    copy.style.cssText = `position: absolute; visibility: hidden; width: ${getComputedStyle(text).width};`;
    body.append(copy);
    let tallest = 0;
    for (const s of STATES) {
      copy.replaceChildren(...lines(s));
      tallest = Math.max(tallest, parseFloat(getComputedStyle(copy).height));
    }
    copy.remove();
    text.style.minHeight = `${tallest}px`;
  };
  reserve();
  window.addEventListener('resize', reserve);

  const chosen = () => STATES[Math.max(0, inputs.findIndex((x) => x.checked))];
  for (const link of document.querySelectorAll('.fig-link[data-figure="fig-states"]')) {
    const i = STATES.findIndex((s) => s.id === link.dataset.state);
    if (i < 0) {
      console.error(`states.js: a name in the text links to no state of the figure (${link.textContent}).`);
      continue;
    }
    link.tabIndex = 0;
    link.addEventListener('pointerenter', () => show(STATES[i]));
    link.addEventListener('pointerleave', () => show(chosen()));
    link.addEventListener('focus', () => show(STATES[i]));
    link.addEventListener('blur', () => show(chosen()));
    link.addEventListener('click', () => { inputs[i].checked = true; show(STATES[i]); });
  }
}

if (host) build();
