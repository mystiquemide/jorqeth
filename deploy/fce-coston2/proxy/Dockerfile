FROM golang:1.25.1-alpine AS builder
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch v0.0.18 https://github.com/flare-foundation/tee-proxy.git .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -o /app/tee-proxy ./cmd/proxy

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget
WORKDIR /app
COPY --from=builder /app/tee-proxy ./tee-proxy
COPY entrypoint.sh ./entrypoint.sh
RUN chmod 755 ./entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["./tee-proxy"]
