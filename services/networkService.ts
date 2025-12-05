import Peer, { DataConnection } from 'peerjs';
import { GameState, LobbyState, NetworkRequest, NetworkResponse } from '../types';
import { GameAction, NetworkMessage, ActionMessage, FullStateMessage } from './schemas';

// ============================================
// REAL-TIME P2P NETWORK SERVICE
// ============================================
// Optimistic P2P broadcast: Actions are sent immediately
// and executed on all peers without waiting for confirmation

export type NetworkEvent =
    | { type: 'CONNECT', peerId: string }
    | { type: 'DISCONNECT', peerId: string }
    | { type: 'ACTION', action: GameAction }
    | { type: 'FULL_STATE', gameState: GameState, timestamp: number }
    | { type: 'LOBBY_UPDATE', state: LobbyState }
    | { type: 'START_GAME', scenarioId: string, factions: any[], pois: any[] }
    | { type: 'REQUEST', request: NetworkRequest, fromPeerId: string }
    | { type: 'RESPONSE', response: NetworkResponse };

type EventHandler = (event: NetworkEvent) => void;

class NetworkServiceImpl {
    private peer: Peer | null = null;
    private conns: DataConnection[] = [];
    private handlers: EventHandler[] = [];

    public myPeerId: string = '';
    private _isHost: boolean = false;  // Private backing field
    public hostConn: DataConnection | null = null;

    // Action deduplication (prevent processing same action twice)
    private processedActions = new Set<string>();

    // State versioning for authoritative sync
    private _stateVersion: number = 0;

    // ============================================
    // HOST STATUS - SINGLE SOURCE OF TRUTH
    // ============================================

    /**
     * Get authoritative host status. This is THE ONLY way to check host status.
     */
    get isHost(): boolean {
        return this._isHost;
    }

    /**
     * Set host status. Should only be called during game initialization.
     */
    set isHost(value: boolean) {
        this._isHost = value;
        console.log('[NETWORK] Host status set to:', value);
    }

    /**
     * Get current state version (for sync tracking)
     */
    get stateVersion(): number {
        return this._stateVersion;
    }

    /**
     * Increment state version (host only, called after each authoritative update)
     */
    incrementStateVersion(): number {
        if (this._isHost) {
            this._stateVersion++;
        }
        return this._stateVersion;
    }

