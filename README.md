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
2. The images are already on Docker Hub (`alija900/url-shortener-shortener:0.1.2` and
   `alija900/url-shortener-analytics:0.1.1`) and `k8s/*.yaml` uses them, so you can skip to step 3.
   If you change the code, build and push under your own Docker Hub name (replace `you`) and update
   the image lines in `k8s/shortener.yaml` and `k8s/analytics.yaml`:

   ```sh
   docker build -t you/url-shortener-shortener:0.1.2 services/shortener
   docker build -t you/url-shortener-analytics:0.1.1 services/analytics
   docker push you/url-shortener-shortener:0.1.2
   docker push you/url-shortener-analytics:0.1.1
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
   Without `openssl` (e.g. Windows PowerShell 5.1), use any random string of letters and digits.

4. Deploy everything: `kubectl apply -f k8s/`. This also starts the optional Cloudflare tunnel;
   delete `k8s/cloudflared.yaml` first if you don't want it.
5. Watch it come up: `kubectl -n url-shortener get pods -w`. When all pods are `1/1`, open
   http://localhost:8080 (on k3s, use the address from `kubectl -n url-shortener get svc shortener`).
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
   A later `kubectl apply -f k8s/` also resets it to localhost.
   Locally, the app is still available at http://localhost:8080 through the LoadBalancer.

Remove everything: `kubectl delete namespace url-shortener`. This also deletes the persistent
volume and all links.
