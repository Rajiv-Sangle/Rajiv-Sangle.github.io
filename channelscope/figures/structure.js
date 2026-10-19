
const host = document.querySelector('d-figure#fig-structure');
const SUBUNITS = [['A', '#0072B2'], ['B', '#E69F00'], ['I', '#009E73'], ['G', '#CC79A7']];
const FKBP = { chains: ['F', 'H', 'J', 'O'], color: '#9a9a9a' };
const INITIAL = { view: 'top', style: 'backbone', zoom: 0, fkbp: false };
const CHOSEN = '#D55E00';
function pale(hex, amount = 0.72) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
let built = false;

async function build() {
  if (built) return;
  built = true;

  const root = host.querySelector('.figure-root');
  const box = root.querySelector('.structure-viewer');
  box.addEventListener('wheel', (event) => event.stopPropagation(), { capture: true });

  const pdb = await (await fetch('data/7m6a_ca.pdb')).text();
  const viewer = $3Dmol.createViewer(box, { backgroundColor: 'white', antialias: true });
  const model = viewer.addModel(pdb, 'pdb');
  const atoms = model.selectedAtoms({});
  viewer.zoomTo();
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const a of atoms) {
    [a.x, a.y, a.z].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
  }
  const fromCytoplasm = viewer.getView();
  for (let i = 0; i < 3; i++) fromCytoplasm[i] = -(lo[i] + hi[i]) / 2;

  const state = { ...INITIAL };

  function look(color) {
    return state.style === 'backbone'
      ? { cartoon: { style: 'trace', color, thickness: 0.5 } }
      : { sphere: { color, radius: 2.3 } };
  }

  function fit() {
    viewer.render();
    const points = viewer.modelToScreen(atoms);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    viewer.zoom(0.9 * Math.min(box.clientWidth / width, box.clientHeight / height));
  }

  const showTurn = () => { root.dataset.turn = viewer.getView().slice(4).map((q) => q.toFixed(3)).join(','); };
  viewer.setViewChangeCallback(showTurn);

  function orient() {
    viewer.setView(fromCytoplasm);
    if (state.view === 'side') viewer.rotate(-90, 'x');
  }

  const fkbpSwatch = root.querySelector('.structure-legend .fkbp-swatch');
  function draw(reorient = false) {
    viewer.setStyle({}, {});
    for (const [chain, color] of SUBUNITS) viewer.setStyle({ chain }, look(state.fkbp ? pale(color) : color));
    viewer.setStyle({ chain: FKBP.chains }, state.fkbp ? { sphere: { color: CHOSEN, radius: 3 } } : look(FKBP.color));
    if (fkbpSwatch) fkbpSwatch.style.background = state.fkbp ? CHOSEN : FKBP.color;
    if (reorient) orient();
    fit();
    if (state.zoom) viewer.zoom(Math.pow(1.3, state.zoom));
    viewer.render();
    showTurn();
    root.dataset.state = `view=${state.view};style=${state.style};zoom=${state.zoom};fkbp=${state.fkbp}`;
  }

  const view = root.querySelector('select[name=view]');
  const style = root.querySelector('select[name=style]');
  const fkbp = root.querySelector('input[name=fkbp]');
  view.addEventListener('change', () => { state.view = view.value; state.zoom = 0; draw(true); });
  style.addEventListener('change', () => { state.style = style.value; draw(); });
  fkbp.addEventListener('change', () => { state.fkbp = fkbp.checked; draw(); });
  root.querySelector('[data-zoom=in]').addEventListener('click', () => { state.zoom = Math.min(state.zoom + 1, 4); draw(); });
  root.querySelector('[data-zoom=out]').addEventListener('click', () => { state.zoom = Math.max(state.zoom - 1, -2); draw(); });
  root.querySelector('[data-reset]').addEventListener('click', () => {
    Object.assign(state, INITIAL);
    view.value = state.view;
    style.value = state.style;
    fkbp.checked = state.fkbp;
    draw(true);
  });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const turn = viewer.getView();
      viewer.resize();
      viewer.setView(turn);
      draw();
    }, 150);
  });

  draw(true);
}

host.addEventListener('ready', build);
