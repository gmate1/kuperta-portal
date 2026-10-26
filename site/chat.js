// Kuperta asszisztens – szabályalapú chat (nincs külső szolgáltatás, nincs AI).
// Kulcsszavak alapján válaszol a gyakori kérdésekre, az árakat és az elérhetőségeket
// élőben az API-ból veszi, és kérésre felveszi a látogató adatait – ez a portálban
// ugyanúgy érdeklődésként jelenik meg, mint a kapcsolat űrlapról érkezők.
//
// Kikapcsolás: töröld a HTML oldalakból a chat.css és chat.js sorokat.
(() => {
  const STORE = 'kuperta-chat-v1';
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Állapot (a fül bezárásáig megmarad, oldalváltáskor is) ─────────────
  let state = { open: false, messages: [], lead: null, topic: 'other' };
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORE) || 'null');
    if (saved && Array.isArray(saved.messages)) state = { ...state, ...saved, open: false };
  } catch { /* privát mód vagy tiltott tárhely: memóriában fut */ }
  const save = () => {
    try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch { /* nem baj */ }
  };

  // ─── Élő adatok az API-ból ─────────────────────────────────────────────
  let services = null;
  let contact = null;
  const getServices = async () => {
    if (services) return services;
    try {
      const r = await fetch('/api/public/services');
      services = r.ok ? await r.json() : [];
    } catch { services = []; }
    return services;
  };
  const getContact = async () => {
    if (contact) return contact;
    try {
      const r = await fetch('/api/public/contact');
      contact = r.ok ? await r.json() : {};
    } catch { contact = {}; }
    return contact;
  };
  const huf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
  const priceLine = (s) => `${s.name.replace(/\s*\(óradíj\)$/, '')}: ${huf.format(Number(s.unit_price))} Ft / ${s.unit}`;
  const findService = async (re) => (await getServices()).find((s) => re.test(norm(s.name)));

  // ─── Szövegfelismerés ──────────────────────────────────────────────────
  // Kisbetű, ékezetek nélkül, írásjelek helyett szóköz
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9@.+ ]/g, ' ').replace(/\s+/g, ' ').trim();

  // A sorrend számít: az előrébb álló szándék nyer
  const INTENTS = [
    ['cancel', /^(megse|megsem|megszakit\w*|megallj|stop)$/],
    ['lead', /\b(visszahiv\w*|hivjon\w*|hivjanak|munkatars\w*|ugyintez\w*|emberrel|beszelni|beszelhetnek|jelentkezzen\w*|keressen\w*|keressetek|idopont\w*|ajanlatot kerek)\b/],
    ['prepare', /\b(elokeszit\w*|dokumentum\w*|vigyek|hozzak|kuldjek|papir\w*|kivonat\w*)\b/],
    ['first', /\b(elso\w*|ingyen\w*|dijmentes\w*|konzultac\w*|talalkoz\w*)\b/],
    ['calc', /\b(kalkulat\w*|szamol\w*|cash ?flow\w*|likvid\w*|penzforgal\w*|elfogy\w*|fogy\w*|egyenleg\w*|controlling|riport\w*)\b/],
    ['tax', /\b(ado|adok|adot|adoz\w*|adotanac\w*|adoform\w*|adooptim\w*|adobevall\w*|kata|kiva|afa|szja|tao|ekho)\b/],
    ['plan', /\b(uzleti ?terv\w*|indulo|indul\w*|alapit\w*|startup\w*|befekteto\w*|inditas\w*)\b/],
    ['loan', /\b(hitel\w*|kolcson\w*|bank\w*|finansz\w*|lizing\w*|faktor\w*)\b/],
    ['grant', /\b(palyaz\w*|tamogatas\w*)\b/],
    ['prices', /\b(ar|ara|arak|arai\w*|arat|arlist\w*|mennyibe|kerul|dij|dija|dijak|dijat|koltseg\w*|oradij\w*|arajanlat\w*)\b/],
    ['bookkeeping', /\b(konyvel\w*)\b/],
    ['security', /\b(adat|adatok\w*|adatai\w*|adatkezel\w*|biztonsag\w*|gdpr|bizalmas\w*|titoktart\w*)\b/],
    ['contact', /\b(elerhetoseg\w*|email|e mail|telefon\w*|telefonszam\w*|cim|cimetek|cimuk|hol vagytok|hol talal\w*|iroda\w*|szekhely\w*|gyomro\w*)\b/],
    ['time', /\b(meddig|mennyi ido\w*|hatarido\w*|mikorra|milyen gyors\w*)\b/],
    ['who', /\b(kinek|maganszemely\w*|egyeni vallalkoz\w*|kkv|kisvallalkoz\w*)\b/],
    ['thanks', /\b(koszon\w*|kosz|koszi|kossz|thx|thanks)\b/],
    ['greet', /^(szia\w*|hello|helo|hali|hi|jo napot\w*|jonapot\w*|udv\w*|szervusz\w*|csokolom|jo estet\w*|jo reggelt\w*)\b/],
  ];
  const detect = (text) => {
    const n = norm(text);
    for (const [name, re] of INTENTS) if (re.test(n)) return name;
    return 'fallback';
  };

  // ─── Válaszok ──────────────────────────────────────────────────────────
  // Egy válasz: { parts: [szöveg | {a, href}], actions: [{label, intent} | {label, href}] }
  const A = (label, intent) => ({ label, intent });
  const L = (label, href) => ({ label, href });
  const QUICK = [A('Árak', 'prices'), A('Első beszélgetés', 'first'), A('Kalkulátor', 'calc'), A('Visszahívást kérek', 'lead')];

  const pillar = async (topic, intro, serviceRe) => {
    state.topic = topic;
    const s = serviceRe ? await findService(serviceRe) : null;
    return {
      parts: [intro, ...(s ? [`\n\nÁr: ${priceLine(s).split(': ')[1]} (nettó).`] : [])],
      actions: [A('Erről beszélnék valakivel', 'lead'), L('Szakterületek', '/#szakteruletek')],
    };
  };

  const ANSWERS = {
    welcome: () => ({
      parts: ['Üdvözlöm! A Kuperta automatikus asszisztense vagyok. Az árakról, a szakterületeinkről és az első beszélgetésről tudok gyorsan válaszolni. Ha személyesen szeretne beszélni valakivel, felveszem az elérhetőségét.'],
      actions: QUICK,
    }),
    greet: () => ({ parts: ['Üdvözlöm! Miben segíthetek?'], actions: QUICK }),
    thanks: () => ({ parts: ['Szívesen! Ha más kérdése is van, írjon nyugodtan.'], actions: [] }),
    prices: async () => {
      const list = await getServices();
      if (!list.length) {
        return { parts: ['Az árlistát most nem tudom betölteni, de a ', { a: 'főoldalon', href: '/#szolgaltatasok' }, ' megtalálja.'], actions: [A('Ajánlatot kérek', 'lead')] };
      }
      return {
        parts: ['Az áraink (nettó, ÁFA nélkül):\n\n', list.map(priceLine).join('\n'),
          '\n\nMinden munka előtt tételes, írásos árajánlatot küldünk, és csak az elfogadása után kezdünk.'],
        actions: [A('Ajánlatot kérek', 'lead'), L('Árlista az oldalon', '/#szolgaltatasok')],
      };
    },
    first: () => ({
      parts: ['Az első beszélgetés díjmentes: nagyjából fél óra telefonon vagy online. Elmondja, mi a helyzet, mi pedig megmondjuk, tudunk-e segíteni és nagyjából mennyi munkával jár. Kötelezettséggel nem jár.'],
      actions: [A('Időpontot kérek', 'lead'), A('Mit készítsek elő?', 'prepare')],
    }),
    calc: () => {
      state.topic = 'cashflow';
      return {
        parts: ['A ', { a: 'likviditás-kalkulátorral', href: '/kalkulator.html' }, ' pár csúszkával megnézheti, mikor fogyhat el a pénz a következő 12 hónapban, és mennyit segítene, ha a vevők hamarabb fizetnének. Havi cash-flow tervet és controllingot is vállalunk.'],
        actions: [L('Kalkulátor megnyitása', '/kalkulator.html'), A('Átnéznénk a valódi számokat', 'lead')],
      };
    },
    tax: () => pillar('tax', 'Adótanácsadásban segítünk: átnézzük, melyik adózási forma a legkedvezőbb a cégének, és mikor milyen fizetési kötelezettség jön. A könyvelőjével együtt dolgozunk.', /ado/),
    loan: () => pillar('loan', 'Finanszírozásban és hitelben: megnézzük, mekkora hitelt bír el a cég, és összeállítjuk a banki dokumentációt, hogy a kérelem elsőre rendben legyen.', /hitel/),
    grant: () => pillar('grant', 'Pályázatoknál a szakmai részt Ön írja, a költségvetést, a megtérülési számítást és a pénzügyi táblákat mi készítjük el, a kiírás szerint.', /palyaz/),
    plan: () => pillar('business_plan', 'Üzleti tervet induló és bővülő vállalkozásoknak készítünk: árbevétel- és költségterv, cash-flow előrejelzés, olyan formában, amit a bank is elfogad.', /uzleti terv/),
    prepare: () => ({
      parts: ['Az elmúlt néhány hónap bankszámlakivonatait, a nyitott vevő- és szállítói számlák listáját, valamint a hitelek és lízingek törlesztési ütemezését. Ha valami nincs meg, az sem baj: az átvilágítás során közösen összerakjuk.'],
      actions: [A('Időpontot kérek', 'lead')],
    }),
    bookkeeping: () => ({
      parts: ['Könyvelést nem vállalunk, de a könyvelőjével együtt tudunk dolgozni. A könyvelés a múltat rögzíti, a pénzügyi tanácsadás előre néz: mikor lesz szűkös a pénz, mit lehet tenni ellene, és hogyan finanszírozható a növekedés.'],
      actions: [A('Szakterületek', 'who'), A('Árak', 'prices')],
    }),
    security: () => ({
      parts: ['Az adatok titkosított kapcsolaton érkeznek, a belső rendszerünkhöz csak bejelentkezett munkatársak férnek hozzá, az adószámokat titkosítva tároljuk, és minden hozzáférést naplózunk. Részletek az ', { a: 'adatkezelési tájékoztatóban', href: '/adatvedelem.html' }, '.'],
      actions: [],
    }),
    contact: async () => {
      const c = await getContact();
      const lines = [c.email && `Email: ${c.email}`, c.phone && `Telefon: ${c.phone}`, c.address && `Székhely: ${c.address}`].filter(Boolean);
      return {
        parts: [lines.length ? `${lines.join('\n')}\n\nVagy írjon a ` : 'Írjon nekünk a ', { a: 'Kapcsolat oldalon', href: '/kapcsolat.html' }, '. Ha megadja az elérhetőségét, mi keressük meg.'],
        actions: [A('Visszahívást kérek', 'lead')],
      };
    },
    time: () => ({
      parts: ['Minden megkeresésre egy munkanapon belül válaszolunk. Hogy egy munka mennyi ideig tart, az a terjedelmétől függ: az árajánlatban azt is megírjuk, mikorra várható.'],
      actions: [A('Ajánlatot kérek', 'lead')],
    }),
    who: () => ({
      parts: ['Főleg kis- és középvállalkozásoknak dolgozunk: növekvő cégeknek, ahol a hónap végén szűkös a számla, induló vállalkozásoknak, akiktől a bank üzleti tervet kér, és pályázóknak, akiknek a pénzügyi melléklet kell. Szakterületeink: cash-flow, adó, finanszírozás, pályázat, üzleti terv.'],
      actions: [A('Árak', 'prices'), L('Szakterületek', '/#szakteruletek')],
    }),
    fallback: () => ({
      parts: ['Erre nem tudok biztos választ adni, de egy munkatársunk szívesen megválaszolja. Ha megadja az elérhetőségét, egy munkanapon belül jelentkezünk.'],
      actions: [A('Visszahívást kérek', 'lead'), A('Árak', 'prices'), L('Kapcsolat oldal', '/kapcsolat.html')],
    }),
  };

  // ─── Adatfelvétel (lépésenként) ────────────────────────────────────────
  const CANCEL = A('Mégse', 'cancel');
  const LEAD_STEPS = {
    start: () => {
      state.lead = { step: 'name' };
      return { parts: ['Rendben, felveszem az adatait, és egy munkatársunk egy munkanapon belül jelentkezik. Hogyan szólíthatjuk?'], actions: [CANCEL] };
    },
    name: (t) => {
      if (t.trim().length < 2) return { parts: ['Kérem, adja meg a nevét.'], actions: [CANCEL] };
      state.lead.name = t.trim().slice(0, 200);
      state.lead.step = 'email';
      const first = state.lead.name.split(/\s+/).slice(-1)[0];
      return { parts: [`Köszönöm, ${first}! Milyen email címen érjük el?`], actions: [CANCEL] };
    },
    email: (t) => {
      const e = t.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return { parts: ['Ez nem tűnik érvényes email címnek. Megadná újra?'], actions: [CANCEL] };
      state.lead.email = e.slice(0, 255);
      state.lead.step = 'phone';
      return { parts: ['Telefonon is kereshetjük? Ha igen, írja be a számát, ha nem, nyomja meg a Kihagyom gombot.'], actions: [A('Kihagyom', 'skip'), CANCEL] };
    },
    phone: (t, skip) => {
      if (!skip) {
        if (!/^[0-9+()\-\s]{6,30}$/.test(t.trim())) return { parts: ['Ez nem tűnik telefonszámnak. Írja be újra, vagy nyomja meg a Kihagyom gombot.'], actions: [A('Kihagyom', 'skip'), CANCEL] };
        state.lead.phone = t.trim();
      }
      state.lead.step = 'message';
      return { parts: ['Pár szóban: miben segíthetünk?'], actions: [CANCEL] };
    },
    message: (t) => {
      if (t.trim().length < 3) return { parts: ['Írjon pár szót arról, miben segíthetünk.'], actions: [CANCEL] };
      state.lead.message = t.trim().slice(0, 2900);
      state.lead.step = 'consent';
      return {
        parts: ['Utolsó lépés: az adatait csak a megkeresés megválaszolására használjuk, az ', { a: 'adatkezelési tájékoztató', href: '/adatvedelem.html' }, ' szerint. Elküldhetem?'],
        actions: [A('Elfogadom és elküldöm', 'submit'), CANCEL],
      };
    },
  };

  async function submitLead() {
    const l = state.lead;
    const msg = `[Chat] ${l.message}`;
    const body = {
      name: l.name, company: '', email: l.email, topic: state.topic || 'other',
      message: msg.length >= 10 ? msg : `${msg} (chaten keresztül)`, consent: true, website: '',
      ...(l.phone ? { phone: l.phone } : {}),
    };
    try {
      const r = await fetch('/api/public/inquiries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        state.lead = null;
        return { parts: [`Köszönjük, megkaptuk! Egy munkanapon belül jelentkezünk a(z) ${l.email} címen.`], actions: [] };
      }
      const why = data.details?.map((d) => d.message).join(' ') || data.error || 'Ismeretlen hiba.';
      return { parts: [`Nem sikerült elküldeni: ${why}`], actions: [A('Újrapróbálom', 'submit'), L('Kapcsolat oldal', '/kapcsolat.html')] };
    } catch {
      return { parts: ['Nincs kapcsolat a szerverrel. Próbálja újra, vagy írjon a ', { a: 'Kapcsolat oldalon', href: '/kapcsolat.html' }, '.'], actions: [A('Újrapróbálom', 'submit')] };
    }
  }

  // ─── Feldolgozás ───────────────────────────────────────────────────────
  async function respond({ text = '', intent = null }) {
    const chosen = intent || detect(text);
    if (chosen === 'cancel') {
      const had = !!state.lead;
      state.lead = null;
      return { parts: [had ? 'Rendben, megszakítottam. Miben segíthetek még?' : 'Rendben. Miben segíthetek?'], actions: QUICK };
    }
    if (state.lead) {
      if (chosen === 'submit' && state.lead.step === 'consent') return submitLead();
      if (chosen === 'skip' && state.lead.step === 'phone') return LEAD_STEPS.phone('', true);
      if (state.lead.step === 'consent') {
        return { parts: ['Az elküldéshez nyomja meg az „Elfogadom és elküldöm” gombot, vagy a Mégse gombbal megszakíthatja.'], actions: [A('Elfogadom és elküldöm', 'submit'), CANCEL] };
      }
      if (!intent) return LEAD_STEPS[state.lead.step](text);
    }
    if (chosen === 'lead') return LEAD_STEPS.start();
    const fn = ANSWERS[chosen] || ANSWERS.fallback;
    return fn();
  }

  // ─── Felület ───────────────────────────────────────────────────────────
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter((k) => k !== null && k !== undefined));
    return n;
  };
  const svg = (paths, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = paths; // csak a saját, állandó ikonjaink – felhasználói szöveg soha
    return s;
  };

  const launcher = el('button', { class: 'kc-launcher', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'kc-panel' },
    svg('<path d="M4 5h16v11H9l-5 4z"/>', 'kc-ico'), el('span', { class: 'kc-launcher-text' }, 'Kérdése van?'));
  const log = el('div', { class: 'kc-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Beszélgetés' });
  const input = el('input', { id: 'kc-text', type: 'text', autocomplete: 'off', maxlength: '500', placeholder: 'Írja be a kérdését…' });
  const form = el('form', { class: 'kc-form' },
    el('label', { for: 'kc-text', class: 'visually-hidden' }, 'Üzenet az asszisztensnek'), input,
    el('button', { type: 'submit', class: 'kc-send', 'aria-label': 'Küldés' }, svg('<path d="M4 12h14M13 6l6 6-6 6"/>')));
  const closeBtn = el('button', { type: 'button', class: 'kc-close', 'aria-label': 'Asszisztens bezárása' }, svg('<path d="M6 6l12 12M18 6L6 18"/>'));
  const panel = el('section', { id: 'kc-panel', class: 'kc-panel', role: 'dialog', 'aria-label': 'Kuperta asszisztens', hidden: '' },
    el('header', { class: 'kc-head' },
      el('img', { src: '/img/mark-192.png', alt: '', width: '36', height: '36' }),
      el('div', {}, el('strong', {}, 'Kuperta asszisztens'),
        el('span', {}, 'Automatikus válaszok. Személyes kérdésekre munkatársunk válaszol.')),
      closeBtn),
    log, form);
  document.body.append(launcher, panel);

  function renderMessage(m, isLast) {
    const bubble = el('div', { class: `kc-msg kc-${m.from}` });
    for (const p of m.parts) {
      if (typeof p === 'string') bubble.append(p);
      else bubble.append(el('a', { href: p.href }, p.a));
    }
    const wrap = el('div', { class: `kc-row kc-row-${m.from}` }, bubble);
    if (m.from === 'bot' && m.actions?.length) {
      const acts = el('div', { class: 'kc-actions' });
      for (const a of m.actions) {
        if (a.href) acts.append(el('a', { class: 'kc-chip', href: a.href }, a.label));
        else {
          acts.append(el('button', {
            type: 'button', class: 'kc-chip', ...(isLast ? {} : { disabled: '' }),
            onclick: () => handle({ intent: a.intent, label: a.label }),
          }, a.label));
        }
      }
      wrap.append(acts);
    }
    return wrap;
  }
  function renderAll() {
    log.replaceChildren(...state.messages.map((m, i) => renderMessage(m, i === state.messages.length - 1)));
    log.scrollTop = log.scrollHeight;
  }

  let busy = false;
  async function handle({ text, intent, label }) {
    if (busy) return;
    busy = true;
    state.messages.push({ from: 'user', parts: [label || text] });
    renderAll();
    const typing = el('div', { class: 'kc-row kc-row-bot' }, el('div', { class: 'kc-msg kc-bot kc-typing', 'aria-label': 'Az asszisztens ír' }, el('i'), el('i'), el('i')));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    const [reply] = await Promise.all([respond({ text, intent }), new Promise((r) => setTimeout(r, reduceMotion ? 0 : 450))]);
    typing.remove();
    state.messages.push({ from: 'bot', ...reply });
    state.messages = state.messages.slice(-60);
    save();
    renderAll();
    busy = false;
    input.focus({ preventScroll: true });
  }

  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    document.documentElement.classList.toggle('kc-open', open);
    if (open) {
      if (!state.messages.length) {
        state.messages.push({ from: 'bot', ...ANSWERS.welcome() });
        save();
      }
      renderAll();
      setTimeout(() => input.focus(), reduceMotion ? 0 : 60);
    } else {
      launcher.focus({ preventScroll: true });
    }
  }

  launcher.addEventListener('click', () => setOpen(!state.open));
  closeBtn.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handle({ text });
  });

  // Teszteléshez és a dokumentációhoz (pl. konzolból): window.kupertaChat.detect('mennyibe kerül?')
  window.kupertaChat = { detect, norm };
})();
