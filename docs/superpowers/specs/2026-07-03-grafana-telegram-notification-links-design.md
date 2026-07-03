# Grafana Telegram alert notifications: correct links + Markdown formatting — design

## Problem

Telegram alert notifications currently look like this (plain text, from Grafana's default message template):

```
Source: http://localhost:3000/alerting/grafana/alert-sandbox-unavailable/view?orgId=1
Silence: http://localhost:3000/alerting/silence/new?alertmanager=grafana&matcher=...
```

Two issues:

1. **Wrong host.** The URLs use `localhost:3000` (Grafana's built-in default), because `GF_SERVER_ROOT_URL` is never set. The instance is actually reachable at `http://213.35.126.204:3001`. Every notification's Source/Silence link is currently dead for anyone clicking it outside the host machine.
2. **No formatting.** The Telegram contact point (`monitoring/grafana/provisioning/alerting/contact-points.yaml.tmpl`) doesn't set a `parse_mode`, so Grafana's default template — which contains Markdown-style `**Firing**` bold markers — renders as literal asterisks, and URLs show as raw unclickable-looking text blocks instead of named links.

## Fix

### 1. Correct the root URL

Add `GF_SERVER_ROOT_URL` to the `grafana` service in `docker-compose.yml`, sourced from a new `GRAFANA_ROOT_URL` env var (`.env` / `.env.example`), set to `http://213.35.126.204:3001`.

Every Grafana-managed alert instance exposes `.GeneratorURL` ("Source"), `.SilenceURL` ("Silence") and, if the rule ever gets dashboard/panel annotations, `.DashboardURL`/`.PanelURL` — all four are built from this root URL server-side. Fixing it once fixes every alert's links; no per-rule changes to `alert-rules.yaml` are needed.

### 2. Markdown-formatted, clickable Telegram message

In `contact-points.yaml.tmpl`, set `parse_mode: MarkdownV2` on the Telegram receiver and replace the default message with a custom Go template that:

- Bolds the alert title (`*{{ ... }}*`)
- Turns Source/Silence into named clickable links (`[Source](url)` / `[Silence](url)`)
- Separates Firing / Resolved sections with emoji headers

MarkdownV2 requires escaping 18 reserved characters (`` _ * [ ] ( ) ~ ` > # + - = | { } . ! ``) in any dynamic text, or Telegram rejects the whole message. A local `mdv2Escape` sub-template (defined inline in the same `message` field) does this via `reReplaceAll("([_*\[\]()~`>#+=|{}.!\\-])", "\$1", .)`, applied to `.Labels.alertname` and `.Annotations.summary` — the two dynamic fields interpolated into the message. Static template text (e.g. the literal `(1)` alert count) is hand-escaped in the template source itself.

Full message template:

```gotemplate
{{ define "mdv2Escape" }}{{ reReplaceAll "([_*\[\]()~`>#+=|{}.!\\-])" "\$1" . }}{{ end }}
{{ if gt (len .Alerts.Firing) 0 }}🔴 *Firing* \({{ len .Alerts.Firing }}\)
{{ range .Alerts.Firing }}
*{{ template "mdv2Escape" .Labels.alertname }}*
{{ template "mdv2Escape" .Annotations.summary }}
[Source]({{ .GeneratorURL }}) · [Silence]({{ .SilenceURL }})
{{ end }}{{ end }}{{ if gt (len .Alerts.Resolved) 0 }}
✅ *Resolved* \({{ len .Alerts.Resolved }}\)
{{ range .Alerts.Resolved }}
*{{ template "mdv2Escape" .Labels.alertname }}*
{{ end }}{{ end }}
```

(Note: the Go-string-literal encoding of the regex/replacement inside the actual YAML file requires doubled backslashes — `\\[`, `\\]`, `\\\\-`, `\\$1` — see implementation plan for the exact on-disk text. The form above is the logical/regex-level version for readability.)

## Verified correctness

Hand-escaping regex replacement strings for a templating engine is error-prone, so this was validated by actually running the template through Go's `text/template` + `regexp` (the same engine Grafana uses) in an isolated `golang:1.22-alpine` container, feeding it all 7 real alert titles/summaries from `alert-rules.yaml`. Confirmed:
- Reserved characters in dynamic text (`(`, `)`, `.`, `_`) are correctly backslash-escaped.
- Text with no reserved characters passes through unchanged.
- Firing-only, Resolved-only, and mixed Firing+Resolved renders all produce valid MarkdownV2.

## Out of scope

- No changes to `alert-rules.yaml` — no `dashboardUid`/`panelId`/`runbook_url` annotations are being added (explicitly descoped earlier: several alerts, e.g. `alert-cpu-usage` and `alert-api-down`, have no matching dashboard panel to link to, and there's no runbook/wiki doc system in this project yet).
- No change to `repeat_interval` or alert thresholds.

## Verification

Config/infra change, not app logic — verified against the live stack, not automated tests:

1. Rebuild + redeploy `grafana` (picks up `GF_SERVER_ROOT_URL` and the re-provisioned contact point).
2. In Grafana UI → Alerting → Contact points → Telegram → "Test", send a test notification.
3. Confirm in Telegram: message renders with bold title, no literal `\`/`*` characters leaking through, and tapping "Source"/"Silence" opens `http://213.35.126.204:3001/...` (not `localhost:3000`).
