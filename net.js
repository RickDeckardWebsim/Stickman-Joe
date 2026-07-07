export const NET_VERSION = '1.0';
export const TICK_RATE_HZ = 20;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE_HZ;
export const CLIENT_STATE_RATE_HZ = 30;
export const CLIENT_STATE_INTERVAL_MS = 1000 / CLIENT_STATE_RATE_HZ;

let network = null;
export function getNetwork() { return network; }
export function setNetwork(n) { network = n; }

export class HostManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.roomCode = null;
        this.connected = false;
    }
    async host() {
        return new Promise((resolve, reject) => {
            this.roomCode = this._generateRandomCode();
            this.peer = new Peer(this.roomCode);
            this.peer.on('open', (id) => resolve(this.roomCode));
            this.peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    this.roomCode = this._generateRandomCode();
                    this.peer = new Peer(this.roomCode);
                    this.peer.on('open', () => resolve(this.roomCode));
                    this.peer.on('error', (e) => reject(e));
                } else {
                    reject(err);
                }
            });
            this.peer.on('connection', (conn) => {
                if (this.connection) { conn.close(); return; }
                this.connection = conn;
                conn.on('open', () => { this.connected = true; });
                conn.on('close', () => { this.connected = false; this.connection = null; });
            });
        });
    }

    _generateRandomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }
}

export class ClientManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connected = false;
    }
    async join(roomCode) {
        return new Promise((resolve, reject) => {
            this.peer = new Peer();
            this.peer.on('open', () => {
                const conn = this.peer.connect(roomCode, { reliable: false });
                this.connection = conn;
                conn.on('open', () => { this.connected = true; resolve(); });
                conn.on('error', (err) => reject(err));
                conn.on('close', () => { this.connected = false; this.connection = null; });
            });
            this.peer.on('error', (err) => reject(err));
        });
    }
}
