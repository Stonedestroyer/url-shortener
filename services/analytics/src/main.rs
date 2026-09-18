use std::{env, net::SocketAddr};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgPool, PgPoolOptions};

// same limit as the shortener
const MAX_CODE_LEN: usize = 32;

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

    let state_pool = pool.clone();
    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/readyz", get(readyz))
        .route("/api/clicks", post(record_click))
        .route("/api/stats/{code}", get(stats))
        .with_state(AppState { pool });

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("analytics listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();

    state_pool.close().await;
    tracing::info!("analytics stopped");
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

#[derive(Deserialize)]
struct Click {
    code: String,
}

// Validate here too instead of trusting the caller.
fn valid_code(code: &str) -> bool {
    (1..=MAX_CODE_LEN).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphanumeric())
}

async fn record_click(State(state): State<AppState>, Json(click): Json<Click>) -> StatusCode {
    if !valid_code(&click.code) {
        return StatusCode::BAD_REQUEST;
    }
    match sqlx::query("INSERT INTO clicks (code) VALUES ($1)")
        .bind(&click.code)
        .execute(&state.pool)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(err) => {
            tracing::error!("failed to record click for {}: {err}", click.code);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// Finish in-flight requests on SIGTERM.
async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutdown signal received, finishing in-flight requests");
}
