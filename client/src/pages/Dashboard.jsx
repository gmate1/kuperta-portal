import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatHuf, STATUS_LABELS } from '../api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setData);
  }, []);

  if (!data) return <div className="muted">Betöltés…</div>;

  const byStatus = Object.fromEntries(data.quotesByStatus.map((s) => [s.status, s]));
  const open = byStatus.sent;
  const won = byStatus.accepted;

  return (
    <>
      <h2>Áttekintés</h2>
      <div className="stats">
        <Link to="/inquiries" className="card stat">
          <div className="muted small">Új érdeklődés a weboldalról</div>
          <div className="big">{data.newInquiries}</div>
          <div className="muted small">Megnyitás</div>
        </Link>
        <div className="card stat">
          <div className="muted small">Nyitott ajánlatok</div>
          <div className="big">{open?.count ?? 0}</div>
          <div className="muted small">{formatHuf(open?.gross)}</div>
        </div>
        <div className="card stat">
          <div className="muted small">Elfogadott ajánlatok</div>
          <div className="big">{won?.count ?? 0}</div>
          <div className="muted small">{formatHuf(won?.gross)}</div>
        </div>
        <div className="card stat">
          <div className="muted small">Költség ebben a hónapban</div>
          <div className="big">{formatHuf(data.expensesThisMonth)}</div>
        </div>
        <div className="card stat">
          <div className="muted small">Ügyfelek</div>
          <div className="big">{data.clientCount}</div>
        </div>
      </div>

      <div className="card">
        <h3>Legutóbbi árajánlatok</h3>
        <table>
          <tbody>
            {data.recentQuotes.map((q) => (
              <tr key={q.id}>
                <td><Link to={`/quotes/${q.id}`}>{q.quote_number}</Link></td>
                <td>{q.client_name}</td>
                <td><span className={`badge ${q.status}`}>{STATUS_LABELS[q.status]}</span></td>
                <td className="num">{formatHuf(q.gross_total)}</td>
              </tr>
            ))}
            {!data.recentQuotes.length && <tr><td className="muted">Még nincs árajánlat.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
