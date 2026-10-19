
export const IDENTIFIER_NOTES = { Gene: 'gene', Genome: 'genome', Transcript: 'transcript', 'Residue numbering': 'residue_numbering' };
export const UNTRANSLATED_NOTE = 'exons_not_all_coding';
const PLACES = new Set([...Object.values(IDENTIFIER_NOTES), UNTRANSLATED_NOTE]);
const RELEASE = 'release';
const PAPER = 'paper:';

const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortUrl = (href) => {
  const url = new URL(href);
  return `${url.host}${url.pathname}${url.search.length > 40 ? '?…' : url.search}`;
};
const webAddress = (s) => {
  if (typeof s !== 'string' || !/^https?:\/\/\S+$/.test(s)) return false;
  try {
    return Boolean(new URL(s));
  } catch {
    return false;
  }
};
const text = (s) => (typeof s === 'string' ? s.trim() : '');
const published = (s) => {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(typeof s === 'string' ? s : '');
  if (!m) return null;
  const month = m[2] ? new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : null;
  return [m[3] ? String(+m[3]) : null, month, m[1]].filter(Boolean).join(' ');
};
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function outLink(href) {
  const link = el('a', null, shortUrl(href));
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
}

function context(header, releaseFiles) {
  return {
    sources: new Map((header.provenance?.sources ?? []).map((s) => [s.source, s])),
    papers: new Map((Array.isArray(header.literature) ? header.literature : []).map((p) => [p.id, p])),
    release: header.release?.name ?? 'this release',
    releaseFiles,
  };
}

function readSentence(s, where, ctx, faults) {
  const words = text(s?.text);
  if (!words) faults.push(`${where} has no text`);
  const location = text(s?.location) || null;
  if (s?.source === RELEASE) {
    if (!location) faults.push(`${where} rests on the release but names no place in it`);
    else if (ctx.releaseFiles && !ctx.releaseFiles.some((f) => location.includes(f))) {
      faults.push(`${where} rests on the release, but its place names none of the release's files`);
    }
    if (s.url != null || s.link != null) faults.push(`${where} rests on the release but also cites a page`);
    return { text: words, release: ctx.release, location, key: JSON.stringify([RELEASE, location]) };
  }
  if (typeof s?.source === 'string' && s.source.startsWith(PAPER)) {
    const paper = ctx.papers.get(s.source);
    if (!paper) faults.push(`${where} names ${s.source}, which the release's literature doesn't list`);
    else if (!webAddress(paper.link) || paper.link !== `https://doi.org/${paper.doi}`) {
      faults.push(`${where} names ${s.source}, for which the release gives no DOI link`);
    } else if (s.url !== paper.link) faults.push(`${where} cites ${s.source} by a link other than its DOI link`);
    if (paper && (!text(paper.citation) || !text(paper.title))) faults.push(`${where} names ${s.source}, which has no citation or title`);
    if (s.link != null && !webAddress(s.link)) faults.push(`${where}'s link is not a web address`);
    return {
      text: words, paper, href: s.link ?? s.url, location,
      key: JSON.stringify([s.source, s.url, s.link ?? null, location]),
    };
  }
  const source = ctx.sources.get(s?.source);
  if (!s?.source) faults.push(`${where} names no source`);
  else if (!source) faults.push(`${where} names ${s.source}, which the release's provenance doesn't list`);
  const retrieval = source?.retrievals?.find((r) => r.url === s?.url);
  if (source && !retrieval) faults.push(`${where} cites a page that ${s.source} was not read from`);
  else if (retrieval && Number.isNaN(Date.parse(retrieval.retrieved_at))) faults.push(`${where} cites a page with no date read`);
  if (s?.link != null && !webAddress(s.link)) faults.push(`${where}'s link is not a web address`);
  return {
    text: words, sourceName: source?.name, href: s?.link ?? s?.url, location, readAt: retrieval?.retrieved_at,
    key: JSON.stringify([s?.source, s?.url, s?.link ?? null, location]),
  };
}

