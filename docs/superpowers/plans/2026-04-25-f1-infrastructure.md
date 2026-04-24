# F-1 Infrastructure & DevOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the complete platform infrastructure — Spring Boot backend skeleton, React frontend placeholder, Docker Compose with 6 services + backup, Flyway V1 migration, Nginx reverse proxy, Python sandbox (nsjail), and Grafana/Prometheus monitoring.

**Architecture:** Single-server Docker Compose deployment on `exercise-platform-net` bridge network. Spring Boot (port 8080 internal) behind Nginx (port 80 external). Python sandbox (port 5000 internal) connected only to the API. nsjail binary copied from `gcr.io/nsjail/nsjail` image — no compilation step. Backup via `mysql:8.0` base with `cron`.

**Tech Stack:** Java 17 (Eclipse Temurin) · Spring Boot 3.2.5 · Maven 3.9 · Flyway 9 · H2 (test) · MySQL 8.0 · React 18.3.1 · Vite 5 · Nginx 1.25-alpine · Python 3.12-slim · nsjail 3.4 · Flask · Prometheus 2.51 · Grafana 10.4

**Design decisions from brainstorming:**
- nsjail: pre-built binary copied from `gcr.io/nsjail/nsjail` (no compilation)
- Backup container: `mysql:8.0` base + `apt-get install cron`
- Secrets: `.env` file (git-ignored) + `.env.example` (committed)
- Backend scaffold: skeleton + `common/` cross-cutting package (Approach B)
- Sandbox base image: `python:3.12-slim` (Debian — glibc required by nsjail binary)

---

## File Map

```
programming-learning-platform/
├── .env                                          [create] git-ignored actual secrets
├── .env.example                                  [create] committed placeholder values
├── docker-compose.yml                            [create] 7 services on shared network
├── nginx/
│   ├── Dockerfile                                [create] multi-stage: Node build → Nginx serve
│   └── nginx.conf                                [create] proxy, CSP, SPA fallback, gzip
├── backend/
│   ├── Dockerfile                                [create] multi-stage: Maven build → JRE runtime
│   ├── pom.xml                                   [create] all F-1 dependencies declared
│   └── src/
│       ├── main/
│       │   ├── java/com/platform/exercise/
│       │   │   ├── ExerciseApplication.java      [create] @SpringBootApplication entry point
│       │   │   ├── common/
│       │   │   │   ├── ErrorCode.java            [create] 18 error codes with HTTP status
│       │   │   │   ├── PlatformException.java    [create] unchecked exception carrying ErrorCode
│       │   │   │   ├── ErrorResponse.java        [create] {error:{code,message,timestamp}} record
│       │   │   │   ├── GlobalExceptionHandler.java [create] @RestControllerAdvice
│       │   │   │   └── PageResponse.java         [create] generic pagination wrapper
│       │   │   └── security/
│       │   │       └── SecurityConfig.java       [create] permit-all placeholder, BCrypt bean
│       │   └── resources/
│       │       ├── application.yml               [create] MySQL + actuator + Flyway config
│       │       ├── application-test.yml          [create] H2 in-memory override
│       │       └── db/migration/
│       │           └── V1__create_schema.sql     [create] all 11 tables (from architecture.md §3.2)
│       └── test/java/com/platform/exercise/
│           ├── MigrationTest.java                [create] H2 migration smoke test
│           ├── common/
│           │   ├── ErrorCodeTest.java            [create] HTTP status mapping assertions
│           │   └── GlobalExceptionHandlerTest.java [create] error response structure assertions
│           └── security/
│               └── ActuatorHealthTest.java       [create] /actuator/health returns 200 without auth
├── frontend/
│   ├── index.html                                [create]
│   ├── package.json                              [create] React 18.3.1, Vite 5, React Router 6, Axios
│   ├── vite.config.js                            [create] dev proxy /api → localhost:8080
│   └── src/
│       ├── main.jsx                              [create] ReactDOM.createRoot
│       ├── App.jsx                               [create] BrowserRouter + catch-all → LoginPage
│       ├── pages/login/LoginPage.jsx             [create] static placeholder (no API calls)
│       ├── components/.gitkeep                   [create]
│       ├── api/.gitkeep                          [create]
│       ├── hooks/.gitkeep                        [create]
│       └── workers/.gitkeep                      [create]
├── sandbox/
│   ├── Dockerfile                                [create] nsjail from gcr.io image + python:3.12-slim
│   ├── app.py                                    [create] Flask POST /execute endpoint
│   ├── executor.py                               [create] nsjail subprocess runner
│   ├── restricted_imports.py                     [create] builtins import hook
│   └── tests/
│       ├── test_restricted_imports.py            [create] blocked/allowed module assertions
│       └── test_app.py                           [create] Flask endpoint tests (mocked executor)
├── backup/
│   ├── Dockerfile                                [create] mysql:8.0 + cron
│   └── backup.sh                                 [create] mysqldump + 30-day retention
└── monitoring/
    ├── prometheus.yml                            [create] scrape api-server:8080/actuator/prometheus
    └── grafana/
        └── provisioning/
            ├── datasources/
            │   └── prometheus.yml                [create] auto-provision Prometheus datasource
            └── dashboards/
                ├── dashboard-provider.yml        [create] file-based discovery config
                └── platform.json                 [create] 5-panel dashboard (rate, p95, errors, heap, DB)
```

