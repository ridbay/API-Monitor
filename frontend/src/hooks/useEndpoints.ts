import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endpointsApi, loadTestApi, monitorApi } from "../services/api";
import type { CreateEndpointInput, LoadTestOptions } from "../types";

export function useEndpoints() {
  return useQuery({ queryKey: ["endpoints"], queryFn: endpointsApi.list, refetchInterval: 15_000 });
}

export function useEndpoint(id: number) {
  return useQuery({ queryKey: ["endpoints", id], queryFn: () => endpointsApi.getById(id) });
}

export function useEndpointTrends(id: number, hours: number) {
  return useQuery({ queryKey: ["endpoints", id, "trends", hours], queryFn: () => endpointsApi.trends(id, hours) });
}

export function useEndpointStatusCodes(id: number) {
  return useQuery({ queryKey: ["endpoints", id, "status-codes"], queryFn: () => endpointsApi.statusCodes(id) });
}

export function useCreateEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEndpointInput) => endpointsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["endpoints"] }),
  });
}

export function useUpdateEndpoint(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateEndpointInput>) => endpointsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endpoints"] });
      queryClient.invalidateQueries({ queryKey: ["endpoints", id] });
    },
  });
}

export function useDeleteEndpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => endpointsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["endpoints"] }),
  });
}

export function useRunCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => monitorApi.runOne(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endpoints"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRunAllChecks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi.runAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["endpoints"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Not wired to invalidate endpoints/dashboard queries: load-test bursts are
// deliberately kept out of the uptime/availability stats those views show.
export function useRunLoadTest(id: number) {
  return useMutation({
    mutationFn: (options: LoadTestOptions) => loadTestApi.run(id, options),
  });
}