function readEntry(e, where, ctx, faults) {
  const role = text(e?.role) || null;
  if (e?.id === RELEASE) {
    const files = Array.isArray(e.files) ? e.files.filter((f) => typeof f === 'string') : [];
    if (!files.length) faults.push(`${where} is the release but names none of its files`);
    else if (ctx.releaseFiles && files.some((f) => !ctx.releaseFiles.includes(f))) faults.push(`${where} names a file the release doesn't have`);
    return { release: ctx.release, files };
  }
  if (typeof e?.id === 'string' && e.id.startsWith(PAPER)) {
    const paper = ctx.papers.get(e.id);
    if (!paper) faults.push(`${where} names ${e.id}, which the release's literature doesn't list`);
    else if (e.link !== paper.link || e.title !== paper.title || e.citation !== paper.citation) {
      faults.push(`${where} differs from the release's literature entry for ${e.id}`);
    }
    if (!role) faults.push(`${where} doesn't say what it is for`);
    const quotes = (Array.isArray(e.quotes) ? e.quotes : []).map((q) => ({ text: text(q?.text), location: text(q?.location) }));
    quotes.forEach((q, k) => {
      if (!q.text || !q.location) faults.push(`${where}'s quotation ${k + 1} has no text or no place`);
    });
    return { paper: paper ?? e, role, quotes };
  }
  const source = ctx.sources.get(e?.id);
  if (!source) faults.push(`${where} names ${e?.id}, which the release's provenance doesn't list`);
  const retrieval = source?.retrievals?.find((r) => r.url === e?.url);
  if (source && !retrieval) faults.push(`${where} cites a page that ${e.id} was not read from`);
  else if (retrieval && retrieval.retrieved_at !== e.retrieved_at) faults.push(`${where} gives a date read other than its page's`);
  if (e?.link != null && !webAddress(e.link)) faults.push(`${where}'s link is not a web address`);
  if (!text(e?.citation)) faults.push(`${where} has no citation`);
  if (!role) faults.push(`${where} doesn't say what it is for`);
  return { citation: text(e?.citation), href: e?.link ?? e?.url, readAt: retrieval?.retrieved_at, role };
}

export function readNotes(header, releaseFiles = null) {
  const notes = new Map();
  const problems = [];
  if (header.notes == null) return { notes, problems };
  if (!Array.isArray(header.notes)) return { notes, problems: ["the release's notes are not a list, so none is shown."] };
  const ctx = context(header, releaseFiles);
  header.notes.forEach((note, i) => {
    const id = note?.id;
    const name = typeof id === 'string' ? `note "${id}"` : `note ${i + 1}`;
    if (!PLACES.has(id)) {
      problems.push(`${name} has no place in the figure, so it is not shown.`);
      return;
    }
    if (notes.has(id)) {
      problems.push(`${name} appears twice; only the first is shown.`);
      return;
    }
    const faults = [];
    const given = Array.isArray(note.sentences) ? note.sentences : [];
    if (!given.length) faults.push('it has no sentences');
    const sentences = given.map((s, j) => readSentence(s, `sentence ${j + 1}`, ctx, faults));
    if (faults.length) {
      problems.push(`${name} is withheld: ${faults.join('; ')}.`);
      return;
    }
    notes.set(id, { id, sentences });
  });
  return { notes, problems };
}

export function readBackgrounds(header, releaseFiles, views) {
  const backgrounds = new Map();
  const problems = [];
  const groups = header.highlight_groups?.groups;
  if (groups == null) return { backgrounds, problems };
  if (!Array.isArray(groups)) return { backgrounds, problems: ["the release's highlight groups are not a list, so no background is shown."] };
  const ctx = context(header, releaseFiles);
  for (const view of views) {
    const holds = (g) => Array.isArray(g?.genome_positions) && view.anchors.some((a) => g.genome_positions.includes(a));
    const holding = groups.filter(holds);
    const at = `the example at GRCh38 ${view.anchors.join(', ')}`;
    if (!holding.length) {
      problems.push(`${at} lies in none of the release's highlight groups, so it has no background.`);
      continue;
    }
    if (holding.length > 1 || !view.anchors.every((a) => holding[0].genome_positions.includes(a))) {
      problems.push(`${at} lies in more than one of the release's highlight groups, so it has no background.`);
      continue;
    }
    const g = holding[0];
    const faults = [];
    const sentences = (part, label) => (Array.isArray(g[part]) ? g[part] : [])
      .map((s, j) => readSentence(s, `${label} sentence ${j + 1}`, ctx, faults));
    const why = sentences('why', 'its why');
    const gaps = sentences('gaps', 'its gaps');
    if (!why.length) faults.push('it gives no reason why it is shown');
    const sources = (Array.isArray(g.source) ? g.source : []).map((e, j) => readEntry(e, `its source ${j + 1}`, ctx, faults));
    if (!sources.length) faults.push('it lists no sources');
    if (faults.length) {
      problems.push(`the background "${g.id}" is withheld: ${faults.join('; ')}.`);
      continue;
    }
    backgrounds.set(view.id, { id: g.id, why, gaps, sources });
  }
  return { backgrounds, problems };
}

