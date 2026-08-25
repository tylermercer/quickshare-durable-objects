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

function encodeIpRoom(ipGroup: string): string {
  const str = `ip:${ipGroup}`;
  const base64 = typeof btoa === 'function' ? btoa(str) : Buffer.from(str).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeRoom(room: string): string {
  try {
    let base64 = room.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const decoded = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf-8');
    return decoded;
  } catch {
    return room;
  }
}

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  return {
    default: {
      async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/api/signaling') {
          const roomParam = url.searchParams.get("room");
          let targetRoom: string;
          let roomId: string;

          if (roomParam) {
            roomId = roomParam;
            const decoded = decodeRoom(roomParam);
            if (decoded.startsWith("ip:")) {
              targetRoom = decoded.substring(3);
            } else {
              targetRoom = roomParam;
            }
          } else {
            const ip = request.headers.get("cf-connecting-ip") || "unknown";
            const ipGroup = getIpGroup(ip);
            targetRoom = ipGroup;
            roomId = encodeIpRoom(ipGroup);
          }

          const id = env.SIGNALING_SERVER.idFromName(targetRoom);
          const stub = env.SIGNALING_SERVER.get(id);

          const stubUrl = new URL(request.url);
          stubUrl.searchParams.set("roomId", roomId);
          const stubRequest = new Request(stubUrl.toString(), request);

          return stub.fetch(stubRequest);
        }
        return handle(manifest, app, request, env, ctx);
      },
    } satisfies ExportedHandler<Env>,
    SignalingServer: SignalingServer,
  };
}
