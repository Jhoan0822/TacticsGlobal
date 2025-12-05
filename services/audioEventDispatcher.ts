
// ============================================
// AUDIO EVENT DISPATCHER
// Filters and dispatches audio events based on player relevance
// ============================================

import { AudioService } from './audioService';
import { WeaponType } from '../types';

// ============================================
// EVENT TYPES
// ============================================

export enum AudioEventType {
    // Combat
    WEAPON_FIRED = 'WEAPON_FIRED',
    EXPLOSION = 'EXPLOSION',
    UNIT_DEATH = 'UNIT_DEATH',

    // Unit Lifecycle
    UNIT_SPAWNED = 'UNIT_SPAWNED',
    UNIT_PROMOTED = 'UNIT_PROMOTED',

    // City/POI
    CITY_CAPTURED = 'CITY_CAPTURED',
    CITY_UNDER_ATTACK = 'CITY_UNDER_ATTACK',
    INCOME_TICK = 'INCOME_TICK',

    // Commands (always play - these are local player actions)
    UNIT_SELECTED = 'UNIT_SELECTED',
    MOVE_COMMAND = 'MOVE_COMMAND',
    ATTACK_COMMAND = 'ATTACK_COMMAND',

    // Game State
    VICTORY = 'VICTORY',
    DEFEAT = 'DEFEAT',
    GAME_START = 'GAME_START',
}

export interface AudioEvent {
    type: AudioEventType;
    position?: { lat: number; lng: number };
    targetFactionId?: string;
    sourceFactionId?: string;
    data?: {
        weaponType?: WeaponType;
        explosionSize?: 'SMALL' | 'MEDIUM' | 'LARGE';
        isPlayerUnit?: boolean;
        isPOI?: boolean;
    };
}

// ============================================
// EVENT QUEUE & THROTTLING
// Prevents audio spam by limiting events per frame
// ============================================

interface QueuedEvent {
    event: AudioEvent;
    timestamp: number;
}

const eventQueue: QueuedEvent[] = [];
const MAX_EVENTS_PER_FRAME = 5;
const EVENT_COOLDOWNS: Map<string, number> = new Map();

// Minimum time between same event types (ms)
const COOLDOWN_TIMES: Record<AudioEventType, number> = {
    [AudioEventType.WEAPON_FIRED]: 100,
    [AudioEventType.EXPLOSION]: 80,
    [AudioEventType.UNIT_DEATH]: 200,
    [AudioEventType.UNIT_SPAWNED]: 150,
    [AudioEventType.UNIT_PROMOTED]: 500,
    [AudioEventType.CITY_CAPTURED]: 500,
    [AudioEventType.CITY_UNDER_ATTACK]: 2000, // Long cooldown to prevent spam
    [AudioEventType.INCOME_TICK]: 1000,
    [AudioEventType.UNIT_SELECTED]: 50,
    [AudioEventType.MOVE_COMMAND]: 80,
    [AudioEventType.ATTACK_COMMAND]: 80,
    [AudioEventType.VICTORY]: 0,
    [AudioEventType.DEFEAT]: 0,
    [AudioEventType.GAME_START]: 0,
};

const canPlayEvent = (type: AudioEventType): boolean => {
    const lastPlayed = EVENT_COOLDOWNS.get(type) || 0;
    const now = Date.now();
    const cooldown = COOLDOWN_TIMES[type] || 100;

    if (now - lastPlayed >= cooldown) {
        EVENT_COOLDOWNS.set(type, now);
        return true;
    }
    return false;
};

// ============================================
// RELEVANCE FILTERING
// Only play sounds for events that affect the local player
// ============================================

