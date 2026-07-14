export function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold font-serif text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground text-lg">This page could not be found.</p>
        <a
          href="/"
          className="mt-6 inline-block text-sm text-primary font-medium underline underline-offset-4"
        >
          Return to home
        </a>
      </div>
    </div>
  );
}

export default NotFound;
