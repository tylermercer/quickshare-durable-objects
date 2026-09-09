# Quickshare

Quickshare is a serverless, peer-to-peer (P2P) file sharing web application built with Astro and Cloudflare Workers. It enables instant local file transfers directly between browsers using WebRTC, with WebSockets and Cloudflare Durable Objects handling peer discovery and signaling.

## Features

- **Direct P2P File Transfer**: Uses WebRTC DataChannels for fast, private, direct browser-to-browser transfers without routing files through a central storage server.
- **Automatic Local Grouping**: Peers connected from the same IP address or subnet (IPv4 addresses or IPv6 `/64` prefixes) are automatically placed in the same room.
- **Room Sharing via QR Code & Link**: Generate QR codes or shareable links with a `?room=` parameter to invite devices on different networks into the same transfer room.
- **Nautical Peer Names**: Each connected client is assigned a fun, memorable nautical moniker (e.g., *Swift Schooner*, *Nimble Kayak*).
- **Edge-Powered Signaling**: Powered by Cloudflare Durable Objects (`SignalingServer`) for low-latency WebSocket signaling and state management at Cloudflare's edge.

## Tech Stack

- **Framework**: [Astro](https://astro.build) (SSR mode)
- **Deployment & Edge Compute**: [Cloudflare Workers](https://workers.cloudflare.com/) & [Durable Objects](https://developers.cloudflare.com/durable-objects/)
- **Adapter**: `@astrojs/cloudflare`
- **Networking**: WebRTC DataChannels & WebSockets
- **Package Manager**: `pnpm`
- **UI Components & Utilities**: `@wundero/qr-code` web components for QR code rendering

## Project Structure

```text
├── src/
│   ├── lib/
│   │   └── SignalingServer.ts   # Cloudflare Durable Object for WebSocket signaling
│   ├── pages/
│   │   └── index.astro          # Main Quickshare web interface
│   ├── scripts/
│   │   └── main.ts              # Client-side WebRTC and WebSocket logic
│   └── worker-entry.ts          # Custom Cloudflare Worker entrypoint routing requests & DOs
├── public/                      # Static assets (including QR code scripts)
├── astro.config.mjs             # Astro configuration with Cloudflare adapter
└── wrangler.jsonc               # Cloudflare Wrangler configuration
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher recommended)
- [pnpm](https://pnpm.io/) package manager

### Installation

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ```

2. Start the local development server:

   ```bash
   pnpm dev
   ```

### Building for Production

To build the application for deployment to Cloudflare Workers:

```bash
pnpm build
```

To preview the production build locally:

```bash
pnpm preview
```

## Deployment

Deployments are managed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

To deploy manually from your local environment:

```bash
npx wrangler deploy
```

### GitHub Actions CI/CD

The repository includes a GitHub Actions workflow (`.github/workflows/main.yml`) that automatically:
- Builds and deploys the `main` branch to Cloudflare Workers upon push.
- Uploads preview builds with dedicated subdomains for pull requests.

Required GitHub repository secrets for automated deployment:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

## License

MIT
