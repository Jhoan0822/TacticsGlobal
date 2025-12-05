import { GameState, Faction, GameUnit, UnitClass, POI, POIType, Difficulty, BotPersonality } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY, AI_CONFIG, GAME_TICK_MS, DIFFICULTY_CONFIG, PERSONALITY_CONFIG } from '../constants';
import { spawnUnit, getNearbyUnits, getDistanceKm } from './gameLogic';
import { AIDirector } from './aiDirector';
import { updateAdvancedBotAI } from './AdvancedBotAI';

// ===========================================
// SMART AI CONFIGURATION
// ===========================================
const AI_LIMITS = {
  MAX_UNITS: 25, // Max units per faction
  UNITS_PER_TICK: 1, // Build rate
  GOLD_RESERVE: 0.25, // Keep 25% gold in reserve
  DEFENSE_RATIO: 0.3, // 30% units defend
  ATTACK_RATIO: 0.7, // 70% units attack
  RETREAT_HP_THRESHOLD: 0.25, // Retreat when HP < 25%
  TARGET_DISTANCE_PENALTY: 0.5, // Penalty per km for distant targets
  MAX_EFFECTIVE_RANGE: 300, // Beyond this, heavy penalty
};

// Ideal army composition ratios
const ARMY_COMPOSITION = {
  INFANTRY: 0.15, // 15% - just for capture
  TANKS: 0.35, // 35% - main battle
  AIR: 0.30, // 30% - air superiority
  MISSILES: 0.10, // 10% - support
  NAVY: 0.10, // 10% - if coastal
};

// ===========================================
// ADVANCED AI SYSTEM (NEW)
// ===========================================
// This module now uses the AdvancedBotAI system for intelligent,
// personality-driven bot behavior. Each bot has a distinct personality:
// - ECONOMIC: Resource focused, builds powerful late game
// - DEFENSIVE: Fortifies territory, counter-attacks only
// - AGGRESSIVE: Constant pressure, early rush tactics
// - TACTICAL: Combined arms, flanking, focus fire
//
// ALL personalities prioritize neutral city capture first!
// ===========================================

// --- CORE AI LOOP (Uses Advanced Bot AI) ---
export const updateAI = (gameState: GameState, unitGrid?: Map<string, GameUnit[]>): GameState => {
  // 1. Run Director (Wave spawns - manages game pacing)
  let newState = AIDirector.getInstance().update(gameState);

  // 2. Run Advanced Bot AI for all BOT factions
  // Replaces basic logic with intelligent, personality-driven decisions
  newState = updateAdvancedBotAI(newState);

  return newState;
};

// ===========================================
// SITUATION ANALYSIS
// ===========================================
interface StrategicSituation {
  myUnits: GameUnit[];
  myCities: POI[];
  myResources: POI[];
  enemyUnits: GameUnit[];
  neutralCities: POI[];
  enemyCities: POI[];
  armyStrength: number;
  enemyStrength: number;
  needsDefense: boolean;
  canExpand: boolean;
  composition: {
    infantry: number;
    tanks: number;
    air: number;
    missiles: number;
    navy: number;
  };
}

