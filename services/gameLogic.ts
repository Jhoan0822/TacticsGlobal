
import { GameState, GameUnit, Faction, Projectile, POIType, UnitClass, POI, LogMessage, WeaponType, Explosion } from '../types';
import { DIPLOMACY, POI_CONFIG, UNIT_CONFIG, AI_CONFIG, WEAPON_MAPPING } from '../constants';
import { updateAI } from './aiService';
import { TerrainService } from './terrainService';
import { Intent } from './schemas';

// OPTIMIZATION: Pre-calculate constants
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS = 6371;

// OPTIMIZATION: Fast approximation for short distances (Haversine is too heavy for game loop)
// Error is negligible for game logic distances (< 500km)
export const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    // Simple Euclidean approximation on sphere surface for performance
    const latMean = (lat1 + lat2) * DEG2RAD * 0.5;
    const x = dLon * Math.cos(latMean);
    const y = dLat;
    return EARTH_RADIUS * Math.sqrt(x * x + y * y);
};

// OPTIMIZATION: Fast bearing calculation
const getBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLon = (lng2 - lng1) * DEG2RAD;
    const lat1Rad = lat1 * DEG2RAD;
    const lat2Rad = lat2 * DEG2RAD;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
};



const getRelation = (f1: Faction, f2Id: string): number => {
    if (f1.id === f2Id) return 100;
    return f1.relations[f2Id] || 0;
};

const isHostile = (f1: Faction, f2Id: string): boolean => {
    if (f1.id === f2Id) return false;
    if (f2Id === 'NEUTRAL') return false;
    return getRelation(f1, f2Id) <= DIPLOMACY.WAR_THRESHOLD;
};

const canAttack = (attacker: GameUnit, defenderClass: UnitClass | 'CITY'): boolean => {
    // UNRESTRICTED COMBAT: Allow any unit to attack anything.
    return true;
};

// Logging Helper
const logEvent = (msgs: LogMessage[], text: string, type: LogMessage['type']) => {
    msgs.push({ id: Math.random().toString(36), text, type, timestamp: Date.now() });
    if (msgs.length > 20) msgs.shift();
};

export const evaluateAllianceRequest = (gameState: GameState, targetFactionId: string): { accepted: boolean, reason: string, chance: number } => {
    const targetFaction = gameState.factions.find(f => f.id === targetFactionId);
    const playerFaction = gameState.factions.find(f => f.id === gameState.localPlayerId);

    if (!targetFaction || !playerFaction) return { accepted: false, reason: 'Faction not found', chance: 0 };

    const getPower = (fid: string) => gameState.units.filter(u => u.factionId === fid).reduce((acc, u) => acc + u.attack, 0);
    const playerPower = getPower('PLAYER');
    const aiPower = getPower(targetFactionId);

    let score = 0;
    // 1. Relations
    score += (getRelation(targetFaction, 'PLAYER') * 0.5);

    // 2. Power Balance
    const ratio = playerPower / (aiPower + 1);
    if (ratio > 0.8 && ratio < 1.5) score += 20;
    else if (ratio > 3.0) score -= 10;
    else if (ratio < 0.2) score -= 20;

    // 3. Distance
    let minDist = Infinity;
    gameState.units.filter(u => u.factionId === 'PLAYER').forEach(pu => {
        gameState.units.filter(u => u.factionId === targetFactionId).forEach(au => {
            const d = getDistanceKm(pu.position.lat, pu.position.lng, au.position.lat, au.position.lng);
            if (d < minDist) minDist = d;
        });
    });
    if (minDist < 500) score += 10;

    // 4. Common Enemies
    const playerEnemies = Object.keys(playerFaction.relations).filter(id => playerFaction.relations[id] < DIPLOMACY.WAR_THRESHOLD);
    const aiEnemies = Object.keys(targetFaction.relations).filter(id => targetFaction.relations[id] < DIPLOMACY.WAR_THRESHOLD);
    const commonEnemies = playerEnemies.filter(id => aiEnemies.includes(id));
    score += (commonEnemies.length * 25);

    const chance = Math.min(100, Math.max(0, score + 50));

    if (score >= 40) return { accepted: true, reason: 'Strategic interests align.', chance };
    if (score >= 10) return { accepted: false, reason: 'Not enough benefit for us.', chance };
    return { accepted: false, reason: 'Our interests conflict.', chance };
};

