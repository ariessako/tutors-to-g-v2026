# Tutors To Go

A tutor-matching platform for Filipino learners. Students, tutors and parents fill in a profile (hobbies, learning style, personality, subjects, free time, grade level), and k-means clustering groups each student with the licensed tutors closest to them. Built from the "Tutors To Go v2" Claude Design project.

## Running it

Requires Node 22 or newer.

```sh
npm install
npm run dev        # API on :3001 and the web app on http://localhost:5173
```

On first start the server creates `data/ttg.db` (SQLite) and loads demo data. The login page lists the demo accounts; every password is `demo123`.

| Account | Email |
|---|---|
| Student | bea@student.ph |
| Tutor | paolo.reyes@tutor.ph |
| Tutor applicant | jen@tutor.ph |
| Parent | liza@parent.ph |
| Admin | admin@tutorstogo.ph |

Other scripts:

```sh
npm run build      # web → web/dist, server → dist/server.js
npm start          # production server on :3001, serving the built web app
npm run seed       # reset the database to the demo data
npm test           # matching engine and API tests (Vitest)
npm run typecheck
npm run db:generate  # new migration after editing server/db/schema.ts
```

Environment variables: `PORT` (default 3001), `TTG_DATA` (data directory, default `./data`), `TTG_DB`, `TTG_UPLOADS`, and `TTG_DEMO=0` to turn off demo mode. Demo mode shows the demo accounts and a "Reset demo data" button on the login page, so turn it off for real use.

## How it's built

- `shared/`: code used by both sides. `matching.ts` is the matching engine: feature encoding, seeded k-means (k-means++ or random start), PCA for the 2D plot, cluster summaries and match scores (`1 − d² ÷ d²max`). The server runs it to rank matches, and the K-means lab page runs the same code in the browser, so both always agree.
- `server/`: Express 5 JSON API under `/api`, SQLite through Drizzle ORM (`server/db/schema.ts`, migrations applied at startup). Passwords are hashed with scrypt; logins use an httpOnly session cookie. Every route checks the caller's role, and ownership where it applies. Uploads (tutor documents, payment receipts) are PDFs or images up to 10 MB, stored in `data/uploads/` and downloadable only by the uploader and admins.
- `web/`: React 19 + Vite, React Router, TanStack Query. Styles in `web/src/styles/` reproduce the design's tokens (light and dark) and components.

## Roles

- **Students** see their cluster and ranked matches, request sessions from a tutor's open weekly slots, pay by PayPal and upload the receipt, rate completed sessions (optionally anonymously) and join study groups.
- **Tutors** apply by uploading their PRC license, PSA birth certificate, transcript and a demo video link. Once an admin approves them they enter the matching pool and can manage requests, their weekly schedule, reviews and groups.
- **Parents** link to their child's account at sign-up, follow the child's sessions and review the child's tutors.
- **Admins** review applications, verify payment receipts, moderate reviews, manage the tutor store and accounts, and set the live matching model (k, seed, start method, joint or tutor-only clustering) from the K-means lab.

## Differences from the design

- Payments stay manual, as in the design: the student pays through PayPal outside the app and uploads the receipt with its transaction ID. The design's simulated in-app "PayPal checkout" step is replaced by a link to PayPal, since the app doesn't process payments.
- In the K-means lab, other students appear as "Student 1", "Student 2" and so on for everyone except admins. Only admins' control changes update the live model; for everyone else the controls are a local preview. "Add a student" in the lab adds a hypothetical student to that page only and saves nothing.
- Anonymous reviews never send the author to the browser unless the viewer is an admin.
- When an admin adds a tutor directly, the app generates a temporary password and shows it once so the admin can pass it on.
- The design's alternative layouts (list-style matches, tabbed tutor profiles, article-style lab) aren't built; the app uses the design's default layouts.
