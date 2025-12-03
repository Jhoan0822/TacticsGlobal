import { GameState, UnitClass, POIType } from '../types';
import { GameAction, SpawnUnitPayload, MoveUnitsPayload, AttackTargetPayload, BuildStructurePayload, SelectBasePayload, ClaimPOIPayload } from './schemas';
import { spawnUnit } from './gameLogic';
import { UNIT_CONFIG } from '../constants';

/**
 * Apply a network action to the game state IMMEDIATELY
 * This is called when receiving actions from other players
 * NO latency - executes as soon as message arrives
 */
export function applyAction(state: GameState, action: GameAction): GameState {
    console.log('[APPLY ACTION]', action.actionType, 'from', action.playerId);

    let nextState = { ...state };

    // Helper to deduct resources
    const deductResources = (cost: { gold: number, oil: number }) => {
        // 1. Deduct from Faction (Gold only as per Faction type)
        nextState.factions = nextState.factions.map(f => {
            if (f.id === action.playerId) {
                return {
                    ...f,
                    gold: Math.max(0, f.gold - (cost.gold || 0))
                };
            }
            return f;
        });

        // 2. If Local Player, deduct from playerResources (Gold + Oil)
        // This keeps the UI in sync and enforces local limits
        if (action.playerId === state.localPlayerId) {
            nextState.playerResources = {
                ...nextState.playerResources,
                gold: Math.max(0, nextState.playerResources.gold - (cost.gold || 0)),
                oil: Math.max(0, nextState.playerResources.oil - (cost.oil || 0))
            };
        }
    };

    switch (action.actionType) {
        case 'SPAWN_UNIT': {
            const payload = action.payload as SpawnUnitPayload;
            const stats = UNIT_CONFIG[payload.unitClass];

            // Deduct Resources
            if (stats && stats.cost) {
                deductResources(stats.cost);
            }

            const unit = spawnUnit(
                payload.unitClass,
                payload.lat,
                payload.lng,
                action.playerId
            );
            // Use the pre-generated ID for consistency
            unit.id = payload.unitId;

            nextState.units = [...nextState.units, unit];
            console.log('[APPLY ACTION] Unit spawned:', payload.unitClass, 'total units:', nextState.units.length);
            break;
        }

        case 'MOVE_UNITS': {
            const payload = action.payload as MoveUnitsPayload;
            nextState.units = nextState.units.map(u => {
                if (payload.unitIds.includes(u.id) && u.factionId === action.playerId) {
                    return {
                        ...u,
                        destination: { lat: payload.targetLat, lng: payload.targetLng },
                        targetId: null,
                        isBoosting: payload.isBoosting ?? false
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Units moved:', payload.unitIds.length);
            break;
        }

        case 'ATTACK_TARGET': {
            const payload = action.payload as AttackTargetPayload;
            nextState.units = nextState.units.map(u => {
                if (payload.attackerIds.includes(u.id) && u.factionId === action.playerId) {
                    return {
                        ...u,
                        targetId: payload.targetId,
                        destination: null
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Attack command:', payload.attackerIds.length, 'units');
            break;
        }

        case 'BUILD_STRUCTURE': {
            const payload = action.payload as BuildStructurePayload;
            const stats = UNIT_CONFIG[payload.structureType];

            // Deduct Resources
            if (stats && stats.cost) {
                deductResources(stats.cost);
            }

            const structure = spawnUnit(
                payload.structureType,
                payload.lat,
                payload.lng,
                action.playerId
            );
            structure.id = payload.unitId;

            nextState.units = [...nextState.units, structure];
            console.log('[APPLY ACTION] Structure built:', payload.structureType);
            break;
        }

        case 'SELECT_BASE': {
            const payload = action.payload as SelectBasePayload;

            // Spawn HQ
            const hq = spawnUnit(
                UnitClass.COMMAND_CENTER,
                0, 0, // Will be set by POI position
                action.playerId
            );
            hq.id = payload.hqUnitId;

            // Find and claim POI
            const poi = nextState.pois.find(p => p.id === payload.poiId);
            if (poi) {
                hq.position = { lat: poi.position.lat, lng: poi.position.lng };
                poi.ownerFactionId = action.playerId;
                poi.tier = 1;

                nextState.units = [...nextState.units, hq];
                nextState.pois = nextState.pois.map(p => p.id === poi.id ? poi : p);

                const message = {
                    id: Math.random().toString(36),
                    text: `${action.playerId} established HQ at ${poi.name}`,
                    type: 'info' as const,
                    timestamp: Date.now()
                };
                nextState.messages = [...nextState.messages, message];
                console.log('[APPLY ACTION] Base selected at', poi.name);
            }
            break;
        }

        case 'CLAIM_POI': {
            const payload = action.payload as ClaimPOIPayload;
            nextState.pois = nextState.pois.map(p => {
                if (p.id === payload.poiId) {
                    return { ...p, ownerFactionId: payload.factionId };
                }
                return p;
            });
            console.log('[APPLY ACTION] POI claimed:', payload.poiId);
            break;
        }
    }

    return nextState;
}
