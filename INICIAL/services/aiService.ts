import { GameState, Faction, GameUnit, UnitClass, POI, POIType } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY, AI_CONFIG, GAME_TICK_MS } from '../constants';
import { spawnUnit } from './gameLogic';

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// --- CORE AI LOOP ---
export const updateAI = (gameState: GameState): GameState => {
  let newState = { ...gameState };
  const now = Date.now();

  newState.factions.forEach(faction => {
    if (faction.type !== 'AI') return;

    if (faction.lastAiUpdate && (now - faction.lastAiUpdate < AI_CONFIG.UPDATE_INTERVAL_MS)) {
      return;
    }
    faction.lastAiUpdate = now;

    const targets = evaluateTargets(faction, newState);
    newState = executeProduction(faction, newState, targets);
    newState = executeMovement(faction, newState, targets);
  });

  return newState;
};

// --- 1. TARGET EVALUATION (UTILITY SYSTEM) ---
interface ScoredTarget {
  id: string;
  type: 'CITY' | 'UNIT';
  position: { lat: number; lng: number };
  score: number;
}

const evaluateTargets = (faction: Faction, gameState: GameState): ScoredTarget[] => {
  const targets: ScoredTarget[] = [];
  const myUnits = gameState.units.filter(u => u.factionId === faction.id);
  const avgLat = myUnits.reduce((sum, u) => sum + u.position.lat, 0) / (myUnits.length || 1);
  const avgLng = myUnits.reduce((sum, u) => sum + u.position.lng, 0) / (myUnits.length || 1);

  // A. Evaluate Cities
  gameState.pois.forEach(poi => {
    if (poi.type !== POIType.CITY) return;

    const isMine = poi.ownerFactionId === faction.id;
    const isNeutral = poi.ownerFactionId === 'NEUTRAL';
    const isEnemy = !isMine && !isNeutral && (faction.relations[poi.ownerFactionId] || 0) <= DIPLOMACY.WAR_THRESHOLD;

    if (!isMine && !isNeutral && !isEnemy) return; 

    const dist = getDistanceKm(avgLat, avgLng, poi.position.lat, poi.position.lng);
    let score = 0;

    const importance = (poi.tier === 1 ? 50 : poi.tier === 2 ? 30 : 10);
    const distancePenalty = dist * 0.05;

    if (isMine) {
      // DEFENSIVE SCORE
      const nearbyEnemies = gameState.units.filter(u => 
        u.factionId !== faction.id && 
        u.factionId !== 'NEUTRAL' &&
        (faction.relations[u.factionId] || 0) <= DIPLOMACY.WAR_THRESHOLD &&
        getDistanceKm(poi.position.lat, poi.position.lng, u.position.lat, u.position.lng) < 200
      );
      
      if (nearbyEnemies.length > 0) {
        score = 100 + (importance * 2) + (nearbyEnemies.length * 10);
      }
    } else {
      // OFFENSIVE SCORE 
      const baseDesire = isNeutral ? 40 : 60; 
      score = baseDesire + importance - distancePenalty;
      
      // Look for weak spots
      const defenders = gameState.units.filter(u => u.factionId === poi.ownerFactionId && getDistanceKm(u.position.lat, u.position.lng, poi.position.lat, poi.position.lng) < 50);
      score -= (defenders.length * 5); // Avoid heavily defended if possible

      if (faction.aggression) {
        score *= (0.5 + faction.aggression);
      }
    }

    if (score > 0) {
      targets.push({ id: poi.id, type: 'CITY', position: poi.position, score });
    }
  });

  return targets.sort((a, b) => b.score - a.score); 
};

// --- 2. PRODUCTION LOGIC ---
const executeProduction = (faction: Faction, gameState: GameState, targets: ScoredTarget[]): GameState => {
  if (faction.gold < AI_CONFIG.MIN_GOLD_RESERVE) return gameState;

  const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);
  if (myCities.length === 0) return gameState;

  if (Math.random() > (faction.aggression || 0.5)) return gameState;

  // Decide Unit Type based on "Task Force" needs
  let unitType = UnitClass.INFANTRY;
  const rand = Math.random();

  const coastalCities = myCities.filter(c => c.isCoastal);
  const canBuildNavy = coastalCities.length > 0;
  
  if (canBuildNavy && rand < 0.2) {
      unitType = Math.random() > 0.5 ? UnitClass.DESTROYER : UnitClass.FRIGATE;
  } else if (rand < 0.5) {
      unitType = UnitClass.GROUND_TANK; // Main battle unit
  } else if (rand < 0.7) {
      unitType = UnitClass.FIGHTER_JET; // Air cover
  } else {
      unitType = UnitClass.INFANTRY; // Capturers
  }

  const cost = UNIT_CONFIG[unitType].cost;
  if (!cost || faction.gold < cost.gold) return gameState;

  const spawnCity = canBuildNavy && UNIT_CONFIG[unitType].validTargets.includes(UnitClass.SUBMARINE)
      ? coastalCities[Math.floor(Math.random() * coastalCities.length)] 
      : myCities[Math.floor(Math.random() * myCities.length)];

  if (!spawnCity) return gameState;

  const offsetLat = (Math.random() - 0.5) * 0.02;
  const offsetLng = (Math.random() - 0.5) * 0.02;
  const newUnit = spawnUnit(unitType, spawnCity.position.lat + offsetLat, spawnCity.position.lng + offsetLng, faction.id);

  const newUnits = [...gameState.units, newUnit];
  const newFactions = gameState.factions.map(f => {
      if (f.id === faction.id) {
          return { ...f, gold: f.gold - cost.gold };
      }
      return f;
  });

  return { ...gameState, units: newUnits, factions: newFactions };
};

// --- 3. MOVEMENT LOGIC (TASK FORCES) ---
const executeMovement = (faction: Faction, gameState: GameState, targets: ScoredTarget[]): GameState => {
    if (targets.length === 0) return gameState;

    const myUnits = gameState.units.filter(u => u.factionId === faction.id);
    const idleUnits = myUnits.filter(u => !u.targetId && !u.destination && u.unitClass !== UnitClass.COMMAND_CENTER && u.unitClass !== UnitClass.MILITARY_BASE);

    // Group logic: Assign squads of 3-5 units to the same target
    const SQUAD_SIZE = 5;
    const assignedUnits = [...gameState.units]; 
    
    // Process idle units in chunks
    for (let i = 0; i < idleUnits.length; i += SQUAD_SIZE) {
        const squad = idleUnits.slice(i, i + SQUAD_SIZE);
        if (squad.length === 0) break;

        // Pick top target
        const target = targets[0]; 
        
        // Randomly fallback to 2nd or 3rd target to spread out
        const spreadTarget = targets[Math.floor(Math.random() * Math.min(targets.length, 3))];
        const finalTarget = Math.random() > 0.7 ? spreadTarget : target;

        if (finalTarget) {
            squad.forEach(u => {
                const index = assignedUnits.findIndex(au => au.id === u.id);
                if (index !== -1) {
                    assignedUnits[index] = {
                        ...assignedUnits[index],
                        targetId: finalTarget.id, // Assign Target ID, gameLogic handles the rest
                        destination: null
                    };
                }
            });
        }
    }

    return { ...gameState, units: assignedUnits };
};