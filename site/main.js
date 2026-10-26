// Kuperta weboldal: cash-flow grafikon, élő árlista, kapcsolat űrlap. Keretrendszer nélkül.

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}, text) => {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
};

// ─── Cash-flow grafikon ────────────────────────────────────────────────────
function drawCashflow(svg) {
  const months = ['nov.', 'dec.', 'jan.', 'febr.', 'márc.', 'ápr.'];
  const actual = [4.2, 2.6, 0.6, -1.3, -0.5, 0.9]; // millió Ft, terv nélkül
  const plan = [4.2, 3.5, 2.8, 2.2, 2.6, 3.3]; // ugyanez a cég tervvel

  const L = 64, R = 600, T = 16, B = 340, MAX = 5, MIN = -2;
  const x = (i) => L + (i * (R - L)) / (months.length - 1);
  const y = (v) => T + ((MAX - v) / (MAX - MIN)) * (B - T);
  const y0 = y(0);
  const fmt = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('hu-HU', { minimumFractionDigits: 1 })} M Ft`;

  // Catmull-Rom → köbös Bézier: sima görbe pontosan a mért pontokon át
  const curve = (vals) => {
    const p = vals.map((v, i) => [x(i), y(v)]);
    let d = `M${p[0][0]},${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
    }
    return d;
  };

  const defs = el('defs');
  const clipAbove = el('clipPath', { id: 'cf-above' });
  clipAbove.append(el('rect', { x: 0, y: 0, width: 640, height: y0 }));
  const clipBelow = el('clipPath', { id: 'cf-below' });
  clipBelow.append(el('rect', { x: 0, y: y0, width: 640, height: 400 - y0 }));
  defs.append(clipAbove, clipBelow);
  svg.append(defs);

  // Főkönyvi rácsvonalak és tengely
  const grid = el('g', { class: 'cf-grid' });
  for (let v = MIN; v <= MAX; v++) if (v !== 0) grid.append(el('line', { x1: L, x2: R, y1: y(v), y2: y(v) }));
  svg.append(grid);
  for (const v of [4, 2, 0, -2]) {
    svg.append(el('text', { x: L - 12, y: y(v) + 4, 'text-anchor': 'end', class: `cf-axis${v === 0 ? ' zero' : ''}` },
      v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v)} M`));
  }
  months.forEach((m, i) => svg.append(el('text', { x: x(i), y: B + 28, 'text-anchor': 'middle', class: 'cf-axis' }, m)));

  const actualD = curve(actual);

  // Hiányterület a nulla alatt
  svg.append(el('path', {
    d: `${actualD} L${x(actual.length - 1)},${y0} L${x(0)},${y0} Z`,
    class: 'cf-deficit cf-fade', 'clip-path': 'url(#cf-below)',
  }));
  svg.append(el('line', { x1: L, x2: R, y1: y0, y2: y0, class: 'cf-zero' }));

  const planPath = el('path', { d: curve(plan), class: 'cf-plan cf-fade' });
  svg.append(planPath);

  // Ugyanaz a görbe kétszer: nulla felett tinta, alatta piros
  const above = el('path', { d: actualD, class: 'cf-actual above cf-draw', 'clip-path': 'url(#cf-above)' });
  const below = el('path', { d: actualD, class: 'cf-actual below cf-draw', 'clip-path': 'url(#cf-below)' });
  svg.append(above, below);
  const len = Math.ceil(above.getTotalLength());
  for (const p of [above, below]) p.style.setProperty('--len', len);

  // Mélypont jelölése
  const iMin = actual.indexOf(Math.min(...actual));
  svg.append(el('circle', { cx: x(iMin), cy: y(actual[iMin]), r: 5, class: 'cf-dot cf-fade' }));
  svg.append(el('text', { x: x(iMin) + 12, y: y(actual[iMin]) + 22, class: 'cf-note cf-fade' }, fmt(actual[iMin])));

  // Görbék nevei a jobb szélen
  const last = months.length - 1;
  svg.append(el('text', { x: R, y: y(plan[last]) - 14, 'text-anchor': 'end', class: 'cf-label plan cf-fade' }, 'Tervvel'));
  svg.append(el('text', { x: R, y: y(actual[last]) - 14, 'text-anchor': 'end', class: 'cf-label actual cf-fade' }, 'Terv nélkül'));
}

// ─── Likviditás-kalkulátor ────────────────────────────────────────────────
// Havi szimuláció: a bevétel a vevők fizetési határidejével, a közvetlen költség
// a szállítóiéval eltolva érkezik / megy ki. A növekedés a következő hónapban indul.
const MONTHS = ['január', 'február', 'március', 'április', 'május', 'június', 'július',
  'augusztus', 'szeptember', 'október', 'november', 'december'];
const MONTHS_SHORT = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];
// "márciusban" / "2027 márciusában"
const IN_MONTH = ['januárban', 'februárban', 'márciusban', 'áprilisban', 'májusban', 'júniusban', 'júliusban',
  'augusztusban', 'szeptemberben', 'októberben', 'novemberben', 'decemberben'];
const IN_MONTH_OF_YEAR = ['januárjában', 'februárjában', 'márciusában', 'áprilisában', 'májusában', 'júniusában',
  'júliusában', 'augusztusában', 'szeptemberében', 'októberében', 'novemberében', 'decemberében'];

function simulate({ start, revenue, growth, variable, fixed, custDays, suppDays }, months = 12) {
  const rev = (m) => revenue * (1 + growth / 100) ** Math.max(0, m);
  const out = [];
  let balance = start;
  for (let m = 1; m <= months; m++) {
    const inflow = rev(m - custDays / 30);
    const outflow = (variable / 100) * rev(m - suppDays / 30) + fixed;
    balance += inflow - outflow;
    out.push(balance);
  }
  return out;
}

const fmtM = (v, digits = 1) =>
  `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits })} M Ft`;
const UNITS = {
  mft: (v) => fmtM(v),
  mfth: (v) => `${fmtM(v)}/hó`,
  pct: (v) => `${v} %`,
  pcth: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} %/hó`,
  nap: (v) => `${v} nap`,
};

