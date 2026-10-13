import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Clients from './pages/Clients.jsx';
import Quotes from './pages/Quotes.jsx';
import QuoteEditor from './pages/QuoteEditor.jsx';
import Expenses from './pages/Expenses.jsx';
import Inquiries from './pages/Inquiries.jsx';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="center muted">Betöltés…</div>;
  if (!user) return <Login />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Kuperta<span>portál</span></div>
        <nav>
          <NavLink to="/" end>Áttekintés</NavLink>
          <NavLink to="/inquiries">Érdeklődések</NavLink>
          <NavLink to="/quotes">Árajánlatok</NavLink>
          <NavLink to="/clients">Ügyfelek</NavLink>
          <NavLink to="/expenses">Költségek</NavLink>
        </nav>
        <div className="user">
          <div>{user.full_name}</div>
          <div className="muted small">{user.email}</div>
          <button className="link" onClick={logout}>Kijelentkezés</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/quotes" element={<Quotes />} />
          <Route path="/quotes/new" element={<QuoteEditor />} />
          <Route path="/quotes/:id" element={<QuoteEditor />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/inquiries" element={<Inquiries />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
