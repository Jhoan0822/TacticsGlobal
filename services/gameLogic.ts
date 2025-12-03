import { GameState, GameUnit, Faction, Projectile, POIType, UnitClass, POI, LogMessage, WeaponType, Explosion } from '../types';
import { DIPLOMACY, POI_CONFIG, UNIT_CONFIG, WEAPON_MAPPING } from '../constants';
import { updateAI } from './aiService';
import { TerrainService } from './terrainService';
import { Intent } from './schemas';

// --- CONSTANTS ---
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS = 6371;

// --- HELPERS ---
export const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const dLat = (lat2 - lat1) * DEG2RAD;
    const dLon = (lon2 - lon1) * DEG2RAD;
    const latMean = (lat1 + lat2) * DEG2RAD * 0.5;
    const x = dLon * Math.cos(latMean);
    const y = dLat;
    return EARTH_RADIUS * Math.sqrt(x * x + y * y);
};

const getBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const dLon = (lng2 - lng1) * DEG2RAD;
    const lat1Rad = lat1 * DEG2RAD;
    const lat2Rad = lat2 * DEG2RAD;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return (Math.atan2(y, x) * RAD2DEG + 360) % 360;
};

const logEvent = (msgs: LogMessage[], text: string, type: LogMessage['type']) => {
    msgs.push({ id: Math.random().toString(36), text, type, timestamp: Date.now() });
    if (msgs.length > 20) msgs.shift();
};

// --- SPATIAL GRID (Optimization) ---
class SpatialGrid {
    private grid: Map<string, GameUnit[]> = new Map();
    clear() { this.grid.clear(); }
    add(unit: GameUnit) {
        const key = `${Math.floor(unit.position.lat * 10)},${Math.floor(unit.position.lng * 10)}`;
        if (!this.grid.has(key)) this.grid.set(key, []);
        this.grid.get(key)!.push(unit);
    }
    getNearby(lat: number, lng: number): GameUnit[] {
        const latIdx = Math.floor(lat * 10);
        const lngIdx = Math.floor(lng * 10);
        const nearby: GameUnit[] = [];
        for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
                const cell = this.grid.get(`${latIdx + x},${lngIdx + y}`);
                if (cell) nearby.push(...cell);
            }
        }
        return nearby;
    }
}
const spatialGrid = new SpatialGrid();

// --- CORE LOGIC ---

