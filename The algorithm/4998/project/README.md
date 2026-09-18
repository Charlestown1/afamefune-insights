# The Algorithm v1.0.0

Production-oriented crypto/forex intelligence platform foundation. The application deliberately refuses to fabricate live market data: provider-dependent screens show unavailable/configuration states when credentials are absent.

## Run
Requires Node 20+.

```bash
cp .env.example .env
npm install
npm test
npm start
```

## Production configuration
Set `MONGODB_URI`, a strong `JWT_SECRET` (32+ chars), and the provider keys you actually use. Never commit `.env`. `ADMIN_EMAIL` is the support/admin identity; set `ADMIN_PASSWORD` only in the deployment environment and rotate it after provisioning.

## Real-data behavior
- Twelve Data is used for scanner candles/quotes when `TWELVE_DATA_API_KEY` is configured.
- Gemini research is disabled until `GEMINI_API_KEY` is configured and its JSON response passes validation.
- Economic calendar storage is provider-backed; no fabricated events are inserted.
- Track-record metrics are calculated only from persisted SignalResult records.
- Published signal entry/stop/targets/direction are immutable through the public admin update route.
- Portfolio transactions are ownership-scoped and oversells are rejected.

## Deployment (Render)
Build: `npm install`  Start: `npm start`. Add all secrets through Render environment variables. Use MongoDB Atlas for persistent database storage.

## Important
This release contains working production foundations and intentionally does not claim that optional third-party integrations are live without their credentials/configuration. Before accepting subscriptions or publishing paid signals, complete provider credentials, payment/webhook implementation, legal/compliance review, external security review, and end-to-end production smoke tests.
