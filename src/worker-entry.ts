import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { handle } from '@astrojs/cloudflare/handler';
import { SignalingServer } from './lib/SignalingServer';

export { SignalingServer };

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/api/signaling') {
          const ip = request.headers.get("cf-connecting-ip") || "unknown";
          const id = env.SIGNALING_SERVER.idFromName(ip);
          const stub = env.SIGNALING_SERVER.get(id);
          return stub.fetch(request);
        }
        return handle(manifest, app, request, env, ctx);
      },
    } satisfies ExportedHandler<Env>,
    SignalingServer: SignalingServer,
  };
}