const isEventRelevantToPlayer = (event: AudioEvent, localPlayerId: string): boolean => {
    // Game state events always play
    if (event.type === AudioEventType.VICTORY ||
        event.type === AudioEventType.DEFEAT ||
        event.type === AudioEventType.GAME_START) {
        return true;
    }

    // Player command events always play (local actions)
    if (event.type === AudioEventType.UNIT_SELECTED ||
        event.type === AudioEventType.MOVE_COMMAND ||
        event.type === AudioEventType.ATTACK_COMMAND) {
        return true;
    }

    // Income tick only for local player
    if (event.type === AudioEventType.INCOME_TICK) {
        return event.targetFactionId === localPlayerId;
    }

    // Unit spawned - only for local player's units
    if (event.type === AudioEventType.UNIT_SPAWNED) {
        return event.sourceFactionId === localPlayerId;
    }

    // Unit promoted - only for local player's units
    if (event.type === AudioEventType.UNIT_PROMOTED) {
        return event.sourceFactionId === localPlayerId;
    }

    // City captured - play if local player captured OR lost the city
    if (event.type === AudioEventType.CITY_CAPTURED) {
        return event.sourceFactionId === localPlayerId ||
            event.targetFactionId === localPlayerId;
    }

    // City under attack - only if it's the player's city
    if (event.type === AudioEventType.CITY_UNDER_ATTACK) {
        return event.targetFactionId === localPlayerId;
    }

    // Combat events - play if player is involved (attacker or defender)
    if (event.type === AudioEventType.WEAPON_FIRED ||
        event.type === AudioEventType.EXPLOSION ||
        event.type === AudioEventType.UNIT_DEATH) {
        return event.sourceFactionId === localPlayerId ||
            event.targetFactionId === localPlayerId;
    }

    return false;
};

// ============================================
// EVENT HANDLER
// Maps events to AudioService methods
// ============================================

const handleEvent = (event: AudioEvent): void => {
    switch (event.type) {
        case AudioEventType.WEAPON_FIRED:
            if (event.data?.weaponType) {
                AudioService.playWeaponFire(event.data.weaponType);
            } else {
                AudioService.playTracerFire();
            }
            break;

        case AudioEventType.EXPLOSION:
            AudioService.playExplosion(event.data?.explosionSize || 'SMALL');
            break;

        case AudioEventType.UNIT_DEATH:
            AudioService.playUnitDeath();
            break;

        case AudioEventType.UNIT_SPAWNED:
            AudioService.playUnitSpawn();
            break;

        case AudioEventType.UNIT_PROMOTED:
            AudioService.playUnitPromotion();
            break;

        case AudioEventType.CITY_CAPTURED:
            AudioService.playCityCapture();
            break;

        case AudioEventType.CITY_UNDER_ATTACK:
            AudioService.playCityUnderAttack();
            break;

        case AudioEventType.INCOME_TICK:
            AudioService.playIncomeReceived();
            break;

        case AudioEventType.UNIT_SELECTED:
            AudioService.playUnitSelect();
            break;

        case AudioEventType.MOVE_COMMAND:
            AudioService.playMoveCommand();
            break;

        case AudioEventType.ATTACK_COMMAND:
            AudioService.playAttackCommand();
            break;

        case AudioEventType.VICTORY:
            AudioService.playVictory();
            break;

        case AudioEventType.DEFEAT:
            AudioService.playDefeat();
            break;

        case AudioEventType.GAME_START:
            AudioService.startBackgroundMusic();
            break;
    }
};

// ============================================
// PUBLIC API
// ============================================

/**
 * Dispatch an audio event. The event will be filtered based on player relevance
 * and throttled to prevent audio spam.
 */
export const dispatchAudioEvent = (event: AudioEvent, localPlayerId: string): void => {
    // Filter by relevance
    if (!isEventRelevantToPlayer(event, localPlayerId)) {
        return;
    }

    // Check cooldown
    if (!canPlayEvent(event.type)) {
        return;
    }

    // Play immediately
    handleEvent(event);
};

/**
 * Batch dispatch multiple events (useful for game tick processing)
 */
