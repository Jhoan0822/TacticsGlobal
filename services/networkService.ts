import Peer, { DataConnection } from 'peerjs';
import { GameState, LobbyState } from '../types';

export type NetworkEvent =
  | { type: 'CONNECT', peerId: string }
  | { type: 'DISCONNECT' }
  | { type: 'STATE_UPDATE', state: GameState }
  | { type: 'ACTION', action: any }
  | { type: 'LOBBY_UPDATE', state: LobbyState }
  | { type: 'START_GAME', scenarioId: string, factions: any[], localPlayerId: string };

type EventHandler = (event: NetworkEvent) => void;

class NetworkServiceImpl {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: EventHandler[] = [];
  public myPeerId: string = '';
  public isHost: boolean = false;

  initialize(onReady: (id: string) => void) {
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
    this.conn = conn;

    this.conn.on('open', () => {
      console.log('Connection established with:', conn.peer);
      this.notify({ type: 'CONNECT', peerId: conn.peer });
    });

    this.conn.on('data', (data: any) => {
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

    this.conn.on('close', () => {
      console.log('Connection closed');
      this.notify({ type: 'DISCONNECT' });
      this.conn = null;
    });

    this.conn.on('error', (err) => {
      console.error('Connection error:', err);
    });
  }

  sendState(state: GameState) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'STATE_UPDATE', payload: state });
    }
  }

  sendAction(action: any) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'ACTION', payload: action });
    }
  }

  sendLobbyUpdate(state: LobbyState) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'LOBBY_UPDATE', payload: state });
    }
  }

  startGame(scenarioId: string, factions: any[], localPlayerId: string) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type: 'START_GAME', payload: { scenarioId, factions, localPlayerId } });
    }
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
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
  }
}

export const NetworkService = new NetworkServiceImpl();
