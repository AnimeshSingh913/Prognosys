import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-6xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">
          Oops! The page you’re looking for doesn’t exist.
        </p>

        <Link
          to="/"
          className="inline-block rounded-lg bg-primary px-6 py-2 text-primary-foreground font-medium hover:bg-primary/90 transition"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
