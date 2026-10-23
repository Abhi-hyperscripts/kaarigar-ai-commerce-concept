// Kaarigar concept: catalogue, the on-device concierge (text reader, quiz, behaviour), both store modes, and the wheel.
import { createStudio } from './studio.js';
import { PRODUCTS } from './catalog.js';

// ---------- catalogue (placeholder pieces; every image is rendered from the same 3D models) ----------

const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const CRAFTS = ['Blue Pottery', 'Dhokra', 'Terracotta', 'Channapatna', 'Black Pottery', 'Marble Inlay', 'Textiles'];
const SIGNATURE = { hero: 'neel-vase', blue: 'neel-vase', dhokra: 'lantern', terracotta: 'tc-urn', lacquer: 'lq-lamp', black: 'bk-surahi', textile: 'kantha' };
const LABEL = {
  'pal:blue': 'Blue & white', 'pal:earthy': 'Earthy tones', 'pal:gold': 'Brass & gold', 'pal:black': 'Black & silver', 'pal:bright': 'Bright colours', 'pal:indigo': 'Indigo', 'pal:white': 'White marble',
  'room:living': 'Living room', 'room:dining': 'Dining & kitchen', 'room:bedroom': 'Bedroom', 'room:pooja': 'Pooja corner', 'room:balcony': 'Balcony & garden', 'room:office': 'Study & desk', 'room:kids': "Kids' room",
  'use:decor': 'Decor', 'use:serve': 'Serveware', 'use:light': 'Lighting', 'use:planter': 'Planters', 'use:textile': 'Textiles',
  'type:vase': 'Vases', 'type:bowl': 'Bowls', 'type:cup': 'Cups', 'type:diya': 'Diyas', 'type:lamp': 'Lamps', 'type:planter': 'Planters', 'type:textile': 'Textiles',
  'occ:gift': 'A gift', 'occ:diwali': 'Diwali', 'occ:wedding': 'Wedding', 'occ:housewarming': 'Housewarming',
  'style:traditional': 'Traditional', 'style:minimal': 'Calm & minimal', 'style:statement': 'Statement piece', 'style:rustic': 'Rustic', 'style:playful': 'Playful',
  'mat:ceramic': 'Glazed ceramic', 'mat:clay': 'Clay', 'mat:brass': 'Brass', 'mat:wood': 'Wood', 'mat:marble': 'Marble', 'mat:cotton': 'Cotton',
};
const CRAFT_TAG = { 'Blue Pottery': 'pal:blue', Dhokra: 'mat:brass', Terracotta: 'pal:earthy', Channapatna: 'mat:wood', 'Black Pottery': 'pal:black', 'Marble Inlay': 'mat:marble', Textiles: 'use:textile' };
const inr = (n) => '₹' + n.toLocaleString('en-IN');

