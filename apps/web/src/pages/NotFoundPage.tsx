import { Link } from "react-router";
import { Compass } from "lucide-react";
import { Button } from "../components/ui/button";

export function NotFoundPage() {
  return (
    <div className="py-10 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Compass aria-hidden className="size-8" />
      </span>
      <h1 className="mt-5 text-[1.875rem] font-bold outline-none">We couldn't find that page</h1>
      <p className="mt-3 text-muted">This page doesn't exist.</p>
      <Button asChild size="lg" className="mt-6">
        <Link to="/">Go to Home</Link>
      </Button>
    </div>
  );
}