    initialize(onReady: (id: string) => void) {
        if (this.peer) return;

        this.peer = new Peer({ debug: 0 });

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            console.log('[NETWORK] Peer initialized:', id);
            onReady(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('[NETWORK] Incoming connection:', conn.peer);
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('[NETWORK] Peer error:', err);
        });
    }

    connect(hostId: string) {
        if (!this.peer) return;
        console.log('[NETWORK] Connecting to host:', hostId);
        const conn = this.peer.connect(hostId, { reliable: true });
        this.hostConn = conn;
        this.handleConnection(conn);
    }

    private handleConnection(conn: DataConnection) {
        const existingIdx = this.conns.findIndex(c => c.peer === conn.peer);
        if (existingIdx !== -1) {
            console.warn('[NETWORK] Duplicate connection, replacing:', conn.peer);
            // Remove old connection from array to prevent duplicate handling
            this.conns.splice(existingIdx, 1);
        }

        this.conns.push(conn);

        conn.on('open', () => {
            console.log('[NETWORK] Connection established:', conn.peer);
            this.notify({ type: 'CONNECT', peerId: conn.peer });
        });

        conn.on('data', (data: any) => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            console.log('[NETWORK] Connection closed:', conn.peer);
            this.conns = this.conns.filter(c => c !== conn);
            if (this.hostConn === conn) this.hostConn = null;
            this.notify({ type: 'DISCONNECT', peerId: conn.peer });
        });

        conn.on('error', (err) => {
            console.error('[NETWORK] Connection error:', err);
        });
    }

    private handleMessage(msg: NetworkMessage, conn: DataConnection) {
        switch (msg.type) {
            case 'ACTION':
                // Deduplicate actions
                if (this.processedActions.has(msg.action.actionId)) {
                    console.log('[NETWORK] Duplicate action ignored:', msg.action.actionId);
                    return;
                }
                this.processedActions.add(msg.action.actionId);

                // Clean old entries (keep last 1000)
                if (this.processedActions.size > 1000) {
                    const first = this.processedActions.values().next().value;
                    this.processedActions.delete(first);
                }

                console.log('[NETWORK] Action received:', msg.action.actionType, 'from', msg.action.playerId);
                this.notify({ type: 'ACTION', action: msg.action });
                break;

            case 'FULL_STATE':
                console.log('[NETWORK] Full state received');
                this.notify({ type: 'FULL_STATE', gameState: msg.gameState, timestamp: msg.timestamp });
                break;

            case 'LOBBY_UPDATE':
                this.notify({ type: 'LOBBY_UPDATE', state: msg.payload });
                break;

            case 'START_GAME':
                // Ensure all required fields are passed
                this.notify({
                    type: 'START_GAME',
                    scenarioId: msg.payload.scenarioId,
                    factions: msg.payload.factions,
                    pois: msg.payload.pois || []
                });
                break;

            case 'REQUEST':
                this.notify({ type: 'REQUEST', request: msg.payload, fromPeerId: conn.peer });
                break;

            case 'RESPONSE':
                this.notify({ type: 'RESPONSE', response: msg.payload });
                break;
        }
    }

    // ============================================
    // PUBLIC API - BROADCAST ACTIONS
    // ============================================

    /**
     * Broadcast an action to all connected peers
     * Called AFTER local execution (optimistic update)
     * For clients: sends to host via hostConn
     * For host: sends to all connected clients
     */
    broadcastAction(action: GameAction) {
        const msg: ActionMessage = { type: 'ACTION', action };

        // CLIENT: Make sure action reaches host via hostConn
        if (!this._isHost && this.hostConn && this.hostConn.open) {
            console.log('[NETWORK] Client sending action to host:', action.actionType);
            this.hostConn.send(msg);
            return; // Clients only send to host
        }

        // HOST: Broadcast to all connected clients
        console.log('[NETWORK] Host broadcasting action:', action.actionType, 'to', this.conns.length, 'peers');
        this.conns.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    /**
     * Broadcast full game state (for resync/late join)
     * Called periodically by host as backup
     */
    broadcastFullState(gameState: GameState) {
        const msg: FullStateMessage = {
            type: 'FULL_STATE',
            gameState,
            timestamp: Date.now()
        };

        console.log('[NETWORK] Broadcasting full state to', this.conns.length, 'peers');
        this.conns.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    /**
     * Send lobby update (legacy support)
     */
    sendLobbyUpdate(state: LobbyState) {
        const msg = { type: 'LOBBY_UPDATE' as const, payload: state };
        this.conns.forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }

    /**
     * Start game signal (legacy support)
     */
    startGame(scenarioId: string, factions: any[], pois: any[]) {
        const msg = { type: 'START_GAME' as const, payload: { scenarioId, factions, pois } };
        this.conns.forEach(conn => {
            if (conn.open) conn.send(msg);
        });
    }

    // ============================================
    // NEW AUTHORITATIVE METHODS
    // ============================================

    sendRequest(request: import('../types').NetworkRequest) {
        if (this.isHost) {
            // If I am host, loopback immediately
            this.notify({ type: 'REQUEST', request, fromPeerId: this.myPeerId });
            return;
        }
        if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type: 'REQUEST', payload: request });
        }
    }

    broadcastResponse(response: import('../types').NetworkResponse) {
        // Loopback to self
        this.notify({ type: 'RESPONSE', response });

        // Send to all clients
        this.conns.forEach(conn => {
            if (conn.open) {
                conn.send({ type: 'RESPONSE', payload: response });
            }
        });
    }

    // ============================================
    // EVENT SUBSCRIPTION
    // ============================================

    subscribe(handler: EventHandler) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    private notify(event: NetworkEvent) {
        this.handlers.forEach(h => h(event));
    }

    disconnect() {
        console.log('[NETWORK] Disconnecting all connections');
        this.conns.forEach(c => c.close());
        this.conns = [];
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
        this.processedActions.clear();
        // Reset state for clean reconnection
        this._isHost = false;
        this._stateVersion = 0;
        this.hostConn = null;
        this.myPeerId = '';
    }

    // ============================================
    // HELPER METHODS
    // ============================================

    getConnectionCount(): number {
        return this.conns.filter(c => c.open).length;
    }

    isConnected(): boolean {
        return this.isHost ? this.conns.length > 0 : (this.hostConn?.open ?? false);
    }
}

export const NetworkService = new NetworkServiceImpl();