function sourceLine(s) {
  const item = el('li');
  if (s.release) {
    item.append(`ChannelScope's release ${s.release}, ${s.location}.`);
  } else if (s.paper) {
    item.append(`${s.paper.citation}, “`, el('span', 'cite-title', s.paper.title), '”, ', outLink(s.href),
      `${s.location ? `, ${s.location}` : ''}.`);
  } else {
    item.append(`${s.sourceName}, `, outLink(s.href), `${s.location ? `, ${s.location}` : ''}, read ${day(s.readAt)}.`);
  }
  return item;
}

function cite(sentences, numbers, list, prefix) {
  const para = el('p', `${prefix}-text`);
  sentences.forEach((s, i) => {
    if (!numbers.has(s.key)) {
      numbers.set(s.key, numbers.size + 1);
      list.append(sourceLine(s));
    }
    if (i) para.append(' ');
    para.append(el('span', `${prefix}-sentence`, s.text), el('sup', `${prefix}-ref`, String(numbers.get(s.key))));
  });
  return para;
}

export function noteToggle(note) {
  if (!note) return null;
  const details = el('details', 'id-note');
  details.dataset.note = note.id;
  const summary = el('summary', null, "What's this?");
  summary.dataset.control = 'click';
  const list = el('ol', 'id-note-sources');
  const body = el('div', 'id-note-body');
  body.append(cite(note.sentences, new Map(), list, 'id-note'), list);
  details.append(summary, body);
  return details;
}

function entryLine(e) {
  const item = el('li');
  if (e.release) {
    item.append(`ChannelScope's release ${e.release}, its file${e.files.length > 1 ? 's' : ''} ${listOf(e.files)}.`);
  } else if (e.paper && e.quotes) {
    const date = published(e.paper.published);
    item.append(`${e.paper.citation}, “`, el('span', 'cite-title', e.paper.title), '”, ', outLink(e.paper.link),
      `${date ? `, published ${date}` : ''}: ${e.role}.`);
    if (e.quotes.length) {
      const quotes = el('ul', 'bg-quotes');
      for (const q of e.quotes) {
        const li = el('li');
        li.append(el('q', 'bg-quote', q.text), ` [${q.location}]`);
        quotes.append(li);
      }
      item.append(quotes);
    }
  } else {
    item.append(`${e.citation}, `, outLink(e.href), `, read ${day(e.readAt)}: ${e.role}.`);
  }
  return item;
}

export function backgroundBlock(bg) {
  if (!bg) return null;
  const block = el('div', 'example-bg');
  block.dataset.group = bg.id;
  const numbers = new Map();
  const list = el('ol', 'bg-source-list');
  block.append(el('p', 'bg-label', 'Why it is shown'), cite(bg.why, numbers, list, 'bg'));
  if (bg.gaps.length) block.append(el('p', 'bg-label', 'What stays open'), cite(bg.gaps, numbers, list, 'bg'));
  const details = el('details', 'bg-sources');
  const summary = el('summary', null, 'Where its facts come from');
  summary.dataset.control = 'click';
  const own = el('ul', 'bg-entries');
  bg.sources.forEach((e) => own.append(entryLine(e)));
  details.append(summary, list, el('p', 'bg-entries-title', "The release's own list of sources for this example:"), own);
  block.append(details);
  return block;
}
