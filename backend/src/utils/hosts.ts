// Cluster-internal names and private addresses are services we can act on
// with Kubernetes; anything else is a third-party host.
export function isInternalHost(hostWithPort: string): boolean {
  const host = hostWithPort.replace(/:\d+$/, "");
  if (host === "localhost" || !host.includes(".")) return true;
  if (/\.(local|internal|svc|cluster\.local|corp|lan)$/.test(host)) return true;
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}
