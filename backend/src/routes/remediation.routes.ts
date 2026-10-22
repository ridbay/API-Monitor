import { Router, Request, Response, NextFunction } from "express";
import {
  approvePlan,
  getPlan,
  listAudit,
  listAutopilotPolicies,
  listPlans,
  rejectPlan,
  setAutopilotPolicy,
} from "../services/remediation.service";
import { kubernetesStatus } from "../services/kubernetesRunner.service";

export const remediationRouter = Router();

remediationRouter.get("/plans", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incidentId = req.query.incident_id ? Number(req.query.incident_id) : undefined;
    const status = req.query.status as string | undefined;
    res.json(await listPlans({ incidentId, status }));
  } catch (err) {
    next(err);
  }
});

remediationRouter.get("/plans/:reference", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getPlan(req.params.reference));
  } catch (err) {
    next(err);
  }
});

remediationRouter.post("/plans/:reference/approve", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await approvePlan(req.params.reference, req.body?.actor, req.body?.note));
  } catch (err) {
    next(err);
  }
});

remediationRouter.post("/plans/:reference/reject", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await rejectPlan(req.params.reference, req.body?.actor, req.body?.note));
  } catch (err) {
    next(err);
  }
});

remediationRouter.get("/audit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incidentId = req.query.incident_id ? Number(req.query.incident_id) : undefined;
    res.json(await listAudit(incidentId));
  } catch (err) {
    next(err);
  }
});

remediationRouter.get("/autopilot", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ policies: await listAutopilotPolicies(), kubernetes: kubernetesStatus() });
  } catch (err) {
    next(err);
  }
});

remediationRouter.put("/autopilot/:action", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const policies = await setAutopilotPolicy(req.params.action, Boolean(req.body?.enabled), req.body?.actor);
    res.json({ policies, kubernetes: kubernetesStatus() });
  } catch (err) {
    next(err);
  }
});
