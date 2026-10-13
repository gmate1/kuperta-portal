import { Router } from 'express';
import { query } from '../db.js';
import { asyncHandler } from '../middleware/index.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [quotes, expenses, clients, recent] = await Promise.all([
      query(`SELECT status, count(*)::int AS count, coalesce(sum(gross_total),0) AS gross
             FROM quotes GROUP BY status`),
      query(`SELECT coalesce(sum(amount_gross),0) AS gross FROM expenses
             WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)`),
      query('SELECT count(*)::int AS count FROM clients'),
      query(`SELECT q.id, q.quote_number, q.status, q.gross_total, c.name AS client_name
             FROM quotes q JOIN clients c ON c.id = q.client_id
             ORDER BY q.updated_at DESC LIMIT 5`),
    ]);
    res.json({
      quotesByStatus: quotes.rows,
      expensesThisMonth: expenses.rows[0].gross,
      clientCount: clients.rows[0].count,
      recentQuotes: recent.rows,
    });
  }),
);

export default router;
