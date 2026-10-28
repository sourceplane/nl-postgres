import { Info } from "lucide-react";
import { SourceLink } from "./source-link";
import { Alert, AlertDescription } from "./ui/alert";
import Link from "next/link";

export const ProjectInfo = () => {
  return (
    <div className="bg-muted p-4 mt-auto">
      <Alert className="bg-muted text-muted-foreground border-0">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription>
          This application uses the{" "}
          <Link
            target="_blank"
            className="text-primary hover:text-primary/90 underline"
            href="https://sdk.vercel.ai"
          >
            AI SDK
          </Link>{" "}
          to allow you to query a PostgreSQL database with natural language. It
          starts with sample data &mdash; sixty fictional companies &mdash; in
          the shape of CB Insights&apos; list of all unicorn companies, which
          its README says how to load. Learn more at{" "}
          <Link
            href="https://www.cbinsights.com/research-unicorn-companies"
            target="_blank"
            className="text-primary hover:text-primary/90 underline"
          >
            CB Insights
          </Link>
          .
          <div className="mt-4 sm:hidden">
            <SourceLink />
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
};
