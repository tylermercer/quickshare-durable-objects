import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { SignalingServer } from './lib/SignalingServer';

export { SignalingServer };

function getIpGroup(ip: string): string {
  if (ip.includes(":")) {
    // IPv6: Group by /64 prefix (the first 4 hextets)
    const parts = ip.split(":");
    // Normalize condensed IPv6 addresses if necessary
    // But Cloudflare's cf-connecting-ip is usually normalized or at least consistent.
    // A simple way to get the /64 is to take the first 4 parts.
    // If there are fewer than 4 parts (e.g. ::1), we'll just use the whole thing.
    return parts.slice(0, 4).join(":");
  }
  // IPv4: Group by the full IP (standard NAT behavior)
  return ip;
}

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/api/signaling') {
          const ip = request.headers.get("cf-connecting-ip") || "unknown";
          const ipGroup = getIpGroup(ip);
          const id = env.SIGNALING_SERVER.idFromName(ipGroup);
          const stub = env.SIGNALING_SERVER.get(id);
          return stub.fetch(request);
        }
        return handle(manifest, app, request, env, ctx);
      },
    } satisfies ExportedHandler<Env>,
    SignalingServer: SignalingServer,
  };
}
