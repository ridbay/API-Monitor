import { Badge } from "./ui/Badge";
import type { EndpointStatus } from "../types";

export function StatusBadge({ status, availability }: { status: EndpointStatus; availability?: number }) {
  if (status === "down") return <Badge tone="failure">Down</Badge>;
  if (status === "unknown") return <Badge tone="neutral">Unknown</Badge>;
  if (availability !== undefined && availability < 98) return <Badge tone="warning">Warning</Badge>;
  return <Badge tone="success">Healthy</Badge>;
}
