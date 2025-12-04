import { GameState, Faction, GameUnit, UnitClass, POI, POIType, Difficulty } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY, AI_CONFIG, GAME_TICK_MS, DIFFICULTY_CONFIG } from '../constants';
import { spawnUnit, getNearbyUnits, getDistanceKm } from './gameLogic';
import { AIDirector } from './aiDirector';

// --- CORE AI LOOP ---
export const updateAI = (gameState: GameState, unitGrid?: Map<string, GameUnit[]>): GameState => {
  // 1. Run Director (Wave spawns)
  let newState = AIDirector.getInstance().update(gameState);

  // 2. Run Faction Logic for EVERY BOT
  const now = Date.now();

  newState.factions.forEach(faction => {
    // ONLY process BOT factions
    if (faction.type !== 'BOT') return;

    // Throttle AI updates (but faster than before)
    const timeSinceLastUpdate = now - (faction.lastAiUpdate || 0);
    if (timeSinceLastUpdate < 200) return; // 200ms minimum between AI ticks

    faction.lastAiUpdate = now;

    // AGGRESSIVE AI: Evaluate targets and take action
    const targets = evaluateTargets(faction, newState, unitGrid);

    // FORCE PRODUCTION: AI always tries to build if it has money
    newState = executeProductionAggressive(faction, newState, targets);

    // FORCE MOVEMENT: AI always assigns targets to idle units
    newState = executeMovementAggressive(faction, newState, targets);
  });

  return newState;
};

// --- TARGET EVALUATION ---
interface ScoredTarget {
  id: string;
  type: 'CITY' | 'UNIT' | 'RESOURCE';
  position: { lat: number; lng: number };
  score: number;
}

const evaluateTargets = (faction: Faction, gameState: GameState, unitGrid?: Map<string, GameUnit[]>): ScoredTarget[] => {
  const targets: ScoredTarget[] = [];
  const myUnits = gameState.units.filter(u => u.factionId === faction.id);
  if (myUnits.length === 0) return [];

  const avgLat = myUnits.reduce((sum, u) => sum + u.position.lat, 0) / myUnits.length;
  const avgLng = myUnits.reduce((sum, u) => sum + u.position.lng, 0) / myUnits.length;

  const config = DIFFICULTY_CONFIG[gameState.difficulty || Difficulty.MEDIUM];

  // A. Evaluate POIs (Cities, Gold Mines, Oil Rigs)
  gameState.pois.forEach(poi => {
    const isMine = poi.ownerFactionId === faction.id;
    if (isMine) return; // Don't target own POIs

    const isNeutral = poi.ownerFactionId === 'NEUTRAL';
    const relation = faction.relations[poi.ownerFactionId] || 0;
    const isEnemy = !isNeutral && relation <= DIPLOMACY.WAR_THRESHOLD;

    // Target neutral and enemy POIs
    if (!isNeutral && !isEnemy) return;

    const dist = getDistanceKm(avgLat, avgLng, poi.position.lat, poi.position.lng);
    let score = 0;

    // Base score by POI type
    if (poi.type === POIType.CITY) {
      score = isNeutral ? 300 : 250; // Cities are HIGH priority
    } else if (poi.type === POIType.GOLD_MINE) {
      score = isNeutral ? 200 : 150; // Gold is good
    } else if (poi.type === POIType.OIL_RIG) {
      score = isNeutral ? 180 : 130; // Oil is important too
    }

    // Tier bonus for cities
    if (poi.type === POIType.CITY) {
      score += (4 - poi.tier) * 50; // Tier 1 = +150, Tier 2 = +100, Tier 3 = +50
    }

    // Distance penalty (closer is better)
    score -= dist * 0.3;

    // Damaged targets are easier to capture
    if (poi.hp < poi.maxHp) {
      score += (1 - poi.hp / poi.maxHp) * 100;
    }

    targets.push({
      id: poi.id,
      type: poi.type === POIType.CITY ? 'CITY' : 'RESOURCE',
      position: poi.position,
      score
    });
  });

  // B. Evaluate Enemy Units (High Priority Threats)
  gameState.units.forEach(unit => {
    if (unit.factionId === faction.id) return;
    if (unit.factionId === 'NEUTRAL') return;

    const relation = faction.relations[unit.factionId] || 0;
    if (relation > DIPLOMACY.WAR_THRESHOLD) return; // Not at war

    const dist = getDistanceKm(avgLat, avgLng, unit.position.lat, unit.position.lng);

    // Score based on threat level
    let score = 100;

    // Closer threats are higher priority
    if (dist < 50) score += 100;
    else if (dist < 100) score += 50;

    // Command centers are VERY high priority
    if (unit.unitClass === UnitClass.COMMAND_CENTER) {
      score += 200;
    }

    targets.push({
      id: unit.id,
      type: 'UNIT',
      position: unit.position,
      score
    });
  });

  // Sort by score (highest first)
  targets.sort((a, b) => b.score - a.score);

  return targets;
};

