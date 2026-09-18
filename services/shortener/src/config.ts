function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

// Config from env vars, same image for compose and k8s.
export const config = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required("DATABASE_URL"),
  analyticsUrl: required("ANALYTICS_URL"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:8080",
};
