import { GameState, GameUnit, UnitClass, POIType, POI } from '../types';
import { getDistanceKm } from './gameLogic';
import { UNIT_CONFIG, DIPLOMACY } from '../constants';

// ===========================================
// AUTO-CONTROL SERVICE
// ===========================================
// Works for PLAYER units AND NEUTRAL_DEFENDER units
// DEFEND: Patrol area + attack enemies in area (80km radius)
// ATTACK: Hunt enemies continuously, anywhere on map
// Manual click always resets to MANUAL mode

const DEFEND_RADIUS = 80; // km - defend/patrol radius around home

export const processPlayerAutoControl = (gameState: GameState): GameState => {
    // Process units with auto-modes from any faction
    const autoUnits = gameState.units.filter(u =>
        (u.autoMode && u.autoMode !== 'NONE') || u.autoTarget
    );

    if (autoUnits.length === 0) return gameState;

    const updatedUnits = [...gameState.units];

    autoUnits.forEach(unit => {
        const unitIdx = updatedUnits.findIndex(u => u.id === unit.id);
        if (unitIdx === -1) return;

        // Check if current target still exists and is alive
        const currentTarget = unit.targetId
            ? gameState.units.find(u => u.id === unit.targetId && u.hp > 0)
            : null;

        // If target still alive, don't reassign (let combat continue)
        if (currentTarget) return;

        // Find all enemies (anyone not on same faction and not pure NEUTRAL)
        const enemies = gameState.units.filter(u =>
            u.factionId !== unit.factionId &&
            u.factionId !== 'NEUTRAL' && // Don't attack pure NEUTRAL
            u.hp > 0
        );

        const unitStats = UNIT_CONFIG[unit.unitClass];
        const range = unitStats?.range || 50;
        const homePos = unit.homePosition || unit.position;

        // Calculate distances to all enemies
        const enemiesWithDist = enemies.map(e => ({
            enemy: e,
            distToUnit: getDistanceKm(unit.position.lat, unit.position.lng, e.position.lat, e.position.lng),
            distToHome: getDistanceKm(homePos.lat, homePos.lng, e.position.lat, e.position.lng)
        })).sort((a, b) => a.distToUnit - b.distToUnit);

        const closestEnemy = enemiesWithDist[0]?.enemy;
        const closestDist = enemiesWithDist[0]?.distToUnit || Infinity;

        // Handle AUTO-TARGET (standalone, for non-mode units)
        if (unit.autoTarget && !unit.autoMode && closestEnemy && closestDist < range * 1.5) {
            updatedUnits[unitIdx] = {
                ...updatedUnits[unitIdx],
                targetId: closestEnemy.id,
                destination: null
            };
            return;
        }

        // Handle AUTO-MODES
        switch (unit.autoMode) {
            case 'DEFEND': {
                // DEFEND = Patrol area + attack enemies in area
                const enemiesInArea = enemiesWithDist.filter(e => e.distToHome < DEFEND_RADIUS);
                const distFromHome = getDistanceKm(unit.position.lat, unit.position.lng, homePos.lat, homePos.lng);

                if (enemiesInArea.length > 0) {
                    // Attack closest enemy in defense area
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: enemiesInArea[0].enemy.id,
                        destination: null
                    };
                } else if (distFromHome > DEFEND_RADIUS) {
                    // Too far from home, return
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: homePos,
                        targetId: null
                    };
                } else if (!unit.destination) {
                    // No enemies, patrol the area - move to random point within radius
                    const angle = Math.random() * Math.PI * 2;
                    const dist = DEFEND_RADIUS * 0.3 + Math.random() * DEFEND_RADIUS * 0.5;
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: {
                            lat: homePos.lat + Math.sin(angle) * (dist / 111),
                            lng: homePos.lng + Math.cos(angle) * (dist / (111 * Math.cos(homePos.lat * Math.PI / 180)))
                        },
                        targetId: null
                    };
                }
                break;
            }

            case 'ATTACK': {
                // Hunt mode: always find a target anywhere on map
                if (closestEnemy) {
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: closestEnemy.id,
                        destination: null
                    };
                }
                break;
            }
        }
    });

    return { ...gameState, units: updatedUnits };
};

// Toggle auto-target for selected units
export const toggleAutoTarget = (gameState: GameState, unitIds: string[]): GameState => {
    const updatedUnits = gameState.units.map(u => {
        if (unitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
            return { ...u, autoTarget: !u.autoTarget };
        }
        return u;
    });
    return { ...gameState, units: updatedUnits };
};

// Set auto-mode for selected units
export const setAutoMode = (
    gameState: GameState,
    unitIds: string[],
    mode: 'NONE' | 'DEFEND' | 'ATTACK'
): GameState => {
    const updatedUnits = gameState.units.map(u => {
        if (unitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
            return {
                ...u,
                autoMode: mode,
                homePosition: mode !== 'NONE' ? { ...u.position } : undefined,
                targetId: null,
                destination: null
            };
        }
        return u;
    });
    return { ...gameState, units: updatedUnits };
};
