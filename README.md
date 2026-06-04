# Programming Learning Platform

A standalone web platform for university programming exercises. Supports Blockly (visual block-based) and Python (text-based) exercise types with a decoupled export/import grading workflow. Single-server Docker Compose deployment.

---

## Table of Contents

- [Programming Learning Platform](#programming-learning-platform)
  - [Table of Contents](#table-of-contents)
  - [Part 1: Deployment](#part-1-deployment)
    - [Prerequisites](#prerequisites)
    - [Clone and Configure](#clone-and-configure)
      - [Create the environment configuration file](#create-the-environment-configuration-file)
    - [First-Time Launch](#first-time-launch)
    - [Initial Admin Account](#initial-admin-account)
    - [Verify the Deployment](#verify-the-deployment)
  - [Part 2: Operations](#part-2-operations)
    - [Starting and Stopping Services](#starting-and-stopping-services)
    - [Viewing Logs](#viewing-logs)
    - [Database Backups](#database-backups)
    - [Monitoring](#monitoring)
    - [Upgrading](#upgrading)
    - [Troubleshooting](#troubleshooting)
      - [Application returns 502 Bad Gateway](#application-returns-502-bad-gateway)
      - [Database connection refused](#database-connection-refused)
      - [Sandbox does not execute code / returns errors](#sandbox-does-not-execute-code--returns-errors)
      - [Grafana shows no data](#grafana-shows-no-data)
      - [Disk space exhaustion](#disk-space-exhaustion)

---

## Part 1: Deployment

### Prerequisites

| Requirement | Minimum Version |
|---|---|
| Docker | 24.x |
| Docker Compose | 2.x |
| Operating System | Linux (64-bit) |
| RAM | 2 GB |
| Disk | 10 GB free |

The server must expose **port 80** (application) to users. Ports **9090** (Prometheus) and **3001** (Grafana) are for internal monitoring and should be firewall-restricted to admin access only.

---

### Clone and Configure

On the server, open a terminal and run:

```bash
git clone https://github.com/Jeromefromcn/programming-learning-platform.git programming-learning-platform
cd programming-learning-platform
```

This downloads the project code into a folder called `programming-learning-platform` and opens that folder.

#### Create the environment configuration file

The platform needs a configuration file called `.env` to know things like database passwords and secret keys. This file is **not included in the repository** because it contains sensitive credentials that must never be shared publicly. Instead, the repository provides a template file called `.env.example` that lists all the required settings with placeholder values.

**Step 1 — Copy the template to create your own configuration file.**

Run this command from inside the `programming-learning-platform` folder:

```bash
cp .env.example .env
```

This creates a new file `.env` in the same folder. The template file `.env.example` is left untouched.

**Step 2 — Open `.env` in a text editor and replace every placeholder with real values.**

```bash
nano .env
```

The file looks like this. Replace the values in `< >` with your own:

```env
# Database
DB_URL=jdbc:mysql://mysql:3306/exercise_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USERNAME=platform
DB_PASSWORD=<strong-password>
DB_ROOT_PASSWORD=<strong-root-password>
MYSQL_HOST=mysql
MYSQL_DATABASE=exercise_db

# Auth — must be at least 32 random characters
JWT_SECRET=<minimum-32-character-random-secret>

# Monitoring
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

| Setting | What it is |
|---|---|
| `DB_PASSWORD` | Password the application uses to connect to the database. Choose any strong password. |
| `DB_ROOT_PASSWORD` | Root (administrator) password for the database itself. Choose a different strong password. |
| `JWT_SECRET` | A secret key used to sign login tokens. Must be at least 32 random characters. |
| `GRAFANA_ADMIN_PASSWORD` | Password for the Grafana monitoring dashboard. |
| `DB_URL`, `DB_USERNAME`, `MYSQL_HOST`, `MYSQL_DATABASE` | Leave these unchanged unless you have a specific reason to modify them. |

To generate a secure random value for `JWT_SECRET`, run:

```bash
openssl rand -hex 32
```

Copy the output and paste it as the value of `JWT_SECRET` in `.env`.

Save and close the file (in nano: press `Ctrl+O`, then `Enter` to save, then `Ctrl+X` to exit).

**Security checklist before going live:**
- Every `<...>` placeholder in `.env` must be replaced with a real value.
- `DB_PASSWORD`, `DB_ROOT_PASSWORD`, and `GRAFANA_ADMIN_PASSWORD` should each be a unique, strong password — do not reuse the same password for all three.
- `JWT_SECRET` must be at least 32 characters of random data (use the `openssl` command above).
- Do not commit `.env` to git or share it with anyone outside the operations team.
- Restrict firewall access to ports 9090 and 3001 so only admins can reach the monitoring dashboards.

---

### First-Time Launch

```bash
docker compose up -d
```

This starts seven services:

| Service | Role | Internal Port |
|---|---|---|
| `nginx` | Reverse proxy + static file server | 80 (public) |
| `api-server` | Spring Boot REST API | 8080 |
| `mysql` | MySQL 8.0 database | 3306 |
| `sandbox` | Python code execution (nsjail) | 5000 |
| `prometheus` | Metrics collection | 9090 |
| `grafana` | Monitoring dashboards | 3001 |
| `backup` | Automated daily database backup | — |

On first startup, Flyway automatically runs all database migrations, creates the schema, and seeds the default admin account. No manual database setup is required.

Wait for the API to become healthy before using the application:

```bash
docker compose logs -f api-server
# Wait until you see: Started ExercisePlatformApplication
```

---

### Initial Admin Account

A default Super Admin account is created automatically by the database migration:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

**Change this password immediately after first login.** Go to the login page, sign in with the credentials above, then use the admin panel to reset the password.

---

### Verify the Deployment

| Check | URL | Expected |
|---|---|---|
| Application loads | `http://<your-server>/` | Login page |
| API health | `http://<your-server>/api/actuator/health` | `{"status":"UP"}` |
| Prometheus | `http://<your-server>:9090` | Prometheus UI |
| Grafana | `http://<your-server>:3001` | Grafana login |

If the application page does not load, check the nginx and api-server logs:

```bash
docker compose logs nginx
docker compose logs api-server
```

---

## Part 2: Operations

### Starting and Stopping Services

Start all services (detached):
```bash
docker compose up -d
```

Stop all services without removing data:
```bash
docker compose down
```

Restart a single service (e.g., after a config change):
```bash
docker compose restart api-server
```

Check service status:
```bash
docker compose ps
```

---

### Viewing Logs

Stream logs for all services:
```bash
docker compose logs -f
```

Stream logs for a specific service:
```bash
docker compose logs -f api-server
docker compose logs -f nginx
docker compose logs -f sandbox
```

The API server logs in structured JSON format. Each log line includes a timestamp, log level, and message. To filter for errors only:

```bash
docker compose logs api-server | grep '"level":"ERROR"'
```

---

### Database Backups

**Automatic backups** run daily via the `backup` service. Backups are compressed MySQL dumps stored at:

```
/var/backups/exercise-platform/backup_YYYY-MM-DD_HH-MM.sql.gz
```

Backups older than 30 days are automatically deleted.

**Trigger a manual backup** at any time:

```bash
docker compose exec backup /backup.sh
```

**Restore from a backup:**

```bash
# Copy the backup file out of the container if needed
gunzip -c /var/backups/exercise-platform/backup_2026-06-04_02-00.sql.gz \
  | docker compose exec -T mysql \
    mysql -u${DB_USERNAME} -p${DB_PASSWORD} ${MYSQL_DATABASE}
```

> Always stop application traffic (take nginx offline or redirect) before restoring, to prevent writes during the restore operation.

**Verify backup integrity** by checking that the file is non-empty and can be decompressed:

```bash
ls -lh /var/backups/exercise-platform/
gunzip -t /var/backups/exercise-platform/backup_2026-06-04_02-00.sql.gz && echo "OK"
```

---

### Monitoring

**Prometheus** (`http://<your-server>:9090`) collects metrics from the API server every 15 seconds. Use the Prometheus UI to query raw metrics.

**Grafana** (`http://<your-server>:3001`) provides dashboards. Log in with username `admin` and the `GRAFANA_ADMIN_PASSWORD` from your `.env` file.

Key metrics to monitor:

| Metric | What it means |
|---|---|
| `jvm_memory_used_bytes` | JVM heap and non-heap usage |
| `http_server_requests_seconds` | API request latency and error rate |
| `hikaricp_connections_active` | Active database connections |
| `process_cpu_usage` | API server CPU usage |

**Health endpoint** (accessible without authentication):

```
GET http://<your-server>/api/actuator/health
```

Returns `{"status":"UP"}` when the application and database connection are healthy.

---

### Upgrading

1. Pull the latest code:
   ```bash
   git pull origin main
   ```

2. Rebuild changed images:
   ```bash
   docker compose build --no-cache
   ```

3. Restart services with the new images:
   ```bash
   docker compose up -d
   ```

   Flyway will automatically apply any new database migrations on startup.

4. Verify the upgrade:
   ```bash
   docker compose ps
   curl http://localhost/api/actuator/health
   ```

> **Before upgrading a production instance:** take a manual backup first (see [Database Backups](#database-backups)).

---

### Troubleshooting

#### Application returns 502 Bad Gateway

The API server has not started yet or has crashed. Check its logs:

```bash
docker compose logs api-server
```

Common causes:
- Database not ready when API started — wait for mysql healthcheck to pass, then restart the API:
  ```bash
  docker compose restart api-server
  ```
- `JWT_SECRET` is shorter than 32 characters — update `.env` and restart.

#### Database connection refused

```bash
docker compose ps mysql
docker compose logs mysql
```

If mysql is still initialising, wait for the healthcheck to report `healthy` before starting other services:

```bash
docker compose up -d mysql
docker compose ps mysql   # wait until status shows "healthy"
docker compose up -d
```

#### Sandbox does not execute code / returns errors

The sandbox requires `SYS_ADMIN` capability for nsjail. Verify the host kernel supports user namespaces:

```bash
docker compose logs sandbox
```

If you see permission errors, ensure the host allows unprivileged user namespaces:

```bash
sysctl kernel.unprivileged_userns_clone   # should be 1
```

#### Grafana shows no data

Check that Prometheus is scraping the API successfully:

1. Open `http://<your-server>:9090/targets`
2. The `exercise-platform` target should show state `UP`.

If the target is `DOWN`, confirm the API server is running and the `/api/actuator/prometheus` endpoint is reachable from the prometheus container:

```bash
docker compose exec prometheus wget -qO- http://api-server:8080/api/actuator/prometheus | head -5
```

#### Disk space exhaustion

Old backups accumulate if the automatic cleanup is not running. Check disk usage and backup age:

```bash
df -h /var/backups/exercise-platform
ls -lh /var/backups/exercise-platform/
```

Manually delete backups older than your retention window if needed:

```bash
find /var/backups/exercise-platform -name "*.sql.gz" -mtime +30 -delete
```
