import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { BookOpen, Plus, X, ArrowLeft, Image as ImageIcon, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";

/**
 * Create a course.
 *
 * The first step of the course-first authoring flow: capture the identity of a course
 * (title, descriptions, objectives, banner) and create it, then land on the course page
 * where modules are added next.
 *
 * Praxis has no image generator yet, so each course gets a distinct AUTO-GENERATED banner:
 * a deterministic CSS gradient derived from the title. An author can override it with a real
 * banner image URL. A photorealistic AI-generated banner is planned.
 */

/** Cheap, stable string hash. Same title always yields the same banner. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic gradient + soft dot pattern derived from the title. */
function bannerStyle(title: string): React.CSSProperties {
  const seed = hashString(title || "Untitled course");
  const h1 = seed % 360;
  const h2 = (h1 + 40 + (seed >> 8) % 80) % 360;
  const angle = (seed >> 3) % 360;
  const c1 = `hsl(${h1} 70% 42%)`;
  const c2 = `hsl(${h2} 68% 32%)`;
  const dot = `hsla(${(h1 + 180) % 360} 80% 85% / 0.18)`;
  return {
    backgroundImage: `radial-gradient(circle at 20% 30%, ${dot} 0, transparent 40%), radial-gradient(circle at 80% 70%, ${dot} 0, transparent 45%), linear-gradient(${angle}deg, ${c1}, ${c2})`,
  };
}

export function CourseBuilder() {
  const [, navigate] = useLocation();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [catalogDescription, setCatalogDescription] = useState("");
  const [objectives, setObjectives] = useState<string[]>([]);
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const [bannerGen, setBannerGen] = useState(false);
  const [bannerErr, setBannerErr] = useState<string | null>(null);
  const [bannerAlt, setBannerAlt] = useState("");

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const style = useMemo(() => bannerStyle(title), [title]);
  const hasBannerImage = thumbnailUrl.trim().length > 0;

  const setObjectiveAt = (i: number, v: string) =>
    setObjectives((list) => list.map((o, idx) => (idx === i ? v : o)));
  const removeObjectiveAt = (i: number) =>
    setObjectives((list) => list.filter((_, idx) => idx !== i));
  const addObjective = () => setObjectives((list) => [...list, ""]);

  const generateBanner = async () => {
    if (!title.trim() && !description.trim()) {
      setBannerErr("Add a title or description first.");
      return;
    }
    setBannerGen(true);
    setBannerErr(null);
    try {
      const r = await apiFetch<{ thumbnailUrl: string; alt: string }>("/courses/generate-banner", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: description.trim() }),
      });
      setThumbnailUrl(r.thumbnailUrl);
      setBannerAlt(r.alt || "");
    } catch (e) {
      setBannerErr(e instanceof Error ? e.message : "Could not generate a banner.");
    } finally {
      setBannerGen(false);
    }
  };

  const generateObjectives = async () => {
    if (!title.trim() && !description.trim()) {
      setGenErr("Add a title or description first.");
      return;
    }
    setGenerating(true);
    setGenErr(null);
    try {
      const r = await apiFetch<{ catalogDescription: string; objectives: string[] }>(
        "/courses/generate-objectives",
        {
          method: "POST",
          body: JSON.stringify({ title: title.trim(), description: description.trim() }),
        },
      );
      if (!catalogDescription.trim() && r.catalogDescription) {
        setCatalogDescription(r.catalogDescription);
      }
      if (Array.isArray(r.objectives) && r.objectives.length > 0) {
        setObjectives(r.objectives);
      }
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : "Could not generate objectives.");
    } finally {
      setGenerating(false);
    }
  };

  const createCourse = async (withMaterials = false) => {
    if (!title.trim()) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const cleanObjectives = objectives.map((o) => o.trim()).filter(Boolean);
      const created = await apiFetch<{ id: string }>("/courses", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          catalogDescription: catalogDescription.trim() || undefined,
          objectives: cleanObjectives,
          thumbnailUrl: thumbnailUrl.trim() || undefined,
        }),
      });
      // withMaterials opens the "Build from content" upload panel on the course page.
      navigate(withMaterials ? `/courses/${created.id}?build=content` : `/courses/${created.id}`);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create the course.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-3xl">
      <PageHeader
        title="Create a course"
        icon={BookOpen}
        subtitle="Name the course and describe what it teaches. You will add modules on the next screen."
        action={
          <Button variant="ghost" className="gap-1.5" onClick={() => navigate("/courses")}>
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </Button>
        }
      />

      {/* Banner */}
      <div className="space-y-2">
        <div
          className="relative h-44 w-full overflow-hidden rounded-2xl border border-border shadow-sm"
          style={hasBannerImage ? undefined : style}
        >
          {hasBannerImage && (
            <img
              src={thumbnailUrl.trim()}
              alt={bannerAlt || `Banner for ${title.trim() || "this course"}`}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex items-end p-5">
            <h2 className="font-serif text-2xl font-semibold leading-tight text-white drop-shadow-sm line-clamp-2">
              {title.trim() || "Your course title"}
            </h2>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={bannerGen} onClick={generateBanner}>
            <ImageIcon className="h-4 w-4" />
            {bannerGen ? "Generating banner..." : "Generate a photorealistic banner"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Generated from the course description. Or paste your own image URL below. Falls back to a themed banner.
          </p>
        </div>
        {bannerErr && <p className="text-xs text-rose-600">{bannerErr}</p>}
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course details</CardTitle>
          <CardDescription>These appear on the course page and catalogue cards.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="cb-title">Course title</Label>
            <Input
              id="cb-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Customer Service Excellence"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cb-desc">Course description</Label>
            <Textarea
              id="cb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="The full description: what the course covers, who it is for, and what learners can do by the end."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cb-catalog">Catalogue description</Label>
            <Textarea
              id="cb-catalog"
              value={catalogDescription}
              onChange={(e) => setCatalogDescription(e.target.value)}
              rows={2}
              placeholder="A short blurb shown on catalogue cards."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cb-banner">Banner image URL (optional)</Label>
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                id="cb-banner"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use the auto-generated banner above.</p>
          </div>
        </CardContent>
      </Card>

      {/* Objectives */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Course learning objectives</CardTitle>
              <CardDescription>What a learner can do after completing the course.</CardDescription>
            </div>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={generating}
              onClick={generateObjectives}
            >
              {generating ? "Generating..." : "Generate objectives from the description"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {genErr && <p className="text-xs text-rose-600">{genErr}</p>}

          {objectives.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              No objectives yet. Add them by hand or generate from the description.
            </div>
          ) : (
            <ul className="space-y-2">
              {objectives.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                  <Textarea
                    value={o}
                    onChange={(e) => setObjectiveAt(i, e.target.value)}
                    rows={1}
                    placeholder={`Objective ${i + 1}`}
                    className="min-h-0 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-rose-600"
                    title="Remove objective"
                    onClick={() => removeObjectiveAt(i)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button variant="outline" size="sm" className="gap-1.5" onClick={addObjective}>
            <Plus className="h-4 w-4" /> Add objective
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {createErr && <p className="text-sm text-rose-600">{createErr}</p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={() => navigate("/courses")}>
            Cancel
          </Button>
          <Button variant="outline" disabled={!title.trim() || creating} onClick={() => createCourse(false)}>
            {creating ? "Creating..." : "Create empty course"}
          </Button>
          <Button className="gap-1.5" disabled={!title.trim() || creating} onClick={() => createCourse(true)}>
            <Upload className="h-4 w-4" /> {creating ? "Creating..." : "Create and add materials"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CourseBuilder;