---

### Task 1: Maven project scaffold

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/com/platform/exercise/ExerciseApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-test.yml`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p backend/src/main/java/com/platform/exercise/common
mkdir -p backend/src/main/java/com/platform/exercise/security
mkdir -p backend/src/main/resources/db/migration
mkdir -p backend/src/test/java/com/platform/exercise/common
mkdir -p backend/src/test/java/com/platform/exercise/security
```

Run: `ls backend/src/main/java/com/platform/exercise/`
Expected: `common/  security/`

- [ ] **Step 2: Create `backend/pom.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>com.platform</groupId>
    <artifactId>exercise-platform</artifactId>
    <version>1.0.0</version>
    <name>exercise-platform</name>
    <packaging>jar</packaging>

    <properties>
        <java.version>17</java.version>
        <jjwt.version>0.12.6</jjwt.version>
        <logstash-logback.version>7.4</logstash-logback.version>
        <rhino.version>1.7.15</rhino.version>
        <commons-csv.version>1.11.0</commons-csv.version>
    </properties>

    <dependencies>
        <!-- Spring Boot Starters -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>

        <!-- JWT -->
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>${jjwt.version}</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>

        <!-- Flyway -->
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-mysql</artifactId>
        </dependency>

        <!-- Lombok -->
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>

        <!-- Structured logging -->
        <dependency>
            <groupId>net.logstash.logback</groupId>
            <artifactId>logstash-logback-encoder</artifactId>
            <version>${logstash-logback.version}</version>
        </dependency>

        <!-- MySQL -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>

        <!-- Micrometer Prometheus -->
        <dependency>
            <groupId>io.micrometer</groupId>
            <artifactId>micrometer-registry-prometheus</artifactId>
        </dependency>

        <!-- Apache Commons CSV -->
        <dependency>
            <groupId>org.apache.commons</groupId>
            <artifactId>commons-csv</artifactId>
            <version>${commons-csv.version}</version>
        </dependency>

        <!-- Rhino JS engine -->
        <dependency>
            <groupId>org.mozilla</groupId>
            <artifactId>rhino</artifactId>
            <version>${rhino.version}</version>
        </dependency>

        <!-- Test -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-test</artifactId>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
                <configuration>
                    <excludes>
                        <exclude>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                        </exclude>
                    </excludes>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 3: Create `backend/src/main/java/com/platform/exercise/ExerciseApplication.java`**

```java
package com.platform.exercise;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ExerciseApplication {
    public static void main(String[] args) {
        SpringApplication.run(ExerciseApplication.class, args);
    }
}
```

- [ ] **Step 4: Create `backend/src/main/resources/application.yml`**

```yaml
server:
  port: 8080

