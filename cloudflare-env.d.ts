declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    GROWTH_AUTO_MODE?: string;
    BUCKET?: R2Bucket;
  }
}
