import { GameState, GameUnit, UnitClass, POIType } from '../types';
import { getDistanceKm } from './gameLogic';
import { UNIT_CONFIG, DIPLOMACY } from '../constants';

// ===========================================
// PLAYER AUTO-CONTROL SERVICE
// ===========================================
// Allows player units to auto-attack, defend, or patrol
// Manual orders (mouse click) ALWAYS override auto-mode

export const processPlayerAutoControl = (gameState: GameState): GameState => {
    const localPlayerId = gameState.localPlayerId;
    if (!localPlayerId) return gameState;

    const playerUnits = gameState.units.filter(u =>
        u.factionId === localPlayerId &&
        (u.autoMode || u.autoTarget)
    );

    if (playerUnits.length === 0) return gameState;

    const updatedUnits = [...gameState.units];

    playerUnits.forEach(unit => {
        // Skip units with existing targets or destinations (manual orders)
        if (unit.targetId || unit.destination) return;

        const unitIdx = updatedUnits.findIndex(u => u.id === unit.id);
        if (unitIdx === -1) return;

        // Find enemies in range
        const enemies = gameState.units.filter(u =>
            u.factionId !== localPlayerId &&
            u.factionId !== 'NEUTRAL' &&
            u.hp > 0
        );

        const unitStats = UNIT_CONFIG[unit.unitClass];
        const range = unitStats?.range || 50;

        // Find closest enemy in range
        const enemiesInRange = enemies
            .map(e => ({
                enemy: e,
                dist: getDistanceKm(unit.position.lat, unit.position.lng, e.position.lat, e.position.lng)
            }))
            .filter(e => e.dist < range * 1.5) // 1.5x range = pursuit range
            .sort((a, b) => a.dist - b.dist);

        const closestEnemy = enemiesInRange[0]?.enemy;

        // Handle AUTO-TARGET (always engages enemies in range)
        if (unit.autoTarget && closestEnemy) {
            updatedUnits[unitIdx] = {
                ...updatedUnits[unitIdx],
                targetId: closestEnemy.id
            };
            return;
        }

        // Handle AUTO-MODES
        switch (unit.autoMode) {
            case 'DEFEND':
                // Stay near home position, engage enemies that come close
                const homePos = unit.homePosition || unit.position;
                const distFromHome = getDistanceKm(unit.position.lat, unit.position.lng, homePos.lat, homePos.lng);

                if (closestEnemy && enemiesInRange[0].dist < range) {
                    // Engage enemy in defensive range
                    updatedUnits[unitIdx] = { ...updatedUnits[unitIdx], targetId: closestEnemy.id };
                } else if (distFromHome > 30) {
                    // Return to home if too far
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: homePos,
                        targetId: null
                    };
                }
                break;

            case 'ATTACK':
                // Seek and destroy nearest enemy
                if (closestEnemy) {
                    updatedUnits[unitIdx] = { ...updatedUnits[unitIdx], targetId: closestEnemy.id };
                } else {
                    // No enemies in range, find nearest enemy on map
                    const allEnemies = enemies.map(e => ({
                        enemy: e,
                        dist: getDistanceKm(unit.position.lat, unit.position.lng, e.position.lat, e.position.lng)
                    })).sort((a, b) => a.dist - b.dist);

                    if (allEnemies[0]) {
                        updatedUnits[unitIdx] = { ...updatedUnits[unitIdx], targetId: allEnemies[0].enemy.id };
                    }
                }
                break;

            case 'PATROL':
                // Circle around home position, engage hostiles
                const patrolCenter = unit.homePosition || unit.position;
                const patrolDist = getDistanceKm(unit.position.lat, unit.position.lng, patrolCenter.lat, patrolCenter.lng);
                const patrolRadius = 20; // km

                if (closestEnemy && enemiesInRange[0].dist < range) {
                    // Engage enemy
                    updatedUnits[unitIdx] = { ...updatedUnits[unitIdx], targetId: closestEnemy.id };
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
                homePosition: mode !== 'NONE' ? { ...u.position } : undefined,
                targetId: null,
                destination: null
            };
        }
        return u;
    });
    return { ...gameState, units: updatedUnits };
};
