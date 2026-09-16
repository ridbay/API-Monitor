import { Request, Response } from "express";
import { endpointService, createEndpointSchema, updateEndpointSchema } from "../services/endpoint.service";
import { HttpError } from "../middleware/errorHandler";

export const endpointController = {
  async list(_req: Request, res: Response) {
    const endpoints = await endpointService.listWithStats();
    res.json(endpoints);
  },

  async getById(req: Request, res: Response) {
    const id = Number(req.params.id);
    const endpoint = await endpointService.getById(id);
    if (!endpoint) throw new HttpError(404, "Endpoint not found");
    res.json(endpoint);
  },

  async create(req: Request, res: Response) {
    const input = createEndpointSchema.parse(req.body);
    const endpoint = await endpointService.create(input);
    res.status(201).json(endpoint);
  },

  async update(req: Request, res: Response) {
    const id = Number(req.params.id);
    const input = updateEndpointSchema.parse(req.body);
    const endpoint = await endpointService.update(id, input);
    if (!endpoint) throw new HttpError(404, "Endpoint not found");
    res.json(endpoint);
  },

  async remove(req: Request, res: Response) {
    const id = Number(req.params.id);
    const deleted = await endpointService.softDelete(id);
    if (!deleted) throw new HttpError(404, "Endpoint not found");
    res.status(204).send();
  },
};
