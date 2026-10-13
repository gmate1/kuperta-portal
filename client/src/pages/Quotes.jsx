import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, formatDate, formatHuf, STATUS_LABELS } from '../api.js';

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get(`/quotes${status ? `?status=${status}` : ''}`).then(setQuotes);
  }, [status]);

  return (
    <>
      <div className="toolbar">
        <h2>Árajánlatok</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Minden státusz</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Link className="button primary" to="/quotes/new">Új árajánlat</Link>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>Sorszám</th><th>Ügyfél</th><th>Kelt</th><th>Érvényes</th><th>Státusz</th><th className="num">Bruttó</th></tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="clickable" onClick={() => navigate(`/quotes/${q.id}`)}>
                <td className="mono">{q.quote_number}</td>
                <td>{q.client_name}</td>
                <td>{formatDate(q.issue_date)}</td>
                <td>{formatDate(q.valid_until)}</td>
                <td><span className={`badge ${q.status}`}>{STATUS_LABELS[q.status]}</span></td>
                <td className="num">{formatHuf(q.gross_total)}</td>
              </tr>
            ))}
            {!quotes.length && <tr><td colSpan={6} className="muted">Nincs árajánlat.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