export const dispatchAudioEvents = (events: AudioEvent[], localPlayerId: string): void => {
    let playedThisFrame = 0;

    for (const event of events) {
        if (playedThisFrame >= MAX_EVENTS_PER_FRAME) break;

        if (isEventRelevantToPlayer(event, localPlayerId) && canPlayEvent(event.type)) {
            handleEvent(event);
            playedThisFrame++;
        }
    }
};

/**
 * Helper to create weapon fired events
 */
export const createWeaponFiredEvent = (
    weaponType: WeaponType,
    sourceFactionId: string,
    targetFactionId: string,
    position?: { lat: number; lng: number }
): AudioEvent => ({
    type: AudioEventType.WEAPON_FIRED,
    sourceFactionId,
    targetFactionId,
    position,
    data: { weaponType }
});

/**
 * Helper to create explosion events
 */
export const createExplosionEvent = (
    size: 'SMALL' | 'MEDIUM' | 'LARGE',
    sourceFactionId?: string,
    targetFactionId?: string,
    position?: { lat: number; lng: number }
): AudioEvent => ({
    type: AudioEventType.EXPLOSION,
    sourceFactionId,
    targetFactionId,
    position,
    data: { explosionSize: size }
});

/**
 * Helper to create command events (always relevant)
 */
export const createCommandEvent = (
    type: AudioEventType.UNIT_SELECTED | AudioEventType.MOVE_COMMAND | AudioEventType.ATTACK_COMMAND
): AudioEvent => ({
    type
});

// Export convenience functions for direct use in hooks
export const AudioEvents = {
    // Combat
    weaponFired: (weaponType: WeaponType, sourceFactionId: string, targetFactionId: string, localPlayerId: string) => {
        dispatchAudioEvent(createWeaponFiredEvent(weaponType, sourceFactionId, targetFactionId), localPlayerId);
    },

    explosion: (size: 'SMALL' | 'MEDIUM' | 'LARGE', sourceFactionId: string, targetFactionId: string, localPlayerId: string) => {
        dispatchAudioEvent(createExplosionEvent(size, sourceFactionId, targetFactionId), localPlayerId);
    },

    unitDeath: (factionId: string, localPlayerId: string) => {
        dispatchAudioEvent({ type: AudioEventType.UNIT_DEATH, targetFactionId: factionId }, localPlayerId);
    },

    // Lifecycle
    unitSpawned: (factionId: string, localPlayerId: string) => {
        dispatchAudioEvent({ type: AudioEventType.UNIT_SPAWNED, sourceFactionId: factionId }, localPlayerId);
    },

    unitPromoted: (factionId: string, localPlayerId: string) => {
        dispatchAudioEvent({ type: AudioEventType.UNIT_PROMOTED, sourceFactionId: factionId }, localPlayerId);
    },

    // Cities
    cityCapture: (capturedBy: string, capturedFrom: string, localPlayerId: string) => {
        dispatchAudioEvent({
            type: AudioEventType.CITY_CAPTURED,
            sourceFactionId: capturedBy,
            targetFactionId: capturedFrom
        }, localPlayerId);
    },

    cityUnderAttack: (cityOwner: string, localPlayerId: string) => {
        dispatchAudioEvent({ type: AudioEventType.CITY_UNDER_ATTACK, targetFactionId: cityOwner }, localPlayerId);
    },

    incomeTick: (factionId: string, localPlayerId: string) => {
        dispatchAudioEvent({ type: AudioEventType.INCOME_TICK, targetFactionId: factionId }, localPlayerId);
    },

    // Commands (always local)
    unitSelected: () => {
        AudioService.playUnitSelect();
    },

    moveCommand: () => {
        AudioService.playMoveCommand();
    },

    attackCommand: () => {
        AudioService.playAttackCommand();
    },

    // Game state
    victory: () => {
        AudioService.playVictory();
    },

    defeat: () => {
        AudioService.playDefeat();
    },

    gameStart: () => {
        AudioService.startBackgroundMusic();
    },

    gameEnd: () => {
        AudioService.stopBackgroundMusic();
    }
};