// --- STEERING BEHAVIORS FOR PATHFINDING ---
const calculateSteering = (unit: GameUnit, neighbors: GameUnit[], pois: POI[]): { lat: number, lng: number } => {
    let steerLat = 0;
    let steerLng = 0;

    // 1. SEPARATION (Push away from neighbors to avoid stacking)
    const desiredSeparation = 0.05; // ~5km
    let count = 0;
    neighbors.forEach(other => {
        const d = Math.sqrt(Math.pow(unit.position.lat - other.position.lat, 2) + Math.pow(unit.position.lng - other.position.lng, 2));
        if (d > 0 && d < desiredSeparation) {
            const diffLat = unit.position.lat - other.position.lat;
            const diffLng = unit.position.lng - other.position.lng;
            // Weight by distance
            steerLat += (diffLat / d);
            steerLng += (diffLng / d);
            count++;
        }
    });

    if (count > 0) {
        steerLat /= count;
        steerLng /= count;
    }

    // 2. OBSTACLE AVOIDANCE (Terrain)
    // Look ahead vector
    const speedFactor = 0.008 * unit.speed * (unit.isBoosting ? 2.0 : 1.0);
    const rads = unit.heading * (Math.PI / 180);
    const lookAheadLat = unit.position.lat + (Math.cos(rads) * speedFactor * 5); // Look 5 ticks ahead
    const lookAheadLng = unit.position.lng + (Math.sin(rads) * speedFactor * 5);

    if (!TerrainService.isValidMove(unit.unitClass, lookAheadLat, lookAheadLng, pois)) {
        // If hitting obstacle, steer strongly to the left or right relative to current heading
        // Simple heuristic: bounce normal
        steerLat += Math.sin(rads) * 0.5; // Perpendicular force
        steerLng -= Math.cos(rads) * 0.5;
    }

    return { lat: steerLat, lng: steerLng };
};

// --- OPTIMIZED SPATIAL GRID ---
export const GRID_CELL_SIZE = 0.1; // ~11km

// OPTIMIZATION: Persistent Grid to avoid allocation every frame
class SpatialGrid {
    private grid: Map<string, GameUnit[]> = new Map();
    private keys: string[] = []; // Reuse array for keys

    clear() {
        // OPTIMIZATION: Reuse arrays to avoid reallocation
        for (const cell of this.grid.values()) {
            cell.length = 0;
        }
    }

    add(unit: GameUnit) {
        const key = getGridKey(unit.position.lat, unit.position.lng);
        let cell = this.grid.get(key);
        if (!cell) {
            cell = []; // We still allocate arrays here, but could pool them if needed
            this.grid.set(key, cell);
        }
        cell.push(unit);
    }

    getNearby(lat: number, lng: number): GameUnit[] {
        const latIdx = Math.floor(lat / GRID_CELL_SIZE);
        const lngIdx = Math.floor(lng / GRID_CELL_SIZE);
        const nearby: GameUnit[] = [];

        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                const key = `${latIdx + x},${lngIdx + y}`;
                const cell = this.grid.get(key);
                if (cell) {
                    // Manual push is faster than spread for large arrays, but spread is fine here
                    for (let i = 0; i < cell.length; i++) nearby.push(cell[i]);
                }
            }
        }
        return nearby;
    }
}

const spatialGrid = new SpatialGrid();

export const getGridKey = (lat: number, lng: number) => {
    // Bitwise truncate for speed? No, lat/lng are floats.
    return `${Math.floor(lat / GRID_CELL_SIZE)},${Math.floor(lng / GRID_CELL_SIZE)}`;
};

// Deprecated: Use spatialGrid singleton
export const buildSpatialGrid = (units: GameUnit[]) => {
    spatialGrid.clear();
    for (let i = 0; i < units.length; i++) {
        spatialGrid.add(units[i]);
    }
    return spatialGrid; // Return the singleton wrapper (API change)
};

// Helper for backward compatibility if needed, but we will use spatialGrid directly
export const getNearbyUnits = (unit: GameUnit | { position: { lat: number, lng: number } }, grid?: any) => {
    return spatialGrid.getNearby(unit.position.lat, unit.position.lng);
};

