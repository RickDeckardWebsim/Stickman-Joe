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
}

export class ClientManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.connected = false;
    }
}