spring:
  application:
    name: exercise-platform
  datasource:
    url: ${DB_URL:jdbc:mysql://mysql:3306/exercise_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC}
    username: ${DB_USERNAME:platform}
    password: ${DB_PASSWORD:changeme}
    driver-class-name: com.mysql.cj.jdbc.Driver
    hikari:
      connection-timeout: 30000
      maximum-pool-size: 10
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
    show-sql: false
  flyway:
    enabled: true
    locations: classpath:db/migration

management:
  endpoints:
    web:
      exposure:
        include: health,prometheus
  endpoint:
    health:
      show-details: never
  metrics:
    export:
      prometheus:
        enabled: true

logging:
  level:
    com.platform.exercise: INFO
    org.springframework: WARN
    org.hibernate: WARN
```

- [ ] **Step 5: Create `backend/src/main/resources/application-test.yml`**

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE;NON_KEYWORDS=VALUE,YEAR
    username: sa
    password:
    driver-class-name: org.h2.Driver
  jpa:
    database-platform: org.hibernate.dialect.H2Dialect
    hibernate:
      ddl-auto: none
  flyway:
    enabled: true
    locations: classpath:db/migration
```

- [ ] **Step 6: Verify the project compiles**

```bash
cd backend && mvn compile -q
```
Expected: `BUILD SUCCESS` (no output)

- [ ] **Step 7: Commit**

```bash
git add backend/pom.xml \
        backend/src/main/java/com/platform/exercise/ExerciseApplication.java \
        backend/src/main/resources/application.yml \
        backend/src/main/resources/application-test.yml
git commit -m "feat(infra): add Spring Boot Maven scaffold with application.yml"
```

---

### Task 2: Flyway V1 migration + MigrationTest

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__create_schema.sql`
- Create: `backend/src/test/java/com/platform/exercise/MigrationTest.java`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/MigrationTest.java`:

```java
package com.platform.exercise;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class MigrationTest {

    @Autowired
    private DataSource dataSource;

    @Test
    void v1MigrationCreatesAllElevenTables() throws Exception {
        List<String> expected = List.of(
            "users", "refresh_tokens", "categories", "courses",
            "exercises", "exercise_versions", "course_exercises",
            "course_students", "submissions", "exercise_likes", "global_settings"
        );
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT LOWER(TABLE_NAME) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'PUBLIC'")) {
            ResultSet rs = stmt.executeQuery();
            Set<String> actual = new HashSet<>();
            while (rs.next()) actual.add(rs.getString(1));
            for (String table : expected) {
                assertTrue(actual.contains(table), "Missing table: " + table);
            }
        }
    }

    @Test
    void globalSettingsSeedRowExists() throws Exception {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                 "SELECT setting_value FROM global_settings WHERE setting_key = 'course_filter_enabled'")) {
            ResultSet rs = stmt.executeQuery();
            assertTrue(rs.next(), "Seed row 'course_filter_enabled' should exist");
            assertEquals("false", rs.getString("setting_value"));
        }
    }
}
```

- [ ] **Step 2: Run the test — expect FAIL (no migration file yet)**

```bash
cd backend && mvn test -Dtest=MigrationTest -q 2>&1 | tail -5
```
Expected: `BUILD FAILURE` — Flyway finds no migration scripts

- [ ] **Step 3: Create `backend/src/main/resources/db/migration/V1__create_schema.sql`**

Copy the complete DDL from `docs/2_architecture/architecture.md` section 3.2 verbatim. The file starts with `-- V1__create_schema.sql` and ends with:

```sql
INSERT INTO global_settings (setting_key, setting_value) VALUES
    ('course_filter_enabled', 'false');
```

The SQL must be copied exactly — do not paraphrase or omit any table, index, constraint, or the seed INSERT.

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd backend && mvn test -Dtest=MigrationTest -q
```
Expected: `BUILD SUCCESS` — both tests pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration/V1__create_schema.sql \
        backend/src/test/java/com/platform/exercise/MigrationTest.java
git commit -m "feat(infra): add Flyway V1 schema (11 tables) and H2 migration smoke test"
```

---

### Task 3: Common package

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`
- Create: `backend/src/main/java/com/platform/exercise/common/PlatformException.java`
- Create: `backend/src/main/java/com/platform/exercise/common/ErrorResponse.java`
- Create: `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`
- Create: `backend/src/main/java/com/platform/exercise/common/PageResponse.java`
- Create: `backend/src/test/java/com/platform/exercise/common/ErrorCodeTest.java`
- Create: `backend/src/test/java/com/platform/exercise/common/GlobalExceptionHandlerTest.java`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/platform/exercise/common/ErrorCodeTest.java`:

```java
package com.platform.exercise.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.*;

class ErrorCodeTest {

    @Test
    void everyErrorCodeHasAnHttpStatus() {
        for (ErrorCode code : ErrorCode.values()) {
            assertNotNull(code.getHttpStatus(), code.name() + " must have an HTTP status");
        }
    }

    @Test
    void invalidCredentialsIsUnauthorized() {
        assertEquals(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS.getHttpStatus());
    }

    @Test
    void exerciseNotFoundIsNotFound() {
        assertEquals(HttpStatus.NOT_FOUND, ErrorCode.EXERCISE_NOT_FOUND.getHttpStatus());
    }

    @Test
    void usernameTakenIsConflict() {
        assertEquals(HttpStatus.CONFLICT, ErrorCode.USERNAME_TAKEN.getHttpStatus());
    }

    @Test
    void rateLimitedIsTooManyRequests() {
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED.getHttpStatus());
    }
}
```

Create `backend/src/test/java/com/platform/exercise/common/GlobalExceptionHandlerTest.java`:

```java
package com.platform.exercise.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void platformException_mapsToCorrectHttpStatus() {
        PlatformException ex = new PlatformException(ErrorCode.EXERCISE_NOT_FOUND, "Exercise 42 not found");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
    }

    @Test
    void platformException_bodyContainsCodeAndMessage() {
        PlatformException ex = new PlatformException(ErrorCode.USERNAME_TAKEN, "Username already in use");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertNotNull(response.getBody());
        assertEquals("USERNAME_TAKEN", response.getBody().error().code());
        assertEquals("Username already in use", response.getBody().error().message());
        assertNotNull(response.getBody().error().timestamp());
    }

    @Test
    void platformException_conflictMapsTo409() {
        PlatformException ex = new PlatformException(ErrorCode.CATEGORY_DUPLICATE, "Already exists");
        ResponseEntity<ErrorResponse> response = handler.handlePlatformException(ex);
        assertEquals(HttpStatus.CONFLICT, response.getStatusCode());
    }
}
```

- [ ] **Step 2: Run the tests — expect FAIL (classes missing)**

```bash
cd backend && mvn test -Dtest="ErrorCodeTest,GlobalExceptionHandlerTest" -q 2>&1 | tail -5
```
Expected: `BUILD FAILURE` — compilation errors

- [ ] **Step 3: Create `backend/src/main/java/com/platform/exercise/common/ErrorCode.java`**

```java
package com.platform.exercise.common;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED),
    ACCOUNT_DISABLED(HttpStatus.FORBIDDEN),
    TOKEN_EXPIRED(HttpStatus.UNAUTHORIZED),
    ACCESS_DENIED(HttpStatus.FORBIDDEN),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND),
    USERNAME_TAKEN(HttpStatus.CONFLICT),
    EXERCISE_NOT_FOUND(HttpStatus.NOT_FOUND),
    COURSE_NOT_FOUND(HttpStatus.NOT_FOUND),
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND),
    CATEGORY_DUPLICATE(HttpStatus.CONFLICT),
    CATEGORY_HAS_EXERCISES(HttpStatus.CONFLICT),
    IMPORT_FILE_INVALID(HttpStatus.BAD_REQUEST),
    IMPORT_EXERCISE_MISSING(HttpStatus.BAD_REQUEST),
    IMPORT_DUPLICATE(HttpStatus.CONFLICT),
    ZIP_PATH_TRAVERSAL(HttpStatus.BAD_REQUEST),
    ZIP_TOO_LARGE(HttpStatus.BAD_REQUEST),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS);

    private final HttpStatus httpStatus;

    ErrorCode(HttpStatus httpStatus) {
        this.httpStatus = httpStatus;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }
}
```

- [ ] **Step 4: Create `backend/src/main/java/com/platform/exercise/common/PlatformException.java`**

```java
package com.platform.exercise.common;

public class PlatformException extends RuntimeException {

    private final ErrorCode errorCode;

    public PlatformException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
```

- [ ] **Step 5: Create `backend/src/main/java/com/platform/exercise/common/ErrorResponse.java`**

```java
package com.platform.exercise.common;

import java.time.Instant;

public record ErrorResponse(ErrorDetails error) {

    public record ErrorDetails(String code, String message, String timestamp) {}

    public static ErrorResponse of(ErrorCode code, String message) {
        return new ErrorResponse(new ErrorDetails(
            code.name(),
            message,
            Instant.now().toString()
        ));
    }
}
```

- [ ] **Step 6: Create `backend/src/main/java/com/platform/exercise/common/GlobalExceptionHandler.java`**

```java
package com.platform.exercise.common;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(PlatformException.class)
    public ResponseEntity<ErrorResponse> handlePlatformException(PlatformException ex) {
        return ResponseEntity
            .status(ex.getErrorCode().getHttpStatus())
            .body(ErrorResponse.of(ex.getErrorCode(), ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining("; "));
        return ResponseEntity
            .status(ErrorCode.VALIDATION_ERROR.getHttpStatus())
            .body(ErrorResponse.of(ErrorCode.VALIDATION_ERROR, message));
    }
}
```

- [ ] **Step 7: Create `backend/src/main/java/com/platform/exercise/common/PageResponse.java`**

```java
package com.platform.exercise.common;

import org.springframework.data.domain.Page;

import java.util.List;

public record PageResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements,
    int totalPages
) {
    public static <T> PageResponse<T> of(Page<T> springPage) {
        return new PageResponse<>(
            springPage.getContent(),
            springPage.getNumber(),
            springPage.getSize(),
            springPage.getTotalElements(),
            springPage.getTotalPages()
        );
    }
}
```

- [ ] **Step 8: Run the tests — expect PASS**

```bash
cd backend && mvn test -Dtest="ErrorCodeTest,GlobalExceptionHandlerTest" -q
```
Expected: `BUILD SUCCESS` — 8 tests pass

- [ ] **Step 9: Run all backend tests so far**

```bash
cd backend && mvn test -q
```
Expected: `BUILD SUCCESS` — MigrationTest + ErrorCodeTest + GlobalExceptionHandlerTest all pass

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/common/ \
        backend/src/test/java/com/platform/exercise/common/
git commit -m "feat(infra): add common package (ErrorCode, PlatformException, ErrorResponse, GlobalExceptionHandler, PageResponse)"
```

---

### Task 4: SecurityConfig placeholder

**Files:**
- Create: `backend/src/main/java/com/platform/exercise/security/SecurityConfig.java`
- Create: `backend/src/test/java/com/platform/exercise/security/ActuatorHealthTest.java`

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/platform/exercise/security/ActuatorHealthTest.java`:

```java
package com.platform.exercise.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ActuatorHealthTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void actuatorHealth_returnsUp_withoutAuthentication() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"));
    }
}
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd backend && mvn test -Dtest=ActuatorHealthTest -q 2>&1 | tail -5
```
Expected: `BUILD FAILURE` — Spring Security returns 401 by default

- [ ] **Step 3: Create `backend/src/main/java/com/platform/exercise/security/SecurityConfig.java`**

```java
package com.platform.exercise.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd backend && mvn test -Dtest=ActuatorHealthTest -q
```
Expected: `BUILD SUCCESS`

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && mvn test -q
```
Expected: `BUILD SUCCESS` — all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/platform/exercise/security/ \
        backend/src/test/java/com/platform/exercise/security/
git commit -m "feat(infra): add SecurityConfig placeholder (permit-all, BCrypt encoder)"
```

---

### Task 5: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -q
COPY src ./src
RUN mvn package -DskipTests -q

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

- [ ] **Step 2: Verify the image builds**

Run from project root:
```bash
docker build -t exercise-backend ./backend
```
Expected: `Successfully tagged exercise-backend:latest` (takes ~3–5 min first time)

- [ ] **Step 3: Commit**

```bash
git add backend/Dockerfile
git commit -m "feat(infra): add backend multi-stage Dockerfile (Maven build + JRE runtime)"
```

---

### Task 6: Frontend skeleton

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/pages/login/LoginPage.jsx`
- Create: `frontend/src/components/.gitkeep`
- Create: `frontend/src/api/.gitkeep`
- Create: `frontend/src/hooks/.gitkeep`
- Create: `frontend/src/workers/.gitkeep`

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "exercise-platform-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "^6.23.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.2.0"
  }
}
```

- [ ] **Step 2: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Programming Exercise Platform</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 5: Create `frontend/src/App.jsx`**

```jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/login/LoginPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 6: Create `frontend/src/pages/login/LoginPage.jsx`**

```jsx
export default function LoginPage() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 32, width: 360 }}>
        <h2 style={{ marginBottom: 24 }}>Programming Exercise Platform</h2>
        <div style={{ marginBottom: 16 }}>
          <label>Username</label>
          <input disabled style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label>Password</label>
          <input type="password" disabled style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, boxSizing: 'border-box' }} />
        </div>
        <button disabled style={{ width: '100%', padding: 10, background: '#1976d2', color: '#fff', border: 'none', borderRadius: 4, cursor: 'not-allowed', opacity: 0.7 }}>
          Login
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create directory placeholders**