// ---------- the concierge's memory ----------
const store = { get(k, d) { try { const v = localStorage.getItem('kaarigar:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('kaarigar:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
let explicit = store.get('explicit', {});        // tag -> weight, from what the shopper said
let behaviour = store.get('behaviour', {});      // tag -> weight, from what the shopper did (decays)
let because = store.get('because', {});          // tag -> product name that taught it
let budget = store.get('budget', null);          // { max, min }
let signals = store.get('signals', []);
let wish = new Set(store.get('wish', [])), cart = store.get('cart', 0);
const save = () => { store.set('explicit', explicit); store.set('behaviour', behaviour); store.set('because', because); store.set('budget', budget); store.set('signals', signals.slice(0, 40)); store.set('wish', [...wish]); store.set('cart', cart); };

// ---------- reading a free-text request ----------
const LEXICON = [
  [/\bblue\b|\bcobalt\b|\bturquoise\b|blue pottery/, ['pal:blue']], [/\bwhite\b(?!.*blue)/, ['pal:white']],
  [/earthy|brown|terracotta|\bclay\b|rustic|natural|mitti/, ['pal:earthy']], [/brass|gold|golden|metal|dhokra|copper/, ['pal:gold', 'mat:brass']],
  [/black|silver|dark|monochrome|charcoal/, ['pal:black']], [/bright|colou?rful|vibrant|playful|\bfun\b/, ['pal:bright', 'style:playful']],
  [/\bkids?\b|child|children|nursery|baby/, ['room:kids', 'style:playful']], [/indigo|navy/, ['pal:indigo']], [/marble|inlay|taj/, ['mat:marble', 'pal:white']], [/wood|wooden|lacquer|channapatna/, ['mat:wood']],
  [/cushion|throw|runner|stole|textile|fabric|cloth|bedspread|quilt|dupatta/, ['use:textile', 'type:textile']],
  [/vase|flowers?|stems/, ['type:vase', 'use:decor']], [/\bbowls?\b|fruit|urli/, ['type:bowl']], [/lamp|light|lantern|candle|glow/, ['use:light', 'type:lamp']], [/diyas?|deepak/, ['type:diya', 'use:light']],
  [/planter|plants?|garden|balcony|succulent|terrace/, ['use:planter', 'room:balcony']], [/\bcups?\b|mugs?|tea|chai|kulhad|serv(e|ing)|dining|table|kitchen/, ['use:serve', 'room:dining']],
  [/living|lounge|\bhall\b|drawing room/, ['room:living']], [/bedroom|bedside/, ['room:bedroom']], [/study|office|desk|work/, ['room:office']], [/pooja|puja|mandir|temple|prayer/, ['room:pooja']],
  [/gift|present|mother|\bmom\b|\bmum\b|father|\bdad\b|friend|wife|husband|sister|brother|boss|colleague/, ['occ:gift']], [/diwali|deepavali|festiv|dussehra/, ['occ:diwali']],
  [/wedding|marriage|anniversary|shaadi/, ['occ:wedding']], [/housewarming|griha|new (home|house|flat)/, ['occ:housewarming']],
  [/calm|minimal|simple|subtle|quiet|modern|clean/, ['style:minimal']], [/statement|bold|grand|\bbig\b|dramatic|showpiece/, ['style:statement']], [/traditional|classic|ethnic|heritage/, ['style:traditional']],
];
function readRequest(text) {
  const t = ' ' + text.toLowerCase().replace(/[,₹]/g, (m) => (m === ',' ? '' : ' ')) + ' ';
  const tags = new Set(); LEXICON.forEach(([re, ts]) => { if (re.test(t)) ts.forEach((x) => tags.add(x)); });
  if (tags.has('pal:white') && tags.has('pal:blue')) tags.delete('pal:white');
  let b = null; const num = (s) => { const m = s.match(/(\d+(?:\.\d+)?)\s*(k|thousand)?/); return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : null; };
  let m;
  if ((m = t.match(/between\s+(?:rs\.?\s*)?([\d.]+\s*k?)\s+(?:and|to|-)\s+(?:rs\.?\s*)?([\d.]+\s*k?)/))) b = { min: num(m[1]), max: num(m[2]) };
  else if ((m = t.match(/(?:under|below|less than|within|upto|up to|max|budget(?: of| is)?)\s+(?:rs\.?\s*|inr\s*)?([\d.]+\s*(?:k|thousand)?)/))) b = { max: num(m[1]) };
  else if ((m = t.match(/(?:around|about|~)\s+(?:rs\.?\s*)?([\d.]+\s*k?)/))) { const v = num(m[1]); b = { min: Math.round(v * 0.6), max: Math.round(v * 1.3) }; }
  else if (/cheap|affordable|budget|inexpensive/.test(t)) b = { max: 1200 };
  else if (/luxur|premium|expensive|splurge/.test(t)) b = { min: 2500 };
  return { tags: [...tags], budget: b };
}

// ---------- ranking ----------
function score(p) {
  let s = 0; const parts = [];
  p.tags.forEach((t) => { const e = (explicit[t] || 0) * 2, b = behaviour[t] || 0; if (e) parts.push({ t, w: e, kind: 'said' }); if (b > 0.05) parts.push({ t, w: b, kind: 'did' }); s += e + b; });
  if (budget) {
    if (budget.max && p.price <= budget.max) { s += 1.6; parts.push({ t: 'budget', w: 1.2, kind: 'said' }); }
    if (budget.max && p.price > budget.max) s -= 3 * Math.min(2, (p.price - budget.max) / budget.max + 0.4);
    if (budget.min && p.price < budget.min) s -= 1;
  }
  if (cartIds.has(p.id)) s -= 2;                      // already in the bag: make room for something new
  s += (p.isNew ? 0.15 : 0) + (1 - PRODUCTS.indexOf(p) / PRODUCTS.length) * 0.1;
  return { s, parts: parts.sort((a, b) => b.w - a.w) };
}
const cartIds = new Set(store.get('cartIds', []));
function ranked() {
  const list = PRODUCTS.map((p) => ({ p, ...score(p) })).sort((a, b) => b.s - a.s);
  const top = Math.max(0.001, list[0].s), learned = hasProfile();
  list.forEach((r) => { r.pct = learned ? Math.round(Math.max(55, Math.min(98, 62 + 36 * (r.s / top)))) : null; r.why = reasons(r); });
  return list;
}
function hasProfile() { return Object.keys(explicit).length > 0 || Object.values(behaviour).some((v) => v > 0.2) || !!budget; }
function reasons(r) {
  const out = [], seen = new Set();
  for (const part of r.parts) {
    if (out.length >= 2) break;
    if (part.t === 'budget') { if (!seen.has('b')) { out.push({ text: 'Within ' + inr(budget.max), kind: 'said' }); seen.add('b'); } continue; }
    const key = part.t.split(':')[0]; if (seen.has(key)) continue; seen.add(key);
    if (part.kind === 'did' && because[part.t] && because[part.t] !== r.p.name) out.push({ text: 'Like the ' + because[part.t], kind: 'did' });
    else out.push({ text: (LABEL[part.t] || part.t), kind: part.kind });
  }
  if (!out.length) out.push({ text: r.p.isNew ? 'New this week' : 'Loved by shoppers', kind: 'said' });
  return out;
}

// ---------- behaviour ----------
const WEIGHT = { look: 0.55, open: 1.0, like: 1.6, cart: 2.2, wheel: 0.8, craft: 1.4 };
const VERB = { look: 'looked', open: 'opened', like: 'liked', cart: 'added', wheel: 'turned', craft: 'explored' };
let rerankTimer = 0;
function signal(kind, p, label) {
  Object.keys(behaviour).forEach((t) => { behaviour[t] *= 0.93; });              // recent signals count more than old ones
  const tags = p ? p.tags : [CRAFT_TAG[label]];
  tags.forEach((t) => { behaviour[t] = (behaviour[t] || 0) + WEIGHT[kind] * (t.startsWith('pal:') || t.startsWith('mat:') ? 1.2 : 0.8); if (p) because[t] = p.name; });
  signals.unshift({ k: kind, n: p ? p.name : label, at: Date.now() }); save();
  renderSignals(); renderTaste();
  if (mode() === 'ai') { clearTimeout(rerankTimer); rerankTimer = setTimeout(() => { renderGrid(true); renderRail(); const tag = p ? (p.tags.find((t) => t.startsWith('pal:') || t.startsWith('mat:'))) : CRAFT_TAG[label]; toast(`Re-ranked: more <b>${(LABEL[tag] || '').toLowerCase()}</b>, because you ${VERB[kind]} ${p ? 'the ' + p.name : label}.`); }, 450); }
}

// ---------- DOM ----------
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement, grid = $('#grid'), rail = $('#rail');
const thumbs = Object.fromEntries(PRODUCTS.map((p) => [p.id, `assets/p/${p.id}.webp`]));
const mode = () => root.dataset.mode;
const heart = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20s-7-4.4-9-9.2C1.6 7.3 4 4 7.3 4c2 0 3.5 1 4.7 2.6C13.2 5 14.7 4 16.7 4 20 4 22.4 7.3 21 10.8 19 15.6 12 20 12 20z"/></svg>';

function cardHTML(r, i) {
  const p = r.p;
  return `<article class="card${mode() === 'ai' && i === 0 && hasProfile() ? ' rank1' : ''}" data-id="${p.id}">
    <div class="img"><img alt="${p.name}" loading="lazy" decoding="async" width="560" height="560" src="${thumbs[p.id] || ''}"><span class="match">${r.pct ? r.pct + '% match' : (p.isNew ? 'New' : 'Popular')}</span><button class="heart${wish.has(p.id) ? ' on' : ''}" aria-label="Save">${heart}</button><span class="dwell"></span></div>
    <div class="body"><span class="craftname">${p.craft} · ${p.region}</span><h3>${p.name}</h3><span class="who">by ${p.artisan}</span>
      <div class="why">${r.why.map((w) => `<span class="${w.kind === 'did' ? 'b' : ''}">${w.text}</span>`).join('')}</div>
      <div class="foot"><span class="price">${inr(p.price)}</span><button class="add">Add</button></div></div></article>`;
}
function visibleList() {
  const q = $('#search').value.trim().toLowerCase();
  let list = mode() === 'ai' ? ranked() : PRODUCTS.map((p) => ({ p, s: 0, parts: [], why: [], pct: null }));
  if (mode() === 'classic') {
    const crafts = $$('#filters input[data-craft]:checked').map((i) => i.dataset.craft), max = +($('#priceMax') || { value: 99999 }).value;
    if (crafts.length) list = list.filter((r) => crafts.includes(r.p.craft));
    list = list.filter((r) => r.p.price <= max);
    const sort = $('#sort').value;
    if (sort === 'low') list.sort((a, b) => a.p.price - b.p.price); else if (sort === 'high') list.sort((a, b) => b.p.price - a.p.price); else if (sort === 'new') list.sort((a, b) => b.p.isNew - a.p.isNew);
  }
  if (q) list = list.filter((r) => (r.p.name + ' ' + r.p.craft + ' ' + r.p.region + ' ' + r.p.desc + ' ' + r.p.tags.map((t) => LABEL[t]).join(' ')).toLowerCase().includes(q));
  return list;
}
function renderGrid(animate) {
  const before = animate ? Object.fromEntries($$('.card', grid).map((c) => [c.dataset.id, c.getBoundingClientRect()])) : null;
  const list = visibleList();
  grid.innerHTML = list.map(cardHTML).join('') || '<p style="color:var(--ink-3)">Nothing matches that yet. Try fewer filters.</p>';
  $('#count').textContent = `${list.length} piece${list.length === 1 ? '' : 's'}`;
  if (before) $$('.card', grid).forEach((c) => { const b = before[c.dataset.id]; if (!b) return; const a = c.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top; if (!dx && !dy) return; c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }); });
}
function renderRail() {
  if (!hasProfile()) { $('#matches').classList.remove('on'); return; }
  const top = ranked().slice(0, 4);
  rail.innerHTML = top.map((r, i) => `<div class="mcard" style="--i:${i}" data-id="${r.p.id}"><img alt="${r.p.name}" src="${thumbs[r.p.id] || ''}"><span class="pct">${r.pct}%</span><div class="mi"><b>${r.p.name}</b><span>${inr(r.p.price)}</span></div></div>`).join('');
  $('#matches').classList.add('on');
  updateHeroPiece();
}
function renderTaste() {
  const all = {}; Object.entries(explicit).forEach(([t, w]) => { all[t] = (all[t] || 0) + w * 2; }); Object.entries(behaviour).forEach(([t, w]) => { all[t] = (all[t] || 0) + w; });
  const top = Object.entries(all).filter(([t, w]) => w > 0.15 && !t.startsWith('type:')).sort((a, b) => b[1] - a[1]).slice(0, 6), max = top.length ? top[0][1] : 1;
  $('#taste').innerHTML = top.length ? top.map(([t, w]) => `<div class="t"><span>${LABEL[t] || t}</span><small>${explicit[t] ? 'you said' : 'you browsed'}</small><div class="bar"><i style="width:${Math.round(w / max * 100)}%"></i></div></div>`).join('') + (budget && budget.max ? `<div class="t"><span>Budget</span><small>up to ${inr(budget.max)}</small></div>` : '') : '<div class="empty">Nothing yet. Describe what you want above, take the quiz, or just browse.</div>';
}
function renderSignals() {
  if (!signals.length) return;
  $('#signals').innerHTML = signals.slice(0, 14).map((s) => `<div><i>${s.k}</i>${s.n}</div>`).join('');
}
function renderFilters() {
  $('#filters').innerHTML = `<div class="fg"><b>Craft</b>${CRAFTS.map((c) => `<label><input type="checkbox" data-craft="${c}">${c}</label>`).join('')}</div>
    <div class="fg"><b>Price up to <span id="pmv">₹6,000</span></b><input type="range" id="priceMax" min="400" max="6000" step="100" value="6000"></div>`;
  $('#filters').addEventListener('input', (e) => { if (e.target.id === 'priceMax') $('#pmv').textContent = inr(+e.target.value); renderGrid(); });
}
function renderMinis() { $$('.mini[data-craft]').forEach((m) => { m.innerHTML = PRODUCTS.filter((p) => p.craft === m.dataset.craft || (m.dataset.craft === 'Textiles' && p.craft === 'Textiles')).slice(0, 4).map((p) => `<img data-id="${p.id}" alt="${p.name}" title="${p.name} · ${inr(p.price)}" src="${thumbs[p.id] || ''}">`).join(''); }); }
function heroCats() { $('#heroCats').innerHTML = CRAFTS.map((c) => `<button class="pill" data-shopcraft="${c}">${c}</button>`).join(''); }

let toastT = 0;
function toast(html) { $('#toastText').innerHTML = html; $('#toast').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('#toast').classList.remove('on'), 3400); }

// ---------- quick view ----------
let qvItem = null;
function openQV(p) {
  qvItem = p; $('#qvImg').src = thumbs[p.id] || ''; $('#qvCraft').textContent = `${p.craft} · ${p.region}`; $('#qvName').textContent = p.name; $('#qvWho').textContent = 'Made by ' + p.artisan;
  $('#qvDesc').textContent = p.desc; $('#qvPrice').textContent = inr(p.price); $('#qvChips').innerHTML = p.tags.filter((t) => !t.startsWith('type:')).map((t) => `<span>${LABEL[t]}</span>`).join('');
  $('#qv').classList.add('on'); signal('open', p);
}
$('#qvClose').onclick = () => $('#qv').classList.remove('on');
$('#qv').addEventListener('click', (e) => { if (e.target.id === 'qv') $('#qv').classList.remove('on'); });
$('#qvAdd').onclick = () => { addToCart(qvItem); $('#qv').classList.remove('on'); };
$('#qvWheel').onclick = () => { $('#qv').classList.remove('on'); onWheel(qvItem, 'Put on the wheel'); scrollTo({ top: 0, behavior: 'smooth' }); signal('wheel', qvItem); };
function addToCart(p) { cart++; cartIds.add(p.id); store.set('cartIds', [...cartIds]); $('#cartBadge').textContent = cart; $('#cartBadge').classList.add('on'); signal('cart', p); if (mode() === 'classic') toast(`Added <b>${p.name}</b> to your bag.`); }

// ---------- grid interactions: look (dwell), open, like, add ----------
const dwellT = new WeakMap(), lastLook = {};
grid.addEventListener('mouseover', (e) => { const c = e.target.closest('.card'); if (!c || dwellT.has(c)) return; c.classList.add('dwelling'); dwellT.set(c, setTimeout(() => { const id = c.dataset.id; if (Date.now() - (lastLook[id] || 0) > 20000 && mode() === 'ai') { lastLook[id] = Date.now(); signal('look', byId[id]); } }, 900)); });
grid.addEventListener('mouseout', (e) => { const c = e.target.closest('.card'); if (!c || c.contains(e.relatedTarget)) return; c.classList.remove('dwelling'); clearTimeout(dwellT.get(c)); dwellT.delete(c); });
grid.addEventListener('click', (e) => {
  const c = e.target.closest('.card'); if (!c) return; const p = byId[c.dataset.id];
  if (e.target.closest('.heart')) { const h = e.target.closest('.heart'); if (wish.has(p.id)) { wish.delete(p.id); h.classList.remove('on'); } else { wish.add(p.id); h.classList.add('on'); signal('like', p); } $('#wishBadge').textContent = wish.size; $('#wishBadge').classList.toggle('on', wish.size > 0); save(); return; }
  if (e.target.closest('.add')) { addToCart(p); return; }
  openQV(p);
});
rail.addEventListener('mouseover', (e) => { const c = e.target.closest('.mcard'); if (c) { $$('.mcard', rail).forEach((m) => m.classList.toggle('on', m === c)); onWheel(byId[c.dataset.id], 'Your match'); } });
rail.addEventListener('click', (e) => { const c = e.target.closest('.mcard'); if (c) openQV(byId[c.dataset.id]); });
document.addEventListener('click', (e) => {
  const m = e.target.closest('.mini img'); if (m) { openQV(byId[m.dataset.id]); return; }
  const b = e.target.closest('[data-shopcraft]'); if (b) {
    const craft = b.dataset.shopcraft;
    if (mode() === 'classic') { renderFilters(); const box = $(`#filters input[data-craft="${craft}"]`); if (box) box.checked = true; renderGrid(); }
    else signal('craft', null, craft);
    $('#shop').scrollIntoView({ behavior: 'smooth' });
  }
});

// ---------- asking ----------
const ask = $('#askBox');
function runAsk() {
  const text = ask.value.trim(); if (!text) { ask.focus(); return; }
  const r = readRequest(text); explicit = {}; r.tags.forEach((t) => { explicit[t] = 1; }); budget = r.budget; save();
  showUnderstood(r); renderTaste(); renderGrid(); renderRail();
  signals.unshift({ k: 'asked', n: '“' + text.slice(0, 60) + (text.length > 60 ? '…' : '') + '”' }); renderSignals(); save();
  if (!r.tags.length && !r.budget) toast('I could not pick out a craft, colour or room there. Showing our most loved pieces; try naming a colour or a room.');
}
function showUnderstood(r) {
  const u = $('#understood'), chips = r.tags.filter((t) => !t.startsWith('type:') || !r.tags.includes(t.replace('type:', 'use:')));
  u.innerHTML = '<span>Understood:</span>' + chips.map((t) => `<span class="tag">${LABEL[t] || t}<button data-untag="${t}" aria-label="Remove">×</button></span>`).join('') + (r.budget ? `<span class="tag">${r.budget.max ? 'Up to ' + inr(r.budget.max) : 'From ' + inr(r.budget.min)}<button data-unbudget aria-label="Remove">×</button></span>` : '');
  u.classList.add('on');
}
$('#understood').addEventListener('click', (e) => {
  const t = e.target.closest('[data-untag]'); if (t) { delete explicit[t.dataset.untag]; t.parentElement.remove(); }
  if (e.target.closest('[data-unbudget]')) { budget = null; e.target.parentElement.remove(); }
  save(); renderTaste(); renderGrid(true); renderRail();
});
$('#askGo').onclick = runAsk;
ask.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAsk(); } });
$('#examples').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; ask.value = b.textContent; runAsk(); });