export const spawnUnit = (type: UnitClass, lat: number, lng: number, factionId: string, id?: string): GameUnit => {
    const stats = UNIT_CONFIG[type];
    return {
        id: id || `SPAWN-${Math.random().toString(36).substr(2, 9)}`,
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
    // 1. DEEP COPY STATE (Immutability)
    let nextUnits = currentState.units.map(u => ({ ...u }));
    let nextPOIs = currentState.pois.map(p => ({ ...p }));
    let nextFactions = currentState.factions.map(f => ({ ...f }));
    let nextMessages = [...currentState.messages];
    let nextProjectiles: Projectile[] = [];
    currentState.projectiles.forEach(p => nextProjectiles.push({ ...p }));
    let nextExplosions = currentState.explosions.filter(e => Date.now() - e.timestamp < 1000);

    // 2. PROCESS INTENTS
    for (const intent of intents) {
        switch (intent.type) {
            case 'CLAIM_BASE': {
                // ROBUST: Use ID directly
                const poiIndex = nextPOIs.findIndex(p => p.id === intent.poiId);
                if (poiIndex !== -1) {
                    nextPOIs[poiIndex].ownerFactionId = intent.clientId;
                    logEvent(nextMessages, `${intent.clientId} claimed ${nextPOIs[poiIndex].name}`, 'info');
                } else {
                    console.warn(`[GameLogic] CLAIM_BASE failed: POI ${intent.poiId} not found`);
                }
                break;
            }
            case 'SPAWN': {
                // Deduct Resources
                const factionIndex = nextFactions.findIndex(f => f.id === intent.clientId);
                const cost = UNIT_CONFIG[intent.unitClass].cost;

                if (factionIndex !== -1 && cost) {
                    nextFactions[factionIndex].gold -= cost;
                }

                const unit = spawnUnit(intent.unitClass, intent.lat, intent.lng, intent.clientId, intent.unitId);
                nextUnits.push(unit);

                // HQ Spawn Logic (Claim City) - Redundant if CLAIM_BASE is used, but good fallback
                if (unit.unitClass === UnitClass.COMMAND_CENTER) {
                    const cityIndex = nextPOIs.findIndex(p =>
                        Math.abs(p.position.lat - unit.position.lat) < 0.02 &&
                        Math.abs(p.position.lng - unit.position.lng) < 0.02
                    );
                    if (cityIndex !== -1) {
                        nextPOIs[cityIndex].ownerFactionId = intent.clientId;
                    }
                }
                break;
            }
            case 'MOVE': {
                intent.unitIds.forEach(id => {
                    const u = nextUnits.find(unit => unit.id === id);
                    if (u && u.factionId === intent.clientId) {
                        u.destination = { lat: intent.lat, lng: intent.lng };
                        u.targetId = null;
                    }
                });
                break;
            }
            case 'ATTACK': {
                const u = nextUnits.find(unit => unit.id === intent.attackerId);
                if (u && u.factionId === intent.clientId) {
                    u.targetId = intent.targetId;
                    u.destination = null;
                }
                break;
            }
            case 'BUILD_STRUCTURE': {
                const unit = spawnUnit(intent.structureType, intent.lat, intent.lng, intent.clientId);
                nextUnits.push(unit);
                break;
            }
            case 'SET_TARGET': {
                const u = nextUnits.find(unit => unit.id === intent.unitId);
                if (u && u.factionId === intent.clientId) {
                    u.targetId = intent.targetId;
                }
                break;
            }
            case 'CHEAT_RESOURCES': {
                const fIndex = nextFactions.findIndex(f => f.id === intent.clientId);
                if (fIndex !== -1) {
                    nextFactions[fIndex].gold += intent.gold;
                    nextFactions[fIndex].oil += intent.oil;
                }
                break;
            }
        }
    }

    // 3. UNIT LOGIC (Movement, Steering, Combat)

    // Build Grid
    spatialGrid.clear();
    nextUnits.forEach(u => spatialGrid.add(u));

    nextUnits = nextUnits.map(unit => {
        if (unit.hp <= 0) return unit;
        if (unit.cooldown && unit.cooldown > 0) unit.cooldown--;

        // Movement
        if (unit.destination || unit.targetId) {
            let destLat = unit.destination?.lat;
            let destLng = unit.destination?.lng;

            // Target Chase
            if (unit.targetId) {
                const tUnit = nextUnits.find(u => u.id === unit.targetId);
                const tPoi = nextPOIs.find(p => p.id === unit.targetId);
                const tPos = tUnit?.position || tPoi?.position;

                if (tPos) {
                    const dist = getDistanceKm(unit.position.lat, unit.position.lng, tPos.lat, tPos.lng);
                    if (dist > unit.range * 0.8) {
                        destLat = tPos.lat;
                        destLng = tPos.lng;
                    } else {
                        // In range, stop moving
                        destLat = undefined;
                        destLng = undefined;
                    }
                } else {
                    unit.targetId = null; // Target lost
                }
            }

            if (destLat !== undefined && destLng !== undefined) {
                const dist = getDistanceKm(unit.position.lat, unit.position.lng, destLat, destLng);
                const speed = 0.008 * unit.speed; // Approx speed factor

                if (dist > 0.5) {
                    const bearing = getBearing(unit.position.lat, unit.position.lng, destLat, destLng);
                    const rads = bearing * DEG2RAD;

                    unit.position.lat += Math.cos(rads) * speed;
                    unit.position.lng += Math.sin(rads) * speed;
                    unit.heading = bearing;
                } else {
                    unit.destination = null;
                }
            }
        }

        return unit;
    });

    // Combat
    nextUnits.forEach(attacker => {
        if (attacker.hp <= 0 || (attacker.cooldown && attacker.cooldown > 0)) return;

        // Find Target
        let target: GameUnit | POI | undefined;

        if (attacker.targetId) {
            target = nextUnits.find(u => u.id === attacker.targetId) || nextPOIs.find(p => p.id === attacker.targetId);
        } else {
            // Auto-acquire
            const nearby = spatialGrid.getNearby(attacker.position.lat, attacker.position.lng);
            target = nearby.find(u => u.factionId !== attacker.factionId && u.hp > 0); // Simple hostile check
        }

        if (target) {
            const dist = getDistanceKm(attacker.position.lat, attacker.position.lng, target.position.lat, target.position.lng);
            if (dist <= attacker.range) {
                // Fire!
                attacker.cooldown = 20; // Fire rate

                // Damage
                const dmg = Math.max(5, attacker.attack);
                target.hp -= dmg;

                // Visuals
                nextProjectiles.push({
                    id: Math.random().toString(36),
                    fromId: attacker.id,
                    toId: target.id,
                    fromPos: { ...attacker.position },
                    toPos: { ...target.position },
                    weaponType: WEAPON_MAPPING[attacker.unitClass] || WeaponType.TRACER,
                    timestamp: Date.now(),
                    progress: 0,
                    isHit: false,
                    speed: 0.1
                });

                // Capture Logic
                if ('type' in target && target.hp <= 0 && attacker.canCapture) {
                    target.hp = target.maxHp * 0.5;
                    target.ownerFactionId = attacker.factionId;
                    logEvent(nextMessages, `${attacker.factionId} captured ${target.name}`, 'alert');
                }
            }
        }
    });

    // 4. RESOURCE GENERATION (Every 60 ticks ~ 1 sec)
    if (currentState.gameTick % 60 === 0) {
        nextFactions = nextFactions.map(f => {
            let gold = 5;
            let oil = 2;
            nextPOIs.filter(p => p.ownerFactionId === f.id).forEach(p => {
                const conf = POI_CONFIG[p.type];
                if (conf) {
                    gold += conf.incomeGold;
                    oil += conf.incomeOil;
                }
            });
            return { ...f, gold: f.gold + gold, oil: f.oil + oil };
        });
    }

    // 5. SYNC PLAYER RESOURCES (For UI)
    const localFaction = nextFactions.find(f => f.id === currentState.localPlayerId);
    const nextPlayerResources = localFaction ? {
        gold: localFaction.gold,
        oil: localFaction.oil,
        intel: localFaction.intel
    } : currentState.playerResources;

    return {
        ...currentState,
        units: nextUnits.filter(u => u.hp > 0),
        pois: nextPOIs,
        factions: nextFactions,
        messages: nextMessages,
        projectiles: nextProjectiles,
        explosions: nextExplosions,
        playerResources: nextPlayerResources,
        gameTick: currentState.gameTick + 1
    };
};

export const evaluateAllianceRequest = (gameState: GameState, targetFactionId: string) => {
    return { accepted: false, reason: "Not implemented", chance: 0 };
};
