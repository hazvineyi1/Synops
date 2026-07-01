import { useEffect, useState } from "react";

const MESSAGES = [
  "Drafting the lesson outline.",
  "Considering common misconceptions.",
  "Differentiating for support, core, and stretch.",
  "Polishing the wording.",
  "Almost there.",
];

export function GeneratingSpinner({ label = "Generating" }: { label?: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % MESSAGES.length), 2400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="relative h-12 w-12 mb-6">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
      <p className="font-serif text-2xl text-primary mb-2">{label}</p>
      <p className="text-sm text-muted-foreground">{MESSAGES[idx]}</p>
    </div>
  );
}

export function InlineSpinner() {
  return (
    <div className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
  );
}
