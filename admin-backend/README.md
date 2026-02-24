# Admin Backend

Standalone admin API service for MarketHub. It connects to the same MySQL database used by the main marketplace backend.

## Setup

1. Copy `.env.example` to `.env`.
2. Set DB connection values to the shared database.
3. Install dependencies:
   - `npm install`
4. Run service:
   - `npm run dev`

Default port: `5001`

## Notes

- Configure `BACKEND_BASE_URL` to the public base URL for this service (used when returning uploaded image URLs).
- For production, set `DEV_ALLOW_SELF_ADMIN=false`.
- Point `admin-frontend` `VITE_API_URL` to this service URL.
