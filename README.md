# GadaaSpace

GadaaSpace is a frontend educational spacecraft radiation simulator with a local Node API and MongoDB Atlas persistence.

## Start locally

1. Install dependencies with `npm install`.
2. Configure `.env` with `MONGODB_URI` and optionally `MONGODB_DB=gadaaspace` and `API_PORT=4173`. `.env` is ignored by Git; never place Atlas secrets in `VITE_*` variables.
3. Ensure the Atlas database user has the required database permissions and the current development machine is allowed by the Atlas network access list.
4. Run `npm run dev`. This starts the API on `127.0.0.1:4173` and Vite on its usual development port. Vite proxies `/api` requests to the local API.
5. Run `npm run build` to create the frontend production bundle.
6. For a local production-style run, start the API and built frontend together with `npm start` after building.

If setting up a new checkout, copy `.env.example` to `.env` and enter the Atlas connection URI locally. The supplied credentials are not included in source control or the browser bundle.

## Persistence

- Educational simulation history is stored in the `simulations` collection. Existing browser history is migrated on first connection when the Atlas collection is empty.
- Workspace controls and display preferences are saved in the `workspaces` collection.
- Imported CSV data stays in browser memory until a user explicitly selects **Save … to Atlas**. Saved datasets can be loaded and deleted in Dataset Explorer. Keep personal or sensitive measurements local unless you intend to upload them to your Atlas account.
- If Atlas is unavailable, the interface reports the database state and completed simulations continue to be saved in browser storage.

The API binds to loopback for local development and has no user authentication. Do not expose it directly to a network or deploy it publicly without adding authentication, authorization, request protections, and production configuration.

## Scientific scope

Simulation outputs are synthetic educational estimates, not validated radiation transport or operational spacecraft predictions. Health context is informational and is not a diagnosis or individual risk assessment.
