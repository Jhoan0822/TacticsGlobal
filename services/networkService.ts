import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage, Intent } from './schemas';

type NetworkCallback = (msg: NetworkMessage) => void;

class NetworkServiceImpl {
  private peer: Peer | null = null;
  private connections: DataConnection[] = []; // Host: all clients. Client: just host.
  private hostConnection: DataConnection | null = null; // Client only
  public myPeerId: string = '';
  public isHost: boolean = false;
  private subscribers: NetworkCallback[] = [];

  // --- INITIALIZATION ---
  initialize(onId: (id: string) => void) {
    if (this.peer) return;

    // Generate a short ID for easier typing
    const shortId = Math.random().toString(36).substr(2, 4).toUpperCase();
    this.peer = new Peer(shortId);

    this.peer.on('open', (id) => {
      console.log('[Network] Peer Open:', id);
      this.myPeerId = id;
      onId(id);
    });

    this.peer.on('connection', (conn) => {
      console.log('[Network] Incoming connection from:', conn.peer);
      this.handleConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('[Network] Peer Error:', err);
    });
  }

  // --- HOSTING ---
  startHosting() {
    this.isHost = true;
    console.log('[Network] Started Hosting');
  }

  // --- JOINING ---
  connectToHost(hostId: string) {
    if (!this.peer) return;
    this.isHost = false;
    console.log('[Network] Connecting to Host:', hostId);
    const conn = this.peer.connect(hostId);
    this.handleConnection(conn);
    this.hostConnection = conn;
  }

  // --- CONNECTION HANDLING ---
  private handleConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('[Network] Connection Open:', conn.peer);
      this.connections.push(conn);

      // If I am Host, send current Lobby State immediately? (Handled by MainMenu)
    });

    conn.on('data', (data) => {
      // Pass data to subscribers
      this.notify(data as NetworkMessage);
    });

    conn.on('close', () => {
      console.log('[Network] Connection Closed:', conn.peer);
      this.connections = this.connections.filter(c => c !== conn);
      if (this.hostConnection === conn) this.hostConnection = null;
    });

    conn.on('error', (err) => {
      console.error('[Network] Connection Error:', err);
    });
  }

  // --- MESSAGING ---

  // 1. Send Intent (Client -> Host)
  sendIntent(intent: Intent) {
    if (this.isHost) {
      // Loopback: Host handles its own intents directly in GameLoop, 
      // but for consistency we could emit it locally too.
      // However, typical architecture: Host adds to buffer directly.
      // We'll assume GameLoop handles Host intents locally.
      console.warn('[Network] Host should not call sendIntent via network');
    } else {
      if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send({ type: 'INTENT', intent });
      }
    }
  }

  // 2. Broadcast (Host -> All Clients)
  broadcast(msg: NetworkMessage) {
    if (!this.isHost) return;
    this.connections.forEach(conn => {
      if (conn.open) conn.send(msg);
    });
  }

  // --- SUBSCRIPTION ---
  subscribe(callback: NetworkCallback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notify(msg: NetworkMessage) {
    this.subscribers.forEach(cb => cb(msg));
  }
}

export const NetworkService = new NetworkServiceImpl();
