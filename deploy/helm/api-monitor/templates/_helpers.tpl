{{- define "api-monitor.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "api-monitor.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* Selector labels for one component: include with (dict "ctx" $ "component" "api") */}}
{{- define "api-monitor.selector" -}}
app.kubernetes.io/name: {{ .ctx.Chart.Name }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "api-monitor.backendImage" -}}
{{ .Values.image.backend.repository }}:{{ .Values.image.backend.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "api-monitor.frontendImage" -}}
{{ .Values.image.frontend.repository }}:{{ .Values.image.frontend.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "api-monitor.secretName" -}}
{{ .Values.secrets.existingSecret | default (printf "%s-secrets" (include "api-monitor.fullname" .)) }}
{{- end -}}

{{- define "api-monitor.kafkaBrokers" -}}
{{- if .Values.kafka.deploy -}}
{{ include "api-monitor.fullname" . }}-kafka:9092
{{- else -}}
{{ .Values.kafka.brokers }}
{{- end -}}
{{- end -}}

{{- define "api-monitor.kafkaEnabled" -}}
{{- if or .Values.kafka.deploy .Values.kafka.brokers -}}true{{- end -}}
{{- end -}}

{{- define "api-monitor.redisUrl" -}}
{{- if .Values.redis.deploy -}}
redis://{{ include "api-monitor.fullname" . }}-redis:6379
{{- else -}}
{{ .Values.redis.url }}
{{- end -}}
{{- end -}}

{{/* Shared pod-level bits: pull secrets, scheduling, pod security */}}
{{- define "api-monitor.podCommon" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with .Values.affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
securityContext:
  {{- toYaml .Values.podSecurityContext | nindent 2 }}
{{- end -}}

{{/* Environment shared by every backend process (API, scheduler, consumer) */}}
{{- define "api-monitor.backendEnv" -}}
envFrom:
  - configMapRef:
      name: {{ include "api-monitor.fullname" . }}-config
  - secretRef:
      name: {{ include "api-monitor.secretName" . }}
{{- end -}}
