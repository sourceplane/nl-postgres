// The template's `.eslintrc.json` (`extends: next/core-web-vitals`, run through
// `next lint`) has no Next 16 equivalent — `next lint` is gone and
// eslint-config-next 16 ships flat configs — so this is the same rule set as a
// flat config, and the `lint` script is `eslint .`. A plain array, because the
// template's ESLint (9.16) predates `defineConfig`.
import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    // components/dynamic-chart.tsx reassigns its `chartData` prop to the
    // parsed rows (`chartData = parsedChartData`), the pattern this React
    // Compiler rule, new in eslint-config-next 16, flags; the template is kept
    // as written.
    rules: { "react-hooks/immutability": "off" },
  },
  { ignores: [".next/**", ".open-next/**", "next-env.d.ts", "cloudflare-env.d.ts"] },
];

export default config;
