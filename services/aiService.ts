import { GameState, Faction, GameUnit, UnitClass, POI, POIType, Difficulty } from '../types';
import { UNIT_CONFIG, POI_CONFIG, DIPLOMACY, AI_CONFIG, GAME_TICK_MS, DIFFICULTY_CONFIG } from '../constants';
import { spawnUnit, getNearbyUnits, getDistanceKm } from './gameLogic';
import { AIDirector } from './aiDirector';

// Local getDistanceKm removed in favor of optimized version from gameLogic

// --- CORE AI LOOP ---
export const updateAI = (gameState: GameState, unitGrid?: Map<string, GameUnit[]>): GameState => {
  // 1. Run Director
  let newState = AIDirector.getInstance().update(gameState);

  // 2. Run Faction Logic
  const now = Date.now();
  newState.factions.forEach(faction => {
    if (faction.type !== 'BOT') return; // BOT factions only (was 'AI' which never matched!)

    if (faction.lastAiUpdate && (now - faction.lastAiUpdate < AI_CONFIG.UPDATE_INTERVAL_MS)) {
      return;
    }
    faction.lastAiUpdate = now;

    const targets = evaluateTargets(faction, newState, unitGrid);
    newState = executeProduction(faction, newState, targets);
    newState = executeMovement(faction, newState, targets);
  });

  return newState;
};

// --- UTILITY SYSTEM (Existing Logic Preserved) ---
interface ScoredTarget {
  id: string;
  type: 'CITY' | 'UNIT';
  position: { lat: number; lng: number };
  score: number;
}


// ... (keep getDistanceKm)

// ... (keep AIDirector class if it was here, but it's in a separate file now, so just update imports and functions)
// Wait, aiService.ts had AIDirector class inside it in the previous read? 
// Ah, I see two files: aiService.ts and aiDirector.ts.
// The previous read of aiService.ts showed AIDirector inside it?
// Let me check the file content again.
// Yes, aiService.ts lines 15-98 define AIDirector.
// BUT aiDirector.ts ALSO defines AIDirector.
// This is a duplicate definition!
// I should probably remove AIDirector from aiService.ts and use the one from aiDirector.ts, OR just update aiService.ts if that's the one being used.
// The user has `aiDirector.ts` open.
// Let's assume `aiDirector.ts` is the source of truth for the Director, and `aiService.ts` is for the Faction AI.
// However, `aiService.ts` exports `updateAI` which calls `AIDirector.getInstance().update(gameState)`.
// If `AIDirector` is defined in `aiService.ts`, it uses that one.
// I should remove the duplicate `AIDirector` from `aiService.ts` and import it from `aiDirector.ts`.

// Let's proceed with updating `aiService.ts` to use `DIFFICULTY_CONFIG` and remove the internal `AIDirector` class if I can confirm it's imported.
// Actually, I'll just update the `evaluateTargets` and `executeProduction` functions in `aiService.ts` for now, and leave the cleanup for a separate step if needed, to avoid breaking things if `aiDirector.ts` isn't fully wired up.
// Wait, `aiService.ts` imports `spawnUnit` from `./gameLogic`.
// I will update the functions.

// ...