```bash
mkdir -p frontend/src/components frontend/src/api frontend/src/hooks frontend/src/workers \
         frontend/src/pages/student frontend/src/pages/tutor frontend/src/pages/admin
touch frontend/src/components/.gitkeep frontend/src/api/.gitkeep \
      frontend/src/hooks/.gitkeep frontend/src/workers/.gitkeep
```

- [ ] **Step 8: Install dependencies and verify dev server**

```bash
cd frontend && npm install
npm run dev &
sleep 4
curl -s http://localhost:5173 | grep -c "Programming Exercise Platform"
kill %1
```
Expected: output is `1`

- [ ] **Step 9: Verify production build**

```bash
cd frontend && npm run build
```
Expected: `dist/` directory created — no errors

- [ ] **Step 10: Commit**

```bash
git add frontend/
git commit -m "feat(infra): add React/Vite frontend skeleton with login page placeholder"
```

---

### Task 7: Nginx config + Dockerfile

**Files:**
- Create: `nginx/nginx.conf`
- Create: `nginx/Dockerfile`

- [ ] **Step 1: Create `nginx/nginx.conf`**

```nginx
server {
    listen 80;
    server_name _;

    gzip on;
    gzip_types text/html text/css application/javascript application/json;
    gzip_min_length 1024;

    client_max_body_size 50m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;" always;

    location /api/ {
        proxy_pass http://api-server:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create `nginx/Dockerfile`**

```dockerfile
# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Nginx serve
FROM nginx:1.25-alpine
COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Validate nginx config syntax**

