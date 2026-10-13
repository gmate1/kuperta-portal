import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, formatHuf, STATUS_LABELS } from '../api.js';
import ErrorBox from '../components/ErrorBox.jsx';

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// Csak előnézet – a hiteles összeget a szerver számolja mentéskor
function previewLine(it) {
  const net = Math.round(Number(it.quantity) * Math.round(Number(it.unit_price) * 100) * (100 - Number(it.discount_pct || 0)) / 100);
  const vat = Math.round((net * Number(it.vat_rate)) / 100);
  return { net: net / 100, vat: vat / 100 };
}

const NEXT_ACTIONS = {
  draft: [['sent', 'Megjelölés elküldöttként']],
  sent: [['accepted', 'Elfogadva'], ['rejected', 'Elutasítva'], ['expired', 'Lejárt'], ['draft', 'Vissza piszkozatba']],
  rejected: [['draft', 'Vissza piszkozatba']],
  expired: [['draft', 'Vissza piszkozatba']],
  accepted: [],
};

export default function QuoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/clients').then(setClients);
    api.get('/services').then(setServices);
    if (id) api.get(`/quotes/${id}`).then(setQuote);
    else setQuote({ status: 'draft', client_id: search.get('client') || '', issue_date: today(), valid_until: plusDays(30), notes: '', items: [] });
  }, [id]);

  const totals = useMemo(() => {
    if (!quote) return { net: 0, vat: 0 };
    return quote.items.reduce((t, it) => {
      const l = previewLine(it);
      return { net: t.net + l.net, vat: t.vat + l.vat };
    }, { net: 0, vat: 0 });
  }, [quote]);

  if (!quote) return <div className="muted">Betöltés…</div>;
  const editable = quote.status === 'draft';

  const setField = (k) => (e) => setQuote({ ...quote, [k]: e.target.value });
  const setItem = (i, k, v) => setQuote({ ...quote, items: quote.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) });
  const removeItem = (i) => setQuote({ ...quote, items: quote.items.filter((_, j) => j !== i) });
  const addService = (sid) => {
    const s = services.find((x) => x.id === Number(sid));
    const item = s
      ? { service_id: s.id, description: s.name, quantity: 1, unit: s.unit, unit_price: s.unit_price, discount_pct: 0, vat_rate: s.vat_rate }
      : { service_id: null, description: '', quantity: 1, unit: 'óra', unit_price: 0, discount_pct: 0, vat_rate: 27 };
    setQuote({ ...quote, items: [...quote.items, item] });
  };

  const save = async () => {
    setError(null);
    const body = {
      client_id: quote.client_id,
      issue_date: quote.issue_date,
      valid_until: quote.valid_until,
      notes: quote.notes,
      items: quote.items.map(({ service_id, description, quantity, unit, unit_price, discount_pct, vat_rate }) =>
        ({ service_id, description, quantity, unit, unit_price, discount_pct, vat_rate })),
    };
    try {
      const saved = id ? await api.put(`/quotes/${id}`, body) : await api.post('/quotes', body);
      if (id) setQuote(saved);
      else navigate(`/quotes/${saved.id}`, { replace: true });
    } catch (err) {
      setError(err);
    }
  };

  const changeStatus = async (status) => {
    setError(null);
    try {
      setQuote(await api.patch(`/quotes/${id}/status`, { status }));
    } catch (err) {
      setError(err);
    }
  };

  const duplicate = async () => {
    const copy = await api.post(`/quotes/${id}/duplicate`);
    navigate(`/quotes/${copy.id}`);
  };

  const remove = async () => {
    if (!confirm('Biztosan törlöd a piszkozatot?')) return;
    await api.del(`/quotes/${id}`);
    navigate('/quotes');
  };

  return (
    <>
      <div className="toolbar">
        <h2>{quote.quote_number || 'Új árajánlat'}</h2>
        {id && <span className={`badge ${quote.status}`}>{STATUS_LABELS[quote.status]}</span>}
        <div className="spacer" />
        {id && NEXT_ACTIONS[quote.status].map(([s, label]) => (
          <button key={s} onClick={() => changeStatus(s)}>{label}</button>
        ))}
        {id && <button onClick={duplicate}>Másolat</button>}
        {id && editable && <button className="danger" onClick={remove}>Törlés</button>}
      </div>

      <div className="card form-grid">
        <label>
          Ügyfél
          <select value={quote.client_id} onChange={setField('client_id')} disabled={!editable}>
            <option value="">– válassz –</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="row2">
          <label>Kelt<input type="date" value={quote.issue_date} onChange={setField('issue_date')} disabled={!editable} /></label>
          <label>Érvényes<input type="date" value={quote.valid_until} onChange={setField('valid_until')} disabled={!editable} /></label>
        </div>
      </div>

      <div className="card">
        <table className="items">
          <thead>
            <tr>
              <th>Megnevezés</th><th className="num">Menny.</th><th>Egység</th>
              <th className="num">Egységár</th><th className="num">Kedv. %</th><th className="num">ÁFA %</th>
              <th className="num">Nettó</th>{editable && <th />}
            </tr>
          </thead>
          <tbody>
            {quote.items.map((it, i) => (
              <tr key={i}>
                <td><input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} disabled={!editable} /></td>
                <td><input className="num" type="number" step="0.25" min="0" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} disabled={!editable} /></td>
                <td><input className="short" value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} disabled={!editable} /></td>
                <td><input className="num" type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} disabled={!editable} /></td>
                <td><input className="num short" type="number" min="0" max="100" value={it.discount_pct} onChange={(e) => setItem(i, 'discount_pct', e.target.value)} disabled={!editable} /></td>
                <td>
                  <select value={Number(it.vat_rate)} onChange={(e) => setItem(i, 'vat_rate', e.target.value)} disabled={!editable}>
                    <option value={27}>27%</option>
                    <option value={0}>0% / mentes</option>
                  </select>
                </td>
                <td className="num">{formatHuf(previewLine(it).net)}</td>
                {editable && <td><button className="link" onClick={() => removeItem(i)}>✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {editable && (
          <div className="add-item">
            <select value="" onChange={(e) => addService(e.target.value)}>
              <option value="">+ Tétel hozzáadása a katalógusból…</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} – {formatHuf(s.unit_price)}/{s.unit}</option>)}
            </select>
            <button onClick={() => addService(null)}>+ Egyedi tétel</button>
          </div>
        )}
        <div className="totals">
          <div>Nettó: <b>{formatHuf(totals.net)}</b></div>
          <div>ÁFA: <b>{formatHuf(totals.vat)}</b></div>
          <div className="big">Bruttó: {formatHuf(totals.net + totals.vat)}</div>
        </div>
      </div>

      <div className="card">
        <label>Megjegyzés az ajánlaton<textarea rows={3} value={quote.notes || ''} onChange={setField('notes')} disabled={!editable} /></label>
      </div>

      <ErrorBox error={error} />
      {editable && (
        <div className="actions">
          <button onClick={() => navigate('/quotes')}>Vissza</button>
          <button className="primary" onClick={save}>Mentés</button>
        </div>
      )}
    </>
  );
}