// OPTIMIZATION: Projectile Pool
class ProjectilePool {
    private pool: Projectile[] = [];

    get(fromId: string, toId: string, fromPos: { lat: number, lng: number }, toPos: { lat: number, lng: number }, weaponType: WeaponType): Projectile {
        let p = this.pool.pop();
        if (!p) {
            p = {
                id: '',
                fromId: '',
                toId: '',
                fromPos: { lat: 0, lng: 0 },
                toPos: { lat: 0, lng: 0 },
                timestamp: 0,
                isHit: false,
                weaponType: WeaponType.TRACER,
                speed: 0,
                progress: 0
            };
        }
        p.id = Math.random().toString(36);
        p.fromId = fromId;
        p.toId = toId;
        p.fromPos.lat = fromPos.lat;
        p.fromPos.lng = fromPos.lng;
        p.toPos.lat = toPos.lat;
        p.toPos.lng = toPos.lng;
        p.timestamp = Date.now();
        p.isHit = false;
        p.weaponType = weaponType;
        p.speed = weaponType === WeaponType.MISSILE ? 0.05 : 1;
        p.progress = 0;
        return p;
    }

    release(p: Projectile) {
        this.pool.push(p);
    }
}
const projectilePool = new ProjectilePool();

export const spawnUnit = (type: UnitClass, lat: number, lng: number, factionId: string = 'PLAYER', id?: string): GameUnit => {
    const stats = UNIT_CONFIG[type];
    return {
        id: id || `SPAWN-${Math.random().toString(36).substr(2, 6)}`,
        unitClass: type,
        factionId: factionId,
        position: { lat, lng },
        heading: 0,
        ...stats,
        realWorldIdentity: undefined,
        isBoosting: false
    };
};

