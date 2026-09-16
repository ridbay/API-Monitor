import { Request, Response } from "express";
import { reportService } from "../services/report.service";

export const reportController = {
  async daily(req: Request, res: Response) {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const report = await reportService.getDaily(date);
    res.json(report);
  },

  async weekly(_req: Request, res: Response) {
    const report = await reportService.getWeekly();
    res.json(report);
  },
};
