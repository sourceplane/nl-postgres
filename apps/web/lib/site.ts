// The product's name, written once: the page's <title> and its header read
// it. A product built from this repository gets it rewritten to its own name
// at instantiation, so keep it literal and on one line. Upstream wrote it
// inline: "Natural Language Postgres" in app/layout.tsx's metadata and
// "Natural Language PostgreSQL" in components/header.tsx.
export const SITE_NAME = "Natural Language Postgres";

// This product's own source repository: the header's link, where upstream had
// its "Deploy with Vercel" button.
export const SOURCE_URL = "https://github.com/sourceplane/nl-postgres";

// The public origin the page's absolute links (the Open Graph image) resolve
// against: NEXT_PUBLIC_SITE_URL, which the deploy's build sets to the
// environment's own Worker URL (component.yaml). Upstream hard-coded its own
// demo's origin on Vercel.
export function siteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
}
