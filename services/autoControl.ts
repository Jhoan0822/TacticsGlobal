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
                // DEFEND = Patrol TERRITORY (owned POIs) + attack enemies in territory

                // Find all owned POIs for this faction to define territory
                const ownedPOIs = gameState.pois.filter(p =>
                    p.ownerFactionId === unit.factionId &&
                    (p.type === POIType.CITY || p.type === POIType.OIL_RIG || p.type === POIType.GOLD_MINE)
                );

                // Calculate territory bounds (convex hull simplified as bounding box + margin)
                let minLat = homePos.lat, maxLat = homePos.lat;
                let minLng = homePos.lng, maxLng = homePos.lng;

                ownedPOIs.forEach(poi => {
                    if (poi.position.lat < minLat) minLat = poi.position.lat;
                    if (poi.position.lat > maxLat) maxLat = poi.position.lat;
                    if (poi.position.lng < minLng) minLng = poi.position.lng;
                    if (poi.position.lng > maxLng) maxLng = poi.position.lng;
                });

                // Add margin to territory (in degrees, ~50km)
                const margin = 0.5;
                minLat -= margin; maxLat += margin;
                minLng -= margin; maxLng += margin;

                // Check if enemy is inside territory bounds
                const enemiesInTerritory = enemiesWithDist.filter(e =>
                    e.enemy.position.lat >= minLat && e.enemy.position.lat <= maxLat &&
                    e.enemy.position.lng >= minLng && e.enemy.position.lng <= maxLng
                );

                // Also check if enemy is near any owned POI (radius-based as backup)
                const enemiesNearPOIs = enemiesWithDist.filter(e =>
                    ownedPOIs.some(poi =>
                        getDistanceKm(poi.position.lat, poi.position.lng, e.enemy.position.lat, e.enemy.position.lng) < DEFEND_RADIUS
                    )
                );

                // Combine both checks
                const threateningEnemies = [
                    ...enemiesInTerritory,
                    ...enemiesNearPOIs.filter(e => !enemiesInTerritory.find(t => t.enemy.id === e.enemy.id))
                ];

                // Check if unit is within territory
                const inTerritory = unit.position.lat >= minLat && unit.position.lat <= maxLat &&
                    unit.position.lng >= minLng && unit.position.lng <= maxLng;

                if (threateningEnemies.length > 0) {
                    // Attack closest threatening enemy
                    const closest = threateningEnemies.sort((a, b) => a.distToUnit - b.distToUnit)[0];
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        targetId: closest.enemy.id,
                        destination: null
                    };
                } else if (!inTerritory) {
                    // Return to territory - go to nearest owned POI
                    let nearestPOI = homePos;
                    let nearestDist = Infinity;
                    ownedPOIs.forEach(poi => {
                        const d = getDistanceKm(unit.position.lat, unit.position.lng, poi.position.lat, poi.position.lng);
                        if (d < nearestDist) {
                            nearestDist = d;
                            nearestPOI = poi.position;
                        }
                    });
                    updatedUnits[unitIdx] = {
                        ...updatedUnits[unitIdx],
                        destination: nearestPOI,
                        targetId: null
                    };
                } else if (!unit.destination) {
                    // Patrol territory - move to a random owned POI or patrol point
                    if (ownedPOIs.length > 0) {
                        // Pick a random owned POI as patrol waypoint
                        const patrolTarget = ownedPOIs[Math.floor(Math.random() * ownedPOIs.length)];
                        const offsetLat = (Math.random() - 0.5) * 0.1; // Small offset
                        const offsetLng = (Math.random() - 0.5) * 0.1;
                        updatedUnits[unitIdx] = {
                            ...updatedUnits[unitIdx],
                            destination: {
                                lat: patrolTarget.position.lat + offsetLat,
                                lng: patrolTarget.position.lng + offsetLng
                            },
                            targetId: null
                        };
                    } else {
                        // No owned POIs, patrol around home
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
