use std::{env, net::SocketAddr};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::Serialize;
use sqlx::postgres::{PgPool, PgPoolOptions};

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let database_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    // Lazy so we start even if Postgres isn't up yet, /readyz covers that.
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect_lazy(&database_url)
        .expect("DATABASE_URL is not a valid connection string");

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(readyz))
        .route("/api/clicks", post(record_click))
        .route("/api/stats/{code}", get(stats))
        .with_state(AppState { pool });

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("analytics listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn readyz(State(state): State<AppState>) -> StatusCode {
    match sqlx::query("SELECT 1").execute(&state.pool).await {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::SERVICE_UNAVAILABLE,
    }
}

#[derive(Serialize)]
struct Stats {
    code: String,
    clicks: i64,
}

async fn stats(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> Result<Json<Stats>, StatusCode> {
    let clicks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM clicks WHERE code = $1")
        .bind(&code)
        .fetch_one(&state.pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(Stats { code, clicks }))
}

// TODO: record click
async fn record_click() -> StatusCode {
    StatusCode::NOT_IMPLEMENTED
}