// ---------- the quiz ----------
const QUIZ = [
  { q: 'Who is it for?', opts: [['My own home', ['occ:housewarming']], ['A gift', ['occ:gift']], ['Diwali & festivals', ['occ:diwali']], ['A wedding', ['occ:wedding', 'occ:gift']]] },
  { q: 'Where will it live?', opts: [['Living room', ['room:living']], ['Dining & kitchen', ['room:dining']], ['Bedroom', ['room:bedroom']], ['Pooja corner', ['room:pooja']], ['Balcony & garden', ['room:balcony']], ['Study & desk', ['room:office']]] },
  { q: 'Which colours feel like you?', opts: [['Blue & white', ['pal:blue'], ['#1f3d98', '#f3f0e8', '#2aa0a6']], ['Earthy', ['pal:earthy'], ['#b0512a', '#e8dbc2', '#6a2c12']], ['Brass & gold', ['pal:gold', 'mat:brass'], ['#c99a3c', '#f0cf78', '#6b4512']], ['Black & silver', ['pal:black'], ['#121010', '#cfd2d6', '#5a5a5a']], ['Bright & playful', ['pal:bright', 'style:playful'], ['#c62828', '#f2b705', '#2e7d32']], ['Indigo', ['pal:indigo'], ['#1d2b55', '#2b3d78', '#e1e8f5']]] },
  { q: 'And the budget?', opts: [['Under ₹1,000', null, null, { max: 1000 }], ['₹1,000 – 2,500', null, null, { min: 1000, max: 2500 }], ['₹2,500 – 5,000', null, null, { min: 2500, max: 5000 }], ['Above ₹5,000', null, null, { min: 5000 }]] },
];
let qStep = 0; const qAns = [];
function renderQuiz() {
  $('#quiz').innerHTML = QUIZ.map((s, i) => `<div class="q${i === qStep ? ' on' : ''}"><div class="qh"><b>${s.q}</b><span>${i + 1} / ${QUIZ.length}</span></div><div class="opts">${s.opts.map((o, j) => `<button class="opt${qAns[i] === j ? ' on' : ''}" data-q="${i}" data-o="${j}">${o[2] ? `<span class="sw">${o[2].map((c) => `<i style="background:${c}"></i>`).join('')}</span>` : ''}${o[0]}</button>`).join('')}</div></div>`).join('')
    + `<div class="qnav"><button class="linkish" id="qBack" style="color:var(--cream-3)">${qStep ? '← Back' : ''}</button><div class="dots">${QUIZ.map((_, i) => `<i class="${i <= qStep ? 'on' : ''}"></i>`).join('')}</div><span style="font-size:.74rem;color:var(--cream-3)">Tap an answer</span></div>`;
}
$('#quiz').addEventListener('click', (e) => {
  if (e.target.id === 'qBack') { qStep = Math.max(0, qStep - 1); renderQuiz(); return; }
  const o = e.target.closest('.opt'); if (!o) return; qAns[+o.dataset.q] = +o.dataset.o;
  if (qStep < QUIZ.length - 1) { qStep++; renderQuiz(); return; }
  explicit = {}; budget = null;
  QUIZ.forEach((s, i) => { const a = s.opts[qAns[i]]; if (!a) return; (a[1] || []).forEach((t) => { explicit[t] = 1; }); if (a[3]) budget = a[3]; });
  save(); renderQuiz(); renderTaste(); renderGrid(); renderRail();
  signals.unshift({ k: 'quiz', n: QUIZ.map((s, i) => s.opts[qAns[i]] ? s.opts[qAns[i]][0] : '').filter(Boolean).join(' · ') }); renderSignals(); save();
  toast('Your shortlist is ready. The wheel is throwing your top match.');
  qStep = 0; closeSheet(); scrollTo({ top: 0, behavior: 'smooth' });
});
const sheet = $('#quizSheet'), openSheet = () => { qStep = 0; renderQuiz(); sheet.classList.add('on'); }, closeSheet = () => sheet.classList.remove('on');
$('#quizOpen').onclick = openSheet; $('#quizClose').onclick = closeSheet; sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
$('#openQuiz').onclick = () => { scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(openSheet, 500); };
$('#resetTaste').onclick = () => { explicit = {}; behaviour = {}; because = {}; budget = null; signals = []; save(); $('#understood').classList.remove('on'); ask.value = ''; $('#signals').innerHTML = '<div><i>start</i>Browse a little and watch the list re-rank.</div>'; renderTaste(); renderGrid(true); renderRail(); updateHeroPiece(); toast('Fresh start. Nothing remembered.'); };