const evaluateSituation = (faction: Faction, gameState: GameState): StrategicSituation => {
  const myUnits = gameState.units.filter(u => u.factionId === faction.id);
  const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);
  const myResources = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type !== POIType.CITY);

  const enemyUnits = gameState.units.filter(u =>
    u.factionId !== faction.id &&
    u.factionId !== 'NEUTRAL' &&
    (faction.relations[u.factionId] || 0) <= DIPLOMACY.WAR_THRESHOLD
  );

  const neutralCities = gameState.pois.filter(p =>
    p.ownerFactionId === 'NEUTRAL' && p.type === POIType.CITY
  );

  const enemyCities = gameState.pois.filter(p =>
    p.ownerFactionId !== faction.id &&
    p.ownerFactionId !== 'NEUTRAL' &&
    p.type === POIType.CITY &&
    (faction.relations[p.ownerFactionId] || 0) <= DIPLOMACY.WAR_THRESHOLD
  );

  // Calculate army composition
  const infantry = myUnits.filter(u => u.unitClass === UnitClass.INFANTRY || u.unitClass === UnitClass.SPECIAL_FORCES).length;
  const tanks = myUnits.filter(u => u.unitClass === UnitClass.GROUND_TANK).length;
  const air = myUnits.filter(u => u.unitClass === UnitClass.FIGHTER_JET || u.unitClass === UnitClass.HELICOPTER || u.unitClass === UnitClass.HEAVY_BOMBER).length;
  const missiles = myUnits.filter(u => u.unitClass === UnitClass.MISSILE_LAUNCHER || u.unitClass === UnitClass.SAM_LAUNCHER).length;
  const navy = myUnits.filter(u => u.unitClass === UnitClass.DESTROYER || u.unitClass === UnitClass.FRIGATE || u.unitClass === UnitClass.BATTLESHIP).length;

  // Calculate relative strength
  const armyStrength = myUnits.reduce((sum, u) => sum + u.hp, 0);
  const enemyStrength = enemyUnits.reduce((sum, u) => sum + u.hp, 0);

  // Check if enemies are near our cities
  const needsDefense = myCities.some(city =>
    enemyUnits.some(e => getDistanceKm(city.position.lat, city.position.lng, e.position.lat, e.position.lng) < 50)
  );

  // Can expand if we have strength advantage or neutral targets
  const canExpand = armyStrength > enemyStrength * 0.7 || neutralCities.length > 0;

  return {
    myUnits, myCities, myResources, enemyUnits, neutralCities, enemyCities,
    armyStrength, enemyStrength, needsDefense, canExpand,
    composition: { infantry, tanks, air, missiles, navy }
  };
};

// ===========================================
// TARGET EVALUATION
// ===========================================
interface ScoredTarget {
  id: string;
  type: 'CITY' | 'UNIT' | 'RESOURCE';
  position: { lat: number; lng: number };
  score: number;
  distance: number;
}

const evaluateTargets = (faction: Faction, gameState: GameState, situation: StrategicSituation): ScoredTarget[] => {
  const targets: ScoredTarget[] = [];

  if (situation.myCities.length === 0) return [];

  // Calculate center of our territory
  const centerLat = situation.myCities.reduce((sum, c) => sum + c.position.lat, 0) / situation.myCities.length;
  const centerLng = situation.myCities.reduce((sum, c) => sum + c.position.lng, 0) / situation.myCities.length;

  // A. Neutral Cities (HIGHEST PRIORITY - always capture before attacking enemies)
  situation.neutralCities.forEach(city => {
    const dist = getDistanceKm(centerLat, centerLng, city.position.lat, city.position.lng);
    let score = 1000; // VERY HIGH base score for neutral - always prioritize over enemy

    // HUGE bonus for nearby targets
    if (dist < 100) score += 500;
    else if (dist < 200) score += 250;
    else if (dist < 500) score += 100;

    // Distance penalty (but still high priority)
    score -= dist * AI_LIMITS.TARGET_DISTANCE_PENALTY * 0.5; // Half penalty for neutrals

    // Tier bonus
    score += (4 - (city.tier || 3)) * 50;

    targets.push({ id: city.id, type: 'CITY', position: city.position, score, distance: dist });
  });

  // B. Enemy Cities
  situation.enemyCities.forEach(city => {
    const dist = getDistanceKm(centerLat, centerLng, city.position.lat, city.position.lng);
    let score = 300;

    if (dist < 100) score += 200;
    else if (dist < 200) score += 100;

    // Distance penalty (heavier for enemy cities)
    score -= dist * AI_LIMITS.TARGET_DISTANCE_PENALTY * 1.5;

    // Damaged cities are easier
    if (city.hp < city.maxHp) {
      score += (1 - city.hp / city.maxHp) * 150;
    }

    // Check if city is defended
    const defenders = situation.enemyUnits.filter(u =>
      getDistanceKm(city.position.lat, city.position.lng, u.position.lat, u.position.lng) < 30
    );
    if (defenders.length > 3) score -= 100; // Heavily defended

    targets.push({ id: city.id, type: 'CITY', position: city.position, score, distance: dist });
  });

  // C. Enemy Units (THREATS)
  situation.enemyUnits.forEach(unit => {
    const dist = getDistanceKm(centerLat, centerLng, unit.position.lat, unit.position.lng);
    let score = 150;

    // VERY close threats are priority
    if (dist < 30) score += 250;
    else if (dist < 60) score += 150;
    else if (dist < 100) score += 50;

    // Distance penalty
    score -= dist * AI_LIMITS.TARGET_DISTANCE_PENALTY;

    // High value targets
    if (unit.unitClass === UnitClass.COMMAND_CENTER) score += 300;
    if (unit.unitClass === UnitClass.HEAVY_BOMBER) score += 100;
    if (unit.unitClass === UnitClass.MISSILE_LAUNCHER) score += 80;

    // Low HP targets are easier
    if (unit.hp < unit.maxHp * 0.5) score += 100;

    targets.push({ id: unit.id, type: 'UNIT', position: unit.position, score, distance: dist });
  });

  // D. Resources (lower priority)
  gameState.pois.filter(p =>
    p.ownerFactionId !== faction.id &&
    (p.type === POIType.GOLD_MINE || p.type === POIType.OIL_RIG)
  ).forEach(res => {
    const dist = getDistanceKm(centerLat, centerLng, res.position.lat, res.position.lng);
    let score = 100;
    if (dist < 100) score += 50;
    score -= dist * AI_LIMITS.TARGET_DISTANCE_PENALTY;

    targets.push({ id: res.id, type: 'RESOURCE', position: res.position, score, distance: dist });
  });

  // Sort by score
  targets.sort((a, b) => b.score - a.score);

  return targets;
};

