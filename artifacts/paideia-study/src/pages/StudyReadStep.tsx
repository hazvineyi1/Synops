import { useLocation, useParams } from "wouter";
import { useStudyPath, useCompletePathStep } from "@/hooks/use-study-journey";
import { useListStudyConcepts, customFetch } from "@workspace/paideia-api-client";
import { notifyError } from "@/lib/notify";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Image as ImageIcon, Loader2, Sparkles } from "lucide-react";
import StudyNav from "@/components/StudyNav";
import { useMemo, useState } from "react";

// Strict allowlist SVG sanitizer. AI-generated SVG is untrusted input; we cannot rely on
// regex stripping (event handlers can be unquoted, dangerous tags can be obfuscated). Instead
// we parse the markup with the browser's XML parser and rebuild a clean tree keeping only
// known-safe SVG elements and attributes. Anything else is dropped.
const ALLOWED_TAGS = new Set([
  "svg", "g", "defs", "title", "desc",
  "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop",
  "marker", "symbol", "use", "pattern", "clipPath", "mask",
]);
const ALLOWED_ATTRS = new Set([
  "viewBox", "xmlns", "width", "height", "preserveAspectRatio",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform",
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "fill-opacity", "stroke-opacity", "opacity",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "dy", "dx",
  "offset", "stop-color", "stop-opacity",
  "id", "class", "style",
  "gradientUnits", "gradientTransform", "spreadMethod",
  "patternUnits", "patternTransform",
  "marker-start", "marker-mid", "marker-end", "markerWidth", "markerHeight", "refX", "refY", "orient",
  "clip-path", "mask", "fill-rule", "clip-rule",
]);
// `style` is allowed but we additionally scrub url(), expression(), and javascript: out of its value.
function scrubStyle(v: string): string | null {
  if (/url\s*\(|expression\s*\(|javascript:|@import/i.test(v)) return null;
  return v;
}

function sanitizeSvg(raw: string): string | null {
  if (typeof window === "undefined" || !window.DOMParser) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg" || root.getElementsByTagName("parsererror").length > 0) {
    return null;
  }

  const walk = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return false;

    // Filter attributes
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name;
      // Drop anything namespaced (xlink:*, etc.) and anything not in the allowlist.
      if (name.includes(":") || !ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(name);
        continue;
      }
      const val = attr.value;
      if (/javascript:|data:text\/html/i.test(val)) {
        el.removeAttribute(name);
        continue;
      }
      if (name === "style") {
        const scrubbed = scrubStyle(val);
        if (scrubbed === null) el.removeAttribute(name);
        else el.setAttribute(name, scrubbed);
      }
    }

    // Recurse, removing any child the walker rejects.
    for (const child of Array.from(el.children)) {
      if (!walk(child)) el.removeChild(child);
    }
    return true;
  };

  if (!walk(root)) return null;
  return new XMLSerializer().serializeToString(root);
}