```bash
docker run --rm \
  -v "$(pwd)/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.25-alpine nginx -t 2>&1
```
Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

- [ ] **Step 4: Commit**

```bash
git add nginx/
git commit -m "feat(infra): add Nginx config (proxy, CSP, SPA fallback) and multi-stage Dockerfile"
```

---

### Task 8: Python sandbox

**Files:**
- Create: `sandbox/restricted_imports.py`
- Create: `sandbox/executor.py`
- Create: `sandbox/app.py`
- Create: `sandbox/Dockerfile`
- Create: `sandbox/tests/test_restricted_imports.py`
- Create: `sandbox/tests/test_app.py`

- [ ] **Step 1: Write the failing tests**

Create `sandbox/tests/test_restricted_imports.py`:

```python
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

BLOCKED = ['os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes', 'importlib']
ALLOWED = ['math', 'random', 'json', 'datetime', 'collections']

def test_blocked_modules_raise_import_error():
    import restricted_imports
    for name in BLOCKED:
        with pytest.raises(ImportError, match="not allowed"):
            restricted_imports._restricted_import(name, {}, {}, [], 0)

def test_allowed_modules_import_successfully():
    import restricted_imports
    for name in ALLOWED:
        mod = restricted_imports._restricted_import(name, {}, {}, [], 0)
        assert mod is not None
```

Create `sandbox/tests/test_app.py`:

