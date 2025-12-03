
import { GameState, GameUnit, Faction, Projectile, POIType, UnitClass, POI, LogMessage, WeaponType, Explosion } from '../types';
import { DIPLOMACY, POI_CONFIG, UNIT_CONFIG, AI_CONFIG, WEAPON_MAPPING } from '../constants';
import { updateAI } from './aiService';
import { TerrainService } from './terrainService';

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getBearing = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x = Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) - Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLon);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
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
    const playerFaction = gameState.factions.find(f => f.id === 'PLAYER');
    
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

export const processGameTick = (currentState: GameState): GameState => {
  if (currentState.gameMode === 'SELECT_BASE') return currentState;

  let newProjectiles: Projectile[] = currentState.projectiles.filter(p => {
      // Filter out projectiles that have hit or expired
      return p.progress < 1;
  });
  
  const newExplosions: Explosion[] = currentState.explosions.filter(e => Date.now() - e.timestamp < 1000);

  // Update Existing Projectiles (Missiles need to travel)
  newProjectiles = newProjectiles.map(p => {
      if (p.weaponType === WeaponType.TRACER || p.weaponType === WeaponType.LASER) {
          // Instant travel for these visuals, handled by CSS mostly, but we keep state for one tick
          return { ...p, progress: 1, isHit: true }; 
      }
      
      // Missiles travel slowly
      const speed = p.speed || 0.1;
      const nextProg = p.progress + speed;
      return { ...p, progress: nextProg, isHit: nextProg >= 1 };
  });

  // Handle Hits
  newProjectiles.forEach(p => {
      if (p.progress >= 1 && p.isHit) {
          // Trigger explosion on arrival
          newExplosions.push({
              id: Math.random().toString(36),
              position: p.toPos,
              timestamp: Date.now(),
              size: p.weaponType === WeaponType.MISSILE ? 'MEDIUM' : 'SMALL'
          });
      }
  });


  let factions = [...currentState.factions]; 
  let nextPOIs = [...currentState.pois];
  let messages = [...currentState.messages];
  
  // 1. UNIT LOGIC
  const nextUnits = currentState.units.map(unit => {
    if (unit.hp <= 0) return unit;

    // Cooldown management
    if (unit.cooldown && unit.cooldown > 0) unit.cooldown -= 1;

    let newLat = unit.position.lat;
    let newLng = unit.position.lng;
    let newHeading = unit.heading;
    let currentDestination = unit.destination;

    // RETALIATION LOGIC
    if (!unit.targetId && !unit.destination && unit.lastAttackerId) {
        const attacker = currentState.units.find(u => u.id === unit.lastAttackerId);
        if (attacker && attacker.hp > 0 && isHostile(factions.find(f => f.id === unit.factionId)!, attacker.factionId)) {
            unit.targetId = unit.lastAttackerId;
        }
    }

    // A. COMBAT TARGET CHASE
    if (unit.targetId) {
      const targetUnit = currentState.units.find(u => u.id === unit.targetId);
      const targetPOI = currentState.pois.find(p => p.id === unit.targetId);

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
        const nearbyUnits = currentState.units.filter(u => 
            u.id !== unit.id && 
            Math.abs(u.position.lat - unit.position.lat) < 0.1 && 
            Math.abs(u.position.lng - unit.position.lng) < 0.1
        );
        const steering = calculateSteering(unit, nearbyUnits, nextPOIs);

        // Convert heading to vector
        let rads = bearing * (Math.PI / 180);
        let vx = Math.cos(rads) * speedFactor; // Lat velocity
        let vy = Math.sin(rads) * speedFactor; // Lng velocity

        // Add steering force
        vx += steering.lat * 0.05; 
        vy += steering.lng * 0.05;

        // Re-normalize velocity to speed
        const currentSpeed = Math.sqrt(vx*vx + vy*vy);
        if (currentSpeed > 0) {
            vx = (vx / currentSpeed) * speedFactor;
            vy = (vy / currentSpeed) * speedFactor;
        }

        const proposedLat = unit.position.lat + vx;
        const proposedLng = unit.position.lng + vy;
        
        // Recalculate heading based on actual vector
        newHeading = (Math.atan2(vy, vx) * (180 / Math.PI) + 360) % 360;

        // TERRAIN CHECK (Hard Stop)
        if (TerrainService.isValidMove(unit.unitClass, proposedLat, proposedLng, nextPOIs)) {
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
             newProjectiles.push({
                id: Math.random().toString(36),
                fromId: u1.id,
                toId: target.id,
                fromPos: { ...u1.position },
                toPos: { ...target.position },
                timestamp: Date.now(),
                isHit: !isMissile, 
                weaponType: weaponType,
                speed: isMissile ? 0.05 : 1, 
                progress: 0
             });

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
       // Prioritize Units
       for (let j = 0; j < nextUnits.length; j++) {
        const u2 = nextUnits[j];
        if (i === j || u2.hp <= 0) continue;
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
      const playerUnits = nextUnits.filter(u => u.factionId === 'PLAYER').length;
      incomeGold += 5 + (playerUnits * 0.5);
      incomeOil += 2;
      nextPOIs.forEach(poi => {
          if (poi.ownerFactionId === 'PLAYER') {
              const config = POI_CONFIG[poi.type];
              incomeGold += config.incomeGold;
              incomeOil += config.incomeOil;
          }
      });
  }

  let nextState: GameState = {
    ...currentState,
    factions: factions,
    units: nextUnits.filter(u => u.hp > 0),
    pois: nextPOIs,
    projectiles: newProjectiles, 
    explosions: newExplosions,
    playerResources: {
      ...currentState.playerResources,
      gold: isResourceTick ? currentState.playerResources.gold + incomeGold : currentState.playerResources.gold,
      oil: isResourceTick ? currentState.playerResources.oil + incomeOil : currentState.playerResources.oil
    },
    gameTick: currentState.gameTick + 1,
    messages: messages
  };
  
  nextState = updateAI(nextState);

  return nextState;
};

const fireProjectile = (attacker: GameUnit, defender: GameUnit | POI, projectiles: Projectile[]) => {
    // Determine Weapon Type
    const weaponType = WEAPON_MAPPING[attacker.unitClass] || WeaponType.TRACER;
    const isMissile = weaponType === WeaponType.MISSILE;
    
    // Projectile logic is purely visual now, damage is applied in the loop to handle capture state immediately
    projectiles.push({
      id: Math.random().toString(36),
      fromId: attacker.id,
      toId: defender.id,
      fromPos: { ...attacker.position },
      toPos: { ...defender.position },
      timestamp: Date.now(),
      isHit: !isMissile, 
      weaponType: weaponType,
      speed: isMissile ? 0.05 : 1, 
      progress: 0
    });
};

export const spawnUnit = (type: UnitClass, lat: number, lng: number, factionId: string = 'PLAYER'): GameUnit => {
    const stats = UNIT_CONFIG[type];
    return {
        id: `SPAWN-${Math.random().toString(36).substr(2, 6)}`,
        unitClass: type,
        factionId: factionId,
        position: { lat, lng },
        heading: 0,
        ...stats,
        realWorldIdentity: undefined,
        isBoosting: false
    };
};
