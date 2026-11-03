# Verity documentation

The documentation site: a static Next.js app whose pages are the Markdown under `content/`. It moved here from the
website repository's `apps/docs` (its `/` routes) and runs from the `docs` branch until it lands on `main`.

- `content/`: one Markdown file per page, at `content/<href>.md`.
- `lib/tree.ts`: which pages exist, the sidebar, breadcrumbs and previous/next order. A new page needs an entry here;
  an entry without a Markdown file renders as a placeholder from its `description`.
- `data/`: snapshots the pages draw from (Programs, serving runs, Boolean lowerings, the assumption index). They were
  copied from Verity's own output and will be read from this tree directly.
- `app/(docs)/`: the page route, the assumptions page and the census data routes the graphs fetch, all at the root.
- `components/`, `lib/`: rendering.

~~~sh
cd docs
npm install
npm run dev        # http://localhost:3001
npm run build      # what Vercel runs; every page is prerendered
~~~

Vercel's `verity-docs` project serves https://docs.compute-verification.org and deploys each push to its production
branch, `docs`. Preview deployments are off, so pushes to other branches build nothing.
