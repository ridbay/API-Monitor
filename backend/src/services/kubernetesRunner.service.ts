import axios, { AxiosInstance } from "axios";
import fs from "fs";
import https from "https";

// Talks to the Kubernetes/OpenShift API directly rather than through
// @kubernetes/client-node (ESM-only, which this CommonJS build can't load on
// Node 20). Two ways to authenticate:
//   - in-cluster: the pod's ServiceAccount token (the production path)
//   - K8S_API_URL + K8S_TOKEN (e.g. `oc whoami -t`), optionally K8S_CA_CERT
// Nothing runs unless K8S_REMEDIATION_ENABLED=true.

const SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount";
const DNS_1123_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

export interface KubernetesStatus {
  enabled: boolean;
  source?: "in-cluster" | "env";
  reason?: string;
}

export function kubernetesStatus(): KubernetesStatus {
  if (process.env.K8S_REMEDIATION_ENABLED !== "true") {
    return { enabled: false, reason: "Kubernetes remediation is disabled (set K8S_REMEDIATION_ENABLED=true)." };
  }
  if (process.env.K8S_API_URL && process.env.K8S_TOKEN) return { enabled: true, source: "env" };
  if (process.env.KUBERNETES_SERVICE_HOST && fs.existsSync(`${SA_DIR}/token`)) return { enabled: true, source: "in-cluster" };
  return {
    enabled: false,
    reason: "No cluster credentials: set K8S_API_URL and K8S_TOKEN, or run in-cluster with a ServiceAccount.",
  };
}

function client(): AxiosInstance {
  const status = kubernetesStatus();
  if (!status.enabled) throw new Error(status.reason);

  let baseURL: string;
  let token: string;
  let ca: Buffer | undefined;
  if (status.source === "env") {
    baseURL = process.env.K8S_API_URL!;
    token = process.env.K8S_TOKEN!;
    ca = process.env.K8S_CA_CERT ? fs.readFileSync(process.env.K8S_CA_CERT) : undefined;
  } else {
    baseURL = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT ?? 443}`;
    token = fs.readFileSync(`${SA_DIR}/token`, "utf-8").trim();
    ca = fs.readFileSync(`${SA_DIR}/ca.crt`);
  }

  return axios.create({
    baseURL,
    timeout: 10_000,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    httpsAgent: new https.Agent({ ca, rejectUnauthorized: process.env.K8S_INSECURE_SKIP_TLS_VERIFY !== "true" }),
  });
}

function deploymentPath(namespace: string, name: string): string {
  for (const [label, value] of [["namespace", namespace], ["deployment", name]]) {
    if (!DNS_1123_LABEL.test(value)) throw new Error(`Invalid ${label} name "${value}"`);
  }
  return `/apis/apps/v1/namespaces/${namespace}/deployments/${name}`;
}

function apiError(err: unknown): Error {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { message?: string } | undefined)?.message ?? err.message;
    return new Error(err.response ? `Kubernetes API ${err.response.status}: ${message}` : `Kubernetes API unreachable: ${message}`);
  }
  return err as Error;
}

// Same mechanism as `kubectl rollout restart`: bumping a pod-template
// annotation makes the Deployment roll its pods.
export async function rolloutRestartDeployment(namespace: string, name: string) {
  const path = deploymentPath(namespace, name);
  const restartedAt = new Date().toISOString();
  try {
    await client().patch(
      path,
      { spec: { template: { metadata: { annotations: { "kubectl.kubernetes.io/restartedAt": restartedAt } } } } },
      { headers: { "Content-Type": "application/strategic-merge-patch+json" } }
    );
  } catch (err) {
    throw apiError(err);
  }
  return { namespace, deployment: name, restartedAt };
}

export async function scaleDeployment(namespace: string, name: string, delta: number) {
  const path = `${deploymentPath(namespace, name)}/scale`;
  const maxReplicas = Number(process.env.K8S_MAX_REPLICAS) || 10;
  const api = client();
  try {
    const { data } = await api.get<{ spec?: { replicas?: number } }>(path);
    const from = data.spec?.replicas ?? 0;
    const to = Math.max(0, Math.min(maxReplicas, from + delta));
    if (to !== from) {
      await api.patch(path, { spec: { replicas: to } }, { headers: { "Content-Type": "application/merge-patch+json" } });
    }
    return { namespace, deployment: name, from, to, capped: from + delta > maxReplicas };
  } catch (err) {
    throw apiError(err);
  }
}
