# Grafana Telegram Notification Links & Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Grafana's Telegram alert notifications so Source/Silence links point at the real host (not `localhost:3000`) and the message renders as formatted, clickable Markdown instead of plain text.

**Architecture:** Pure provisioning-config change, no application code. (1) Set `GF_SERVER_ROOT_URL` on the `grafana` container so Grafana's built-in `.GeneratorURL`/`.SilenceURL` template fields resolve to the correct host:port. (2) Set `parse_mode: MarkdownV2` on the Telegram contact point and replace its default message with a custom Go template that bolds the alert title and turns links into `[Source](url)`-style clickable Markdown, using an inline `mdv2Escape` helper (built on the `reReplaceAll` template func) to escape MarkdownV2's reserved characters in dynamic text.

**Tech Stack:** Docker Compose, Grafana 10.4.0 file-based alerting provisioning, Go `text/template` (Grafana's notification templating engine).

## Global Constraints

- No changes to `monitoring/grafana/provisioning/alerting/alert-rules.yaml` (per spec: out of scope).
- No new env vars beyond `GRAFANA_ROOT_URL`.
- Root URL value: `http://213.35.126.204:3001` (confirmed by project owner).
- The exact `message` template text below has already been validated by executing it through a real Go `text/template` + `regexp` engine (see spec doc `docs/superpowers/specs/2026-07-03-grafana-telegram-notification-links-design.md`) — copy it verbatim, do not hand-edit the escape sequences.

---

### Task 1: Configure Grafana's public root URL

**Files:**
- Modify: `.env.example`
- Modify: `.env`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: env var `GRAFANA_ROOT_URL`, consumed by the `grafana` service's `GF_SERVER_ROOT_URL` environment entry.

- [ ] **Step 1: Add `GRAFANA_ROOT_URL` to `.env.example`**

Open `.env.example`. It currently ends with:
```
# Telegram alerts (optional) — fill in to enable Grafana alert notifications
# Create a bot via @BotFather, add it to your group, then set the chat ID
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```
Add a new block right after `GRAFANA_ADMIN_PASSWORD=changeme` (so it's grouped with the other Grafana setting):
```
GRAFANA_ADMIN_PASSWORD=changeme
# Public URL where this Grafana instance is reachable (used to build correct
# Source/Silence links in alert notifications) — include the port, e.g. :3001
GRAFANA_ROOT_URL=http://your-server-host:3001
```

- [ ] **Step 2: Add the real value to `.env`**

Open `.env`. Find the line `GRAFANA_ADMIN_PASSWORD=changeme` and add directly after it:
```
GRAFANA_ROOT_URL=http://213.35.126.204:3001
```

- [ ] **Step 3: Wire it into `docker-compose.yml`**

Find the `grafana` service's `environment:` block:
```yaml
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_PATHS_PROVISIONING: /etc/grafana/provisioning
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
```
Change it to:
```yaml
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_PATHS_PROVISIONING: /etc/grafana/provisioning
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID:-}
```

- [ ] **Step 4: Verify the env var resolves correctly**

Run:
```bash
docker compose config | grep -A5 "GF_SERVER_ROOT_URL\|^  grafana:"
```
Expected: output includes `GF_SERVER_ROOT_URL: http://213.35.126.204:3001` (not `<no value>` or empty).

- [ ] **Step 5: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "$(cat <<'EOF'
fix(monitoring): set Grafana root URL for correct alert notification links

GF_SERVER_ROOT_URL was never set, so every alert notification's
Source/Silence link pointed at localhost:3000 instead of the real host.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
Note: `.env` is gitignored/local — do not add it in this commit; only `.env.example` and `docker-compose.yml` are tracked.

---

### Task 2: Markdown-formatted, clickable Telegram alert messages

**Files:**
- Modify: `monitoring/grafana/provisioning/alerting/contact-points.yaml.tmpl`

**Interfaces:**
- Consumes: `${TELEGRAM_BOT_TOKEN}` / `${TELEGRAM_CHAT_ID}` placeholders (substituted by `monitoring/grafana/grafana-entrypoint.sh` at container start — unchanged, do not touch that script).
- Produces: none consumed by later tasks (this is the final config file).

- [ ] **Step 1: Replace the file contents**

Current `contact-points.yaml.tmpl`:
```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: Telegram
    receivers:
      - uid: telegram-main
        type: telegram
        disableResolveMessage: false
        settings:
          chatid: "${TELEGRAM_CHAT_ID}"
          bottoken: "${TELEGRAM_BOT_TOKEN}"
```

Replace the entire file with:
```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: Telegram
    receivers:
      - uid: telegram-main
        type: telegram
        disableResolveMessage: false
        settings:
          chatid: "${TELEGRAM_CHAT_ID}"
          bottoken: "${TELEGRAM_BOT_TOKEN}"
          parse_mode: MarkdownV2
          message: |-
            {{ define "mdv2Escape" }}{{ reReplaceAll "([_*\\[\\]()~`>#+=|{}.!\\\\-])" "\\$1" . }}{{ end }}
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

Indentation matters: the `message: |-` block's lines must be indented consistently (2 spaces deeper than `message:`) — match the file's existing 10-space indent under `settings:` plus 2 more spaces, i.e. 12 spaces before `{{ define ... }}` etc.

- [ ] **Step 2: Validate YAML syntax**

Run:
```bash
python3 -c "
import yaml
with open('monitoring/grafana/provisioning/alerting/contact-points.yaml.tmpl') as f:
    doc = yaml.safe_load(f)
msg = doc['contactPoints'][0]['receivers'][0]['settings']['message']
assert doc['contactPoints'][0]['receivers'][0]['settings']['parse_mode'] == 'MarkdownV2'
print('YAML OK, message length:', len(msg))
print(msg)
"
```
Expected: no exception, prints `YAML OK, message length: <some number>` followed by the template text (with `\\[`, `\\]`, `\\\\-`, `\\$1` visible as literal backslash pairs — this is correct, that's the Go-template-source form).

- [ ] **Step 3: Validate the Go template actually parses and renders correctly**

This re-runs the same check used to design the template, against the literal string now embedded in the file. Create a throwaway test dir and Go program:

```bash
mkdir -p /tmp/mdv2-verify
python3 -c "
import yaml, json
with open('monitoring/grafana/provisioning/alerting/contact-points.yaml.tmpl') as f:
    doc = yaml.safe_load(f)
msg = doc['contactPoints'][0]['receivers'][0]['settings']['message']
with open('/tmp/mdv2-verify/message.txt', 'w') as out:
    out.write(msg)
"
cat > /tmp/mdv2-verify/main.go <<'GOEOF'
package main

import (
	"fmt"
	"os"
	"regexp"
	"text/template"
)

func main() {
	funcMap := template.FuncMap{
		"reReplaceAll": func(pattern, repl, text string) string {
			return regexp.MustCompile(pattern).ReplaceAllString(text, repl)
		},
	}
	tmplBytes, err := os.ReadFile("/tmp/mdv2-verify/message.txt")
	if err != nil {
		panic(err)
	}
	t, err := template.New("msg").Funcs(funcMap).Parse(string(tmplBytes))
	if err != nil {
		fmt.Println("PARSE ERROR:", err)
		os.Exit(1)
	}

	type Alert struct {
		Labels       map[string]string
		Annotations  map[string]string
		GeneratorURL string
		SilenceURL   string
	}
	data := struct{ Alerts struct{ Firing, Resolved []Alert } }{}
	data.Alerts.Firing = []Alert{
		{
			Labels:       map[string]string{"alertname": "High API Latency (p99)"},
			Annotations:  map[string]string{"summary": "API p99 response time has exceeded 2 seconds for 5 minutes."},
			GeneratorURL: "http://213.35.126.204:3001/alerting/grafana/alert-api-latency/view?orgId=1",
			SilenceURL:   "http://213.35.126.204:3001/alerting/silence/new?alertmanager=grafana&matcher=alertname%3DDatasourceNoData&orgId=1",
		},
	}
	if err := t.Execute(os.Stdout, data); err != nil {
		fmt.Println("\nEXEC ERROR:", err)
		os.Exit(1)
	}
	fmt.Println()
}
GOEOF
docker run --rm -v /tmp/mdv2-verify:/app -w /app golang:1.22-alpine go run main.go
```

Expected output (no PARSE ERROR / EXEC ERROR lines):
```
🔴 *Firing* \(1\)

*High API Latency \(p99\)*
API p99 response time has exceeded 2 seconds for 5 minutes\.
[Source](http://213.35.126.204:3001/alerting/grafana/alert-api-latency/view?orgId=1) · [Silence](http://213.35.126.204:3001/alerting/silence/new?alertmanager=grafana&matcher=alertname%3DDatasourceNoData&orgId=1)
```
Note the escaped `\(`, `\)`, and `\.` around the dynamic title/summary text — that's `mdv2Escape` working. If you instead see `PARSE ERROR` or the escapes are missing/wrong, stop and re-copy the `message:` block from Step 1 exactly (a single mistyped backslash breaks this).

- [ ] **Step 4: Clean up the throwaway verification dir**

```bash
rm -rf /tmp/mdv2-verify
```

- [ ] **Step 5: Commit**

```bash
git add monitoring/grafana/provisioning/alerting/contact-points.yaml.tmpl
git commit -m "$(cat <<'EOF'
fix(monitoring): format Telegram alerts as clickable MarkdownV2

Default Telegram message had no parse_mode, so Grafana's Markdown-style
default template rendered as literal text with raw, unlabeled URLs.
Adds parse_mode: MarkdownV2 and a custom message template with bold
titles and named Source/Silence links, escaping MarkdownV2's reserved
characters in dynamic alert text via a reReplaceAll-based helper.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Redeploy and manually verify against the live Telegram bot

**Files:** none (deployment + manual UI verification only)

**Interfaces:** none — terminal task.

This task restarts a live container and sends a real Telegram message. **Confirm with the project owner before running Step 1** if the stack is currently serving real users/monitoring.

- [ ] **Step 1: Rebuild and redeploy the `grafana` container**

```bash
docker compose up -d --force-recreate grafana
```
Expected: command reports `grafana` container recreated/started.

- [ ] **Step 2: Confirm provisioning loaded without errors**

```bash
docker compose logs grafana --since 2m | grep -i "error\|failed" | grep -i "provision\|alert\|telegram"
```
Expected: no output (no provisioning errors). If there is output, read the error message — most likely cause is a YAML indentation mistake from Task 2 Step 1.

- [ ] **Step 3: Manually test the contact point**

In a browser: open Grafana → Alerting → Contact points → find "Telegram" → click "Test" → send test notification.

- [ ] **Step 4: Confirm in the actual Telegram chat**

Check the Telegram chat/group configured via `TELEGRAM_CHAT_ID`. Confirm:
- The alert title renders **bold** (not literal `*asterisks*`)
- "Source" and "Silence" appear as short clickable link text (not a raw URL string)
- Tapping "Source" opens a URL starting with `http://213.35.126.204:3001/` (not `localhost:3000`)

If any of these fail, do not proceed further — re-check Task 2 Step 1's exact text was copied verbatim, and Task 1 Step 3's env var wiring.