const evaluateTargets = (faction: Faction, gameState: GameState, unitGrid?: Map<string, GameUnit[]>): ScoredTarget[] => {
  const targets: ScoredTarget[] = [];
  const myUnits = gameState.units.filter(u => u.factionId === faction.id);
  if (myUnits.length === 0) return [];

  const avgLat = myUnits.reduce((sum, u) => sum + u.position.lat, 0) / myUnits.length;
  const avgLng = myUnits.reduce((sum, u) => sum + u.position.lng, 0) / myUnits.length;

  const config = DIFFICULTY_CONFIG[gameState.difficulty || Difficulty.MEDIUM];

  // A. Evaluate Cities & Resources
  gameState.pois.forEach(poi => {
    // Allow targeting Cities, Gold Mines, and Oil Rigs
    if (poi.type !== POIType.CITY && poi.type !== POIType.GOLD_MINE && poi.type !== POIType.OIL_RIG) return;

    const isMine = poi.ownerFactionId === faction.id;
    const isNeutral = poi.ownerFactionId === 'NEUTRAL';
    const relation = faction.relations[poi.ownerFactionId] || 0;
    const isEnemy = !isMine && !isNeutral && relation <= DIPLOMACY.WAR_THRESHOLD;
    const isNemesis = relation <= -90; // RIVALRY

    if (isMine || (!isNeutral && !isEnemy)) return; // Don't target allies or self

    const dist = getDistanceKm(avgLat, avgLng, poi.position.lat, poi.position.lng);
    let score = 0;

    const importance = (poi.tier === 1 ? 50 : poi.tier === 2 ? 30 : 10);
    // DISTANCE IS KEY: Penalize distance heavily to force local expansion
    // BUT if it's a NEMESIS, we hate them so much we might travel further
    const distancePenalty = dist * (isNemesis ? 0.2 : 0.5);

    if (isMine) {
      if (poi.hp < poi.maxHp) score = 200; // Defend!
    } else {
      // OFFENSIVE SCORE 
      // HUGE BOOST: INCENTIVIZE CAPTURE
      const baseDesire = isNeutral ? 250 : 200; // High priority for ANY city
      score = baseDesire + importance - distancePenalty;

      // RIVALRY BONUS: We hate our nemesis
      if (isNemesis) {
        score += 500; // KILL THEM ON SIGHT
      }

      // OPPORTUNISM: Attack weak targets
      if (poi.hp < poi.maxHp * 0.5) {
        score += 100;
      }

      // Bonus for very close targets (Local conflict)
      if (dist < 500) score += 100;

      if (faction.aggression) {
        score *= (0.5 + faction.aggression * config.AGGRESSION_MODIFIER);
      }
    }

    if (score > 0) {
      targets.push({ id: poi.id, type: 'CITY', position: poi.position, score });
    }
  });

  // Sort by score descending
  return targets.sort((a, b) => b.score - a.score);
};

const executeProduction = (faction: Faction, gameState: GameState, targets: ScoredTarget[]): GameState => {
  if (faction.gold < AI_CONFIG.MIN_GOLD_RESERVE) return gameState;

  const myCities = gameState.pois.filter(p => p.ownerFactionId === faction.id && p.type === POIType.CITY);
  if (myCities.length === 0) return gameState;

  const config = DIFFICULTY_CONFIG[gameState.difficulty || Difficulty.MEDIUM];

  // REMOVED RANDOM CHECK: AI ALWAYS PRODUCES IF IT HAS MONEY
  // FORCE PRODUCTION IF RICH: If gold > 5000, ignore aggression check (panic buy)
  if (faction.gold < 5000 && Math.random() > (faction.aggression || 0.5) * config.AGGRESSION_MODIFIER) return gameState;

  // Decide Unit Type based on "Task Force" needs
  let unitType = UnitClass.INFANTRY;
  const rand = Math.random();

  const coastalCities = myCities.filter(c => c.isCoastal);
  const canBuildNavy = coastalCities.length > 0;

  if (canBuildNavy && rand < 0.2) {
    unitType = Math.random() > 0.5 ? UnitClass.DESTROYER : UnitClass.FRIGATE;
  } else if (rand < 0.4) {
    unitType = UnitClass.GROUND_TANK; // Main battle unit
  } else if (rand < 0.6) {
    unitType = UnitClass.FIGHTER_JET; // Air cover
  } else if (rand < 0.75) {
    unitType = UnitClass.MISSILE_LAUNCHER; // Long range support
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
      // AI Cheats on Hard: Costs are reduced (or income increased, effectively same)
      const costMultiplier = gameState.difficulty === Difficulty.HARD ? 0.7 : 1.0;
      return { ...f, gold: f.gold - (cost.gold * costMultiplier) };
    }
    return f;
  });

  return { ...gameState, units: newUnits, factions: newFactions };
};

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