// ---------- the mode switch ----------
function setMode(m, quiet) {
  root.dataset.mode = m; $('#modeWord').textContent = m === 'ai' ? 'On' : 'Off'; $('#modeToggle').setAttribute('aria-pressed', m === 'ai'); store.set('mode', m);
  renderGrid(); renderRail(); updateHeroPiece();
  if (!quiet) toast(m === 'ai' ? 'AI concierge <b>on</b>: your shortlist, ranked as you browse.' : 'Classic store: every piece, with filters and sort. <b>Nothing is personalised.</b>');
}
$('#modeToggle').onclick = () => setMode(mode() === 'ai' ? 'classic' : 'ai');
$('#search').addEventListener('input', () => renderGrid());
$('#sort').addEventListener('change', () => renderGrid());

// ---------- the wheel ----------
const studio = createStudio($('#stage'));
let heroOverride = null, currentScene = 'hero';
function onWheel(p, kicker) {
  if (!p) return; studio.show(p);
  $('#capKicker').textContent = kicker; $('#capName').textContent = p.name; $('#capMeta').textContent = `${p.craft} · ${p.region} · ${inr(p.price)}`;
  if (currentScene === 'hero') heroOverride = p;
}
function updateHeroPiece() {
  if (currentScene !== 'hero') return;
  if (mode() === 'ai' && hasProfile()) { const r = ranked()[0]; heroOverride = null; onWheel(r.p, `Your top match · ${r.pct}%`); }
  else onWheel(byId[SIGNATURE.hero], mode() === 'ai' ? 'On the wheel' : 'Featured piece');
}
const scenes = $$('[data-scene]');
function pickScene() {
  let best = null, bestV = 0; const H = innerHeight;
  scenes.forEach((s) => { const r = s.getBoundingClientRect(), v = Math.max(0, Math.min(H, r.bottom) - Math.max(0, r.top)); if (v > bestV) { bestV = v; best = s; } });
  const shopTop = $('#shop').getBoundingClientRect().top;
  studio.setActive(shopTop > 0);
  $('#nav').classList.toggle('solid', scrollY > 30); $('#nav').classList.toggle('light', shopTop < 64 && $('#how').getBoundingClientRect().bottom > 64);
  // the parade: pinned section, its scroll progress sweeps the ring of pieces past the lens
  const pr = $('#parade').getBoundingClientRect(), span = pr.height - H, pp = Math.min(1, Math.max(0, -pr.top / span));
  studio.setParade(pp, pr.top < H * 0.55 && pr.bottom > H * 0.45);
  if (!best || bestV < H * 0.35) return;
  const sd = best.dataset.side; studio.setSide(sd === 'right' ? -1 : sd === 'left' ? 1 : 0);
  const br = best.getBoundingClientRect(), key = best.dataset.scene;
  studio.setShot(key, key === 'hero' ? -br.top / (br.height * 0.85) : (H - br.top) / (H + br.height));
  if (key === currentScene) return; currentScene = key;
  if (key === 'hero') { if (heroOverride) onWheel(heroOverride, $('#capKicker').textContent); else updateHeroPiece(); }
  else if (key.startsWith('craft')) { const craft = key.split(':')[1], p = byId[SIGNATURE[craft]]; onWheel(p, 'The craft'); }
}
// ---------- scroll-scrubbed hand-offs between scenes ----------
const ease3 = (t) => t * t * (3 - 2 * t), clamp = (x) => Math.min(1, Math.max(0, x));
function stage(el, p) {   // p: 0 when the section's top meets the bottom of the screen, 1 when its bottom leaves the top
  const inn = ease3(clamp((p - 0.12) / 0.24)), out = ease3(clamp((p - 0.7) / 0.22)), o = inn * (1 - out);
  el.style.opacity = o.toFixed(3); el.style.transform = `translate3d(0, ${((1 - inn) * 70 - out * 80).toFixed(1)}px, 0) scale(${(0.97 + 0.03 * inn).toFixed(4)})`;
  el.style.filter = o > 0.98 ? 'none' : `blur(${((1 - inn) * 10 + out * 8).toFixed(1)}px)`;
}
const heroEls = ['.hero-title', '.dock.mode-ai', '.dock.mode-classic', '#matches', '#caption'].map((s) => $(s)).filter(Boolean);
function transitions() {
  const H = innerHeight, y = scrollY, k = clamp(y / (H * 0.75));
  if (!root.classList.contains('intro')) heroEls.forEach((el, i) => { el.style.opacity = (1 - ease3(clamp(k * (1.3 + i * 0.15)))).toFixed(3); el.style.transform = `translate3d(0, ${(-k * (120 + i * 30)).toFixed(1)}px, 0)`; el.style.filter = k > 0.02 ? `blur(${(k * 8).toFixed(1)}px)` : 'none'; });
  $('.hero-scrim').style.opacity = (1 - ease3(clamp(k * 1.8))).toFixed(3);
  $$('.craft').forEach((s) => { const r = s.getBoundingClientRect(); if (r.bottom < -H || r.top > 2 * H) return; stage(s.querySelector('.ccopy'), (H - r.top) / (H + r.height)); });
  const pr = $('#parade').getBoundingClientRect(), pp = clamp(-pr.top / (pr.height - H)), pt = $('.parade-type'), ps = $('.parade-stats');
  const pin = ease3(clamp((H - pr.top) / H * 1.6 - 0.4)), pout = ease3(clamp((pp - 0.82) / 0.18));
  pt.style.opacity = ps.style.opacity = (pin * (1 - pout)).toFixed(3); pt.style.transform = `translate3d(${(-(1 - pin) * 80).toFixed(1)}px, ${(-pp * 60).toFixed(1)}px, 0)`; ps.style.transform = `translate3d(${((1 - pin) * 80).toFixed(1)}px, 0, 0)`;
  // the shop rises over the film: the studio dims behind it and the sheet widens as it lands
  const shop = $('#shop'), st = shop.getBoundingClientRect().top, rise = clamp(1 - st / H);
  studio.setDip(rise * 0.7);
  shop.style.transform = `scale(${(0.94 + 0.06 * ease3(rise)).toFixed(4)})`; shop.style.borderRadius = `${Math.round(36 + (1 - rise) * 24)}px ${Math.round(36 + (1 - rise) * 24)}px 0 0`;
}
addEventListener('scroll', () => { pickScene(); transitions(); }, { passive: true });
addEventListener('resize', transitions);
// drag the wheel from any empty part of the studio
addEventListener('pointerdown', (e) => { if (e.target.closest('.hero-copy, .ccopy, .nav, .shop, .how, footer, .qv, button, a, textarea, input')) return; if (e.target.closest('.hero, .craft')) studio.beginDrag(e.clientX); });