// ===========================================
// SMART PRODUCTION
// ===========================================
const executeSmartProduction = (faction: Faction, gameState: GameState, situation: StrategicSituation): GameState => {
  // Check unit cap
  if (situation.myUnits.length >= AI_LIMITS.MAX_UNITS) return gameState;
  if (situation.myCities.length === 0) return gameState;

  // Keep gold reserve
  const reserveGold = faction.gold * AI_LIMITS.GOLD_RESERVE;
  const spendableGold = faction.gold - reserveGold;

  if (spendableGold < 100) return gameState; // Not enough gold

  let newState = gameState;
  const total = situation.myUnits.length || 1;

  // Determine what unit type we need based on composition
  const currentRatios = {
    infantry: situation.composition.infantry / total,
    tanks: situation.composition.tanks / total,
    air: situation.composition.air / total,
    missiles: situation.composition.missiles / total,
    navy: situation.composition.navy / total,
  };

  let unitType: UnitClass | null = null;
  const hasCoastal = situation.myCities.some(c => c.isCoastal);

  // Find which category is most underrepresented
  const gaps = [
    { type: 'tanks', gap: ARMY_COMPOSITION.TANKS - currentRatios.tanks, units: [UnitClass.GROUND_TANK] },
    { type: 'air', gap: ARMY_COMPOSITION.AIR - currentRatios.air, units: [UnitClass.FIGHTER_JET, UnitClass.HELICOPTER] },
    { type: 'infantry', gap: ARMY_COMPOSITION.INFANTRY - currentRatios.infantry, units: [UnitClass.INFANTRY] },
    { type: 'missiles', gap: ARMY_COMPOSITION.MISSILES - currentRatios.missiles, units: [UnitClass.MISSILE_LAUNCHER] },
  ];

  if (hasCoastal) {
    gaps.push({ type: 'navy', gap: ARMY_COMPOSITION.NAVY - currentRatios.navy, units: [UnitClass.DESTROYER, UnitClass.FRIGATE] });
  }

  gaps.sort((a, b) => b.gap - a.gap);

  // Pick unit type from most needed category
  for (const gap of gaps) {
    if (gap.gap > 0) {
      const candidates = gap.units.filter(u => {
        const cost = UNIT_CONFIG[u].cost;
        return cost && spendableGold >= cost.gold && (faction.oil || 0) >= (cost.oil || 0);
      });
      if (candidates.length > 0) {
        unitType = candidates[Math.floor(Math.random() * candidates.length)];
        break;
      }
    }
  }

  if (!unitType) return gameState; // Can't afford anything useful

  const cost = UNIT_CONFIG[unitType].cost;
  if (!cost) return gameState;

  // Spawn near a city
  const spawnCity = situation.myCities[Math.floor(Math.random() * situation.myCities.length)];
  const offsetLat = (Math.random() - 0.5) * 0.02;
  const offsetLng = (Math.random() - 0.5) * 0.02;

  const newUnit = spawnUnit(unitType, spawnCity.position.lat + offsetLat, spawnCity.position.lng + offsetLng, faction.id);

  newState = {
    ...newState,
    units: [...newState.units, newUnit],
    factions: newState.factions.map(f =>
      f.id === faction.id
        ? { ...f, gold: f.gold - cost.gold, oil: (f.oil || 0) - (cost.oil || 0) }
        : f
    )
  };

  return newState;
};

