import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ErrorBox from '../components/ErrorBox.jsx';

export const TOPIC_LABELS = {
  cashflow: 'Cash-flow és likviditás',
  tax: 'Adózás',
  business_plan: 'Üzleti terv',
  grant: 'Pályázat',
  loan: 'Hitel, finanszírozás',
  other: 'Egyéb',
};

const STATUS = {
  new: 'Új',
  contacted: 'Felvettük a kapcsolatot',
  converted: 'Ügyfél lett',
  closed: 'Lezárva',
};

const fmt = (ts) => new Date(ts).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });

export default function Inquiries() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = () => api.get('/inquiries').then(setItems);
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id, status) => {
    setError(null);
    try {
      await api.patch(`/inquiries/${id}`, { status });
      load();
    } catch (err) {
      setError(err);
    }
  };

  const convert = async (id) => {
    setError(null);
    try {
      const client = await api.post(`/inquiries/${id}/convert`);
      navigate(`/quotes/new?client=${client.id}`);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <>
      <div className="toolbar">
        <h2>Érdeklődések</h2>
        <span className="muted">A weboldal kapcsolatfelvételi űrlapjáról</span>
      </div>
      <ErrorBox error={error} />
      <div className="card">
        <table>
          <thead>
            <tr><th>Érkezett</th><th>Név / cég</th><th>Téma</th><th>Állapot</th><th /></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <Fragment key={i.id}>
                <tr className="clickable" onClick={() => setOpen(open === i.id ? null : i.id)}>
                  <td>{fmt(i.created_at)}</td>
                  <td>
                    {i.status === 'new' ? <b>{i.name}</b> : i.name}
                    {i.company && <div className="muted small">{i.company}</div>}
                  </td>
                  <td>{TOPIC_LABELS[i.topic]}</td>
                  <td><span className={`badge inq-${i.status}`}>{STATUS[i.status]}</span></td>
                  <td className="num muted small">{open === i.id ? 'Bezár' : 'Megnyit'}</td>
                </tr>
                {open === i.id && (
                  <tr className="detail">
                    <td colSpan={5}>
                      <p className="message">{i.message}</p>
                      <p className="muted small">
                        <a href={`mailto:${i.email}`}>{i.email}</a>
                        {i.phone && <> · {i.phone}</>}
                        {i.client_name && <> · Ügyfél: {i.client_name}</>}
                      </p>
                      {i.status !== 'converted' && (
                        <div className="actions start">
                          <button className="primary" onClick={() => convert(i.id)}>Ügyféllé alakítás és ajánlat</button>
                          {i.status === 'new' && <button onClick={() => setStatus(i.id, 'contacted')}>Felvettük a kapcsolatot</button>}
                          {i.status !== 'closed' && <button onClick={() => setStatus(i.id, 'closed')}>Lezárás</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!items.length && <tr><td colSpan={5} className="muted">Még nem érkezett érdeklődés a weboldalról.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
