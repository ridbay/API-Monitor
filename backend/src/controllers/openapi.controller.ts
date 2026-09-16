import { Request, Response } from "express";
import { z } from "zod";
import { discoverEndpoints } from "../services/openapi.service";
import { endpointService, createEndpointSchema } from "../services/endpoint.service";

const discoverSchema = z.object({ specUrl: z.string().url() });
const importSchema = z.object({ endpoints: z.array(createEndpointSchema) });

export const openapiController = {
  async discover(req: Request, res: Response) {
    const { specUrl } = discoverSchema.parse(req.body);
    const endpoints = await discoverEndpoints(specUrl);
    res.json({ total: endpoints.length, endpoints });
  },

  async importSelected(req: Request, res: Response) {
    const { endpoints } = importSchema.parse(req.body);
    const created = await endpointService.createMany(endpoints);
    res.status(201).json({ created: created.length, endpoints: created });
  },
};
