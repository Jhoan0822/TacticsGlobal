import { UnitClass, GameState, Faction } from '../types';

// --- INTENTS (Client Actions) ---
export type IntentType = 'SPAWN' | 'MOVE' | 'ATTACK' | 'CLAIM_BASE' | 'BUILD_STRUCTURE' | 'SET_TARGET' | 'CHEAT_RESOURCES';

export interface BaseIntent {
    id: string; // Unique ID for deduplication (UUID)
    type: IntentType;
    clientId: string; // The PeerID of the player issuing the command
    timestamp: number;
}

export interface SpawnIntent extends BaseIntent {
    type: 'SPAWN';
    unitClass: UnitClass;
    lat: number;
    lng: number;
    unitId: string; // Client generates ID to allow immediate prediction
}

export interface MoveIntent extends BaseIntent {
    type: 'MOVE';
    unitIds: string[];
    lat: number;
    lng: number;
}

export interface AttackIntent extends BaseIntent {
    type: 'ATTACK';
    attackerId: string;
    targetId: string;
}

export interface ClaimBaseIntent extends BaseIntent {
    type: 'CLAIM_BASE';
    poiId: string; // Explicit POI ID
}

export interface BuildStructureIntent extends BaseIntent {
    type: 'BUILD_STRUCTURE';
    structureType: UnitClass;
    lat: number;
    lng: number;
}

export interface SetTargetIntent extends BaseIntent {
    type: 'SET_TARGET';
    unitId: string;
    targetId: string;
}

export interface CheatResourcesIntent extends BaseIntent {
    type: 'CHEAT_RESOURCES';
    gold: number;
    oil: number;
}

export type Intent = SpawnIntent | MoveIntent | AttackIntent | ClaimBaseIntent | BuildStructureIntent | SetTargetIntent | CheatResourcesIntent;

// --- PACKETS (Network Messages) ---

// 1. LOBBY
export interface LobbyUpdatePacket {
    type: 'LOBBY_UPDATE';
    players: { id: string; name: string; factionIndex: number; isHost: boolean; isReady: boolean }[];
    scenarioId: string;
    difficulty: string;
    botCount: number;
}

export interface StartGamePacket {
    type: 'START_GAME';
    scenarioId: string;
    factions: Faction[]; // Host dictates the factions
}

// 2. GAME LOOP
export interface TurnPacket {
    type: 'TURN';
    turnNumber: number;
    intents: Intent[]; // Confirmed intents for this tick
}

export interface SyncPacket {
    type: 'SYNC';
    state: GameState; // Full state for reconciliation/late-join
}

export type NetworkMessage = LobbyUpdatePacket | StartGamePacket | TurnPacket | SyncPacket | { type: 'INTENT'; intent: Intent };
