import Peer, { DataConnection } from 'peerjs';
import { GameState, LobbyState } from '../types';
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
    | { type: 'START_GAME', scenarioId: string, factions: any[] };

type EventHandler = (event: NetworkEvent) => void;

class NetworkServiceImpl {
    private peer: Peer | null = null;
    private conns: DataConnection[] = [];
    private handlers: EventHandler[] = []
        ;
    public myPeerId: string = '';
    public isHost: boolean = false;
    public hostConn: DataConnection | null = null;

    // Action deduplication (prevent processing same action twice)
    private processedActions = new Set<string>();

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
        if (this.conns.find(c => c.peer === conn.peer)) {
            console.warn('[NETWORK] Duplicate connection:', conn.peer);
            return;
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
                this.notify({ type: 'START_GAME', ...msg.payload });
                break;
        }
    }

    // ============================================
    // PUBLIC API - BROADCAST ACTIONS
    // ============================================

    /**
     * Broadcast an action to all connected peers
     * Called AFTER local execution (optimistic update)
     */
    broadcastAction(action: GameAction) {
        const msg: ActionMessage = { type: 'ACTION', action };
        console.log('[NETWORK] Broadcasting action:', action.actionType, 'to', this.conns.length, 'peers');

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
    startGame(scenarioId: string, factions: any[]) {
        const msg = { type: 'START_GAME' as const, payload: { scenarioId, factions } };
        this.conns.forEach(conn => {
            if (conn.open) conn.send(msg);
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