```python
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from unittest.mock import patch
from app import app as flask_app


@pytest.fixture
def client():
    flask_app.config['TESTING'] = True
    with flask_app.test_client() as c:
        yield c


def test_execute_returns_results_list(client):
    with patch('app.run_test_case') as mock_run:
        mock_run.return_value = {
            'passed': True, 'actual': 'Fizz', 'error': None, 'executionTimeMs': 42
        }
        resp = client.post('/execute', json={
            'code': 'def fizzbuzz(n): return "Fizz"',
            'testCases': [{'input': 'print(fizzbuzz(3))', 'expectedOutput': 'Fizz'}],
            'timeLimitSeconds': 5,
            'memoryLimitMb': 128
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert 'results' in data
        assert len(data['results']) == 1
        assert data['results'][0]['index'] == 0
        assert data['results'][0]['passed'] is True


def test_execute_assigns_sequential_indices(client):
    with patch('app.run_test_case') as mock_run:
        mock_run.side_effect = [
            {'passed': True, 'actual': 'Fizz', 'error': None, 'executionTimeMs': 10},
            {'passed': False, 'actual': '5', 'error': None, 'executionTimeMs': 11},
        ]
        resp = client.post('/execute', json={
            'code': '',
            'testCases': [
                {'input': 'print(1)', 'expectedOutput': 'Fizz'},
                {'input': 'print(2)', 'expectedOutput': 'Buzz'},
            ],
            'timeLimitSeconds': 5,
            'memoryLimitMb': 128
        })
        data = resp.get_json()
        assert data['results'][0]['index'] == 0
        assert data['results'][1]['index'] == 1
        assert data['results'][1]['passed'] is False
```

- [ ] **Step 2: Install dependencies and run tests — expect FAIL**

```bash
cd sandbox && pip install flask pytest -q
python -m pytest tests/ -q 2>&1 | tail -5
```
Expected: `ModuleNotFoundError` — `restricted_imports` and `app` not found

- [ ] **Step 3: Create `sandbox/restricted_imports.py`**

```python
import builtins

BLOCKED = frozenset({
    'os', 'sys', 'subprocess', 'socket', 'shutil', 'ctypes',
    'importlib', 'pathlib', 'glob', 'pty', 'signal', 'resource'
})

_original_import = builtins.__import__


def _restricted_import(name, *args, **kwargs):
    base = name.split('.')[0]
    if base in BLOCKED:
        raise ImportError(f"Import of '{name}' is not allowed in the sandbox")
    return _original_import(name, *args, **kwargs)


builtins.__import__ = _restricted_import
```

- [ ] **Step 4: Create `sandbox/executor.py`**

```python
import subprocess
import tempfile
import os
import time


def run_test_case(code: str, test_input: str, expected_output: str,
                  time_limit: int, memory_limit_mb: int) -> dict:
    script = f"{code}\n{test_input}\n"

    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', dir='/tmp', delete=False, prefix='student_'
    ) as f:
        f.write(script)
        tmp_path = f.name

    try:
        start = time.monotonic()
        proc = subprocess.run(
            [
                'nsjail',
                '--mode', 'o',
                '--time_limit', str(time_limit),
                '--rlimit_as', str(memory_limit_mb * 1024 * 1024),
                '--disable_clone_newnet',
                '--log_fd', '3',
                '--bindmount_ro', '/',
                '--tmpfsmount', '/tmp',
                '--cwd', '/tmp',
                '--', 'python3', tmp_path
            ],
            capture_output=True,
            text=True,
            timeout=time_limit + 2
        )
        elapsed_ms = int((time.monotonic() - start) * 1000)
        actual = proc.stdout.strip()
        passed = actual == expected_output.strip()
        error = proc.stderr.strip() if proc.returncode != 0 else None
        return {
            'passed': passed,
            'actual': actual,
            'error': error,
            'executionTimeMs': elapsed_ms
        }
    except subprocess.TimeoutExpired:
        return {
            'passed': False,
            'actual': None,
            'error': 'TIME_LIMIT_EXCEEDED',
            'executionTimeMs': (time_limit + 2) * 1000
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
```

- [ ] **Step 5: Create `sandbox/app.py`**

```python
from flask import Flask, request, jsonify
from executor import run_test_case

app = Flask(__name__)


@app.route('/execute', methods=['POST'])
def execute():
    data = request.get_json(force=True)
    code = data['code']
    test_cases = data['testCases']
    time_limit = int(data.get('timeLimitSeconds', 5))
    memory_limit_mb = int(data.get('memoryLimitMb', 128))

    results = []
    for i, tc in enumerate(test_cases):
        result = run_test_case(
            code,
            tc['input'],
            tc['expectedOutput'],
            time_limit,
            memory_limit_mb
        )
        results.append({'index': i, **result})

    return jsonify({'results': results})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

- [ ] **Step 6: Run the tests — expect PASS**

```bash
cd sandbox && python -m pytest tests/ -q
```
Expected: all 4 tests pass

- [ ] **Step 7: Create `sandbox/Dockerfile`**

```dockerfile
# Stage 1: Extract pre-built nsjail binary (no compilation required)
FROM gcr.io/nsjail/nsjail:latest AS nsjail-source