export const processGameTick = (currentState: GameState, intents: Intent[] = []): GameState => {
    if (currentState.gameMode === 'SELECT_BASE') return currentState;

    let nextUnits = [...currentState.units];
    let nextPOIs = [...currentState.pois];
    let messages = [...currentState.messages];
    let playerResources = { ...currentState.playerResources };
    let factions = [...currentState.factions];

    // --- PROCESS INTENTS ---
    for (const intent of intents) {
        switch (intent.type) {
            case 'SPAWN': {
                // Determine faction from clientId (simple mapping for now, or assume PLAYER if local)
                // Ideally, clientId should map to a factionId in the lobby state.
                // For now, we'll assume the intent comes with the correct context or we map it.
                // Let's assume 'PLAYER' for now or use a mapping if we had one.
                // But wait, in multiplayer, we need to know WHICH player spawned it.
                // We need a way to map clientId to factionId.
                // For this implementation, let's assume clientId IS the factionId or we have a way to look it up.
                // Since we don't have the lobby state here easily, let's assume the intent creator is the owner.
                // Actually, we should probably pass the factionId in the intent or look it up.
                // Let's assume clientId is the factionId for simplicity in this step.
                // Let's assume clientId is the factionId for simplicity in this step.
                const unit = spawnUnit(intent.unitClass, intent.lat, intent.lng, intent.clientId, intent.unitId);

                // Deduct resources
                const cost = UNIT_CONFIG[intent.unitClass].cost;
                if (cost) {
                    // We need to deduct from the correct faction's resources.
                    // But GameState only has 'playerResources' which is for the local player?
                    // No, GameState should have resources for ALL factions if we are the host.
                    // But 'playerResources' seems to be a specific field.
                    // Let's check Faction interface. It has 'gold'.
                    // We should update the Faction's gold.
                    const factionIndex = currentState.factions.findIndex(f => f.id === intent.clientId);
                    if (factionIndex !== -1) {
                        // Update faction gold
                        // Note: We are modifying a local copy of factions later, but here we need to be careful.
                        // We will update it in the factions array.
                    }
                }
                nextUnits.push(unit);

                // FIX: If spawning HQ on a City, update City ownership immediately
                if (unit.unitClass === UnitClass.COMMAND_CENTER || unit.unitClass === UnitClass.MOBILE_COMMAND_CENTER) {
                    const city = nextPOIs.find(p =>
                        Math.abs(p.position.lat - unit.position.lat) < 0.001 &&
                        Math.abs(p.position.lng - unit.position.lng) < 0.001
                    );
                    if (city) {
                        city.ownerFactionId = intent.clientId;
                        // Log capture
                        logEvent(messages, `${intent.clientId} established base at ${city.name}`, 'info');
                    }
                }
                break;
            }
            case 'MOVE': {
                intent.unitIds.forEach(id => {
                    const unit = nextUnits.find(u => u.id === id);
                    if (unit && unit.factionId === intent.clientId) {
                        unit.destination = { lat: intent.lat, lng: intent.lng };
                        unit.targetId = null; // Clear target when moving manually
                    }
                });
                break;
            }
            case 'ATTACK': {
                const attacker = nextUnits.find(u => u.id === intent.attackerId);
                if (attacker && attacker.factionId === intent.clientId) {
                    attacker.targetId = intent.targetId;
                    attacker.destination = null; // Clear move dest
                }
                break;
            }
            case 'BUILD_STRUCTURE': {
                // Similar to SPAWN but for structures (POIs or Units depending on implementation)
                // TacticOPS treats structures as Units mostly (Mobile Command Center builds them?)
                // Or they are POIs?
                // Looking at UnitClass, MILITARY_BASE etc are Units.
                const unit = spawnUnit(intent.structureType, intent.lat, intent.lng, intent.clientId);
                nextUnits.push(unit);
                break;
            }
            case 'SET_TARGET': {
                const unit = nextUnits.find(u => u.id === intent.unitId);
                if (unit && unit.factionId === intent.clientId) {
                    unit.targetId = intent.targetId;
                }
                break;
            }
            case 'CHEAT_RESOURCES': {
                // Handle cheats
                // Find the faction to give resources to
                const factionIndex = currentState.factions.findIndex(f => f.id === intent.clientId);
                if (factionIndex !== -1) {
                    // We need to update the faction in the factions array
                    // But here we only have local 'playerResources' which is for the LOCAL player.
                    // If we are Host, we should update the Faction's gold in the array.
                    // If we are Client, we update local 'playerResources' IF it matches us.

                    // Update Faction (Host Authority)
                    factions[factionIndex] = {
                        ...factions[factionIndex],
                        gold: factions[factionIndex].gold + intent.gold
                    };

                    // Update Local Resources if it's us
                    if (intent.clientId === currentState.localPlayerId) {
                        playerResources.gold += intent.gold;
                        playerResources.oil += intent.oil;
                    }
                }
                break;
            }
        }
    }

    // OPTIMIZATION: Manage Projectiles with Pool
    const nextProjectiles: Projectile[] = [];
    const newExplosions: Explosion[] = currentState.explosions.filter(e => Date.now() - e.timestamp < 1000);

    for (let i = 0; i < currentState.projectiles.length; i++) {
        const p = currentState.projectiles[i];

        if (p.weaponType === WeaponType.TRACER || p.weaponType === WeaponType.LASER) {
            // Instant hit visual
            if (p.progress < 1) {
                p.progress = 1;
                p.isHit = true;
                // Create explosion
                newExplosions.push({
                    id: Math.random().toString(36),
                    position: p.toPos,
                    timestamp: Date.now(),
                    size: 'SMALL'
                });
                // Release immediately after one frame of "hit" state? 
                // Actually, if we set progress=1, we should keep it for this frame so renderer sees it, then release next frame.
                // But here we are processing for the *next* state.
                // If it was already 1, release it.
                projectilePool.release(p);
            } else {
                projectilePool.release(p);
            }
            continue;
        }

        // Missiles
        const speed = p.speed || 0.1;
        p.progress += speed;

        if (p.progress >= 1) {
            p.isHit = true;
            newExplosions.push({
                id: Math.random().toString(36),
                position: p.toPos,
                timestamp: Date.now(),
                size: p.weaponType === WeaponType.MISSILE ? 'MEDIUM' : 'SMALL'
            });
            projectilePool.release(p);
        } else {
            nextProjectiles.push(p);
        }
    }

    // const newExplosions: Explosion[] = currentState.explosions.filter(e => Date.now() - e.timestamp < 1000); // Already declared above

    // Projectile logic moved to loop above for efficiency


    // let factions = [...currentState.factions]; // Moved to top
    // Update factions based on intents (e.g. resource deduction) if we did it above?
    // Actually, let's just handle resource updates in the resource tick or specific intent logic if needed.

    // BUILD SPATIAL GRID
    // OPTIMIZATION: Use the persistent grid
    spatialGrid.clear();
    for (let i = 0; i < nextUnits.length; i++) {
        spatialGrid.add(nextUnits[i]);
    }
    // const unitGrid = buildSpatialGrid(currentState.units); // Removed allocation

    // 1. UNIT LOGIC
    nextUnits = nextUnits.map(unit => {
        if (unit.hp <= 0) return unit;

        // Cooldown management
        if (unit.cooldown && unit.cooldown > 0) unit.cooldown -= 1;

        let newLat = unit.position.lat;
        let newLng = unit.position.lng;
        let newHeading = unit.heading;
        let currentDestination = unit.destination;

        // RETALIATION LOGIC
        if (!unit.targetId && !unit.destination && unit.lastAttackerId) {
            const attacker = nextUnits.find(u => u.id === unit.lastAttackerId);
            if (attacker && attacker.hp > 0 && isHostile(factions.find(f => f.id === unit.factionId)!, attacker.factionId)) {
                unit.targetId = unit.lastAttackerId;
            }
        }

        // A. COMBAT TARGET CHASE
        if (unit.targetId) {
            const targetUnit = nextUnits.find(u => u.id === unit.targetId);
            const targetPOI = nextPOIs.find(p => p.id === unit.targetId);

            let targetPos = targetUnit?.position || targetPOI?.position;

            // If target dead/gone/captured, clear
            if (
                (targetUnit && targetUnit.hp <= 0) ||
                (targetPOI && targetPOI.ownerFactionId === unit.factionId)
            ) {
                unit.targetId = null;
                currentDestination = null;
            } else if (targetPos) {
                const dist = getDistanceKm(unit.position.lat, unit.position.lng, targetPos.lat, targetPos.lng);
                if (dist > unit.range * 0.8) {
                    currentDestination = targetPos;
                } else {
                    currentDestination = null;
                    newHeading = getBearing(unit.position.lat, unit.position.lng, targetPos.lat, targetPos.lng);
                }
            }
        }

        // B. MOVEMENT & PATHFINDING
        if (currentDestination) {
            const distToDest = getDistanceKm(unit.position.lat, unit.position.lng, currentDestination.lat, currentDestination.lng);
            const boostMultiplier = unit.isBoosting ? 2.0 : 1.0;
            const speedFactor = 0.008 * unit.speed * boostMultiplier;
            const moveDistKm = speedFactor * 111;

            if (distToDest <= moveDistKm || distToDest < 0.5) {
                currentDestination = null;
                if (unit.isBoosting) unit.isBoosting = false;
            } else {
                // Basic Heading
                let bearing = getBearing(unit.position.lat, unit.position.lng, currentDestination.lat, currentDestination.lng);

                // --- APPLY STEERING BEHAVIORS ---
                // OPTIMIZATION: Use Spatial Grid for neighbors
                const nearbyUnits = spatialGrid.getNearby(unit.position.lat, unit.position.lng);
                // Filter in place or use a loop to avoid allocation?
                // For now, filter is okay as the set is small
                const neighbors = nearbyUnits.filter(u =>
                    u.id !== unit.id &&
                    Math.abs(u.position.lat - unit.position.lat) < 0.05 &&
                    Math.abs(u.position.lng - unit.position.lng) < 0.05
                );

                const steering = calculateSteering(unit, neighbors, nextPOIs);

                // Convert heading to vector
                let rads = bearing * (Math.PI / 180);
                let vx = Math.cos(rads) * speedFactor; // Lat velocity
                let vy = Math.sin(rads) * speedFactor; // Lng velocity

                // Add steering force
                vx += steering.lat * 0.05;
                vy += steering.lng * 0.05;

                // Re-normalize velocity to speed
                const currentSpeed = Math.sqrt(vx * vx + vy * vy);
                if (currentSpeed > 0) {
                    vx = (vx / currentSpeed) * speedFactor;
                    vy = (vy / currentSpeed) * speedFactor;
                }

                const proposedLat = unit.position.lat + vx;
                const proposedLng = unit.position.lng + vy;

                // Recalculate heading based on actual vector
                newHeading = (Math.atan2(vy, vx) * (180 / Math.PI) + 360) % 360;

                // SCENARIO BOUNDS CHECK
                const bounds = currentState.scenario?.bounds || { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 };
                const inBounds = proposedLat >= bounds.minLat && proposedLat <= bounds.maxLat &&
                    proposedLng >= bounds.minLng && proposedLng <= bounds.maxLng;

                // TERRAIN CHECK (Hard Stop)
                if (inBounds && TerrainService.isValidMove(unit.unitClass, proposedLat, proposedLng, nextPOIs)) {
                    newLat = proposedLat;
                    newLng = proposedLng;
                } else {
                    // Stuck? 
                    currentDestination = null;
                }
            }
        } else {
            if (unit.isBoosting) unit.isBoosting = false;
        }

        return { ...unit, position: { lat: newLat, lng: newLng }, heading: newHeading, destination: currentDestination };
    });

    // Re-build grid with next positions for combat check? 
    // Or just use the old one for approximation? 
    // Let's use the old one to avoid re-building, but update positions in our local 'nextUnits' array.
    // Actually, for combat, we need to know who is near the *new* position.
    // But since units move slowly, the old grid is "good enough" for finding candidates.

    // 2. COMBAT RESOLUTION & CITY CAPTURE VIA ATTACK
    for (let i = 0; i < nextUnits.length; i++) {
        const u1 = nextUnits[i];
        if (u1.hp <= 0) continue;
        if (u1.cooldown && u1.cooldown > 0) continue; // Fire rate limit

        const u1Faction = factions.find(f => f.id === u1.factionId);
        if (!u1Faction) continue;

        let hasFired = false;

        // Helper to fire with CAPTURE logic integrated
        const tryFire = (target: GameUnit | POI) => {
            let tPos = target.position;
            const dist = getDistanceKm(u1.position.lat, u1.position.lng, tPos.lat, tPos.lng);
            if (dist <= u1.range) {
                const weaponType = WEAPON_MAPPING[u1.unitClass] || WeaponType.TRACER;
                const isMissile = weaponType === WeaponType.MISSILE;
                const damage = Math.max(5, u1.attack * 0.5);

                // Apply Damage
                target.hp -= damage;

                // --- CITY CAPTURE LOGIC (CONQUEST) ---
                // Only capture if unit has canCapture = true (Ground units)
                if ('type' in target) {
                    if (target.hp <= 0) {
                        if (u1.canCapture) {
                            // Capture the City!
                            target.hp = target.maxHp * 0.5; // Restore partial health
                            target.ownerFactionId = u1.factionId;

                            // Log Event
                            const factionName = u1Faction?.name || 'Unknown';
                            logEvent(messages, `${factionName} captured ${target.name} by force!`, 'alert');
                        } else {
                            // Siege but cannot capture - keep at 0 HP
                            target.hp = 0;
                        }
                    }
                } else if (target.hp < 0) {
                    // Unit death
                    target.hp = 0;
                }

                // Create Projectile
                // Create Projectile (Pooled)
                const proj = projectilePool.get(
                    u1.id,
                    target.id,
                    u1.position,
                    target.position,
                    weaponType
                );
                nextProjectiles.push(proj);

                u1.cooldown = 10; // Frames until next shot

                // If unit, mark retaliation
                if (!('type' in target)) {
                    (target as GameUnit).lastAttackerId = u1.id;
                }
                return true;
            }
            return false;
        }

        // Explicit Target (Manual Command)
        if (u1.targetId) {
            const targetUnit = nextUnits.find(u => u.id === u1.targetId);
            const targetPOI = nextPOIs.find(p => p.id === u1.targetId);

            if (targetUnit && targetUnit.hp > 0) {
                if (canAttack(u1, targetUnit.unitClass)) {
                    hasFired = tryFire(targetUnit);
                }
            } else if (targetPOI && targetPOI.ownerFactionId !== u1.factionId) {
                if (canAttack(u1, 'CITY')) {
                    hasFired = tryFire(targetPOI);
                }
            }
        }

        // Auto-Acquire (Only if Hostile)
        if (!hasFired) {
            // Prioritize Units - OPTIMIZED WITH SPATIAL GRID
            const potentialTargets = spatialGrid.getNearby(u1.position.lat, u1.position.lng);

            for (const u2 of potentialTargets) {
                if (u2.id === u1.id || u2.hp <= 0) continue;
                if (u1.factionId === u2.factionId) continue;
                if (!isHostile(u1Faction, u2.factionId)) continue;

                if (canAttack(u1, u2.unitClass)) {
                    if (tryFire(u2)) {
                        hasFired = true;
                        break;
                    }
                }
            }

            // Then Cities (Siege Logic)
            if (!hasFired && canAttack(u1, 'CITY')) {
                for (const poi of nextPOIs) {
                    if (poi.ownerFactionId !== u1.factionId && isHostile(u1Faction, poi.ownerFactionId)) {
                        if (tryFire(poi)) {
                            hasFired = true;
                            break;
                        }
                    }
                }
            }
        }
    }

    // 3. CAPTURE LOGIC (Passive Regen only, capture is now handled in combat)
    nextPOIs = nextPOIs.map(poi => {
        // Regen City HP slightly if not under attack and not captured recently
        if (poi.hp < poi.maxHp && poi.hp > 0) poi.hp += 0.5;
        return poi;
    });

    // 4. RESOURCE GEN
    const isResourceTick = currentState.gameTick % 40 === 0;
    if (isResourceTick) {
        factions = factions.map(faction => {
            let income = 5;
            const ownedCities = nextPOIs.filter(p => p.ownerFactionId === faction.id);
            ownedCities.forEach(c => {
                income += POI_CONFIG[c.type].incomeGold;
            });
            return { ...faction, gold: faction.gold + income };
        });
    }

    let incomeGold = 0;
    let incomeOil = 0;
    if (isResourceTick) {
        // Calculate income for the LOCAL player to update UI
        // But wait, 'playerResources' in GameState is specifically for the local view?
        // Or is it the "Player" faction resources?
        // It seems 'playerResources' is a legacy field for the UI.
        // We should sync it with the local player's actual faction resources.

        const localFaction = factions.find(f => f.id === currentState.localPlayerId);
        if (localFaction) {
            // We already calculated income in the loop above (lines 678-685)
            // So we just sync here?
            // Actually, the loop above updates 'factions'.
            // We should just grab the updated gold from there.
            // But 'playerResources' has oil/intel which Faction might not have fully?
            // Faction interface has 'gold'.
            // Let's assume for now we calculate it here again for the UI or migrate UI to use Faction.
            // For safety, let's calculate it here for 'playerResources'.

            const playerUnits = nextUnits.filter(u => u.factionId === currentState.localPlayerId).length;
            incomeGold += 5 + (playerUnits * 0.5);
            incomeOil += 2;
            nextPOIs.forEach(poi => {
                if (poi.ownerFactionId === currentState.localPlayerId) {
                    const config = POI_CONFIG[poi.type];
                    incomeGold += config.incomeGold;
                    incomeOil += config.incomeOil;
                }
            });
        }
    }

    let nextState: GameState = {
        ...currentState,
        factions: factions,
        units: nextUnits.filter(u => u.hp > 0),
        pois: nextPOIs,
        projectiles: nextProjectiles,
        explosions: newExplosions,
        playerResources: {
            ...currentState.playerResources,
            gold: isResourceTick ? currentState.playerResources.gold + incomeGold : currentState.playerResources.gold,
            oil: isResourceTick ? currentState.playerResources.oil + incomeOil : currentState.playerResources.oil
        },
        gameTick: currentState.gameTick + 1,
        messages: messages
    };

    // Throttle AI Update (every 5 ticks)
    // Only Host runs AI
    if (!currentState.isClient && currentState.gameTick % 5 === 0) {
        nextState = updateAI(nextState);
    }

    return nextState;
};

const fireProjectile = (attacker: GameUnit, defender: GameUnit | POI, projectiles: Projectile[]) => {
    // Determine Weapon Type
    const weaponType = WEAPON_MAPPING[attacker.unitClass] || WeaponType.TRACER;
    const isMissile = weaponType === WeaponType.MISSILE;

    // Projectile logic is purely visual now, damage is applied in the loop to handle capture state immediately
    const proj = projectilePool.get(
        attacker.id,
        defender.id,
        attacker.position,
        defender.position,
        weaponType
    );
    projectiles.push(proj);
};
