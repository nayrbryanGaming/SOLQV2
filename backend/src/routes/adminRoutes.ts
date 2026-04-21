import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { paymentIntents } from '../services/store';

const router = Router();

function safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
    const adminUser = process.env.ADMIN_DASH_USER;
    const adminPass = process.env.ADMIN_DASH_PASS;

    // If credentials are not configured, keep dashboard open for local MVP usage.
    if (!adminUser || !adminPass) return next();

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="SOLQ Admin"');
        return res.status(401).json({ error: 'Admin authentication required' });
    }

    const raw = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
    const [username = '', password = ''] = raw.split(':');

    if (!safeEqual(username, adminUser) || !safeEqual(password, adminPass)) {
        res.setHeader('WWW-Authenticate', 'Basic realm="SOLQ Admin"');
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    next();
}

function listLatest(limit = 100) {
    return Object.values(paymentIntents)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((intent) => ({
            id: intent.id,
            status: intent.status,
            merchant: intent.merchant?.name || 'UNKNOWN',
            amountIdr: intent.amount_details?.fiat_amount ?? 0,
            txHash: intent.txHash || null,
            createdAt: intent.createdAt,
            updatedAt: intent.updatedAt,
        }));
}

router.use(requireAdminAuth);

router.get('/payment-intents', (req: Request, res: Response) => {
    const rawLimit = Number(req.query.limit || 100);
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    res.json({ count: Object.keys(paymentIntents).length, items: listLatest(limit) });
});

router.get('/stats', (_req: Request, res: Response) => {
    const intents = Object.values(paymentIntents);
    const byStatus = intents.reduce<Record<string, number>>((acc, intent) => {
        acc[intent.status] = (acc[intent.status] || 0) + 1;
        return acc;
    }, {});

    res.json({
        total: intents.length,
        byStatus,
    });
});

router.get('/', (_req: Request, res: Response) => {
    const rows = listLatest(100)
        .map(
            (item) => `
      <tr>
        <td>${item.id}</td>
        <td>${item.status}</td>
        <td>${item.merchant}</td>
        <td>${Number(item.amountIdr).toLocaleString('id-ID')}</td>
        <td>${item.txHash ? `${item.txHash.slice(0, 8)}...${item.txHash.slice(-8)}` : '-'}</td>
        <td>${new Date(item.createdAt).toLocaleString('id-ID')}</td>
      </tr>`
        )
        .join('');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SOLQ Admin</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #0f1115; color: #f5f6f7; }
    header { padding: 16px 20px; border-bottom: 1px solid #22252c; }
    h1 { margin: 0; font-size: 18px; letter-spacing: 0.5px; }
    main { padding: 20px; }
    .muted { color: #9aa2b1; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #22252c; text-align: left; padding: 10px; }
    th { color: #9aa2b1; font-weight: 600; }
    tr:hover { background: #161a21; }
    .chip { display: inline-block; padding: 4px 8px; border-radius: 999px; background: #19202a; color: #6de58b; }
  </style>
</head>
<body>
  <header>
    <h1>SOLQ Provider Dashboard</h1>
  </header>
  <main>
    <p class="muted">Live payment intents (in-memory MVP store). Auto-refresh every 15 seconds.</p>
    <p><span class="chip">Endpoint JSON: /v1/admin/payment-intents</span></p>
    <table>
      <thead>
        <tr>
          <th>Intent ID</th>
          <th>Status</th>
          <th>Merchant</th>
          <th>Amount (IDR)</th>
          <th>Tx Hash</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6">No data yet</td></tr>'}</tbody>
    </table>
  </main>
  <script>
    setTimeout(() => location.reload(), 15000);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
});

export { router as adminRoutes };