// --- AGGRESSIVE PRODUCTION ---
const executeProductionAggressive = (faction: Faction, gameState: GameState, targets: ScoredTarget[]): GameState => {
  // Minimum gold to keep (safety buffer)
  const minGold = 50;

  // Get spawn points
  const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);
  if (myCities.length === 0) return gameState;

  const coastalCities = myCities.filter(c => c.isCoastal);
  const canBuildNavy = coastalCities.length > 0;

  let newState = gameState;
  let currentGold = faction.gold;
  let currentOil = faction.oil || 0;

  // AGGRESSIVE: Build multiple units per tick if we have money
  const maxUnitsPerTick = 3;
  let unitsBuilt = 0;

  while (unitsBuilt < maxUnitsPerTick && currentGold > minGold) {
    // Decide unit type based on army composition
    const myUnits = newState.units.filter(u => u.factionId === faction.id);
    const tankCount = myUnits.filter(u => u.unitClass === UnitClass.GROUND_TANK).length;
    const infantryCount = myUnits.filter(u => u.unitClass === UnitClass.INFANTRY).length;
    const airCount = myUnits.filter(u => u.unitClass === UnitClass.FIGHTER_JET || u.unitClass === UnitClass.HELICOPTER).length;

    let unitType: UnitClass;

    // Strategic production priorities
    if (infantryCount < 3) {
      // Need capturers
      unitType = UnitClass.INFANTRY;
    } else if (tankCount < 5) {
      // Need main battle force
      unitType = UnitClass.GROUND_TANK;
    } else if (airCount < 3) {
      // Need air support
      unitType = Math.random() > 0.5 ? UnitClass.FIGHTER_JET : UnitClass.HELICOPTER;
    } else if (canBuildNavy && Math.random() > 0.7) {
      // Build navy occasionally
      unitType = Math.random() > 0.5 ? UnitClass.DESTROYER : UnitClass.FRIGATE;
    } else {
      // Random mix for variety
      const options = [UnitClass.GROUND_TANK, UnitClass.INFANTRY, UnitClass.MISSILE_LAUNCHER, UnitClass.FIGHTER_JET];
      unitType = options[Math.floor(Math.random() * options.length)];
    }

    const cost = UNIT_CONFIG[unitType].cost;
    if (!cost || currentGold < cost.gold || currentOil < (cost.oil || 0)) {
      // Can't afford this unit, try something cheaper
      if (currentGold >= (UNIT_CONFIG[UnitClass.INFANTRY].cost?.gold || 50)) {
        unitType = UnitClass.INFANTRY;
      } else {
        break; // Can't afford anything
      }
    }

    const unitCost = UNIT_CONFIG[unitType].cost;
    if (!unitCost || currentGold < unitCost.gold) break;

    // Pick spawn city
    const spawnCity = myCities[Math.floor(Math.random() * myCities.length)];

    // Spawn the unit
    const offsetLat = (Math.random() - 0.5) * 0.03;
    const offsetLng = (Math.random() - 0.5) * 0.03;
    const newUnit = spawnUnit(unitType, spawnCity.position.lat + offsetLat, spawnCity.position.lng + offsetLng, faction.id);

    newState = {
      ...newState,
      units: [...newState.units, newUnit],
      factions: newState.factions.map(f =>
        f.id === faction.id
          ? { ...f, gold: f.gold - unitCost.gold, oil: (f.oil || 0) - (unitCost.oil || 0) }
          : f
      )
    };

    currentGold -= unitCost.gold;
    currentOil -= (unitCost.oil || 0);
    unitsBuilt++;
  }

  return newState;
};

// --- AGGRESSIVE MOVEMENT ---
const executeMovementAggressive = (faction: Faction, gameState: GameState, targets: ScoredTarget[]): GameState => {
  if (targets.length === 0) return gameState;

  const myUnits = gameState.units.filter(u => u.factionId === faction.id);

  // Find all idle units (no target and no destination)
  const idleUnits = myUnits.filter(u =>
    !u.targetId &&
    !u.destination &&
    u.unitClass !== UnitClass.COMMAND_CENTER &&
    u.unitClass !== UnitClass.MILITARY_BASE &&
    u.unitClass !== UnitClass.AIRBASE &&
    u.unitClass !== UnitClass.PORT
  );

  if (idleUnits.length === 0) return gameState;

  const assignedUnits = [...gameState.units];

  // Assign each idle unit to a target
  idleUnits.forEach((unit, idx) => {
    // Spread units across multiple targets
    const targetIndex = idx % Math.min(targets.length, 3);
    const target = targets[targetIndex];

    if (target) {
      const unitIndex = assignedUnits.findIndex(u => u.id === unit.id);
      if (unitIndex !== -1) {
        assignedUnits[unitIndex] = {
          ...assignedUnits[unitIndex],
          targetId: target.id,
          destination: null
        };
      }
    }
  });

  return { ...gameState, units: assignedUnits };
};