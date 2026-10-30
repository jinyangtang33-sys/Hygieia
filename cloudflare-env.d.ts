declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    HEALTH_SYNC_SERVICE_TOKEN?: string;
  }
}