// reveals
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.15 });
$$('.rv').forEach((el) => io.observe(el));

// ---------- boot ----------
renderFilters(); heroCats(); renderQuiz(); renderTaste(); renderSignals();
$('#wishBadge').textContent = wish.size; $('#wishBadge').classList.toggle('on', wish.size > 0); $('#cartBadge').textContent = cart; $('#cartBadge').classList.toggle('on', cart > 0);
setMode(store.get('mode', 'ai'), true);
studio.show(byId['neel-vase'], { quiet: true });
// the page never waits for the 3D: words come in on time; the studio fades in over its poster when its first frame is ready
const reveal = () => { if (!root.classList.contains('intro')) return; root.classList.remove('intro'); setTimeout(() => root.classList.add('live'), 2200); };
studio.onFirstFrame(() => root.classList.add('gl-on'));
studio.onReady(reveal);
setTimeout(reveal, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1600);
if (/[?&]debug/.test(location.search)) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:11px monospace;color:#f3e6d0;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px'; document.body.appendChild(d); let n = 0, t0 = performance.now(); (function tick() { n++; const t = performance.now(); if (t - t0 > 1000) { d.textContent = `${Math.round(n * 1000 / (t - t0))} fps · tier ${studio.tier}`; n = 0; t0 = t; } requestAnimationFrame(tick); })(); }
pickScene(); transitions();
renderMinis();
