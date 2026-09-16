import { Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service";
import { redis } from "../config/redis";

const SUMMARY_CACHE_KEY = "dashboard:summary";
const SUMMARY_CACHE_TTL_SECONDS = 30;

export const dashboardController = {
  async summary(_req: Request, res: Response) {
    try {
      const cached = await redis.get(SUMMARY_CACHE_KEY);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      // Redis unavailable — fall through to a live query.
    }

    const summary = await dashboardService.getSummary();
    const recentFailures = await dashboardService.getRecentFailures();
    const payload = { ...summary, recent_failures: recentFailures };

    try {
      await redis.set(SUMMARY_CACHE_KEY, JSON.stringify(payload), { EX: SUMMARY_CACHE_TTL_SECONDS });
    } catch {
      // Ignore cache write failures.
    }

    res.json(payload);
  },

  async trends(req: Request, res: Response) {
    const hours = req.query.hours ? Number(req.query.hours) : 24;
    const trends = await dashboardService.getTrends(hours);
    res.json(trends);
  },

  async endpointHealth(_req: Request, res: Response) {
    const health = await dashboardService.getEndpointHealth();
    res.json(health);
  },
};