function niceScale(lo, hi) {
  lo = Math.min(0, lo);
  hi = Math.max(0, hi);
  if (lo < 0) lo -= (hi - lo) * 0.14; // hely a mélypont felirata alatt
  const span = hi - lo || 1;
  const step = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => span / s <= 5) || 1000;
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step };
}

function setupCalculator(form) {
  const svg = document.getElementById('calc-chart');
  const verdict = document.getElementById('calc-verdict');
  const detail = document.getElementById('calc-detail');
  const tip = document.getElementById('calc-tip');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = 640, L = 64, R = 616, T = 14, B = 296;
  const now = new Date();
  const labels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
    return { short: MONTHS_SHORT[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
  });
  const x = (i) => L + (i * (R - L)) / 11;

  // Állandó elemek
  const defs = el('defs');
  const clipA = el('clipPath', { id: 'calc-above' });
  const clipB = el('clipPath', { id: 'calc-below' });
  const rectA = el('rect', { x: 0, y: 0, width: W });
  const rectB = el('rect', { x: 0, width: W });
  clipA.append(rectA);
  clipB.append(rectB);
  defs.append(clipA, clipB);
  const grid = el('g', { class: 'cf-grid' });
  const axis = el('g');
  const area = el('path', { class: 'cf-deficit', 'clip-path': 'url(#calc-below)' });
  const zero = el('line', { x1: L, x2: R, class: 'cf-zero' });
  const lineA = el('path', { class: 'cf-actual above', 'clip-path': 'url(#calc-above)' });
  const lineB = el('path', { class: 'cf-actual below', 'clip-path': 'url(#calc-below)' });
  const dot = el('circle', { r: 5, class: 'cf-dot' });
  const note = el('text', { class: 'cf-note' });
  const months = el('g');
  labels.forEach((l, i) =>
    months.append(el('text', { x: x(i), y: B + 26, 'text-anchor': 'middle', class: 'cf-axis' }, i % 2 ? '' : l.short)));
  svg.append(defs, grid, axis, area, zero, lineA, lineB, dot, note, months);

  // Catmull-Rom → Bézier: sima görbe, ami pontosan a havi értékeken megy át
  const linePath = (p) => {
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };

  function draw(values, scale) {
    const y = (v) => T + ((scale.hi - v) / (scale.hi - scale.lo)) * (B - T);
    const y0 = y(0);
    grid.replaceChildren();
    axis.replaceChildren();
    for (let v = scale.lo; v <= scale.hi + 1e-9; v += scale.step) {
      const yy = y(v);
      if (Math.abs(v) > 1e-9) grid.append(el('line', { x1: L, x2: R, y1: yy, y2: yy }));
      axis.append(el('text', { x: L - 12, y: yy + 4, 'text-anchor': 'end', class: `cf-axis${Math.abs(v) < 1e-9 ? ' zero' : ''}` },
        Math.abs(v) < 1e-9 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(+v.toFixed(1)).toLocaleString('hu-HU')} M`));
    }
    zero.setAttribute('y1', y0);
    zero.setAttribute('y2', y0);
    rectA.setAttribute('height', Math.max(0, y0));
    rectB.setAttribute('y', y0);
    rectB.setAttribute('height', Math.max(0, 400 - y0));
    const pts = values.map((v, i) => [x(i), y(v)]);
    const d = linePath(pts);
    lineA.setAttribute('d', d);
    lineB.setAttribute('d', d);
    area.setAttribute('d', `${d} L${x(11)},${y0} L${x(0)},${y0} Z`);
    const iMin = values.indexOf(Math.min(...values));
    const neg = values[iMin] < 0;
    dot.style.setProperty('opacity', neg ? 1 : 0);
    note.style.setProperty('opacity', neg ? 1 : 0);
    dot.setAttribute('cx', pts[iMin][0]);
    dot.setAttribute('cy', pts[iMin][1]);
    const right = iMin > 8;
    note.setAttribute('x', pts[iMin][0] + (right ? -12 : 12));
    note.setAttribute('text-anchor', right ? 'end' : 'start');
    note.setAttribute('y', Math.min(B - 6, pts[iMin][1] + 22));
    note.textContent = fmtM(values[iMin]);
  }

  // Animált átmenet az előző és az új állapot között
  let shown = null;
  let frame = 0;
  function animateTo(values, scale) {
    cancelAnimationFrame(frame);
    if (!shown || reduceMotion) {
      shown = { values, scale };
      draw(values, scale);
      return;
    }
    const from = shown;
    const t0 = performance.now();
    const dur = 420;
    const ease = (t) => 1 - (1 - t) ** 3;
    const step = (now) => {
      const k = ease(Math.min(1, (now - t0) / dur));
      const mix = (a, b) => a + (b - a) * k;
      const cur = {
        values: values.map((v, i) => mix(from.values[i], v)),
        scale: { lo: mix(from.scale.lo, scale.lo), hi: mix(from.scale.hi, scale.hi), step: k < 0.5 ? from.scale.step : scale.step },
      };
      shown = cur;
      draw(cur.values, cur.scale);
      if (k < 1) frame = requestAnimationFrame(step);
      else shown = { values, scale };
    };
    frame = requestAnimationFrame(step);
  }

  const whenText = (i) => {
    const l = labels[i];
    return l.year === now.getFullYear() ? IN_MONTH[l.month] : `${l.year} ${IN_MONTH_OF_YEAR[l.month]}`;
  };

  function update() {
    const p = Object.fromEntries([...form.elements].filter((e) => e.type === 'range').map((e) => [e.name, Number(e.value)]));
    for (const input of form.querySelectorAll('input[type=range]')) {
      const out = form.querySelector(`output[for="${input.id}"]`);
      out.textContent = UNITS[out.dataset.unit](Number(input.value));
      const pct = ((input.value - input.min) / (input.max - input.min)) * 100;
      input.style.setProperty('--fill', `${pct}%`);
    }
    const values = simulate(p);
    const sc = niceScale(Math.min(...values), Math.max(...values));
    animateTo(values, sc);

    const firstNeg = values.findIndex((v) => v < 0);
    const iMin = values.indexOf(Math.min(...values));
    if (firstNeg >= 0) {
      const negMonths = values.filter((v) => v < 0).length;
      verdict.textContent = `${whenText(firstNeg).replace(/^./, (c) => c.toUpperCase())} elfogy a pénz.`;
      verdict.classList.add('is-negative');
      detail.textContent = `A legmélyebb pont ${fmtM(values[iMin])} (${MONTHS[labels[iMin].month]}), és ${negMonths} hónapig mínuszban áll a számla.`;
      if (p.custDays >= 30) {
        const alt = simulate({ ...p, custDays: p.custDays - 30 });
        const altMin = Math.min(...alt);
        tip.textContent = altMin >= 0
          ? `Ha a vevők 30 nappal hamarabb fizetnének, egész évben pozitív maradna az egyenleg (legalább ${fmtM(altMin)}).`
          : `Ha a vevők 30 nappal hamarabb fizetnének, a legmélyebb pont ${fmtM(altMin)} lenne.`;
      } else {
        tip.textContent = 'Itt már nem a vevők a szűk keresztmetszet: a költségarányon vagy az induló tartalékon érdemes dolgozni.';
      }
    } else {
      verdict.textContent = 'A következő 12 hónapban nem fogy el a pénz.';
      verdict.classList.remove('is-negative');
      detail.textContent = `A legalacsonyabb egyenleg ${fmtM(values[iMin])} (${MONTHS[labels[iMin].month]}).`;
      tip.textContent = p.growth > 0
        ? 'Próbálja ki nagyobb növekedéssel vagy hosszabb vevői határidővel: a gyors növekedés viszi el a legtöbb készpénzt.'
        : '';
    }
  }

  form.addEventListener('input', update);
  form.addEventListener('reset', () => setTimeout(update));
  update();
}

// ─── Élő árlista a portál szolgáltatás-katalógusából ──────────────────────
// Szolgáltatás → az űrlap témája (a név alapján)
const topicForService = (name) => {
  const n = name.toLowerCase();
  if (n.includes('adó')) return 'tax';
  if (n.includes('üzleti terv')) return 'business_plan';
  if (n.includes('pályázat')) return 'grant';
  if (n.includes('hitel')) return 'loan';
  if (n.includes('controlling') || n.includes('pénzügyi tanácsadás')) return 'cashflow';
  return 'other';
};
const huf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
async function loadPrices(tbody) {
  try {
    const res = await fetch('/api/public/services');
    if (!res.ok) return; // marad a statikus lista
    const services = await res.json();
    if (!services.length) return;
    tbody.replaceChildren(...services.map((s) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = s.name.replace(/\s*\(óradíj\)$/, '');
      const desc = document.createElement('td');
      desc.textContent = s.description || '';
      const price = document.createElement('td');
      price.className = 'num';
      price.textContent = `${huf.format(Number(s.unit_price))} Ft / ${s.unit}`;
      const ask = document.createElement('td');
      ask.className = 'ask';
      const link = document.createElement('a');
      link.href = `/kapcsolat.html?tema=${topicForService(s.name)}`;
      link.textContent = 'Ajánlatot kérek';
      ask.append(link);
      tr.append(th, desc, price, ask);
      return tr;
    }));
  } catch {
    /* hálózati hiba: marad a statikus lista */
  }
}

// ─── Céges elérhetőségek ───────────────────────────────────────────────────
// Egy helyen állíthatók: a .env COMPANY_EMAIL / COMPANY_PHONE / COMPANY_ADDRESS
// változói, az API adja vissza. Ha nincs megadva, marad a helyőrző szöveg.
let companyEmail = '';

async function loadContact() {
  const targets = document.querySelectorAll('[data-contact]');
  if (!targets.length) return;
  let info;
  try {
    const res = await fetch('/api/public/contact');
    if (!res.ok) return;
    info = await res.json();
  } catch {
    return;
  }
  companyEmail = info.email || '';
  for (const node of targets) {
    const key = node.dataset.contact;
    const value = info[key];
    if (!value) continue;
    let content;
    if (key === 'email') {
      content = document.createElement('a');
      content.href = `mailto:${value}`;
      content.textContent = value;
    } else if (key === 'phone') {
      content = document.createElement('a');
      content.href = `tel:${value.replace(/[^0-9+]/g, '')}`;
      content.textContent = value;
    } else {
      content = document.createTextNode(value);
    }
    node.classList.remove('todo');
    node.replaceChildren(content);
    document.querySelector(`[data-contact-row="${key}"]`)?.removeAttribute('hidden');
  }
}

const fallbackHint = () => (companyEmail ? `, vagy írjon a ${companyEmail} címre` : ' egy kicsit később');

// ─── Kapcsolat űrlap ───────────────────────────────────────────────────────
const FIELD_NAMES = { name: 'Név', email: 'Email', phone: 'Telefon', message: 'Üzenet', consent: 'Hozzájárulás', topic: 'Téma' };

function setupForm(form) {
  const status = form.querySelector('#form-status');
  const button = form.querySelector('button[type=submit]');

  const show = (kind, text) => {
    status.className = `form-status field-wide ${kind}`;
    status.textContent = text;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));

    // Böngészőoldali ellenőrzés – a valódi ellenőrzés a szerveren történik
    const invalid = [...form.elements].filter((n) => n.willValidate && !n.checkValidity());
    if (invalid.length) {
      invalid.forEach((n) => n.setAttribute('aria-invalid', 'true'));
      const names = invalid.map((n) => FIELD_NAMES[n.name] || n.name).join(', ');
      show('error', `Ellenőrizze a következő mezőket: ${names}.`);
      invalid[0].focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    if (!data.phone) delete data.phone;

    button.disabled = true;
    button.textContent = 'Küldés…';
    try {
      const res = await fetch('/api/public/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        form.classList.add('sent');
        show('ok', 'Köszönjük, megkaptuk az üzenetét. Egy munkanapon belül válaszolunk a megadott email címre.');
        form.closest('.contact')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        status.focus?.();
        return;
      }
      if (body.details?.length) {
        body.details.forEach((d) => form.elements[d.path]?.setAttribute('aria-invalid', 'true'));
        show('error', body.details.map((d) => d.message).join(' '));
      } else {
        show('error', body.error || `Az üzenet nem ment el. Próbálja újra${fallbackHint()}.`);
      }
    } catch {
      show('error', `Nincs kapcsolat a szerverrel. Próbálja újra${fallbackHint()}.`);
    } finally {
      button.disabled = false;
      button.textContent = 'Üzenet küldése';
    }
  });
}

// Lokális futtatáskor a munkatársi belépés a portal.localhost-ra mutasson
function fixPortalLink(a) {
  const { hostname, port, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    a.href = `${protocol}//portal.localhost${port ? `:${port}` : ''}/`;
  }
}

// ─── Mobil menü ────────────────────────────────────────────────────────────
function setupMenu(header) {
  const btn = header.querySelector('.menu-toggle');
  if (!btn) return;
  const set = (open) => {
    header.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => set(!header.classList.contains('menu-open')));
  header.querySelectorAll('#main-nav a').forEach((a) => a.addEventListener('click', () => set(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('menu-open')) { set(false); btn.focus(); }
  });
}

// ─── Görgetésre beúszó elemek ──────────────────────────────────────────────
// Csoportonként egymás után (kis késleltetéssel) úsznak be. Ami betöltéskor már
// látszik, azt nem rejtjük el, így nincs villanás.
const REVEAL_GROUPS = [
  '.audience > h2, .audience-list > div',
  '.pillars > .pillar',
  '.stats > li',
  '.section-head > *',
  '.price-list tbody tr',
  '.process > h2, .steps > li',
  '.faq > h2, .faq-list > details',
  '.cta-row > *',
  '.calc-controls > .ctl, .calc-controls > button',
  '.calc-result > *',
];
function setupReveal() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  for (const sel of REVEAL_GROUPS) {
    const order = new Map(); // szekciónként újrakezdődő sorszám a késleltetéshez
    document.querySelectorAll(sel).forEach((node) => {
      const section = node.closest('section') || document.body;
      const i = order.get(section) ?? 0;
      order.set(section, i + 1);
      if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      node.style.setProperty('--d', String(Math.min(i, 7)));
      node.classList.add('reveal');
      io.observe(node);
    });
  }
}

// ─── Számláló: 0-ról fut fel, amikor a látóterbe ér ────────────────────────
function setupCounters() {
  const nodes = document.querySelectorAll('.count[data-to]');
  if (!nodes.length || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const run = (el) => {
    const to = Number(el.dataset.to);
    const dur = 1400;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
  }, { threshold: 0.6 });
  nodes.forEach((el) => { el.textContent = '0'; io.observe(el); });
}

// ─── Vissza a tetejére gomb ───────────────────────────────────────────────
function setupToTop() {
  const btn = document.querySelector('.to-top');
  if (!btn) return;
  const onScroll = () => { btn.hidden = window.scrollY < window.innerHeight * 1.2; };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    document.querySelector('.logo')?.focus({ preventScroll: true });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupCounters();
  setupToTop();
  setupReveal();
  const svg = document.getElementById('cashflow');
  if (svg) drawCashflow(svg);
  const rows = document.getElementById('price-rows');
  if (rows) loadPrices(rows);
  const form = document.getElementById('inquiry-form');
  if (form) setupForm(form);
  loadContact();
  const calc = document.getElementById('calc-form');
  if (calc) setupCalculator(calc);
  // Az árlistából érkezve a téma előre ki van választva
  const topic = new URLSearchParams(location.search).get('tema');
  const topicSelect = document.getElementById('f-topic');
  if (topic && topicSelect && [...topicSelect.options].some((o) => o.value === topic)) topicSelect.value = topic;
  // Fejléc árnyéka görgetéskor
  const header = document.querySelector('.site-header');
  if (header) {
    setupMenu(header);
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  const portal = document.getElementById('portal-link');
  if (portal) fixPortalLink(portal);
});