export default function StudyReadStep() {
  const { pathId, stepId } = useParams<{ pathId: string; stepId: string }>();
  const [, setLoc] = useLocation();
  const { data: pathData, isLoading: pathLoading } = useStudyPath(pathId);
  const completeStep = useCompletePathStep();
  const [completing, setCompleting] = useState(false);

  const step = pathData?.steps?.find((s: any) => s.id === stepId) ?? null;
  const materialId = step?.contentRef ?? null;
  const conceptId = step?.conceptId ?? null;
  const { data: concepts, isLoading: conceptsLoading } = useListStudyConcepts(materialId ?? undefined);

  const concept = concepts?.find((c: any) => c.id === conceptId) ?? null;
  const qc = useQueryClient();
  const [generatingVisual, setGeneratingVisual] = useState(false);
  const [visualError, setVisualError] = useState<string | null>(null);
  const [localVisualSvg, setLocalVisualSvg] = useState<string | null>(null);
  const visualSvg = localVisualSvg ?? concept?.visualSvg ?? null;
  const safeSvg = useMemo(() => (visualSvg ? sanitizeSvg(visualSvg) : null), [visualSvg]);

  const generateVisual = async () => {
    if (!materialId || !conceptId) return;
    setVisualError(null);
    setGeneratingVisual(true);
    try {
      const res = await customFetch<{ visualSvg: string }>(
        `/api/study/materials/${materialId}/concepts/${conceptId}/visual`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      setLocalVisualSvg(res.visualSvg);
      qc.invalidateQueries({ queryKey: ["/api/study/materials", materialId, "concepts"] });
    } catch (err: any) {
      setVisualError(err?.data?.error || err?.message || "Couldn't generate a diagram.");
    } finally {
      setGeneratingVisual(false);
    }
  };

  // Position in path so the learner sees "Step X of Y"
  const stepIndex = pathData?.steps?.findIndex((s: any) => s.id === stepId) ?? -1;
  const totalSteps = pathData?.steps?.length ?? 0;

  const onContinue = async () => {
    if (!pathId || !stepId) return;
    setCompleting(true);
    try {
      await completeStep.mutateAsync({ pathId, stepId, masteryScore: 1 });
      // Back to today (the coach home), daily-session query is invalidated by the mutation
      setLoc("/coach");
    } catch {
      setCompleting(false);
      notifyError(undefined, "Couldn't mark this step complete. Please try again.");
    }
  };

  const loading = pathLoading || conceptsLoading;

  return (
    <div className="min-h-screen bg-gray-50">
      <StudyNav />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <button
          onClick={() => setLoc("/coach")}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to today
        </button>

        {loading ? (
          <Card>
            <CardContent className="p-8 flex items-center justify-center text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading your reading…
            </CardContent>
          </Card>
        ) : !step ? (
          <Card>
            <CardContent className="p-8 text-center text-gray-700">
              <p className="font-semibold mb-2">We couldn't find this step.</p>
              <p className="text-sm text-gray-500 mb-4">It may have been completed or removed.</p>
              <Button onClick={() => setLoc("/coach")}>Back to today</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-blue-700 font-semibold">
                <Sparkles className="w-4 h-4" /> AI-led step
              </div>
              {totalSteps > 0 && stepIndex >= 0 && (
                <div className="text-xs text-gray-500">
                  Step {stepIndex + 1} of {totalSteps}
                </div>
              )}
            </div>

            <Card className="mb-4">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Read & Understand</div>
                    <div className="font-semibold text-gray-900">
                      {concept?.title ?? step.title.replace(/^Read & Understand:\s*/i, "")}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3.5 h-3.5" />
                    {step.estimatedMinutes}m
                  </div>
                </div>

                {concept?.difficulty && (
                  <Badge variant="secondary" className="mb-3">{concept.difficulty}</Badge>
                )}

                <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed">
                  {concept ? (
                    <p className="whitespace-pre-wrap">{concept.explanation}</p>
                  ) : (
                    <p className="text-gray-500 italic">
                      This step's concept content isn't available, you can still mark it read and continue.
                    </p>
                  )}
                </div>

                {/* Dual-coding: per-concept diagram. Generated on demand and cached on the concept row. */}
                {concept && (
                  <div className="mt-5 border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                        <ImageIcon className="w-3.5 h-3.5" /> Visual
                      </div>
                      {visualSvg && (
                        <button
                          onClick={generateVisual}
                          disabled={generatingVisual}
                          className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {generatingVisual ? "Regenerating…" : "Regenerate"}
                        </button>
                      )}
                    </div>
                    {safeSvg ? (
                      <div
                        className="rounded-lg border bg-white p-2 [&>svg]:w-full [&>svg]:h-auto"
                        dangerouslySetInnerHTML={{ __html: safeSvg }}
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
                        <p className="text-xs text-gray-500 mb-2">
                          A diagram can make this concept stick faster.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={generateVisual}
                          disabled={generatingVisual}
                        >
                          {generatingVisual ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Drawing…</>
                          ) : (
                            <><ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Generate diagram</>
                          )}
                        </Button>
                        {visualError && (
                          <p className="text-xs text-red-600 mt-2">{visualError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {Array.isArray(concept?.keyTerms) && concept!.keyTerms.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">Key terms</div>
                    <div className="flex flex-wrap gap-2">
                      {concept!.keyTerms.map((t: string) => (
                        <Badge key={t} variant="outline">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              size="lg"
              className="w-full"
              disabled={completing}
              onClick={onContinue}
            >
              {completing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Marking complete…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Mark read & continue</>
              )}
            </Button>

            <p className="text-xs text-center text-gray-500 mt-3">
              Your AI coach will queue the next step (recall, practice, or mastery check) automatically.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
