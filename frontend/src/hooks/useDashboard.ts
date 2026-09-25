import { useQuery } from "@tanstack/react-query";
import { dashboardApi, reportsApi } from "../services/api";

export function useDashboardSummary() {
  return useQuery({ queryKey: ["dashboard", "summary"], queryFn: dashboardApi.summary, refetchInterval: 15_000 });
}

export function useEndpointHealth() {
  return useQuery({
    queryKey: ["dashboard", "endpoint-health"],
    queryFn: dashboardApi.endpointHealth,
    refetchInterval: 15_000,
  });
}

export function useDashboardTrends(hours = 24) {
  return useQuery({
    queryKey: ["dashboard", "trends", hours],
    queryFn: () => dashboardApi.trends(hours),
    refetchInterval: 30_000,
  });
}

export function useDailyReport(date?: string) {
  return useQuery({ queryKey: ["reports", "daily", date], queryFn: () => reportsApi.daily(date) });
}

export function useWeeklyReport() {
  return useQuery({ queryKey: ["reports", "weekly"], queryFn: reportsApi.weekly });
}

export function useMonthlyReport() {
  return useQuery({ queryKey: ["reports", "monthly"], queryFn: reportsApi.monthly });
}
