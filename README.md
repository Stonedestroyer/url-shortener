# URL shortener

A microservice URL shortener for PA2577 "Build Something".

```
browser --HTTP--> shortener (TypeScript) --REST--> analytics (Rust)
                       |                                |
                       v                                v
                 database: links    Postgres     database: analytics
                                (one StatefulSet)
```

| Service | Language | Owns | REST API |
|---|---|---|---|
| shortener | TypeScript / Express | `links` database, web UI | `POST /api/links`, `GET /api/links/:code`, `GET /api/links/:code/stats`, `GET /:code` |
| analytics | Rust / axum | `analytics` database | `POST /api/clicks`, `GET /api/stats/{code}` |
| postgres | (official image) | persistent volume | none |

Both services also expose `/healthz` (liveness) and `/readyz` (readiness).

## Run locally

```sh
docker compose up --build
```

- UI: http://localhost:8080
- Try it from the command line:
  - `curl -X POST localhost:8080/api/links -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'` creates a link
  - `curl -i localhost:8080/<code>` returns a 302 redirect and records a click
  - `curl localhost:8080/api/links/<code>/stats` returns the click count from analytics (service-to-service REST)

Reset the database: `docker compose down -v`.

## Deploy to Kubernetes

1. Get a cluster. Docker Desktop: Settings, Kubernetes, enable. Or k3s on a home server.
2. Build and push images (replace `you` with your Docker Hub username, and in `k8s/*.yaml`):

   ```sh
   docker build -t you/url-shortener-shortener:0.1.0 services/shortener
   docker build -t you/url-shortener-analytics:0.1.0 services/analytics
   docker push you/url-shortener-shortener:0.1.0
   docker push you/url-shortener-analytics:0.1.0
   ```

3. Create the namespace, then the Secrets and ConfigMap. Secrets are kept out of git on
   purpose. There are three logins: a Postgres superuser used only to initialise the
   database, and one login per service that can only reach that service's own database.

   ```sh
   kubectl apply -f k8s/namespace.yaml
   kubectl -n url-shortener create secret generic postgres-credentials \
     --from-literal=POSTGRES_USER=admin --from-literal=POSTGRES_PASSWORD=$(openssl rand -hex 16)
   kubectl -n url-shortener create secret generic shortener-db --from-literal=password=$(openssl rand -hex 16)
   kubectl -n url-shortener create secret generic analytics-db --from-literal=password=$(openssl rand -hex 16)
   kubectl -n url-shortener create configmap postgres-init --from-file=db/init.sh
   ```

   Hex passwords avoid characters such as `@` and `/` that would break the connection strings.

4. Deploy everything: `kubectl apply -f k8s/`
5. Watch it come up: `kubectl -n url-shortener get pods -w`
6. Public HTTPS URL (Cloudflare quick tunnel, see `k8s/cloudflared.yaml`):

   ```sh
   kubectl -n url-shortener logs deploy/cloudflared | grep trycloudflare.com
   ```

   Short links must use that URL, so point the shortener at it. This restarts only the
   shortener pods; the tunnel and its URL stay the same:

   ```sh
   kubectl -n url-shortener set env deploy/shortener PUBLIC_BASE_URL=https://<random>.trycloudflare.com
   ```

   The URL changes whenever the cloudflared pod restarts, so repeat this step after that.
   Locally, the app is still available at http://localhost:8080 through the LoadBalancer.
