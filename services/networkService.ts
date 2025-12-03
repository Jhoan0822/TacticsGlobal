import Peer, { DataConnection } from 'peerjs';
import { GameState, LobbyState } from '../types';

export type NetworkEvent =
  | { type: 'CONNECT', peerId: string }
  | { type: 'DISCONNECT' }
  | { type: 'STATE_UPDATE', state: GameState }
  | { type: 'ACTION', action: any }
  | { type: 'LOBBY_UPDATE', state: LobbyState }
  | { type: 'START_GAME', scenarioId: string, factions: any[] };

type EventHandler = (event: NetworkEvent) => void;

class NetworkServiceImpl {
  private peer: Peer | null = null;
  private conns: DataConnection[] = [];
  private handlers: EventHandler[] = [];
  public myPeerId: string = '';
  public isHost: boolean = false;

  initialize(onReady: (id: string) => void) {
    if (this.peer) return; // Already initialized

    // Use public PeerJS server (default)
    this.peer = new Peer();

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
    const conn = this.peer.connect(hostId);
    this.handleConnection(conn);
  }

  private handleConnection(conn: DataConnection) {
    this.conns.push(conn);

    conn.on('open', () => {
      console.log('Connection established with:', conn.peer);
      this.notify({ type: 'CONNECT', peerId: conn.peer });
    });

    conn.on('data', (data: any) => {
      if (data.type === 'STATE_UPDATE') {
        this.notify({ type: 'STATE_UPDATE', state: data.payload });
      } else if (data.type === 'ACTION') {
        this.notify({ type: 'ACTION', action: data.payload });
      } else if (data.type === 'LOBBY_UPDATE') {
        this.notify({ type: 'LOBBY_UPDATE', state: data.payload });
      } else if (data.type === 'START_GAME') {
        this.notify({ type: 'START_GAME', ...data.payload });
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      this.conns = this.conns.filter(c => c !== conn);
      this.notify({ type: 'DISCONNECT' });
    });

    conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  private broadcast(msg: any) {
    console.log('[NETWORK] Broadcasting:', msg.type, msg.payload);
    this.conns.forEach(conn => {
      if (conn.open) {
        conn.send(msg);
      } else {
        console.warn('[NETWORK] Connection not open:', conn.peer);
      }
    });
  }

  sendState(state: GameState) {
    // Reduce log spam for state updates
    // console.log('[NETWORK] Sending State'); 
    this.broadcast({ type: 'STATE_UPDATE', payload: state });
  }

  sendAction(action: any) {
    console.log('[NETWORK] Sending Action:', action);
    this.broadcast({ type: 'ACTION', payload: action });
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
    this.conns.forEach(c => c.close());
    this.conns = [];
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}

export const NetworkService = new NetworkServiceImpl();