// ===========================================
// STRATEGIC MOVEMENT
// ===========================================
const executeStrategicMovement = (faction: Faction, gameState: GameState, targets: ScoredTarget[], situation: StrategicSituation): GameState => {
  if (situation.myUnits.length === 0) return gameState;

  const assignedUnits = [...gameState.units];

  // Separate units into roles
  const mobileUnits = situation.myUnits.filter(u =>
    !u.targetId && !u.destination &&
    u.unitClass !== UnitClass.COMMAND_CENTER &&
    u.unitClass !== UnitClass.MILITARY_BASE &&
    u.unitClass !== UnitClass.AIRBASE &&
    u.unitClass !== UnitClass.PORT
  );

  if (mobileUnits.length === 0) return gameState;

  // AGGRESSIVE EXPANSION: Reduce defenders when neutral cities are available
  const hasNeutralTargets = targets.some(t => t.type === 'CITY' && t.score > 500);
  const defenseCount = hasNeutralTargets
    ? Math.max(1, Math.floor(mobileUnits.length * 0.1)) // Only 10% defend when expanding
    : Math.max(1, Math.floor(mobileUnits.length * AI_LIMITS.DEFENSE_RATIO));

  const defenders = mobileUnits.slice(0, defenseCount);
  const attackers = mobileUnits.slice(defenseCount);

  // City targets and unit targets
  const cityTargets = targets.filter(t => t.type === 'CITY').slice(0, 5);
  const unitTargets = targets.filter(t => t.type === 'UNIT').slice(0, 5);
  const resourceTargets = targets.filter(t => t.type === 'RESOURCE').slice(0, 3);

  // DEFENDERS: Stay near cities, engage nearby enemies
  defenders.forEach(unit => {
    const nearestCity = situation.myCities.reduce((best, city) => {
      const dist = getDistanceKm(unit.position.lat, unit.position.lng, city.position.lat, city.position.lng);
      return !best || dist < best.dist ? { city, dist } : best;
    }, null as { city: POI; dist: number } | null);

    // Check for nearby enemies
    const nearbyEnemy = unitTargets.find(t => t.distance < 50);

    if (nearbyEnemy) {
      // Engage nearby threat
      assignTarget(assignedUnits, unit.id, nearbyEnemy.id);
    } else if (nearestCity && nearestCity.dist > 20) {
      // Return to defend city
      assignTarget(assignedUnits, unit.id, nearestCity.city.id);
    }
  });

  // ATTACKERS: Pursue strategic objectives
  attackers.forEach((unit, idx) => {
    let target: ScoredTarget | null = null;

    // Infantry: capture cities/resources
    if (unit.unitClass === UnitClass.INFANTRY || unit.unitClass === UnitClass.SPECIAL_FORCES) {
      target = cityTargets[idx % cityTargets.length] || resourceTargets[0];
    }
    // Combat units: attack enemies first, then cities
    else if (unit.unitClass === UnitClass.GROUND_TANK || unit.unitClass === UnitClass.MISSILE_LAUNCHER) {
      target = unitTargets[idx % Math.max(1, unitTargets.length)] || cityTargets[0];
    }
    // Air units: prioritize enemy air, then ground
    else if (unit.unitClass === UnitClass.FIGHTER_JET || unit.unitClass === UnitClass.HELICOPTER) {
      target = unitTargets[idx % Math.max(1, unitTargets.length)] || cityTargets[0];
    }
    // Naval: attack enemy navy or coastal targets
    else if (unit.unitClass === UnitClass.DESTROYER || unit.unitClass === UnitClass.FRIGATE) {
      target = unitTargets.find(t => {
        const u = gameState.units.find(x => x.id === t.id);
        return u && (u.unitClass === UnitClass.DESTROYER || u.unitClass === UnitClass.FRIGATE || u.unitClass === UnitClass.BATTLESHIP);
      }) || unitTargets[0];
    }
    // Default
    else {
      target = targets[idx % Math.max(1, targets.length)];
    }

    if (target) {
      assignTarget(assignedUnits, unit.id, target.id);
    }
  });

  return { ...gameState, units: assignedUnits };
};

// Helper to assign target
const assignTarget = (units: GameUnit[], unitId: string, targetId: string) => {
  const idx = units.findIndex(u => u.id === unitId);
  if (idx !== -1) {
    units[idx] = { ...units[idx], targetId, destination: null };
  }
};