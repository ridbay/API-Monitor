{{/*
Backend pod template shared by the API and scheduler Deployments.
Call with (dict "ctx" $ "component" "api" "scheduler" "true" "resources" .Values.api.resources)
*/}}
{{- define "api-monitor.backendPod" -}}
{{- $ := .ctx -}}
metadata:
  labels:
    {{- include "api-monitor.selector" (dict "ctx" $ "component" .component) | nindent 4 }}
  annotations:
    checksum/config: {{ include (print $.Template.BasePath "/config.yaml") $ | sha256sum }}
    checksum/secret: {{ include (print $.Template.BasePath "/secret.yaml") $ | sha256sum }}
spec:
  serviceAccountName: {{ include "api-monitor.fullname" $ }}
  {{- include "api-monitor.podCommon" $ | nindent 2 }}
  initContainers:
    # Idempotent and advisory-locked, so every replica can run it safely.
    - name: migrate
      image: {{ include "api-monitor.backendImage" $ }}
      imagePullPolicy: {{ $.Values.image.pullPolicy }}
      command: ["node", "dist/config/migrate.js"]
      {{- include "api-monitor.backendEnv" $ | nindent 6 }}
      securityContext:
        {{- toYaml $.Values.containerSecurityContext | nindent 8 }}
  containers:
    - name: {{ .component }}
      image: {{ include "api-monitor.backendImage" $ }}
      imagePullPolicy: {{ $.Values.image.pullPolicy }}
      command: ["node", "dist/index.js"]
      {{- include "api-monitor.backendEnv" $ | nindent 6 }}
      env:
        - name: SCHEDULER_ENABLED
          value: {{ .scheduler | quote }}
      ports:
        - name: http
          containerPort: {{ $.Values.api.port }}
      startupProbe:
        httpGet: { path: /health, port: http }
        periodSeconds: 3
        failureThreshold: 40
      livenessProbe:
        httpGet: { path: /health, port: http }
        periodSeconds: 15
      readinessProbe:
        httpGet: { path: /ready, port: http }
        periodSeconds: 10
      resources:
        {{- toYaml .resources | nindent 8 }}
      securityContext:
        {{- toYaml $.Values.containerSecurityContext | nindent 8 }}
      volumeMounts:
        - { name: tmp, mountPath: /tmp }
  volumes:
    - name: tmp
      emptyDir: {}
{{- end -}}
