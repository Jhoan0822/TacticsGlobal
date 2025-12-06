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
    // HOST MIGRATION & HEARTBEAT SYSTEM
    // ============================================
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private lastHostHeartbeat: number = Date.now();
    private orderedPeers: string[] = []; // For deterministic backup host selection
    private lastKnownState: GameState | null = null;
    private onHostMigration: ((newHostId: string) => void) | null = null;
    private hostMigrationInProgress: boolean = false; // Mutex for host migration

    private static readonly HOST_TIMEOUT_MS = 5000; // 5 seconds to declare host dead
    private static readonly HEARTBEAT_INTERVAL_MS = 1000; // Send heartbeat every second

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

    connect(hostId: string, timeoutMs: number = 10000): Promise<boolean> {
        return new Promise((resolve) => {
            if (!this.peer) {
                console.error('[NETWORK] Cannot connect - peer not initialized');
                resolve(false);
                return;
            }
            console.log('[NETWORK] Connecting to host:', hostId);
            const conn = this.peer.connect(hostId, { reliable: true });
            this.hostConn = conn;

            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.error('[NETWORK] Connection timeout to host:', hostId);
                    conn.close();
                    this.hostConn = null;
                    resolve(false);
                }
            }, timeoutMs);

            conn.on('open', () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    console.log('[NETWORK] Connection established to host:', hostId);
                    resolve(true);
                }
            });

            conn.on('error', (err) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    console.error('[NETWORK] Connection error to host:', hostId, err);
                    resolve(false);
                }
            });

            this.handleConnection(conn);
        });
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
            this.cleanupDisconnectedPlayer(conn.peer);
            this.notify({ type: 'DISCONNECT', peerId: conn.peer });
        });

        conn.on('error', (err) => {
            console.error('[NETWORK] Connection error:', err);
        });
    }

    /**
     * Clean up state related to a disconnected player
     * Prevents memory leaks and ID conflicts on reconnection
     */
    cleanupDisconnectedPlayer(peerId: string) {
        // Clear processed actions from this peer to prevent dedup issues on reconnect
        const toDelete: string[] = [];
        this.processedActions.forEach(actionId => {
            if (actionId.startsWith(peerId)) toDelete.push(actionId);
        });
        toDelete.forEach(id => this.processedActions.delete(id));

        // Remove from ordered peers (for host migration)
        this.orderedPeers = this.orderedPeers.filter(p => p !== peerId);

        console.log('[NETWORK] Cleaned up peer:', peerId, 'removed', toDelete.length, 'cached actions');
    }


    private handleMessage(msg: NetworkMessage, conn: DataConnection) {
        // Validate message structure before processing
        if (!msg || typeof msg !== 'object' || !msg.type) {
            console.warn('[NETWORK] Invalid message received - missing type:', msg);
            return;
        }

        const validTypes = ['ACTION', 'FULL_STATE', 'LOBBY_UPDATE', 'START_GAME',
            'REQUEST', 'RESPONSE', 'HEARTBEAT', 'NEW_HOST'];
        if (!validTypes.includes(msg.type)) {
            console.warn('[NETWORK] Unknown message type:', msg.type);
            return;
        }

        switch (msg.type) {
            case 'ACTION':
                // Validate action structure
                if (!msg.action || !msg.action.actionId || !msg.action.actionType) {
                    console.warn('[NETWORK] Invalid ACTION message - missing action data');
                    return;
                }

                // Deduplicate actions
                if (this.processedActions.has(msg.action.actionId)) {
                    console.log('[NETWORK] Duplicate action ignored:', msg.action.actionId);
                    return;
                }
                this.processedActions.add(msg.action.actionId);

                // Clean old entries (keep last 500) - batch cleanup for efficiency
                if (this.processedActions.size > 1000) {
                    const entries = Array.from(this.processedActions);
                    const toDelete = entries.slice(0, entries.length - 500);
                    toDelete.forEach(id => this.processedActions.delete(id));
                    console.log('[NETWORK] Cleaned', toDelete.length, 'old action IDs');
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

            case 'HEARTBEAT':
                // Client receives heartbeat from host - update timestamp
                this.handleHeartbeat(msg.timestamp);
                break;

            case 'NEW_HOST':
                // A new host has been elected after migration
                console.log('[NETWORK] New host announced:', msg.hostId);
                if (msg.hostId !== this.myPeerId) {
                    // Find connection to new host
                    const newHostConn = this.conns.find(c => c.peer === msg.hostId);
                    if (newHostConn) {
                        this.hostConn = newHostConn;
                        this._isHost = false;
                    }
                }
                this.lastHostHeartbeat = Date.now();
                this.startHeartbeat();
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
        console.log('[NETWORK] sendRequest called, isHost:', this.isHost, 'request:', request.type);

        if (this.isHost) {
            // If I am host, loopback immediately
            console.log('[NETWORK] Host loopback for request:', request.type);
            this.notify({ type: 'REQUEST', request, fromPeerId: this.myPeerId });
            return;
        }

        if (this.hostConn && this.hostConn.open) {
            console.log('[NETWORK] Client sending request to host:', request.type);
            this.hostConn.send({ type: 'REQUEST', payload: request });
        } else {
            // CONNECTION NOT READY - This is a critical failure case
            console.error('[NETWORK] CRITICAL: Cannot send request - host connection not open!',
                'hostConn:', !!this.hostConn,
                'open:', this.hostConn?.open,
                'request:', request.type
            );

            // Retry after a small delay if connection exists but not open
            if (this.hostConn) {
                console.log('[NETWORK] Attempting retry in 500ms...');
                setTimeout(() => {
                    if (this.hostConn && this.hostConn.open) {
                        console.log('[NETWORK] Retry succeeded, sending request');
                        this.hostConn.send({ type: 'REQUEST', payload: request });
                    } else {
                        console.error('[NETWORK] Retry FAILED - connection still not open');
                    }
                }, 500);
            }
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
        this.stopHeartbeat();
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
        this.orderedPeers = [];
        this.lastKnownState = null;
    }

    // ============================================
    // HEARTBEAT & HOST MIGRATION
    // ============================================

    /**
     * Start heartbeat system for host failure detection
     * Host sends heartbeats; clients monitor for timeouts
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing

        this.heartbeatInterval = setInterval(() => {
            if (this._isHost) {
                // Host: Send heartbeat to all clients
                const msg = { type: 'HEARTBEAT' as const, timestamp: Date.now() };
                this.conns.forEach(c => {
                    if (c.open) c.send(msg);
                });
            } else {
                // Client: Check if host is still alive
                const timeSinceLastHeartbeat = Date.now() - this.lastHostHeartbeat;
                if (timeSinceLastHeartbeat > NetworkServiceImpl.HOST_TIMEOUT_MS) {
                    console.warn('[NETWORK] Host heartbeat timeout! Initiating host migration...');
                    this.initiateHostMigration();
                }
            }
        }, NetworkServiceImpl.HEARTBEAT_INTERVAL_MS);

        console.log('[NETWORK] Heartbeat system started');
    }

    /**
     * Stop the heartbeat system
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Update the last known game state (for migration)
     */
    updateLastKnownState(state: GameState) {
        this.lastKnownState = state;
    }

    /**
     * Register a peer in the ordered list for deterministic host selection
     */
    registerPeerForMigration(peerId: string) {
        if (!this.orderedPeers.includes(peerId)) {
            this.orderedPeers.push(peerId);
            this.orderedPeers.sort(); // Deterministic ordering
            console.log('[NETWORK] Peer registered for migration:', peerId, 'Order:', this.orderedPeers);
        }
    }

    /**
     * Set callback for when host migration occurs
     */
    setHostMigrationCallback(callback: (newHostId: string) => void) {
        this.onHostMigration = callback;
    }

    /**
     * Initiate host migration when current host is detected as disconnected
     * Uses deterministic peer ordering - first peer in sorted list becomes new host
     */
    private initiateHostMigration() {
        // Prevent concurrent migrations (race condition fix)
        if (this.hostMigrationInProgress) {
            console.log('[NETWORK] Host migration already in progress, skipping');
            return;
        }
        this.hostMigrationInProgress = true;

        // Stop checking for heartbeats
        this.stopHeartbeat();

        // Remove old host from ordered peers
        if (this.hostConn) {
            this.orderedPeers = this.orderedPeers.filter(p => p !== this.hostConn?.peer);
        }

        // Determine new host (first in deterministic order)
        // Include self in the ordering
        const allPeers = [...this.orderedPeers, this.myPeerId].sort();
        const newHostId = allPeers[0];

        console.log('[NETWORK] Host migration - candidates:', allPeers, 'new host:', newHostId);

        if (newHostId === this.myPeerId) {
            // I am the new host!
            console.log('[NETWORK] I am the new host!');
            this._isHost = true;
            this.hostConn = null;

            // Broadcast that I'm the new host
            const msg = { type: 'NEW_HOST' as const, hostId: this.myPeerId };
            this.conns.forEach(c => {
                if (c.open) c.send(msg);
            });

            // Broadcast full state to resync all clients
            if (this.lastKnownState) {
                setTimeout(() => {
                    this.broadcastFullState(this.lastKnownState!);
                }, 500);
            }

            // Restart heartbeat as host
            this.startHeartbeat();
        } else {
            // Wait for new host announcement
            console.log('[NETWORK] Waiting for new host:', newHostId);
            this.lastHostHeartbeat = Date.now(); // Reset timeout
        }

        // Notify callback if set
        if (this.onHostMigration) {
            this.onHostMigration(newHostId);
        }

        // Reset migration flag after a delay to allow for completion
        setTimeout(() => {
            this.hostMigrationInProgress = false;
        }, 5000);
    }

    /**
     * Handle incoming heartbeat from host
     */
    handleHeartbeat(timestamp: number) {
        this.lastHostHeartbeat = Date.now();
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
