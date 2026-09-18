# build
FROM rust:1-slim-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

# runtime
FROM debian:bookworm-slim
RUN useradd --system --uid 10001 app
COPY --from=build /app/target/release/analytics /usr/local/bin/analytics
# numeric uid for runAsNonRoot
USER 10001
EXPOSE 8080
CMD ["analytics"]
