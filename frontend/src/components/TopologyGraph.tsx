import { useState, useRef, useMemo, useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  Server,
  Database,
  Zap,
  Globe,
  Radio,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import type { TopologyNode, TopologyData } from "../types";
import { TracerouteModal } from "./TracerouteModal";

interface TopologyGraphProps {
  data: TopologyData;
  filterStatus?: "all" | "up" | "degraded" | "down";
  onSelectNode?: (node: TopologyNode | null) => void;
}

interface NodePosition {
  x: number;
  y: number;
}

export function TopologyGraph({ data, filterStatus = "all", onSelectNode }: TopologyGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [tracerouteTarget, setTracerouteTarget] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Draggable Node State
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>({});
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragNodeOffset = useRef({ x: 0, y: 0 });

  // Initial automatic grid/layer layout
  useEffect(() => {
    const positions: Record<string, NodePosition> = {};
    const nodes = data.nodes;

    // Layer 1: Ingress (Left)
    const ingressNodes = nodes.filter((n) => n.type === "ingress");
    ingressNodes.forEach((node, i) => {
      positions[node.id] = { x: 80, y: 260 + i * 160 };
    });

    // Layer 2: Microservices & External (Center)
    const serviceNodes = nodes.filter((n) => n.type === "service" || n.type === "external");
    serviceNodes.forEach((node, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      positions[node.id] = { x: 380 + col * 260, y: 120 + row * 170 };
    });

    // Layer 3: Infrastructure (Right)
    const infraNodes = nodes.filter((n) => ["database", "cache", "broker"].includes(n.type));
    infraNodes.forEach((node, i) => {
      positions[node.id] = { x: 960, y: 140 + i * 180 };
    });

    setNodePositions(positions);
  }, [data.nodes]);

  // Selected node object
  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [data.nodes, selectedNodeId]
  );

  // Notify parent if callback provided
  useEffect(() => {
    onSelectNode?.(selectedNode);
  }, [selectedNode, onSelectNode]);

  // Compute blast radius: incoming callers and outgoing targets
  const blastRadius = useMemo(() => {
    if (!selectedNodeId) return { upstream: new Set<string>(), downstream: new Set<string>() };

    const upstream = new Set<string>();
    const downstream = new Set<string>();

    data.edges.forEach((edge) => {
      if (edge.target === selectedNodeId) upstream.add(edge.source);
      if (edge.source === selectedNodeId) downstream.add(edge.target);
    });

    return { upstream, downstream };
  }, [selectedNodeId, data.edges]);

  // Filtered nodes
  const visibleNodes = useMemo(() => {
    if (filterStatus === "all") return data.nodes;
    return data.nodes.filter((n) => n.status === filterStatus);
  }, [data.nodes, filterStatus]);

  // Canvas Mouse Handlers (Pan)
  const handleCanvasMouseDown = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest(".topology-node")) return;
    setIsDraggingCanvas(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleCanvasMouseMove = (e: ReactMouseEvent) => {
    if (isDraggingCanvas) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    } else if (draggingNodeId) {
      const container = e.currentTarget.getBoundingClientRect();
      const newX = (e.clientX - container.left - pan.x) / zoom - dragNodeOffset.current.x;
      const newY = (e.clientY - container.top - pan.y) / zoom - dragNodeOffset.current.y;
      setNodePositions((prev) => ({
        ...prev,
        [draggingNodeId]: { x: Math.max(20, newX), y: Math.max(20, newY) },
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
    setDraggingNodeId(null);
  };

  const startDragNode = (e: ReactMouseEvent, id: string) => {
    e.stopPropagation();
    setDraggingNodeId(id);
    const pos = nodePositions[id] || { x: 0, y: 0 };
    dragNodeOffset.current = {
      x: (e.clientX - pan.x) / zoom - pos.x,
      y: (e.clientY - pan.y) / zoom - pos.y,
    };
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node Icon Helper
  const getNodeIcon = (type: TopologyNode["type"]) => {
    switch (type) {
      case "ingress":
        return <Radio className="h-5 w-5 text-brand-400" />;
      case "database":
        return <Database className="h-5 w-5 text-indigo-400" />;
      case "cache":
        return <Zap className="h-5 w-5 text-amber-400" />;
      case "broker":
        return <Layers className="h-5 w-5 text-sky-400" />;
      case "external":
        return <Globe className="h-5 w-5 text-emerald-400" />;
      default:
        return <Server className="h-5 w-5 text-accent-400" />;
    }
  };

  // Node Color & Ring Helper
  const getNodeBorder = (node: TopologyNode) => {
    const isSelected = selectedNodeId === node.id;
    const isUpstream = blastRadius.upstream.has(node.id);
    const isDownstream = blastRadius.downstream.has(node.id);

    if (isSelected) {
      return "border-brand-400 ring-4 ring-brand-500/30 shadow-[0_0_24px_rgba(99,102,241,0.5)]";
    }
    if (isUpstream) {
      return "border-warning-400 ring-2 ring-warning-500/20";
    }
    if (isDownstream) {
      return "border-sky-400 ring-2 ring-sky-500/20";
    }

    if (node.status === "down") {
      return "border-failure-500 ring-2 ring-failure-500/20";
    }
    if (node.status === "degraded") {
      return "border-warning-500 ring-2 ring-warning-500/20";
    }
    return "border-[var(--color-border)] hover:border-brand-500/50";
  };

  return (
    <div className="relative flex h-[740px] w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[#0a0e17] select-none">
      {/* Topology Toolbar */}
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-2 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-1.5 border-r border-[var(--color-border)] pr-3">
          <button
            onClick={() => setZoom((z) => Math.min(1.8, z + 0.15))}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={resetView}
            className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
            title="Reset Layout & Zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <span className="text-[11px] font-mono text-[var(--color-text-faint)] ml-1">
            {Math.round(zoom * 100)}%
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 pl-1 text-[11px] font-medium text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-success-400" />
            <span>Optimal</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-warning-400" />
            <span>Degraded</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-failure-400 animate-pulse" />
            <span>Outage</span>
          </div>
        </div>
      </div>

      {/* Interactive Graph Canvas */}
      <div
        className="relative flex-1 cursor-grab active:cursor-grabbing overflow-hidden"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
      >
        {/* Background Grid Pattern */}
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none opacity-20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#4f52e5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-pattern)" />
        </svg>

        {/* Scaled/Panned Graph Stage */}
        <div
          className="absolute origin-top-left transition-transform duration-75"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: "1400px",
            height: "900px",
          }}
        >
          {/* SVG Dependency Edges */}
          <svg className="absolute inset-0 h-full w-full pointer-events-none overflow-visible">
            <defs>
              <linearGradient id="edge-healthy" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="edge-failed" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient id="edge-degraded" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {data.edges.map((edge) => {
              const srcPos = nodePositions[edge.source];
              const tgtPos = nodePositions[edge.target];
              if (!srcPos || !tgtPos) return null;

              // Node dimensions for offset: width ~ 210, height ~ 90
              const x1 = srcPos.x + 210;
              const y1 = srcPos.y + 45;
              const x2 = tgtPos.x;
              const y2 = tgtPos.y + 45;

              // Bezier control curve
              const dx = Math.abs(x2 - x1) * 0.5;
              const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

              const isHighlighted =
                selectedNodeId === edge.source || selectedNodeId === edge.target;
              const strokeColor =
                edge.status === "failed"
                  ? "url(#edge-failed)"
                  : edge.status === "degraded"
                  ? "url(#edge-degraded)"
                  : "url(#edge-healthy)";

              return (
                <g key={edge.id} className="transition-opacity duration-300">
                  {/* Outer glow line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={
                      edge.status === "failed"
                        ? "#ef4444"
                        : edge.status === "degraded"
                        ? "#f59e0b"
                        : "#6366f1"
                    }
                    strokeWidth={isHighlighted ? 4 : 2}
                    strokeOpacity={isHighlighted ? 0.9 : 0.3}
                  />

                  {/* Flow animation line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isHighlighted ? 3 : 2}
                    strokeDasharray="6 6"
                    className="animate-flow-dash"
                  />

                  {/* Live RPS badge in the middle of link */}
                  {isHighlighted && (
                    <foreignObject
                      x={(x1 + x2) / 2 - 40}
                      y={(y1 + y2) / 2 - 12}
                      width="80"
                      height="24"
                    >
                      <div className="flex items-center justify-center rounded-full bg-[var(--color-surface)]/95 border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono text-brand-300 shadow-md">
                        {edge.rps} rps • {edge.avgLatencyMs}ms
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Render Graph Nodes */}
          {visibleNodes.map((node) => {
            const pos = nodePositions[node.id] || { x: 50, y: 50 };
            const isSelected = selectedNodeId === node.id;
            const isFaded =
              selectedNodeId &&
              !isSelected &&
              !blastRadius.upstream.has(node.id) &&
              !blastRadius.downstream.has(node.id);

            return (
              <div
                key={node.id}
                className={`topology-node absolute z-10 w-[220px] rounded-xl border bg-[var(--color-surface)]/95 p-3.5 shadow-xl backdrop-blur-md transition-all duration-150 cursor-pointer ${getNodeBorder(
                  node
                )} ${isFaded ? "opacity-35 grayscale" : "opacity-100"}`}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                }}
                onMouseDown={(e) => startDragNode(e, node.id)}
                onClick={() => setSelectedNodeId((id) => (id === node.id ? null : node.id))}
              >
                {/* Node Header */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                      {getNodeIcon(node.type)}
                    </div>
                    <span className="text-xs font-semibold text-[var(--color-text)] truncate">
                      {node.name}
                    </span>
                  </div>

                  {/* Dynamic Health Status Indicator */}
                  <span
                    className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${
                      node.status === "down"
                        ? "bg-failure-400"
                        : node.status === "degraded"
                        ? "bg-warning-400"
                        : "bg-success-400"
                    }`}
                  >
                    {node.status === "down" && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-failure-400 opacity-75" />
                    )}
                  </span>
                </div>

                {/* Node Metadata & Metrics */}
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-[var(--color-border)] pt-2 text-[11px]">
                  <div>
                    <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Latency</span>
                    <p className="font-mono font-medium text-[var(--color-text)]">{node.latencyMs}ms</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Availability</span>
                    <p
                      className={`font-mono font-medium ${
                        node.uptimePct >= 99 ? "text-success-400" : "text-warning-400"
                      }`}
                    >
                      {node.uptimePct}%
                    </p>
                  </div>
                </div>

                {/* Subtext: Pod count or Namespace */}
                <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--color-text-faint)]">
                  <span>{node.namespace ?? "cluster-node"}</span>
                  {node.podCount && (
                    <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[9px] font-mono text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      {node.podCount} pods
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Blast Radius & Node Inspector Drawer */}
      {selectedNode && (
        <div className="absolute right-4 top-4 bottom-4 z-30 w-84 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]/95 p-5 shadow-2xl backdrop-blur-xl flex flex-col justify-between overflow-y-auto">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                  {getNodeIcon(selectedNode.type)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text)] truncate">{selectedNode.name}</h3>
                  <span className="text-[10px] uppercase tracking-wider text-brand-400 font-semibold">
                    {selectedNode.type}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                ✕
              </button>
            </div>

            {/* Health & Description */}
            <div className="mt-3.5 space-y-3">
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {selectedNode.description}
              </p>

              {/* Blast Radius Alert */}
              <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 text-xs">
                <span className="font-semibold text-brand-300 block mb-1">Impact & Blast Radius</span>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Calling dependencies: <strong className="text-[var(--color-text)]">{blastRadius.upstream.size}</strong> upstream services.
                  Direct dependencies: <strong className="text-[var(--color-text)]">{blastRadius.downstream.size}</strong> downstream stores.
                </p>
              </div>

              {/* Telemetry Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
                  <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Throughput</span>
                  <p className="text-sm font-bold font-mono text-[var(--color-text)] mt-0.5">
                    {selectedNode.rps} RPS
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
                  <span className="text-[10px] text-[var(--color-text-faint)] uppercase">Cluster / NS</span>
                  <p className="text-xs font-mono text-brand-300 truncate mt-0.5">
                    {selectedNode.namespace ?? "default"}
                  </p>
                </div>
              </div>

              {/* Endpoints List */}
              {selectedNode.endpoints && selectedNode.endpoints.length > 0 && (
                <div>
                  <h4 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                    Monitored Endpoints ({selectedNode.endpoints.length})
                  </h4>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {selectedNode.endpoints.map((ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-semibold text-[var(--color-text)] truncate block">
                            {ep.name}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--color-text-faint)] truncate block">
                            {ep.method} {ep.url}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            ep.status === "up"
                              ? "bg-success-500/10 text-success-400 border border-success-500/20"
                              : "bg-failure-500/10 text-failure-400 border border-failure-500/20"
                          }`}
                        >
                          {ep.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger */}
          <div className="pt-4 border-t border-[var(--color-border)] mt-4 space-y-2">
            {selectedNode.endpoints && selectedNode.endpoints.length > 0 && (
              <button
                onClick={() => setTracerouteTarget(selectedNode.endpoints[0].url)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-brand-500/25 hover:from-brand-600 hover:to-accent-600 transition-all"
              >
                <Radio className="h-4 w-4" />
                Run Network Traceroute
              </button>
            )}
          </div>
        </div>
      )}

      {/* Traceroute Modal Trigger */}
      {tracerouteTarget && (
        <TracerouteModal
          targetUrl={tracerouteTarget}
          isOpen={Boolean(tracerouteTarget)}
          onClose={() => setTracerouteTarget(null)}
        />
      )}
    </div>
  );
}
