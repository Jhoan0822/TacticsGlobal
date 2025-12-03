import { UnitClass, GameState } from '../types';

// ============================================
// REAL-TIME P2P MULTIPLAYER SYSTEM
// ============================================
// Optimistic execution: Actions execute locally FIRST,
// then broadcast to others. No waiting for server confirmation.
// Target latency: <100ms (network RTT only)

export type GameActionType =
    | 'SPAWN_UNIT'
    | 'MOVE_UNITS'
    | 'ATTACK_TARGET'
    | 'BUILD_STRUCTURE'
    | 'SELECT_BASE'
    | 'CLAIM_POI';

// Core action structure - simple and fast
export interface GameAction {
    playerId: string;           // Who performed this action
    actionType: GameActionType; // What type of action
    payload: any;               // Action-specific data
    timestamp: number;          // When it happened (for ordering)
    actionId: string;           // Unique ID to prevent duplicates
}

// Specific action payloads for type safety
export interface SpawnUnitPayload {
    unitClass: UnitClass;
    lat: number;
    lng: number;
    unitId: string;  // Pre-generated ID for consistency
}

export interface MoveUnitsPayload {
    unitIds: string[];
    targetLat: number;
    targetLng: number;
    isBoosting?: boolean;
}

export interface AttackTargetPayload {
    attackerIds: string[];
    targetId: string;
    isPoi: boolean;
}

export interface BuildStructurePayload {
    structureType: UnitClass;
    lat: number;
    lng: number;
    unitId: string;
}

export interface SelectBasePayload {
    poiId: string;
    hqUnitId: string;
}

export interface ClaimPOIPayload {
    poiId: string;
    factionId: string;
}

// Network message types
export type NetworkMessageType =
    | 'ACTION'           // GameAction broadcast
    | 'FULL_STATE'       // Complete state sync (resync/join)
    | 'LOBBY_UPDATE'     // Lobby changes
    | 'START_GAME';      // Game start signal

export interface ActionMessage {
    type: 'ACTION';
    action: GameAction;
}

export interface FullStateMessage {
    type: 'FULL_STATE';
    gameState: GameState;
    timestamp: number;
}

export interface LobbyUpdateMessage {
    type: 'LOBBY_UPDATE';
    payload: any;
}

export interface StartGameMessage {
    type: 'START_GAME';
    payload: {
        scenarioId: string;
        factions: any[];
    };
}

export type NetworkMessage =
    | ActionMessage
    | FullStateMessage
    | LobbyUpdateMessage
    | StartGameMessage;

// Helper to create action with unique ID
export function createAction(
    playerId: string,
    actionType: GameActionType,
    payload: any
): GameAction {
    return {
        playerId,
        actionType,
        payload,
        timestamp: Date.now(),
        actionId: `${playerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
}

// Legacy Intent Interface (for processGameTick compatibility)
export interface Intent {
    type: 'SPAWN' | 'MOVE' | 'ATTACK' | 'BUILD_STRUCTURE' | 'SET_TARGET' | 'CHEAT_RESOURCES';
    clientId: string;
    unitClass?: UnitClass;
    lat?: number;
    lng?: number;
    unitIds?: string[];
    attackerId?: string;
    targetId?: string;
    structureType?: UnitClass;
    unitId?: string;
    gold?: number;
    oil?: number;
}