# Stage 2: Python 3.12 slim runtime
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libnl-3-200 libprotobuf-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-source /usr/sbin/nsjail /usr/local/bin/nsjail
RUN chmod +x /usr/local/bin/nsjail

RUN pip install --no-cache-dir flask==3.0.3

WORKDIR /app
COPY restricted_imports.py executor.py app.py ./

EXPOSE 5000
CMD ["python", "app.py"]
```

- [ ] **Step 8: Verify sandbox image builds**

```bash
docker build -t exercise-sandbox ./sandbox
```
Expected: `Successfully tagged exercise-sandbox:latest`

- [ ] **Step 9: Commit**

```bash
git add sandbox/
git commit -m "feat(infra): add Python sandbox (Flask + nsjail executor, restricted imports)"
```

---

### Task 9: Backup container + monitoring

**Files:**
- Create: `backup/backup.sh`
- Create: `backup/Dockerfile`
- Create: `monitoring/prometheus.yml`
- Create: `monitoring/grafana/provisioning/datasources/prometheus.yml`
- Create: `monitoring/grafana/provisioning/dashboards/dashboard-provider.yml`
- Create: `monitoring/grafana/provisioning/dashboards/platform.json`

- [ ] **Step 1: Create `backup/backup.sh`**

```bash
#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y-%m-%d_%H-%M)
BACKUP_DIR="/backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"

echo "[$(date -Iseconds)] Starting backup: ${BACKUP_FILE}"
mysqldump \
    -h "${MYSQL_HOST}" \
    -u "${MYSQL_USER}" \
    -p"${MYSQL_PASSWORD}" \
    "${MYSQL_DATABASE}" \
    | gzip > "${BACKUP_FILE}"

echo "[$(date -Iseconds)] Backup complete. Removing files older than 30 days."
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date -Iseconds)] Done."
```

- [ ] **Step 2: Create `backup/Dockerfile`**

```dockerfile
FROM mysql:8.0

RUN apt-get update && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

COPY backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

RUN echo "0 2 * * * root /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" \
    > /etc/cron.d/backup && chmod 0644 /etc/cron.d/backup

RUN touch /var/log/backup.log

CMD ["cron", "-f"]
```

- [ ] **Step 3: Create `monitoring/prometheus.yml`**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: exercise-platform
    static_configs:
      - targets: ['api-server:8080']
    metrics_path: /actuator/prometheus
```

- [ ] **Step 4: Create `monitoring/grafana/provisioning/datasources/prometheus.yml`**

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

- [ ] **Step 5: Create `monitoring/grafana/provisioning/dashboards/dashboard-provider.yml`**

```yaml
apiVersion: 1
providers:
  - name: platform-dashboards
    type: file
    disableDeletion: true
    options:
      path: /etc/grafana/provisioning/dashboards
```

- [ ] **Step 6: Create `monitoring/grafana/provisioning/dashboards/platform.json`**

```json
{
  "annotations": { "list": [] },
  "description": "Exercise Platform — API, JVM, and DB metrics",
  "editable": false,
  "graphTooltip": 1,
  "id": null,
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "reqps" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 },
      "id": 1,
      "targets": [
        { "expr": "sum(rate(http_server_requests_seconds_count[1m]))", "legendFormat": "req/s" }
      ],
      "title": "Request Rate",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "s" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 },
      "id": 2,
      "targets": [
        {
          "expr": "histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket[1m])) by (le))",
          "legendFormat": "p95 latency"
        }
      ],
      "title": "p95 Latency",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "reqps" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 0, "y": 8 },
      "id": 3,
      "targets": [
        {
          "expr": "sum(rate(http_server_requests_seconds_count{status=~\"5..\"}[1m]))",
          "legendFormat": "5xx/s"
        }
      ],
      "title": "Error Rate (5xx)",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "bytes" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 8, "y": 8 },
      "id": 4,
      "targets": [
        { "expr": "sum(jvm_memory_used_bytes{area=\"heap\"})", "legendFormat": "heap used" }
      ],
      "title": "JVM Heap Used",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": { "defaults": { "unit": "short" }, "overrides": [] },
      "gridPos": { "h": 8, "w": 8, "x": 16, "y": 8 },
      "id": 5,
      "targets": [
        { "expr": "hikaricp_connections_active", "legendFormat": "active DB connections" }
      ],
      "title": "Active DB Connections",
      "type": "timeseries"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 39,
  "tags": ["exercise-platform"],
  "title": "Exercise Platform",
  "uid": "exercise-platform-v1",
  "version": 1
}
```

- [ ] **Step 7: Commit**

```bash
git add backup/ monitoring/
git commit -m "feat(infra): add backup container (mysql:8.0 + cron) and Prometheus/Grafana provisioning"
```

---

### Task 10: Docker Compose + smoke test

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `.gitignore` (ensure `.env` is listed)

- [ ] **Step 1: Create `.env.example`**

