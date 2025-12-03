import { UnitClass, WeaponType } from '../types';

export type ClientID = string;

// --- INTENTS ---
// Actions sent by clients to the host

export type IntentType =
    | 'SPAWN'
    | 'MOVE'
    | 'ATTACK'
    | 'BUILD_STRUCTURE'
    | 'SET_TARGET'
    | 'CHEAT_RESOURCES';

export interface BaseIntent {
    type: IntentType;
    clientId: ClientID;
}

export interface SpawnIntent extends BaseIntent {
    type: 'SPAWN';
    unitClass: UnitClass;
    lat: number;
    lng: number;
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

export interface BuildStructureIntent extends BaseIntent {
    type: 'BUILD_STRUCTURE';
    structureType: UnitClass;
    lat: number;
    lng: number;
}

export interface SetTargetIntent extends BaseIntent {
    type: 'SET_TARGET';
    unitId: string;
    targetId: string | null;
}

export interface CheatResourcesIntent extends BaseIntent {
    type: 'CHEAT_RESOURCES';
    gold: number;
    oil: number;
}

export type Intent =
    | SpawnIntent
    | MoveIntent
    | AttackIntent
    | BuildStructureIntent
    | SetTargetIntent
    | CheatResourcesIntent;

// --- TURN ---
// The authoritative bundle of intents for a specific tick

export interface Turn {
    turnNumber: number;
    intents: Intent[];
}

// --- MESSAGES ---
// Network packets

export type MessageType =
    | 'CLIENT_INTENT'
    | 'SERVER_TURN'
    | 'SERVER_FULL_STATE'
    | 'CLIENT_JOIN'
    | 'SERVER_WELCOME';

export interface ClientIntentMessage {
    type: 'CLIENT_INTENT';
    intent: Intent;
}

export interface ServerTurnMessage {
    type: 'SERVER_TURN';
    turn: Turn;
}

export interface ClientJoinMessage {
    type: 'CLIENT_JOIN';
    name: string;
}

export interface ServerWelcomeMessage {
    type: 'SERVER_WELCOME';
    clientId: string;
    gameState: any; // Full state for initial sync
    turnNumber: number;
}

export type NetworkMessage =
    | ClientIntentMessage
    | ServerTurnMessage
    | ClientJoinMessage
    | ServerWelcomeMessage;
