import { GameState, GameUnit, UnitClass, POIType, POI } from '../types';
import { getDistanceKm } from './gameLogic';
import { UNIT_CONFIG, DIPLOMACY } from '../constants';

// ===========================================
// AUTO-CONTROL SERVICE
// ===========================================
// Works for PLAYER units AND NEUTRAL_DEFENDER units
// DEFEND: Protect controlled area, auto-target, return home when clear
// ATTACK: Hunt enemies continuously, anywhere on map
// Manual click always resets to MANUAL mode

const DEFEND_RADIUS = 100; // km - defend radius around home

export const processPlayerAutoControl = (gameState: GameState): GameState => {
    // Process units with auto-modes from any faction that has them
    const autoUnits = gameState.units.filter(u =>
        (u.autoMode && u.autoMode !== 'NONE') || u.autoTarget
    );

    if (autoUnits.length === 0) return gameState;

    const updatedUnits = [...gameState.units];

    autoUnits.forEach(unit => {
        // Skip if unit has manual orders (destination set by player) - only skip if NOT in auto-mode
        // For DEFEND/ATTACK modes, we process even if they have a target (to find new targets when current dies)
        if (unit.autoMode === 'NONE' && (unit.targetId || unit.destination)) return;

        const unitIdx = updatedUnits.findIndex(u => u.id === unit.id);
        if (unitIdx === -1) return;

        // Check if current target still exists and is alive
        const currentTarget = unit.targetId
            ? gameState.units.find(u => u.id === unit.targetId && u.hp > 0)
            : null;

        // If target still alive, don't reassign (let combat continue)
        if (currentTarget) return;

        // Find all enemies (anyone not on same faction)
        const enemies = gameState.units.filter(u =>
            u.factionId !== unit.factionId &&
            u.factionId !== 'NEUTRAL' && // Don't attack neutral (non-defender) units
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

        // Handle AUTO-TARGET (always engages enemies in range)
        if (unit.autoTarget && closestEnemy && closestDist < range * 1.5) {
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
                // Find enemies within DEFEND_RADIUS of home position
                const enemiesInArea = enemiesWithDist.filter(e => e.distToHome < DEFEND_RADIUS);
                const distFromHome = getDistanceKm(unit.position.lat, unit.position.lng, homePos.lat, homePos.lng);

                if (enemiesInArea.length > 0) {
                    // Attack closest enemy in defense area
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: enemiesInArea[0].enemy.id,
                        destination: null,
                        autoTarget: true // Enable auto-target in DEFEND mode
                    };
                } else if (distFromHome > 30) {
                    // No enemies in area, return to home
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: homePos,
                        targetId: null
                    };
                }
                // If at home and no enemies, do nothing (wait)
                break;
            }

            case 'ATTACK': {
                // Hunt mode: always find a target anywhere on map
                if (closestEnemy) {
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: closestEnemy.id,
                        destination: null,
                        autoTarget: true // Enable auto-target in ATTACK mode
                    };
                }
                // If no enemies exist, do nothing
                break;
            }

            case 'PATROL': {
                const patrolCenter = unit.homePosition || unit.position;
                const patrolDist = getDistanceKm(unit.position.lat, unit.position.lng, patrolCenter.lat, patrolCenter.lng);
                const patrolRadius = 30; // km

                // Check for enemies in patrol range
                const enemiesInPatrol = enemiesWithDist.filter(e => e.distToHome < patrolRadius * 2);

                if (enemiesInPatrol.length > 0 && enemiesInPatrol[0].distToUnit < range * 2) {
                    // Engage enemy
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: enemiesInPatrol[0].enemy.id,
                        destination: null
                    };
                } else if (patrolDist > patrolRadius * 1.5) {
                    // Return to patrol area
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: patrolCenter,
                        targetId: null
                    };
                } else if (!unit.destination) {
                    // Move to random point in patrol area
                    const angle = Math.random() * Math.PI * 2;
                    const dist = patrolRadius * 0.5 + Math.random() * patrolRadius * 0.5;
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: {
                            lat: patrolCenter.lat + Math.sin(angle) * (dist / 111),
                            lng: patrolCenter.lng + Math.cos(angle) * (dist / (111 * Math.cos(patrolCenter.lat * Math.PI / 180)))
                        },
                        targetId: null
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
    mode: 'NONE' | 'DEFEND' | 'ATTACK' | 'PATROL'
): GameState => {
    const updatedUnits = gameState.units.map(u => {
        if (unitIds.includes(u.id) && u.factionId === gameState.localPlayerId) {
            return {
                ...u,
                autoMode: mode,
                autoTarget: mode === 'DEFEND' || mode === 'ATTACK', // Auto-enable for combat modes
                homePosition: mode !== 'NONE' ? { ...u.position } : undefined,
                targetId: null,
                destination: null
            };
        }
        return u;
    });
    return { ...gameState, units: updatedUnits };
};
