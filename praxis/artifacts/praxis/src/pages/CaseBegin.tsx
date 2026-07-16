import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import { casesApi, LANGUAGES } from "@/lib/casesApi";
import { ArrowLeft, Play } from "lucide-react";

/**
 * Pre-start screen for the authenticated flow: the learner confirms their name and picks a
 * language before the Socratic exercise begins. The chosen language then carries through to
 * the fact pattern and the tutor's opening. (The public embed has its own equivalent gate.)
 */
export function CaseBegin({ params }: { params?: { caseId?: string } }) {
  const caseId = params?.caseId ?? "";
  const { user } = useSession();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery({ queryKey: ["case", caseId], queryFn: () => casesApi.get(caseId), enabled: !!caseId });

  const [name, setName] = useState("");
  const [lang, setLang] = useState("en");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (user && !name) setName([user.firstName, user.lastName].filter(Boolean).join(" ").trim());
  }, [user]);
  useEffect(() => { if (data?.language) setLang(data.language); }, [data?.language]);

  const begin = async () => {
    setStarting(true);
    try {
      const s = await casesApi.startSession(caseId, { learnerName: name.trim() || undefined, language: lang });
      navigate(`/case-run/${s.id}`);
    } catch (e) {
      toast({ title: "Could not start", description: e instanceof Error ? e.message : "", variant: "destructive" });
      setStarting(false);
    }
  };

  if (isLoading || !data) {
    return <div className="min-h-screen p-6" style={{ background: "hsl(43 30% 97%)" }}><Skeleton className="h-8 w-64 mb-4" /><Skeleton className="h-80 rounded-xl" /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(43 30% 97%)" }}>
      <div className="max-w-lg w-full rounded-xl bg-white border p-8 space-y-4">
        <Link href="/cases"><Button variant="ghost" size="sm" className="-ml-2"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{data.difficulty} case</p>
          <h1 className="text-2xl font-serif font-bold">{data.title}</h1>
        </div>
        {data.learningObjective && <p className="text-sm text-muted-foreground">{data.learningObjective}</p>}
        <div className="rounded-lg bg-muted/40 border p-4 text-sm whitespace-pre-wrap max-h-48 overflow-auto">{data.contextBlock}</div>
        <p className="text-xs text-muted-foreground">A coach will guide you with questions, there are no lectures. Reason out loud; you'll get an analysis at the end.</p>

        <label className="block text-sm">
          <span className="text-muted-foreground text-xs">Your name</span>
          <input className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground text-xs">Language</span>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          {lang !== data.language && <span className="text-[11px] text-muted-foreground">The situation and the coach will be in {LANGUAGES.find((l) => l.code === lang)?.name}.</span>}
        </label>

        <Button className="w-full" onClick={begin} disabled={starting}><Play className="h-4 w-4 mr-2" />{starting ? "Starting…" : "Begin the case"}</Button>
      </div>
    </div>
  );
}
