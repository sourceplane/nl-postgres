import { SOURCE_URL } from "@/lib/site";

// Where upstream had its "Deploy with Vercel" button (components/deploy-button.tsx):
// this product's own source repository.
export const SourceLink = () => (
  <a
    href={SOURCE_URL}
    target="_blank"
    rel="noreferrer"
    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
  >
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/github.svg" alt="" className="h-5 w-5 dark:invert" />
    <span>Source</span>
  </a>
);
