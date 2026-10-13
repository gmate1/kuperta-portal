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

// ─── Élő árlista a portál szolgáltatás-katalógusából ──────────────────────
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
      tr.append(th, desc, price);
      return tr;
    }));
  } catch {
    /* hálózati hiba: marad a statikus lista */
  }
}

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
        status.focus?.();
        return;
      }
      if (body.details?.length) {
        body.details.forEach((d) => form.elements[d.path]?.setAttribute('aria-invalid', 'true'));
        show('error', body.details.map((d) => d.message).join(' '));
      } else {
        show('error', body.error || 'Az üzenet nem ment el. Próbálja újra, vagy írjon az info@kuperta.hu címre.');
      }
    } catch {
      show('error', 'Nincs kapcsolat a szerverrel. Próbálja újra, vagy írjon az info@kuperta.hu címre.');
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

document.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('cashflow');
  if (svg) drawCashflow(svg);
  const rows = document.getElementById('price-rows');
  if (rows) loadPrices(rows);
  const form = document.getElementById('inquiry-form');
  if (form) setupForm(form);
  const portal = document.getElementById('portal-link');
  if (portal) fixPortalLink(portal);
});
