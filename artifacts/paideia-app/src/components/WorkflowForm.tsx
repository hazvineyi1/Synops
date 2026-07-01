import { type ReactNode } from "react";

export function WorkflowForm({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      <header className="mb-8">
        <h1 className="font-serif text-4xl text-primary mb-2">{title}</h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </header>
      <div className="bg-card border rounded-lg p-8">{children}</div>
    </div>
  );
}
