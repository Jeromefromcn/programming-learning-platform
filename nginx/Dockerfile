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
