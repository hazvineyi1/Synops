import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  useStudyKnowledgeGraph,
  useStudyKnowledgeGenerate,
  type KnowledgeNode,
} from "@/hooks/use-study-api";
import { useListStudyMaterials } from "@workspace/paideia-api-client";
import StudyNav from "@/components/StudyNav";
import {
  Network, Brain, ZoomIn, ZoomOut, Maximize2,
  Target, BookOpen, Search, Plus, Loader2, MessageCircle, Sparkles, X,
} from "lucide-react";

const CAT_PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6",
  "#14b8a6", "#ef4444", "#3b82f6", "#22c55e", "#f97316",
];

function masteryColor(m: number) {
  if (m >= 0.8) return "#10b981";
  if (m >= 0.6) return "#3b82f6";
  if (m >= 0.4) return "#f59e0b";
  return "#ef4444";
}

// Deterministic categorical layout: one cluster per category arranged around
// the canvas center, nodes within a cluster placed via sunflower spiral so
// they are evenly distributed without overlap or randomness.
function useLayout(nodes: KnowledgeNode[]) {
  return useMemo(() => {
    const W = 1000, H = 700, CX = W / 2, CY = H / 2;
    const byCat = new Map<string, KnowledgeNode[]>();
    for (const n of nodes) {
      const k = n.category || "General";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(n);
    }
    const cats = [...byCat.keys()];
    const positions = new Map<string, { x: number; y: number; cluster: string }>();

    if (cats.length <= 1) {
      const items = byCat.get(cats[0] ?? "General") ?? [];
      const r = Math.min(W, H) * 0.34;
      const phi = Math.PI * (3 - Math.sqrt(5));
      items.forEach((n, j) => {
        const dist = items.length === 1 ? 0 : r * Math.sqrt((j + 0.5) / items.length);
        const a = phi * j;
        positions.set(n.id, { x: CX + Math.cos(a) * dist, y: CY + Math.sin(a) * dist, cluster: cats[0] ?? "General" });
      });
      return { positions, W, H };
    }

    const clusterRadius = Math.min(W, H) * 0.32;
    cats.forEach((cat, i) => {
      const angle = (i / cats.length) * Math.PI * 2 - Math.PI / 2;
      const ccx = CX + Math.cos(angle) * clusterRadius;
      const ccy = CY + Math.sin(angle) * clusterRadius;
      const items = byCat.get(cat)!;
      const localR = 24 + Math.sqrt(items.length) * 18;
      const phi = Math.PI * (3 - Math.sqrt(5));
      items.forEach((n, j) => {
        const dist = items.length === 1 ? 0 : localR * Math.sqrt((j + 0.5) / items.length);
        const a = phi * j;
        positions.set(n.id, { x: ccx + Math.cos(a) * dist, y: ccy + Math.sin(a) * dist, cluster: cat });
      });
    });
    return { positions, W, H };
  }, [nodes]);
}

