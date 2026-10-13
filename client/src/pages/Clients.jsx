import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ErrorBox from '../components/ErrorBox.jsx';

const empty = { name: '', client_type: 'company', tax_number: '', email: '', phone: '', address: '', notes: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null); // null = nincs nyitva; {id?, ...}
  const [error, setError] = useState(null);

  const load = () => api.get(`/clients${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setClients);
  useEffect(() => {
    load();
  }, [q]);

  const edit = async (id) => {
    setError(null);
    const c = await api.get(`/clients/${id}`); // teljes (visszafejtett) adószámmal
    setForm({ ...empty, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? ''])) });
  };

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const { id, name, client_type, tax_number, email, phone, address, notes } = form;
      const body = { name, client_type, tax_number, email, phone, address, notes };
      if (id) await api.put(`/clients/${id}`, body);
      else await api.post('/clients', body);
      setForm(null);
      load();
    } catch (err) {
      setError(err);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="toolbar">
        <h2>Ügyfelek</h2>
        <input placeholder="Keresés…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => { setError(null); setForm(empty); }}>Új ügyfél</button>
      </div>

      {form && (
        <form className="card form-grid" onSubmit={save}>
          <h3 className="span2">{form.id ? 'Ügyfél szerkesztése' : 'Új ügyfél'}</h3>
          <label>Név<input value={form.name} onChange={set('name')} required /></label>
          <label>
            Típus
            <select value={form.client_type} onChange={set('client_type')}>
              <option value="company">Cég</option>
              <option value="individual">Magánszemély</option>
            </select>
          </label>
          <label>Adószám / adóazonosító<input value={form.tax_number} onChange={set('tax_number')} placeholder="12345678-1-42" /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} /></label>
          <label>Telefon<input value={form.phone} onChange={set('phone')} /></label>
          <label>Cím<input value={form.address} onChange={set('address')} /></label>
          <label className="span2">Megjegyzés<textarea value={form.notes} onChange={set('notes')} rows={3} /></label>
          <div className="span2"><ErrorBox error={error} /></div>
          <div className="span2 actions">
            <button type="button" onClick={() => setForm(null)}>Mégse</button>
            <button className="primary">Mentés</button>
          </div>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Név</th><th>Adószám</th><th>Email</th><th>Telefon</th><th className="num">Ajánlatok</th></tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => edit(c.id)}>
                <td>{c.name}</td>
                <td className="mono">{c.tax_number}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
                <td className="num">{c.quote_count}</td>
              </tr>
            ))}
            {!clients.length && <tr><td colSpan={5} className="muted">Nincs találat.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