```bash
# Copy to .env and fill in values before running docker compose up
DB_URL=jdbc:mysql://mysql:3306/exercise_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
DB_USERNAME=platform
DB_PASSWORD=changeme
DB_ROOT_PASSWORD=changeme_root
JWT_SECRET=change-this-to-a-minimum-32-character-random-secret-string
GRAFANA_ADMIN_PASSWORD=changeme
MYSQL_HOST=mysql
MYSQL_DATABASE=exercise_db
```

- [ ] **Step 2: Create `.env` and ensure it is git-ignored**

```bash
cp .env.example .env
grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  nginx:
    build:
      context: .
      dockerfile: nginx/Dockerfile
    ports:
      - "80:80"
    depends_on:
      - api-server
    networks:
      - exercise-platform-net
    restart: unless-stopped

  api-server:
    build:
      context: .
      dockerfile: backend/Dockerfile
    environment:
      DB_URL: ${DB_URL}
      DB_USERNAME: ${DB_USERNAME}
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - exercise-platform-net
    restart: unless-stopped

  sandbox:
    build:
      context: ./sandbox
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - SYS_ADMIN
    tmpfs:
      - /tmp:size=256m
    networks:
      - exercise-platform-net
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_USER: ${DB_USERNAME}
      MYSQL_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-p${DB_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5
    volumes:
      - mysql-data:/var/lib/mysql
    networks:
      - exercise-platform-net
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.51.0
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    networks:
      - exercise-platform-net
    restart: unless-stopped

  grafana:
    image: grafana/grafana:10.4.0
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_PATHS_PROVISIONING: /etc/grafana/provisioning
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on:
      - prometheus
    networks:
      - exercise-platform-net
    restart: unless-stopped

  backup:
    build:
      context: ./backup
    environment:
      MYSQL_HOST: ${MYSQL_HOST}
      MYSQL_USER: ${DB_USERNAME}
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
    volumes:
      - /var/backups/exercise-platform:/backups
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - exercise-platform-net
    restart: unless-stopped

volumes:
  mysql-data:

networks:
  exercise-platform-net:
    driver: bridge
```

- [ ] **Step 4: Create the host backup directory**

```bash
sudo mkdir -p /var/backups/exercise-platform
```
Expected: no error (directory created or already exists)

- [ ] **Step 5: Commit before running**

```bash
git add docker-compose.yml .env.example .gitignore
git commit -m "feat(infra): add Docker Compose (7 services) and .env.example"
```

- [ ] **Step 6: Bring up the full stack**

```bash
docker compose up -d --build 2>&1 | tail -15
```
Expected: all 7 containers start. First build takes 5–10 min.

- [ ] **Step 7: Wait for all containers to be healthy**

```bash
docker compose ps
```
Expected: all services show `running` or `healthy`; none show `exited`

- [ ] **Step 8: Verify Nginx on port 80**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:80
```
Expected: `200`

- [ ] **Step 9: Verify API health proxied through Nginx**

```bash
curl -s http://localhost:80/api/actuator/health
```
Expected: `{"status":"UP"}`

- [ ] **Step 10: Verify Prometheus on port 9090**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:9090
```
Expected: `200`

- [ ] **Step 11: Verify Grafana on port 3001**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001
```
Expected: `200`

- [ ] **Step 12: Verify MySQL reconnect after restart**

```bash
docker compose restart mysql
sleep 20
curl -s http://localhost:80/api/actuator/health
```
Expected: `{"status":"UP"}` — Spring Boot reconnected automatically

- [ ] **Step 13: Final commit**

```bash
git add .
git commit -m "feat(infra): F-1 complete — all services healthy, acceptance criteria verified"
```

---

## Self-Review

**Spec coverage check against F-1 acceptance criteria:**

| Criterion | Covered by |
|---|---|
| `mvn spring-boot:run` starts on :8080, `/actuator/health` returns UP | Task 4 ActuatorHealthTest + Task 10 step 9 |
| POM declares all required dependencies | Task 1 step 2 |
| `npm run dev` → login placeholder renders at :5173 | Task 6 step 8 |
| `npm run build` → dist/ produced | Task 6 step 9 |
| `docker compose up -d` → Nginx :80, Prometheus :9090, Grafana :3001 | Task 10 steps 8–11 |
| MySQL restart → Spring Boot reconnects | Task 10 step 12 |
| Flyway applies V1 → all 11 tables exist | Task 2 MigrationTest |
| H2 test profile → same migration applies | Task 2 MigrationTest (`@ActiveProfiles("test")`) |
| `/api/v1/actuator/health` via port 80 proxied | Task 10 step 9 |
| Non-`/api/*` → serves index.html | nginx.conf `try_files` (Task 7) |
| Upload to `/api/v1/submissions/import` ≤50 MB not rejected | nginx.conf `client_max_body_size 50m` (Task 7) |
| Backup produces `backup_YYYY-MM-DD_HH-MM.sql.gz` | backup.sh (Task 9) |
| Files older than 30 days deleted | backup.sh `find -mtime +30 -delete` (Task 9) |

All acceptance criteria covered. No placeholders present. Type and method names are consistent across all tasks.
