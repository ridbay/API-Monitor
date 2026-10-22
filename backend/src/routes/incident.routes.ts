import { Router, Request, Response, NextFunction } from "express";
import {
  listIncidents,
  getIncidentDetails,
  createIncident,
  updateIncidentStatus,
  addTimelineEvent,
  IncidentStatus,
  IncidentSeverity,
} from "../services/incident.service";
import { getNotificationLogs, getNotificationConfigs } from "../services/notification.service";
import { analyzeIncident, getLatestRcaReport } from "../services/rcaEngine.service";

export const incidentRouter = Router();

incidentRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const severity = req.query.severity as string | undefined;
    const incidents = await listIncidents({ status, severity });
    res.json(incidents);
  } catch (err) {
    next(err);
  }
});

incidentRouter.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const incident = await getIncidentDetails(id);
    const [notifications, rca] = await Promise.all([
      getNotificationLogs(incident.id),
      getLatestRcaReport(incident.id),
    ]);
    res.json({ ...incident, notifications, rca });
  } catch (err) {
    next(err);
  }
});

incidentRouter.get("/:id/rca", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incident = await getIncidentDetails(req.params.id);
    const rca = await getLatestRcaReport(incident.id);
    if (!rca) {
      res.status(404).json({ error: "No analysis has been run for this incident" });
      return;
    }
    res.json(rca);
  } catch (err) {
    next(err);
  }
});

incidentRouter.post("/:id/rca", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rca = await analyzeIncident(req.params.id);
    res.status(201).json(rca);
  } catch (err) {
    next(err);
  }
});

incidentRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { service_name, title, severity, root_cause, affected_pods } = req.body;
    if (!service_name || !title || !severity) {
      res.status(400).json({ error: "service_name, title, and severity are required" });
      return;
    }
    const incident = await createIncident({
      service_name,
      title,
      severity: severity as IncidentSeverity,
      root_cause,
      affected_pods,
      actor: "API_OPERATOR",
    });
    res.status(201).json(incident);
  } catch (err) {
    next(err);
  }
});

incidentRouter.patch("/:id/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const { status, actor, note } = req.body;
    if (!status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    const updated = await updateIncidentStatus(
      id,
      status as IncidentStatus,
      actor || "OPERATOR",
      note
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

incidentRouter.post("/:id/timeline", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    const { message, actor, event_type } = req.body;
    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }
    const event = await addTimelineEvent(
      id,
      event_type || "NOTE_ADDED",
      message,
      actor || "OPERATOR"
    );
    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// Notifications routes
export const notificationRouter = Router();

notificationRouter.get("/logs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const incidentId = req.query.incidentId ? Number(req.query.incidentId) : undefined;
    const logs = await getNotificationLogs(incidentId);
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

notificationRouter.get("/configs", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await getNotificationConfigs();
    res.json(configs);
  } catch (err) {
    next(err);
  }
});