export default function StudyKnowledgeMap() {
  const [, setLoc] = useLocation();
  const { data: kgraph, isLoading: graphLoading, refetch } = useStudyKnowledgeGraph();
  const generateMutation = useStudyKnowledgeGenerate();
  const { data: materials } = useListStudyMaterials();

  const [scale, setScale] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const nodes = kgraph?.nodes ?? [];
  const edges = kgraph?.edges ?? [];
  const { positions, W, H } = useLayout(nodes);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) {
      const k = n.category || "General";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  const catColor = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach(([cat], i) => m.set(cat, CAT_PALETTE[i % CAT_PALETTE.length]));
    return m;
  }, [categories]);

  const q = searchQuery.trim().toLowerCase();
  const matchesFilter = (n: KnowledgeNode) => {
    if (categoryFilter && (n.category || "General") !== categoryFilter) return false;
    if (q && !n.label.toLowerCase().includes(q)) return false;
    return true;
  };

  const avgMastery = nodes.length > 0 ? Math.round((nodes.reduce((s, n) => s + (n.masteryLevel || 0), 0) / nodes.length) * 100) : 0;
  const masteredCount = nodes.filter((n) => (n.masteryLevel || 0) >= 0.8).length;
  const weakCount = nodes.filter((n) => (n.masteryLevel || 0) < 0.5).length;

  const handleGenerate = async (materialId: string) => {
    setGeneratingFor(materialId);
    try {
      await generateMutation.mutateAsync({ materialId });
      await refetch();
    } catch {
      alert("Couldn't generate the knowledge map. Please try again.");
    } finally {
      setGeneratingFor(null);
    }
  };

  // Render edges as gentle curves so dense areas read better
  const edgePaths = useMemo(() => {
    return edges
      .map((e) => {
        const a = positions.get(e.sourceNodeId);
        const b = positions.get(e.targetNodeId);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y;
        const offset = (a.cluster === b.cluster ? 0.08 : 0.18) * Math.sqrt(dx * dx + dy * dy);
        // perpendicular control point
        const px = mx + (-dy / (Math.hypot(dx, dy) || 1)) * offset;
        const py = my + (dx / (Math.hypot(dx, dy) || 1)) * offset;
        return { ...e, a, b, d: `M${a.x},${a.y} Q${px},${py} ${b.x},${b.y}` };
      })
      .filter(Boolean) as Array<{ id: string; sourceNodeId: string; targetNodeId: string; relationType: string; a: { x: number; y: number }; b: { x: number; y: number }; d: string }>;
  }, [edges, positions]);

  const fitView = () => setScale(1);
  const zoomIn = () => setScale((s) => Math.min(2.4, s * 1.2));
  const zoomOut = () => setScale((s) => Math.max(0.5, s / 1.2));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <StudyNav />

      <div className="max-w-5xl w-full mx-auto px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-xs uppercase tracking-wider text-blue-700 font-semibold">AI knowledge map</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">What you know, at a glance</h1>
        <p className="text-sm text-gray-600">
          Concepts are grouped by area, sized by review count, and colored by your current mastery.
        </p>
      </div>

      {/* Stats strip */}
      <div className="max-w-5xl w-full mx-auto px-4 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Concepts</div>
          <div className="text-xl font-bold text-gray-900 flex items-center gap-1.5"><Brain className="w-4 h-4 text-blue-600" />{nodes.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Mastered</div>
          <div className="text-xl font-bold text-emerald-600 flex items-center gap-1.5"><Target className="w-4 h-4" />{masteredCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Weak areas</div>
          <div className="text-xl font-bold text-orange-600 flex items-center gap-1.5"><BookOpen className="w-4 h-4" />{weakCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500">Avg mastery</div>
          <div className="flex items-center gap-2"><span className="text-xl font-bold text-gray-900">{avgMastery}%</span><Progress value={avgMastery} className="h-1.5 flex-1" /></div>
        </CardContent></Card>
      </div>

      {/* Controls */}
      {nodes.length > 0 && (
        <div className="max-w-5xl w-full mx-auto px-4 mb-3 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search concepts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${!categoryFilter ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
            >
              All
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-colors ${categoryFilter === cat ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: catColor.get(cat) }} />
                <span className="truncate max-w-[140px]">{cat}</span>
                <span className="opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Canvas */}
      <div className="max-w-5xl w-full mx-auto px-4 pb-6 flex-1">
        <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm" style={{ minHeight: 480 }}>
          {graphLoading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <Network className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">No map yet</h3>
              <p className="text-sm text-gray-500 max-w-sm mb-4">
                Pick a material, the AI will extract concepts and lay out how they connect.
              </p>
              {materials && materials.length > 0 ? (
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {materials.map((m) => (
                    <Button
                      key={m.id}
                      variant="outline"
                      onClick={() => handleGenerate(m.id)}
                      disabled={generatingFor === m.id}
                      className="justify-between"
                    >
                      <span className="truncate">{m.title}</span>
                      {generatingFor === m.id ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Plus className="w-4 h-4 shrink-0" />}
                    </Button>
                  ))}
                </div>
              ) : (
                <Button onClick={() => setLoc("/materials/new")}>
                  <Plus className="w-4 h-4 mr-2" /> Add a material
                </Button>
              )}
            </div>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-[60vh] sm:h-[72vh] block select-none"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopOpacity="0.35" />
                    <stop offset="100%" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <g style={{ transform: `scale(${scale})`, transformOrigin: "50% 50%" }}>
                  {/* edges */}
                  <g fill="none" strokeLinecap="round">
                    {edgePaths.map((e) => {
                      const highlighted = selectedNode && (e.sourceNodeId === selectedNode.id || e.targetNodeId === selectedNode.id);
                      const dim = selectedNode && !highlighted;
                      return (
                        <path
                          key={e.id}
                          d={e.d}
                          stroke={highlighted ? "#0f172a" : "#cbd5e1"}
                          strokeWidth={highlighted ? 1.6 : 0.9}
                          strokeOpacity={dim ? 0.12 : highlighted ? 0.7 : 0.45}
                          strokeDasharray={e.relationType === "prerequisite" ? "5 4" : undefined}
                        />
                      );
                    })}
                  </g>
                  {/* nodes */}
                  <g>
                    {nodes.map((n) => {
                      const p = positions.get(n.id);
                      if (!p) return null;
                      const visible = matchesFilter(n);
                      const isSelected = selectedNode?.id === n.id;
                      const mastery = n.masteryLevel || 0;
                      const r = 10 + Math.min(8, Math.sqrt(n.reviewCount || 0) * 2);
                      const ring = catColor.get(n.category || "General") || "#94a3b8";
                      const fill = masteryColor(mastery);
                      const opacity = visible ? 1 : 0.18;
                      return (
                        <g
                          key={n.id}
                          opacity={opacity}
                          className="cursor-pointer"
                          onClick={() => setSelectedNode(isSelected ? null : n)}
                        >
                          {isSelected && (
                            <circle cx={p.x} cy={p.y} r={r + 10} fill={fill} opacity={0.18} />
                          )}
                          <circle cx={p.x} cy={p.y} r={r + 3} fill="none" stroke={ring} strokeWidth={1.5} strokeOpacity={0.65} />
                          <circle cx={p.x} cy={p.y} r={r} fill={fill} fillOpacity={0.18 + mastery * 0.55} stroke={fill} strokeWidth={1.2} />
                          {(visible || isSelected) && (
                            <text
                              x={p.x}
                              y={p.y + r + 11}
                              textAnchor="middle"
                              className="fill-gray-700 pointer-events-none"
                              style={{ fontSize: 9, fontWeight: 500 }}
                            >
                              {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </g>
              </svg>

              {/* zoom controls */}
              <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 bg-white/95 backdrop-blur rounded-lg shadow-sm border border-gray-200 p-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomIn} aria-label="Zoom in">
                  <ZoomIn className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomOut} aria-label="Zoom out">
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={fitView} aria-label="Fit">
                  <Maximize2 className="w-4 h-4" />
                </Button>
              </div>

              {/* mastery legend */}
              <div className="absolute bottom-3 left-3 hidden sm:flex items-center gap-3 bg-white/95 backdrop-blur rounded-lg shadow-sm border border-gray-200 px-3 py-2 text-[11px] text-gray-600">
                <span className="font-medium text-gray-700">Mastery</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />weak</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b" }} />learning</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />solid</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#10b981" }} />mastered</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Selected-node sheet */}
      {selectedNode && (
        <div className="fixed inset-x-0 bottom-0 z-50 sm:max-w-md sm:right-4 sm:left-auto sm:bottom-4">
          <Card className="rounded-t-2xl sm:rounded-2xl shadow-lg border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <Badge
                    variant="outline"
                    className="text-[10px] mb-1.5"
                    style={{ borderColor: catColor.get(selectedNode.category || "General") || "#94a3b8", color: catColor.get(selectedNode.category || "General") || "#475569" }}
                  >
                    {selectedNode.category || "General"}
                  </Badge>
                  <h3 className="font-semibold text-gray-900 leading-tight">{selectedNode.label}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: `${masteryColor(selectedNode.masteryLevel || 0)}20`, color: masteryColor(selectedNode.masteryLevel || 0) }}
                  >
                    {Math.round((selectedNode.masteryLevel || 0) * 100)}%
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-gray-400 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                {selectedNode.description || "No description available."}
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 mb-3">
                <div>
                  <div className="uppercase tracking-wider text-[10px] mb-0.5">Confidence</div>
                  <Progress value={(selectedNode.confidenceScore || 0) * 100} className="h-1.5" />
                </div>
                <div>
                  <div className="uppercase tracking-wider text-[10px] mb-0.5">Reviews</div>
                  <div className="font-semibold text-gray-900">{selectedNode.reviewCount}</div>
                </div>
              </div>
              <Button className="w-full" onClick={() => setLoc("/tutor")}>
                <MessageCircle className="w-4 h-4 mr-2" /> Discuss with Synops Coach
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
