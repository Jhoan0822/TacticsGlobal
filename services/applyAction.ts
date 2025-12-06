import { GameState, UnitClass, POIType, NuclearMissile, Faction } from '../types';
import { GameAction, SpawnUnitPayload, MoveUnitsPayload, AttackTargetPayload, BuildStructurePayload, SelectBasePayload, ClaimPOIPayload, LaunchNukePayload } from './schemas';
import { spawnUnit } from './gameLogic';
import { UNIT_CONFIG, NUKE_CONFIG } from '../constants';

/**
 * Calculate formation positions for units
 * Simplified version that returns lat/lng positions for each unit index
 */
function calculateFormationOffsets(
    unitCount: number,
    formation: string,
    centerLat: number,
    centerLng: number,
    facingAngle: number
): { lat: number; lng: number }[] {
    const positions: { lat: number; lng: number }[] = [];
    const spacing = 0.5; // ~55km spacing between units
    const angleRad = (facingAngle * Math.PI) / 180;

    for (let i = 0; i < unitCount; i++) {
        let offsetX = 0;
        let offsetY = 0;

        switch (formation) {
            case 'LINE': {
                // Horizontal line perpendicular to facing direction
                const linePos = i - (unitCount - 1) / 2;
                offsetX = linePos * spacing * Math.cos(angleRad + Math.PI / 2);
                offsetY = linePos * spacing * Math.sin(angleRad + Math.PI / 2);
                break;
            }
            case 'COLUMN': {
                // Vertical column in facing direction
                const colPos = i - (unitCount - 1) / 2;
                offsetX = colPos * spacing * Math.cos(angleRad);
                offsetY = colPos * spacing * Math.sin(angleRad);
                break;
            }
            case 'WEDGE': {
                // V-shape pointing in facing direction
                const row = Math.floor(i / 2);
                const side = i % 2 === 0 ? -1 : 1;
                offsetX = -row * spacing * Math.cos(angleRad) + side * row * spacing * 0.5 * Math.cos(angleRad + Math.PI / 2);
                offsetY = -row * spacing * Math.sin(angleRad) + side * row * spacing * 0.5 * Math.sin(angleRad + Math.PI / 2);
                break;
            }
            case 'SQUARE': {
                // Square grid formation
                const gridSize = Math.ceil(Math.sqrt(unitCount));
                const row = Math.floor(i / gridSize);
                const col = i % gridSize;
                offsetX = (col - (gridSize - 1) / 2) * spacing;
                offsetY = (row - (gridSize - 1) / 2) * spacing;
                break;
            }
            case 'CIRCLE': {
                // Circular formation
                const angle = (2 * Math.PI * i) / unitCount;
                const radius = spacing * 0.5;
                offsetX = radius * Math.cos(angle);
                offsetY = radius * Math.sin(angle);
                break;
            }
            case 'SPREAD': {
                // Maximum spread to avoid AoE
                const spreadSpacing = 1.5;
                const spreadGridSize = Math.ceil(Math.sqrt(unitCount));
                const spreadRow = Math.floor(i / spreadGridSize);
                const spreadCol = i % spreadGridSize;
                offsetX = (spreadCol - (spreadGridSize - 1) / 2) * spreadSpacing;
                offsetY = (spreadRow - (spreadGridSize - 1) / 2) * spreadSpacing;
                break;
            }
            default:
                // NONE - no offset
                break;
        }

        positions.push({
            lat: centerLat + offsetY,
            lng: centerLng + offsetX
        });
    }

    return positions;
}

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
                    gold: Math.max(0, f.gold - (cost.gold || 0)),
                    oil: Math.max(0, (f.oil || 0) - (cost.oil || 0))
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
                        isBoosting: payload.isBoosting ?? false,
                        autoMode: 'NONE', // Reset to manual on player command
                        autoTarget: false,
                        formationOffset: undefined // Clear formation - manual override
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Units moved:', payload.unitIds.length, '(mode reset to MANUAL, formation cleared)');
            break;
        }

        case 'ATTACK_TARGET': {
            const payload = action.payload as AttackTargetPayload;
            nextState.units = nextState.units.map(u => {
                if (payload.attackerIds.includes(u.id) && u.factionId === action.playerId) {
                    // Preserve formation destination if unit has formation offset
                    // Only null destination for units without formation
                    return {
                        ...u,
                        targetId: payload.targetId,
                        // Keep destination if unit has formation - it was set by handleTargetCommand
                        destination: u.formationOffset ? u.destination : null,
                        autoMode: 'NONE', // Reset to manual on player command
                        autoTarget: false
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Attack command:', payload.attackerIds.length, 'units (mode reset to MANUAL)');
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

            // CRITICAL: Ensure player faction exists in factions array for resource generation
            const existingFaction = nextState.factions.find(f => f.id === action.playerId);
            if (!existingFaction) {
                // Create new faction for this player with proper type safety
                const newFaction: Faction = {
                    id: action.playerId,
                    name: action.playerId.startsWith('BOT_') ? `Bot ${action.playerId.slice(4)}` : 'Player',
                    color: action.playerId.startsWith('BOT_') ? '#666666' : '#3b82f6', // Blue for player
                    type: action.playerId.startsWith('BOT_') ? 'BOT' : 'PLAYER',
                    gold: 10000, // Starting gold
                    oil: 1000,   // Starting oil
                    relations: {},
                    aggression: action.playerId.startsWith('BOT_') ? 1.0 : 0 // Bots have aggression
                };
                nextState.factions = [...nextState.factions, newFaction];
                console.log('[APPLY ACTION] Created new faction for player:', action.playerId);
            }

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
                poi.tier = 1; // Upgrade to capital

                nextState.units = [...nextState.units, hq];
                nextState.pois = nextState.pois.map(p => p.id === poi.id ? poi : p);

                // Also update playerResources if this is the local player
                if (action.playerId === nextState.localPlayerId) {
                    const faction = nextState.factions.find(f => f.id === action.playerId);
                    if (faction) {
                        nextState.playerResources = {
                            gold: faction.gold,
                            oil: faction.oil || 0,
                            intel: nextState.playerResources.intel
                        };
                    }
                }

                const message = {
                    id: Math.random().toString(36),
                    text: `${action.playerId} established HQ at ${poi.name}`,
                    type: 'info' as const,
                    timestamp: Date.now()
                };
                nextState.messages = [...nextState.messages, message];
                console.log('[APPLY ACTION] Base selected at', poi.name, 'by', action.playerId);
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

        case 'LAUNCH_NUKE': {
            const payload = action.payload as LaunchNukePayload;

            // Deduct launch cost
            deductResources(NUKE_CONFIG.LAUNCH_COST);

            // Find the silo and set its cooldown
            const silo = nextState.units.find(u => u.id === payload.siloId && u.unitClass === UnitClass.MISSILE_SILO);
            if (silo) {
                silo.cooldown = NUKE_CONFIG.COOLDOWN_TICKS;

                // Create nuclear missile in flight
                const nuke: NuclearMissile = {
                    id: payload.nukeId,
                    siloId: payload.siloId,
                    factionId: action.playerId,
                    fromPos: { lat: silo.position.lat, lng: silo.position.lng },
                    toPos: { lat: payload.targetLat, lng: payload.targetLng },
                    launchTime: Date.now(),
                    flightDuration: NUKE_CONFIG.FLIGHT_TIME_MS,
                    progress: 0
                };

                nextState.nukesInFlight = [...(nextState.nukesInFlight || []), nuke];

                // Add log message
                const message = {
                    id: Math.random().toString(36),
                    text: `☢️ NUCLEAR LAUNCH DETECTED!`,
                    type: 'alert' as const,
                    timestamp: Date.now()
                };
                nextState.messages = [...nextState.messages, message];
                console.log('[APPLY ACTION] Nuclear missile launched from silo:', payload.siloId);
            }
            break;
        }

        case 'SET_AUTO_MODE': {
            const payload = action.payload as { unitIds: string[], mode: 'NONE' | 'DEFEND' | 'ATTACK' | 'PATROL' };
            nextState.units = nextState.units.map(u => {
                if (payload.unitIds.includes(u.id) && u.factionId === action.playerId) {
                    return {
                        ...u,
                        autoMode: payload.mode,
                        homePosition: payload.mode !== 'NONE' ? { ...u.position } : undefined,
                        targetId: null,
                        destination: null
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Auto-mode set:', payload.mode, 'for', payload.unitIds.length, 'units');
            break;
        }

        case 'SET_FORMATION': {
            const payload = action.payload as {
                unitIds: string[],
                formation: string,
                centerLat: number,
                centerLng: number,
                facingAngle: number
            };

            // Calculate formation offsets for each unit
            const unitsToUpdate = nextState.units.filter(
                u => payload.unitIds.includes(u.id) && u.factionId === action.playerId
            );

            if (unitsToUpdate.length === 0) break;

            // Calculate positions based on formation type
            const positions = calculateFormationOffsets(
                unitsToUpdate.length,
                payload.formation,
                payload.centerLat,
                payload.centerLng,
                payload.facingAngle
            );

            nextState.units = nextState.units.map(u => {
                const unitIndex = payload.unitIds.indexOf(u.id);
                if (unitIndex !== -1 && u.factionId === action.playerId && positions[unitIndex]) {
                    const pos = positions[unitIndex];
                    return {
                        ...u,
                        formationOffset: {
                            lat: pos.lat - payload.centerLat,
                            lng: pos.lng - payload.centerLng
                        },
                        destination: { lat: pos.lat, lng: pos.lng }
                    };
                }
                return u;
            });
            console.log('[APPLY ACTION] Formation applied:', payload.formation, 'for', payload.unitIds.length, 'units');
            break;
        }
    }

    return nextState;
}
