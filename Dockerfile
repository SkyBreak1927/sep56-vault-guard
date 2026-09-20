# syntax=docker/dockerfile:1

# ---- Stage 1: build the Rust CLI binary ------------------------------------
FROM rust:1-bookworm AS cli-builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY cli ./cli
COPY contracts ./contracts

RUN cargo build --release -p sep56-vault-guard

# ---- Stage 2: runtime image (Node.js + Stellar CLI + our CLI binary) -------
FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install the official prebuilt Stellar CLI binary (same version this
# project has been built/tested against) — matches the tool the Rust CLI
# shells out to for every check.
ARG STELLAR_CLI_VERSION=28.0.0
RUN curl -sSL \
      "https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_CLI_VERSION}/stellar-cli-${STELLAR_CLI_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    | tar xz -C /usr/local/bin stellar \
    && chmod +x /usr/local/bin/stellar

COPY --from=cli-builder /app/target/release/sep56-vault-guard /usr/local/bin/sep56-vault-guard

WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev

COPY server/ ./

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
