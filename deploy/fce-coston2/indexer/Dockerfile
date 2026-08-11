FROM golang:1.25-trixie@sha256:75eb6e343bdac854462811220a5bcae3442af3fb25e8c8644c7494e5e5545aed AS builder
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/flare-foundation/flare-system-c-chain-indexer.git . \
    && git checkout 65a3b809eda8930e185d443c82dfcbc35cb14c99
RUN go build -trimpath -o /app/flare-cchain-indexer ./cmd/indexer

FROM debian:trixie-slim@sha256:cedb1ef40439206b673ee8b33a46a03a0c9fa90bf3732f54704f99cb061d2c5a
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app/flare-cchain-indexer ./flare-cchain-indexer
EXPOSE 8080
