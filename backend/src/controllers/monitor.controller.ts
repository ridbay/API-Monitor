import { Request, Response } from "express";
import { endpointRepository } from "../repositories/endpoint.repository";
import { executeCheck } from "../services/monitoring.service";
import { HttpError } from "../middleware/errorHandler";

export const monitorController = {
  async runOne(req: Request, res: Response) {
    const id = Number(req.params.id);
    const endpoint = await endpointRepository.findById(id);
    if (!endpoint) throw new HttpError(404, "Endpoint not found");

    await executeCheck(endpoint);
    res.json({ message: `Check executed for endpoint ${id}` });
  },

  async runAll(_req: Request, res: Response) {
    const endpoints = await endpointRepository.findActive();
    await Promise.allSettled(endpoints.map((endpoint) => executeCheck(endpoint)));
    res.json({ message: `Checks executed for ${endpoints.length} endpoints` });
  },
};
