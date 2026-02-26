type Peer = {
    id: string;
    name: string;
};

class PeerConnection {
    private pc: RTCPeerConnection;
    private dc: RTCDataChannel | null = null;
    private peerId: string;
    private sendSignal: (signal: any) => void;
    private onFileReceived: (blob: Blob, name: string) => void;

    constructor(peerId: string, sendSignal: (signal: any) => void, onFileReceived: (blob: Blob, name: string) => void) {
        this.peerId = peerId;
        this.sendSignal = sendSignal;
        this.onFileReceived = onFileReceived;
        this.pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.sendSignal({ candidate: e.candidate });
            }
        };

        this.pc.ondatachannel = (e) => {
            this.setupDataChannel(e.channel);
        };
    }

    async handleSignal(signal: any) {
        if (signal.sdp) {
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            if (signal.sdp.type === 'offer') {
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.sendSignal({ sdp: this.pc.localDescription });
            }
        } else if (signal.candidate) {
            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (e) {
                console.error("Error adding ICE candidate", e);
            }
        }
    }

    private setupDataChannel(dc: RTCDataChannel) {
        this.dc = dc;
        this.dc.binaryType = 'arraybuffer';
        let incomingFile: { name: string; size: number; mime: string; chunks: ArrayBuffer[]; received: number } | null = null;

        dc.onmessage = (e) => {
            if (typeof e.data === 'string') {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'metadata') {
                        incomingFile = { ...data, chunks: [], received: 0 };
                    }
                } catch (err) {
                    console.error("Error parsing message", err);
                }
            } else {
                if (incomingFile) {
                    incomingFile.chunks.push(e.data);
                    incomingFile.received += e.data.byteLength;
                    if (incomingFile.received >= incomingFile.size) {
                        const blob = new Blob(incomingFile.chunks, { type: incomingFile.mime });
                        this.onFileReceived(blob, incomingFile.name);
                        incomingFile = null;
                    }
                }
            }
        };
    }

    async sendFile(file: File) {
        if (!this.dc || this.dc.readyState !== 'open') {
            this.dc = this.pc.createDataChannel('file-transfer');
            this.setupDataChannel(this.dc);

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.sendSignal({ sdp: this.pc.localDescription });

            const onOpen = () => {
                this.transferFile(file);
                this.dc?.removeEventListener('open', onOpen);
            };
            this.dc.addEventListener('open', onOpen);
        } else {
            this.transferFile(file);
        }
    }

    private transferFile(file: File) {
        if (!this.dc || this.dc.readyState !== 'open') return;

        this.dc.send(JSON.stringify({
            type: 'metadata',
            name: file.name,
            size: file.size,
            mime: file.type
        }));

        const CHUNK_SIZE = 16384;
        const reader = new FileReader();
        let offset = 0;

        reader.onload = (e) => {
            if (this.dc && this.dc.readyState === 'open') {
                this.dc.send(e.target!.result as ArrayBuffer);
                offset += CHUNK_SIZE;
                if (offset < file.size) {
                    readSlice();
                }
            }
        };

        const readSlice = () => {
            if (this.dc && this.dc.bufferedAmount > CHUNK_SIZE * 8) {
                setTimeout(readSlice, 100);
                return;
            }
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readSlice();
    }
}

class QuickshareApp {
    private ws: WebSocket | null = null;
    private peers: Map<string, Peer> = new Map();
    private connections: Map<string, PeerConnection> = new Map();

    constructor() {
        this.connect();
    }

    private connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/api/signaling`);
        this.ws.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
        this.ws.onclose = () => setTimeout(() => this.connect(), 3000);
    }

    private handleMessage(data: any) {
        switch (data.type) {
            case 'welcome':
                const myNameEl = document.getElementById('my-name');
                if (myNameEl) myNameEl.textContent = `You are: ${data.name}`;
                data.peers.forEach((p: Peer) => this.addPeer(p));
                break;
            case 'peer-joined':
                this.addPeer(data.peer);
                break;
            case 'peer-left':
                this.removePeer(data.id);
                break;
            case 'signal':
                this.getOrCreateConnection(data.from).handleSignal(data.signal);
                break;
        }
    }

    private addPeer(peer: Peer) {
        this.peers.set(peer.id, peer);
        this.render();
    }

    private removePeer(id: string) {
        this.peers.delete(id);
        this.connections.delete(id);
        this.render();
    }

    private getOrCreateConnection(peerId: string): PeerConnection {
        if (!this.connections.has(peerId)) {
            const conn = new PeerConnection(
                peerId,
                (signal) => this.ws?.send(JSON.stringify({ type: 'signal', to: peerId, signal })),
                (blob, name) => this.download(blob, name)
            );
            this.connections.set(peerId, conn);
        }
        return this.connections.get(peerId)!;
    }

    private render() {
        const container = document.getElementById('peers-container')!;
        if (!container) return;
        if (this.peers.size === 0) {
            container.innerHTML = '<p>Searching for peers...</p>';
            return;
        }
        container.innerHTML = '';
        this.peers.forEach(peer => {
            const card = document.createElement('div');
            card.className = 'peer-card';
            card.innerHTML = `
                <div class="peer-icon">📱</div>
                <div class="peer-name">${peer.name}</div>
                <input type="file" id="file-${peer.id}" style="display: none" />
                <button class="send-btn">Send File</button>
            `;
            card.querySelector('.send-btn')?.addEventListener('click', () => {
                (card.querySelector(`#file-${peer.id}`) as HTMLInputElement).click();
            });
            card.querySelector(`#file-${peer.id}`)?.addEventListener('change', (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    this.getOrCreateConnection(peer.id).sendFile(file);
                }
            });
            container.appendChild(card);
        });
    }

    private download(blob: Blob, name: string) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}

new QuickshareApp();
