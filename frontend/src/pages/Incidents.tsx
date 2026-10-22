import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertOctagon,
  CheckCircle2,
  Shield,
  ExternalLink,
  Send,
  RefreshCw,
  Mail,
  Smartphone,
  PlusCircle,
} from "lucide-react";
import { incidentsApi } from "../services/api";
import { RcaPanel } from "../components/RcaPanel";
import type {
  IncidentSeverity,
  IncidentStatus,
} from "../types";

export function Incidents() {
  const queryClient = useQueryClient();
  const [selectedIncidentId, setSelectedIncidentId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [operatorNote, setOperatorNote] = useState("");

  // Create form state
  const [newServiceName, setNewServiceName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSeverity, setNewSeverity] = useState<IncidentSeverity>("P2");
  const [newRootCause, setNewRootCause] = useState("");

  const { data: incidents, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["incidents", statusFilter, severityFilter],
    queryFn: () => incidentsApi.list({ status: statusFilter, severity: severityFilter }),
    refetchInterval: 15000,
  });

  const { data: activeDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["incident-detail", selectedIncidentId],
    queryFn: () => incidentsApi.getById(selectedIncidentId!),
    enabled: selectedIncidentId !== null,
    refetchInterval: 10000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: IncidentStatus; note?: string }) =>
      incidentsApi.updateStatus(id, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
      queryClient.invalidateQueries({ queryKey: ["incident-detail", selectedIncidentId] });
      queryClient.invalidateQueries({ queryKey: ["executive-summary"] });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: ({ id, message }: { id: number; message: string }) =>
      incidentsApi.addTimelineNote(id, message),
    onSuccess: () => {
      setOperatorNote("");
      queryClient.invalidateQueries({ queryKey: ["incident-detail", selectedIncidentId] });
    },
  });

  const createIncidentMutation = useMutation({
    mutationFn: (data: { service_name: string; title: string; severity: IncidentSeverity; root_cause: string }) =>
      fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewServiceName("");
      setNewTitle("");
      setNewRootCause("");
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const handleAddNote = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedIncidentId || !operatorNote.trim()) return;
    addNoteMutation.mutate({ id: selectedIncidentId, message: operatorNote.trim() });
  };

  const handleCreateIncident = (e: FormEvent) => {
    e.preventDefault();
    if (!newServiceName || !newTitle) return;
    createIncidentMutation.mutate({
      service_name: newServiceName,
      title: newTitle,
      severity: newSeverity,
      root_cause: newRootCause || "Manual test incident",
    });
  };

  // Severity pill style helper
  const getSeverityBadge = (sev: IncidentSeverity) => {
    switch (sev) {
      case "P1":
        return "bg-failure-500/15 text-failure-300 border-failure-500/30";
      case "P2":
        return "bg-orange-500/15 text-orange-300 border-orange-500/30";
      case "P3":
        return "bg-warning-500/15 text-warning-300 border-warning-500/30";
      case "P4":
        return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    }
  };

  // Status pill style helper
  const getStatusBadge = (status: IncidentStatus) => {
    switch (status) {
      case "TRIGGERED":
        return "bg-failure-500/10 text-failure-400 border-failure-500/20";
      case "ACKNOWLEDGED":
        return "bg-purple-500/10 text-purple-300 border-purple-500/20";
      case "INVESTIGATING":
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      case "MITIGATED":
        return "bg-sky-500/10 text-sky-300 border-sky-500/20";
      case "RESOLVED":
      case "CLOSED":
        return "bg-success-500/10 text-success-400 border-success-500/20";
    }
  };

  const allCount = incidents?.length ?? 0;
  const activeCount = incidents?.filter((i) => i.status !== "RESOLVED" && i.status !== "CLOSED").length ?? 0;
  const p1Count = incidents?.filter((i) => i.severity === "P1" && i.status !== "RESOLVED").length ?? 0;
  const resolvedCount = incidents?.filter((i) => i.status === "RESOLVED").length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--color-border)] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-failure-500 to-amber-500 text-white shadow-lg shadow-failure-500/20">
              <AlertOctagon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--color-text)]">
                  Enterprise Incident Governance
                </h1>
                <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-300 border border-brand-500/20">
                  ServiceNow Sync
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Unique reference tracking (INC-XXXX), multi-channel alerting, and operational runbook state machine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-accent-500 px-3.5 text-xs font-semibold text-white shadow-lg shadow-brand-500/20 hover:from-brand-600 hover:to-accent-600 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            Trigger Incident
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Active Incidents
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${activeCount > 0 ? "text-amber-400" : "text-emerald-400"}`}>
              {activeCount}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">of {allCount} total</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Awaiting final resolution</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Critical P1 Outages
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${p1Count > 0 ? "text-failure-400" : "text-[var(--color-text-muted)]"}`}>
              {p1Count}
            </span>
            {p1Count > 0 && <span className="h-2 w-2 rounded-full bg-failure-400 animate-ping" />}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">SMS emergency pager active</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            ServiceNow Sync State
          </span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-[var(--color-text)]">Table API 2-Way</span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Auto-syncing incident tickets</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <span className="text-[11px] font-semibold text-[var(--color-text-faint)] uppercase tracking-wider">
            Resolved Incidents
          </span>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {resolvedCount}
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-text-faint)]">Postmortem archived</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-faint)] mr-1">Lifecycle State:</span>
          {(["all", "TRIGGERED", "INVESTIGATING", "MITIGATED", "RESOLVED"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              }`}
            >
              {st === "all" ? "All States" : st}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-faint)] mr-1">Severity:</span>
          {(["all", "P1", "P2", "P3"] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                severityFilter === sev
                  ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              }`}
            >
              {sev === "all" ? "All Sev" : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Incidents Table */}
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="h-7 w-7 animate-spin text-brand-400" />
          </div>
        ) : !incidents || incidents.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-success-400 mb-2" />
            <p className="text-sm font-semibold text-[var(--color-text)]">No incidents found</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">All monitored systems are operating within SLA.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/60 text-[11px] uppercase tracking-wider text-[var(--color-text-faint)]">
                  <th className="px-5 py-3 font-semibold">Incident Ref</th>
                  <th className="px-4 py-3 font-semibold">Impacted Service</th>
                  <th className="px-3 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Lifecycle State</th>
                  <th className="px-4 py-3 font-semibold">ServiceNow Ticket</th>
                  <th className="px-4 py-3 font-semibold">Root Cause Classification</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {incidents.map((inc) => (
                  <tr
                    key={inc.id}
                    className="hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                    onClick={() => setSelectedIncidentId(inc.id)}
                  >
                    <td className="px-5 py-4 font-mono font-bold text-brand-400">
                      {inc.reference}
                    </td>
                    <td className="px-4 py-4">
                      <span className="font-semibold text-[var(--color-text)] block">
                        {inc.service_name}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-xs block">
                        {inc.title}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold border ${getSeverityBadge(inc.severity)}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${getStatusBadge(inc.status)}`}>
                        {inc.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-mono">
                      {inc.servicenow_ticket_num ? (
                        <span className="inline-flex items-center gap-1 text-accent-400 font-semibold bg-accent-500/10 px-2 py-0.5 rounded border border-accent-500/20">
                          <ExternalLink className="h-3 w-3" />
                          {inc.servicenow_ticket_num}
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-faint)]">Unlinked</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[var(--color-text-muted)] max-w-xs truncate">
                      {inc.root_cause || "Auto-detecting root cause..."}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIncidentId(inc.id);
                        }}
                        className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] border border-[var(--color-border)] hover:bg-brand-500/20 hover:text-brand-300 transition-colors"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Incident Detail / Postmortem Drawer */}
      {selectedIncidentId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm">
          <div className="h-full w-full max-w-xl bg-[var(--color-surface)] border-l border-[var(--color-border-strong)] shadow-2xl flex flex-col justify-between overflow-y-auto">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4.5 bg-[var(--color-surface-2)]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-brand-300">
                      {activeDetail?.reference ?? "Loading..."}
                    </span>
                    {activeDetail && (
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold border ${getSeverityBadge(activeDetail.severity)}`}>
                        {activeDetail.severity}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                    {activeDetail?.service_name} • {activeDetail?.title}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedIncidentId(null)}
                  className="rounded-lg p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Content */}
              {isDetailLoading || !activeDetail ? (
                <div className="flex h-64 items-center justify-center">
                  <RefreshCw className="h-7 w-7 animate-spin text-brand-400" />
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* State Machine Transition Actions */}
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] block mb-2.5">
                      Operational State Transition Gate
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: activeDetail.id, status: "ACKNOWLEDGED" })}
                        disabled={activeDetail.status === "ACKNOWLEDGED" || updateStatusMutation.isPending}
                        className="rounded-lg bg-purple-500/15 border border-purple-500/30 px-3 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 disabled:opacity-40 transition-colors"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: activeDetail.id, status: "INVESTIGATING" })}
                        disabled={activeDetail.status === "INVESTIGATING" || updateStatusMutation.isPending}
                        className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-40 transition-colors"
                      >
                        Investigate
                      </button>
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: activeDetail.id, status: "MITIGATED" })}
                        disabled={activeDetail.status === "MITIGATED" || updateStatusMutation.isPending}
                        className="rounded-lg bg-sky-500/15 border border-sky-500/30 px-3 py-1.5 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 transition-colors"
                      >
                        Mitigate
                      </button>
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: activeDetail.id, status: "RESOLVED", note: "Resolved via operational console" })}
                        disabled={activeDetail.status === "RESOLVED" || updateStatusMutation.isPending}
                        className="rounded-lg bg-success-500/15 border border-success-500/30 px-3 py-1.5 text-xs font-semibold text-success-300 hover:bg-success-500/25 disabled:opacity-40 transition-colors"
                      >
                        Resolve & Sync ServiceNow
                      </button>
                    </div>
                  </div>

                  {/* ServiceNow Sync Card */}
                  <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-accent-400" />
                        <span className="text-xs font-semibold text-accent-300">ServiceNow Integration</span>
                      </div>
                      <span className="text-[10px] font-mono text-accent-300 bg-accent-500/20 px-2 py-0.5 rounded">
                        Active
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-[var(--color-text-muted)] space-y-1">
                      <p>
                        Ticket Number: <strong className="font-mono text-[var(--color-text)]">{activeDetail.servicenow_ticket_num}</strong>
                      </p>
                      <p>
                        Sys ID: <span className="font-mono text-[11px] text-[var(--color-text-faint)]">{activeDetail.servicenow_sys_id}</span>
                      </p>
                    </div>
                  </div>

                  {/* Root Cause Analysis & Affected Pods */}
                  <RcaPanel incident={activeDetail} />

                  {/* Multi-Channel Notification Audit Trail */}
                  {activeDetail.notifications && activeDetail.notifications.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] block">
                        Alert Notification Dispatch Logs ({activeDetail.notifications.length})
                      </span>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {activeDetail.notifications.map((notif) => (
                          <div
                            key={notif.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              {notif.channel === "SMS" ? (
                                <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <Mail className="h-3.5 w-3.5 text-brand-400" />
                              )}
                              <span className="font-semibold text-[var(--color-text)]">{notif.channel}</span>
                              <span className="text-[11px] text-[var(--color-text-muted)] truncate max-w-xs">{notif.recipient}</span>
                            </div>
                            <span className="text-[10px] font-mono text-success-400 font-semibold">{notif.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chronological Activity Timeline */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-faint)] block">
                      Chronological Activity Timeline
                    </span>
                    <div className="relative border-l border-[var(--color-border)] pl-4 ml-2 space-y-4">
                      {activeDetail.timeline?.map((evt) => (
                        <div key={evt.id} className="relative text-xs">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-400 ring-4 ring-[var(--color-surface)]" />
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold text-[var(--color-text)]">{evt.actor}</span>
                            <span className="text-[10px] text-[var(--color-text-faint)] font-mono">
                              {new Date(evt.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[var(--color-text-muted)] leading-relaxed">{evt.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Operator Note Form */}
            <form onSubmit={handleAddNote} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 flex gap-2">
              <input
                type="text"
                placeholder="Add operator postmortem note..."
                value={operatorNote}
                onChange={(e) => setOperatorNote(e.target.value)}
                className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                type="submit"
                disabled={!operatorNote.trim() || addNoteMutation.isPending}
                className="rounded-xl bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-40 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Trigger Incident Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--color-text)]">Trigger Enterprise Incident</h3>
            <form onSubmit={handleCreateIncident} className="space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-[var(--color-text-muted)] block mb-1">Target Service Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Core Payment Gateway"
                  value={newServiceName}
                  onChange={(e) => setNewServiceName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--color-text-muted)] block mb-1">Issue Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 504 Gateway Timeout on /checkout"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-[var(--color-text-muted)] block mb-1">Severity Level</label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as IncidentSeverity)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-brand-500 focus:outline-none"
                >
                  <option value="P1">P1 - Critical Outage (SMS Alert Triggered)</option>
                  <option value="P2">P2 - Major Service Degradation</option>
                  <option value="P3">P3 - Moderate Defect</option>
                  <option value="P4">P4 - Minor Blip</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-[var(--color-text-muted)] block mb-1">Identified Root Cause (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Memory leak in pod or connection exhaustion"
                  value={newRootCause}
                  onChange={(e) => setNewRootCause(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-text)] focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createIncidentMutation.isPending}
                  className="rounded-xl bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  {createIncidentMutation.isPending ? "Triggering..." : "Trigger & Sync"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
