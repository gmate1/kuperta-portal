import { useEffect, useState } from 'react';
import { api, formatDate, formatHuf } from '../api.js';
import ErrorBox from '../components/ErrorBox.jsx';

const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const today = () => new Date().toISOString().slice(0, 10);

export default function Expenses() {
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ byCategory: [] });
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const qs = `?from=${range.from}&to=${range.to}`;
  const load = () => {
    api.get(`/expenses${qs}`).then(setExpenses);
    api.get(`/expenses/summary${qs}`).then(setSummary);
  };

  useEffect(() => {
    api.get('/expenses/categories').then(setCategories);
    api.get('/clients').then(setClients);
  }, []);
  useEffect(load, [range]);

  const openForm = () => {
    setError(null);
    setForm({ category_id: categories[0]?.id ?? '', client_id: '', description: '', supplier: '', expense_date: today(), amount_net: '', vat_rate: 27 });
  };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/expenses', { ...form, client_id: form.client_id || null });
      setForm(null);
      load();
    } catch (err) {
      setError(err);
    }
  };

  const remove = async (id) => {
    if (!confirm('Törlöd a költséget?')) return;
    await api.del(`/expenses/${id}`);
    load();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const total = expenses.reduce((s, x) => s + Number(x.amount_gross), 0);

  return (
    <>
      <div className="toolbar">
        <h2>Költségek</h2>
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span>–</span>
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <div className="spacer" />
        <button className="primary" onClick={openForm}>Új költség</button>
      </div>

      {form && (
        <form className="card form-grid" onSubmit={save}>
          <h3 className="span2">Új költség</h3>
          <label>Leírás<input value={form.description} onChange={set('description')} required /></label>
          <label>Szállító<input value={form.supplier} onChange={set('supplier')} /></label>
          <label>
            Kategória
            <select value={form.category_id} onChange={set('category_id')}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            Ügyfélhez kötve (továbbszámlázható)
            <select value={form.client_id} onChange={set('client_id')}>
              <option value="">– nincs –</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Dátum<input type="date" value={form.expense_date} onChange={set('expense_date')} required /></label>
          <div className="row2">
            <label>Nettó összeg (Ft)<input type="number" min="0" step="1" value={form.amount_net} onChange={set('amount_net')} required /></label>
            <label>
              ÁFA
              <select value={form.vat_rate} onChange={set('vat_rate')}>
                <option value={27}>27%</option><option value={18}>18%</option><option value={5}>5%</option><option value={0}>0%</option>
              </select>
            </label>
          </div>
          <div className="span2"><ErrorBox error={error} /></div>
          <div className="span2 actions">
            <button type="button" onClick={() => setForm(null)}>Mégse</button>
            <button className="primary">Mentés</button>
          </div>
        </form>
      )}

      <div className="stats">
        <div className="card stat">
          <div className="muted small">Összesen (bruttó)</div>
          <div className="big">{formatHuf(total)}</div>
        </div>
        {summary.byCategory.slice(0, 3).map((c) => (
          <div className="card stat" key={c.category}>
            <div className="muted small">{c.category}</div>
            <div className="big">{formatHuf(c.gross)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Dátum</th><th>Leírás</th><th>Kategória</th><th>Ügyfél</th><th className="num">Nettó</th><th className="num">Bruttó</th><th /></tr>
          </thead>
          <tbody>
            {expenses.map((x) => (
              <tr key={x.id}>
                <td>{formatDate(x.expense_date)}</td>
                <td>{x.description}{x.supplier && <div className="muted small">{x.supplier}</div>}</td>
                <td>{x.category_name}</td>
                <td>{x.client_name}</td>
                <td className="num">{formatHuf(x.amount_net)}</td>
                <td className="num">{formatHuf(x.amount_gross)}</td>
                <td><button className="link" onClick={() => remove(x.id)}>✕</button></td>
              </tr>
            ))}
            {!expenses.length && <tr><td colSpan={7} className="muted">Nincs költség a választott időszakban.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
