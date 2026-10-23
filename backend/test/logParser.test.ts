import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isStaticAsset, normalizePath, parseLogLine } from "../src/services/logParser.service";

describe("parseLogLine", () => {
  const cases: Array<[string, string, Record<string, unknown>]> = [
    [
      "nginx combined with trailing request time",
      '127.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /api/v1/users/49102?x=1 HTTP/1.1" 200 2326 "-" "curl/8.0" 0.042',
      { method: "GET", path: "/api/v1/users/49102", status: 200, latencyMs: 42 },
    ],
    [
      "vhost combined keeps non-default port, drops :443",
      'payments.internal:443 10.1.2.3 - - [10/Oct/2026:13:55:36 +0000] "POST /v2/charges HTTP/1.1" 502 120 "-" "okhttp" rt=1.250 pod=payments-7d9f-x2',
      { method: "POST", host: "payments.internal", status: 502, latencyMs: 1250, pod: "payments-7d9f-x2" },
    ],
    [
      "host= key/value",
      '10.0.0.1 - - [10/Oct/2026:13:55:36 +0000] "GET /health HTTP/1.1" 200 2 "-" "kube-probe/1.29" host=orders.svc',
      { host: "orders.svc", path: "/health" },
    ],
    [
      "OpenShift router (HAProxy) with captured host header",
      'Oct 10 13:55:36 router haproxy[42]: 10.128.0.1:5432 [10/Oct/2026:13:55:36.655] fe_sni~ be_edge_http:shop:catalog/pod:catalog-5b8c-abcd:catalog:8080:10.131.0.7:8080 0/0/1/68/69 200 2750 - - --NI 1/1/0/0/0 0/0 {catalog.apps.example.com} "GET /products/123 HTTP/1.1"',
      { method: "GET", path: "/products/123", host: "catalog.apps.example.com", service: "catalog", pod: "catalog-5b8c-abcd", latencyMs: 69 },
    ],
    [
      "JSON app log",
      '{"method":"GET","path":"/orders/ORD12345","status":404,"duration_ms":12,"host":"orders.prod.svc","pod":"orders-1"}',
      { method: "GET", path: "/orders/ORD12345", status: 404, latencyMs: 12, host: "orders.prod.svc" },
    ],
    [
      "Fluent Bit Kubernetes wrapper around a morgan line",
      '{"log":"GET /cart/9 200 3.400 ms - 15\\n","kubernetes":{"pod_name":"cart-abc","labels":{"app":"cart"}}}',
      { method: "GET", path: "/cart/9", status: 200, pod: "cart-abc", service: "cart", latencyMs: 3 },
    ],
    [
      "Envoy JSON access log",
      '{"start_time":"2026-10-10T13:55:36.000Z","method":"PUT","path":"/v1/items/5","response_code":"201","duration":"17","authority":"items.mesh:8080","upstream_cluster":"outbound|8080||items"}',
      { method: "PUT", status: 201, host: "items.mesh:8080", latencyMs: 17 },
    ],
    [
      "nested JSON with a full URL",
      '{"http":{"method":"DELETE","url":"https://api.example.com/v1/sessions/8f14e45fceea167a5a36dedd4bea2543","status_code":204},"duration_ms":8}',
      { method: "DELETE", host: "api.example.com", scheme: "https", status: 204 },
    ],
    [
      "Fluent Bit wrapper without a host falls back to <app>.<namespace>.svc",
      '{"log":"GET /stock/4 200 2.0 ms - 1","kubernetes":{"pod_name":"stock-1","namespace_name":"shop","labels":{"app":"stock"}}}',
      { host: "stock.shop.svc", service: "stock", pod: "stock-1", path: "/stock/4" },
    ],
    ["morgan dev format", "GET /api/users/12 304 1.234 ms - -", { method: "GET", path: "/api/users/12", status: 304 }],
  ];

  for (const [name, line, expected] of cases) {
    it(name, () => {
      const parsed = parseLogLine(line);
      assert.ok(parsed, "line should parse");
      for (const [key, value] of Object.entries(expected)) assert.equal((parsed as any)[key], value, key);
    });
  }

  it("parses CLF timestamps with their zone", () => {
    const parsed = parseLogLine('1.2.3.4 - - [10/Oct/2026:13:55:36 +0100] "GET / HTTP/1.1" 200 1 "-" "-"');
    assert.equal(parsed?.timestamp?.toISOString(), "2026-10-10T12:55:36.000Z");
  });

  it("rejects lines that aren't HTTP requests", () => {
    assert.equal(parseLogLine("random log line with no request"), null);
    assert.equal(parseLogLine('{"level":"info","msg":"started"}'), null);
    assert.equal(parseLogLine(""), null);
    assert.equal(parseLogLine('1.2.3.4 - - [10/Oct/2026:13:55:36 +0000] "BREW /pot HTTP/1.1" 418 1 "-" "-"'), null);
  });
});

describe("normalizePath", () => {
  const cases: Array<[string, string]> = [
    ["/api/v1/users/49102", "/api/v1/users/:id"],
    ["/v1/sessions/8f14e45f-ceea-467a-9a36-dedd4bea2543/events", "/v1/sessions/:uuid/events"],
    ["/orders/ORD12345", "/orders/:id"],
    ["/reports/2026-10-10", "/reports/:date"],
    ["/objects/507f1f77bcf86cd799439011", "/objects/:hash"],
    ["/users/jane%40example.com", "/users/:email"],
    ["/auth/reset/aGVsbG8gd29ybGQ1234567890xyz", "/auth/reset/:token"],
    ["/api/v2/oauth2/token", "/api/v2/oauth2/token"],
    ["/html5/v1", "/html5/v1"],
    ["/", "/"],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => assert.equal(normalizePath(input), expected));
  }
});

describe("isStaticAsset", () => {
  it("skips bundles and images but not API paths", () => {
    assert.equal(isStaticAsset("/static/app.4f3a.js"), true);
    assert.equal(isStaticAsset("/img/logo.svg"), true);
    assert.equal(isStaticAsset("/api/js"), false);
  });
});
