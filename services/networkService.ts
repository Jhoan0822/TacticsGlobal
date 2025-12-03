import Peer, { DataConnection } from 'peerjs';
import { GameState, LobbyState } from '../types';
import { Intent, Turn, NetworkMessage, ClientIntentMessage, ServerTurnMessage, ServerWelcomeMessage } from './schemas';

export type NetworkEvent =
    | { type: 'CONNECT', peerId: string }
    | { type: 'DISCONNECT' }
    | { type: 'STATE_UPDATE', state: GameState } // For initial sync or full resync
    | { type: 'TURN', turn: Turn }
    | { type: 'INTENT', intent: Intent } // HOST receives intents from clients
    | { type: 'LOBBY_UPDATE', state: LobbyState }
    | { type: 'START_GAME', scenarioId: string, factions: any[] };

type EventHandler = (event: NetworkEvent) => void;

class NetworkServiceImpl {
    private peer: Peer | null = null;
    private conns: DataConnection[] = [];
    private handlers: EventHandler[] = [];
    public myPeerId: string = '';
    public isHost: boolean = false;
    public hostConn: DataConnection | null = null; // For clients to talk to host

    initialize(onReady: (id: string) => void) {
        if (this.peer) return; // Already initialized

        // Use public PeerJS server (default)
        this.peer = new Peer({ debug: 1 });

        this.peer.on('open', (id) => {
            this.myPeerId = id;
            console.log('My Peer ID:', id);
            onReady(id);
        });

        this.peer.on('connection', (conn) => {
            console.log('Incoming connection from:', conn.peer);
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
        });
    }

    connect(hostId: string) {
        if (!this.peer) return;
        console.log('Connecting to:', hostId);
        const conn = this.peer.connect(hostId, { reliable: true });
        this.hostConn = conn;
        this.handleConnection(conn);
    }

    private handleConnection(conn: DataConnection) {
        // Prevent duplicate connections
        if (this.conns.find(c => c.peer === conn.peer)) {
            console.warn('[NETWORK] Duplicate connection attempt from:', conn.peer);
            return;
        }

        this.conns.push(conn);

        conn.on('open', () => {
            console.log('Connection established with:', conn.peer);
            this.notify({ type: 'CONNECT', peerId: conn.peer });
        });

        conn.on('data', (data: any) => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            console.log('Connection closed with:', conn.peer);
            this.conns = this.conns.filter(c => c !== conn);
            if (this.hostConn === conn) {
                this.hostConn = null;
            }
            this.notify({ type: 'DISCONNECT' });
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }

    private handleMessage(msg: NetworkMessage | any, conn: DataConnection) {
        console.log('[NETWORK] Received message:', msg.type, 'from:', conn.peer);

        // Legacy support or direct event mapping
        if (msg.type === 'LOBBY_UPDATE') {
            this.notify({ type: 'LOBBY_UPDATE', state: msg.payload });
            return;
        }
        if (msg.type === 'START_GAME') {
            this.notify({ type: 'START_GAME', ...msg.payload });
            return;
        }

        // New Protocol
        switch (msg.type) {
            case 'SERVER_TURN':
                console.log('[NETWORK] Processing SERVER_TURN, turnNumber:', msg.turn.turnNumber, 'intents count:', msg.turn.intents.length);
                this.notify({ type: 'TURN', turn: msg.turn });
                break;
            case 'SERVER_WELCOME':
                console.log('[NETWORK] Processing SERVER_WELCOME for client:', msg.clientId);
                // Initial state sync
                this.notify({ type: 'STATE_UPDATE', state: msg.gameState });
                break;
            case 'CLIENT_INTENT':
                console.log('[NETWORK] Processing CLIENT_INTENT from:', conn.peer, 'intent type:', msg.intent.type);
                this.notify({ type: 'INTENT', intent: msg.intent });
                break;
            default:
                // Fallback for legacy state updates if any
                if (msg.type === 'STATE_UPDATE') {
                    this.notify({ type: 'STATE_UPDATE', state: msg.payload });
                }
                break;
        }
    }

    private broadcast(msg: NetworkMessage | any) {
        this.conns.forEach(conn => {
            if (conn.open) {
                conn.send(msg);
            }
        });
    }

    // --- CLIENT METHODS ---

    sendIntent(intent: Intent) {
        if (this.isHost) {
            console.warn('[NETWORK] Host trying to send intent via network. Should be handled locally.');
            return;
        }
        if (this.hostConn && this.hostConn.open) {
            const msg: ClientIntentMessage = { type: 'CLIENT_INTENT', intent };
            console.log('[NETWORK CLIENT] Sending CLIENT_INTENT:', intent.type, 'to host');
            this.hostConn.send(msg);
        } else {
            console.error('[NETWORK CLIENT] Cannot send intent, no connection to host!');
        }
    }

    // --- HOST METHODS ---

    broadcastTurn(turn: Turn) {
        const msg: ServerTurnMessage = { type: 'SERVER_TURN', turn };
        console.log('[NETWORK HOST] Broadcasting SERVER_TURN:', turn.turnNumber, 'intents:', turn.intents.length, 'to', this.conns.length, 'clients');
        this.broadcast(msg);
    }

    sendWelcome(clientId: string, gameState: GameState, turnNumber: number) {
        const conn = this.conns.find(c => c.peer === clientId);
        if (conn && conn.open) {
            const msg: ServerWelcomeMessage = {
                type: 'SERVER_WELCOME',
                clientId,
                gameState,
                turnNumber
            };
            conn.send(msg);
        }
    }

    sendLobbyUpdate(state: LobbyState) {
        this.broadcast({ type: 'LOBBY_UPDATE', payload: state });
    }

    startGame(scenarioId: string, factions: any[]) {
        this.broadcast({ type: 'START_GAME', payload: { scenarioId, factions } });
    }

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
        console.log('[NETWORK] Disconnecting all connections...');
        this.conns.forEach(c => c.close());
        this.conns = [];
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }
    }
}

export const NetworkService = new NetworkServiceImpl();
