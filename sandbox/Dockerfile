# Stage 1: Build nsjail from source
FROM debian:bookworm-slim AS nsjail-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates git cmake build-essential pkg-config \
        libprotobuf-dev protobuf-compiler \
        libnl-3-dev libnl-route-3-dev \
        libcap-dev libseccomp-dev \
        flex bison \
    && rm -rf /var/lib/apt/lists/*
RUN git clone --depth=1 --branch 3.4 https://github.com/google/nsjail.git /nsjail-src \
    && cd /nsjail-src && make -j$(nproc)

# Stage 2: Python 3.12 slim runtime
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libnl-3-200 libprotobuf32 libcap2 libseccomp2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=nsjail-builder /nsjail-src/nsjail /usr/local/bin/nsjail
RUN chmod +x /usr/local/bin/nsjail

RUN pip install --no-cache-dir flask==3.0.3

WORKDIR /app
COPY restricted_imports.py executor.py app.py ./

EXPOSE 5000
CMD ["python", "app.py"]
