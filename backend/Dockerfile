# syntax=docker/dockerfile:1.7

# Stage 1: Build
FROM maven:3.9-eclipse-temurin-25 AS builder
WORKDIR /app
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn dependency:go-offline -q
COPY src ./src
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn package -DskipTests -q

# Stage 2: Runtime
FROM eclipse-temurin:25-jre-jammy
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
