
import { UnitClass, UnitStats, POIType, WeaponType, Difficulty, BotPersonality } from './types';

export const GAME_TICK_MS = 30; // Faster tick for "Frenetic" feel
export const COMBAT_RADIUS_KM = 30;
export const MAX_UNITS_ON_MAP = 200;

// NUCLEAR STRIKE CONFIGURATION - REBALANCED
export const NUKE_CONFIG = {
  LAUNCH_COST: { gold: 2000, oil: 1000 },    // More affordable than before
  FLIGHT_TIME_MS: 10000,                      // Slower, more interceptable
  MAX_RANGE_KM: 400,                          // Reduced range
  COOLDOWN_TICKS: 1800,                       // ~45 seconds
  BLAST_RADIUS_KM: 40,                        // Smaller blast
  GROUND_DAMAGE_PERCENT: 0.60,                // Less devastating
  SEA_DAMAGE_PERCENT: 0.40,
  CITY_DAMAGE_PERCENT: 0.35,                  // Cities more resilient
  STRUCTURE_DESTROY_RADIUS_KM: 20,            // Smaller instant-kill zone
};

// DIFFICULTY CONFIGURATION - SMOOTHED PROGRESSION
export const DIFFICULTY_CONFIG = {
  [Difficulty.EASY]: {
    WAVE_INTERVAL_MS: 90000,     // Slower waves (90s)
    INTENSITY_GAIN: 0.05,        // Calmer pacing
    AGGRESSION_MODIFIER: 0.6,    // Less aggressive
    RESOURCE_MULTIPLIER: 0.8,    // Fewer resources for AI
  },
  [Difficulty.MEDIUM]: {
    WAVE_INTERVAL_MS: 50000,     // Moderate waves (50s)
    INTENSITY_GAIN: 0.15,
    AGGRESSION_MODIFIER: 1.0,    // Fair
    RESOURCE_MULTIPLIER: 1.0,
  },
  [Difficulty.HARD]: {
    WAVE_INTERVAL_MS: 30000,     // Faster but not spam (30s)
    INTENSITY_GAIN: 0.3,
    AGGRESSION_MODIFIER: 1.5,    // Aggressive but beatable
    RESOURCE_MULTIPLIER: 1.3,
  }
};

export const AI_CONFIG = {
  UPDATE_INTERVAL_MS: 500, // Think faster
  MIN_GOLD_RESERVE: 100, // Spend everything
  THREAT_SCAN_RADIUS: 1000, // See everything
  BASE_AGGRESSION: 1.0, // Always aggressive
};

// =============================================
// BOT PERSONALITY CONFIGURATION
// =============================================
export const PERSONALITY_CONFIG = {
  [BotPersonality.ECONOMIC]: {
    name: 'Economic',
    goldReserve: 0.50,           // Keep 50% gold in reserve
    defenseRatio: 0.20,         // Only 20% units defend
    attackRatio: 0.80,          // 80% attack/expand
    neutralPriorityBonus: 1500, // HUGE priority on neutral cities
    enemyPriorityBonus: 100,    // Low priority on enemy cities
    resourcePriorityBonus: 800, // High priority on gold/oil
    threatResponseMultiplier: 0.7, // Slower threat response
    expansionSpeed: 0.6,        // Methodical expansion
    retreatThreshold: 0.40,     // Retreat at 40% HP
    preferredUnits: [UnitClass.GROUND_TANK, UnitClass.HEAVY_BOMBER, UnitClass.BATTLESHIP],
    productionDelay: 2000,      // Slow but expensive units
  },
  [BotPersonality.DEFENSIVE]: {
    name: 'Defensive',
    goldReserve: 0.35,
    defenseRatio: 0.60,         // 60% units defend!
    attackRatio: 0.40,
    neutralPriorityBonus: 800,  // Nearby neutrals only
    enemyPriorityBonus: 150,    // Only attack weak enemies
    resourcePriorityBonus: 400,
    threatResponseMultiplier: 2.0, // FAST threat response
    expansionSpeed: 0.3,        // Very slow expansion
    retreatThreshold: 0.50,     // Retreat early to preserve units
    preferredUnits: [UnitClass.SAM_LAUNCHER, UnitClass.MISSILE_LAUNCHER, UnitClass.MILITARY_BASE],
    productionDelay: 1000,
  },
  [BotPersonality.AGGRESSIVE]: {
    name: 'Aggressive',
    goldReserve: 0.05,          // Spend almost everything!
    defenseRatio: 0.10,         // Minimal defense
    attackRatio: 0.90,          // All-out attack
    neutralPriorityBonus: 1000, // Capture neutrals fast
    enemyPriorityBonus: 800,    // Then attack enemies
    resourcePriorityBonus: 200, // Ignore resources
    threatResponseMultiplier: 0.5, // Ignore threats, keep attacking
    expansionSpeed: 1.5,        // FAST expansion
    retreatThreshold: 0.15,     // Fight to the death
    preferredUnits: [UnitClass.FIGHTER_JET, UnitClass.GROUND_TANK, UnitClass.INFANTRY],
    productionDelay: 300,       // Spam units
  },
  [BotPersonality.TACTICAL]: {
    name: 'Tactical',
    goldReserve: 0.25,
    defenseRatio: 0.35,
    attackRatio: 0.65,
    neutralPriorityBonus: 1200, // Prioritize neutrals
    enemyPriorityBonus: 400,    // Then enemies
    resourcePriorityBonus: 500,
    threatResponseMultiplier: 1.2,
    expansionSpeed: 0.8,
    retreatThreshold: 0.35,
    preferredUnits: [UnitClass.GROUND_TANK, UnitClass.FIGHTER_JET, UnitClass.MISSILE_LAUNCHER, UnitClass.INFANTRY],
    productionDelay: 800,
    useCombinedArms: true,      // Coordinates unit types
    useFlankingManeuvers: true, // Attacks from multiple directions
    focusFireEnabled: true,     // All units attack same target
  },
};

export const TERRITORY_CONFIG = {
  HQ_RADIUS: 4.5, // Degrees 
  CITY_TIER_1_RADIUS: 4.0, // Capital
  CITY_TIER_2_RADIUS: 2.5, // Hub
  CITY_TIER_3_RADIUS: 1.5, // Outpost
  OIL_RIG_RADIUS: 0.8,
};

export const DIPLOMACY = {
  WAR_THRESHOLD: -20,
  ALLIANCE_THRESHOLD: 50,
  MAX_RELATION: 100,
  MIN_RELATION: -100,
  WEIGHT_POWER_DISPARITY: 0.4,
  WEIGHT_DISTANCE: 0.3,
  WEIGHT_COMMON_ENEMY: 0.3,
};

export const FACTION_PRESETS = [
  { name: 'Atlantic Coalition', color: '#3b82f6' },
  { name: 'Red Dawn Syndicate', color: '#ef4444' },
  { name: 'Pacific Federation', color: '#a855f7' },
  { name: 'Nordic Defense Front', color: '#06b6d4' },
  { name: 'Saharan Warlords', color: '#d97706' },
  { name: 'Amazonian Guard', color: '#10b981' },
  { name: 'Southern Cross', color: '#f43f5e' },
  { name: 'Black Sea Union', color: '#6366f1' },
];

// POI CONFIGURATION - REBALANCED with higher city HP for defensive play
export const POI_CONFIG = {
  [POIType.CITY]: { incomeGold: 40, incomeOil: 8, captureRadius: 0.1, defaultHp: 2500, captureThreshold: 0 },
  [POIType.OIL_RIG]: { incomeGold: 8, incomeOil: 60, captureRadius: 0.1, defaultHp: 600, captureThreshold: 0 },
  [POIType.GOLD_MINE]: { incomeGold: 100, incomeOil: 3, captureRadius: 0.1, defaultHp: 400, captureThreshold: 0 }
};

// Tier multiplier - incentivize capturing capitals
export const TIER_MULTIPLIER: Record<number, number> = {
  1: 2.5,  // Capital cities - high value targets
  2: 1.5,  // Major cities
  3: 0.8   // Small cities - less valuable
};

interface ExtendedUnitStats extends UnitStats {
  validTargets: string[];
}

// TARGET CATEGORIES - UNRESTRICTED
const CAT_ALL = [
  UnitClass.INFANTRY, UnitClass.SPECIAL_FORCES, UnitClass.GROUND_TANK, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER, UnitClass.MOBILE_COMMAND_CENTER, UnitClass.MILITARY_BASE, UnitClass.AIRBASE, UnitClass.PORT,
  UnitClass.FIGHTER_JET, UnitClass.HEAVY_BOMBER, UnitClass.TROOP_TRANSPORT, UnitClass.HELICOPTER, UnitClass.RECON_DRONE,
  UnitClass.AIRCRAFT_CARRIER, UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.BATTLESHIP, UnitClass.SUBMARINE, UnitClass.PATROL_BOAT, UnitClass.MINELAYER,
  UnitClass.MISSILE_SILO,
  'CITY'
];

export const WEAPON_MAPPING: Record<UnitClass, WeaponType> = {
  [UnitClass.COMMAND_CENTER]: WeaponType.TRACER,
  [UnitClass.MOBILE_COMMAND_CENTER]: WeaponType.TRACER,
  [UnitClass.MILITARY_BASE]: WeaponType.TRACER,
  [UnitClass.AIRBASE]: WeaponType.TRACER,
  [UnitClass.PORT]: WeaponType.TRACER,
  [UnitClass.INFANTRY]: WeaponType.TRACER,
  [UnitClass.SPECIAL_FORCES]: WeaponType.TRACER,
  [UnitClass.GROUND_TANK]: WeaponType.TRACER,
  [UnitClass.MISSILE_LAUNCHER]: WeaponType.MISSILE,
  [UnitClass.SAM_LAUNCHER]: WeaponType.MISSILE,
  [UnitClass.FIGHTER_JET]: WeaponType.MISSILE,
  [UnitClass.HEAVY_BOMBER]: WeaponType.MISSILE,
  [UnitClass.TROOP_TRANSPORT]: WeaponType.TRACER,
  [UnitClass.HELICOPTER]: WeaponType.TRACER,
  [UnitClass.RECON_DRONE]: WeaponType.LASER,
  [UnitClass.AIRCRAFT_CARRIER]: WeaponType.TRACER,
  [UnitClass.DESTROYER]: WeaponType.TRACER,
  [UnitClass.FRIGATE]: WeaponType.MISSILE,
  [UnitClass.BATTLESHIP]: WeaponType.TRACER,
  [UnitClass.SUBMARINE]: WeaponType.MISSILE,
  [UnitClass.PATROL_BOAT]: WeaponType.TRACER,
  [UnitClass.MINELAYER]: WeaponType.TRACER,
  [UnitClass.MISSILE_SILO]: WeaponType.MISSILE,
};

// =============================================
// UNIT COOLDOWNS (Fire rate differentiation)
// =============================================
export const COOLDOWN_CONFIG: Record<UnitClass, number> = {
  [UnitClass.COMMAND_CENTER]: 15,
  [UnitClass.MOBILE_COMMAND_CENTER]: 12,
  [UnitClass.MILITARY_BASE]: 15,
  [UnitClass.AIRBASE]: 20,
  [UnitClass.PORT]: 15,
  [UnitClass.INFANTRY]: 8,           // Fast fire
  [UnitClass.SPECIAL_FORCES]: 6,     // Elite - faster
  [UnitClass.GROUND_TANK]: 15,       // Medium
  [UnitClass.MISSILE_LAUNCHER]: 30,  // Slow artillery
  [UnitClass.SAM_LAUNCHER]: 25,      // Medium-slow
  [UnitClass.FIGHTER_JET]: 12,       // Fast
  [UnitClass.HEAVY_BOMBER]: 40,      // Very slow, high damage
  [UnitClass.TROOP_TRANSPORT]: 20,   // Slow
  [UnitClass.HELICOPTER]: 10,        // Fast
  [UnitClass.RECON_DRONE]: 15,       // Medium
  [UnitClass.AIRCRAFT_CARRIER]: 25,  // Slow
  [UnitClass.DESTROYER]: 12,         // Medium-fast
  [UnitClass.FRIGATE]: 15,           // Medium
  [UnitClass.BATTLESHIP]: 35,        // Slow bombardment
  [UnitClass.SUBMARINE]: 20,         // Medium
  [UnitClass.PATROL_BOAT]: 8,        // Fast
  [UnitClass.MINELAYER]: 25,         // Medium-slow
  [UnitClass.MISSILE_SILO]: 100,     // Very slow (nukes are separate)
};

// =============================================
// DAMAGE MODIFIERS (Rock-Paper-Scissors counters)
// =============================================
export const DAMAGE_MODIFIERS: Partial<Record<UnitClass, Partial<Record<UnitClass | 'CITY' | 'STRUCTURE', number>>>> = {
  // SAM is devastating vs air
  [UnitClass.SAM_LAUNCHER]: {
    [UnitClass.FIGHTER_JET]: 2.0,
    [UnitClass.HEAVY_BOMBER]: 2.0,
    [UnitClass.HELICOPTER]: 1.8,
    [UnitClass.RECON_DRONE]: 2.5,
    [UnitClass.TROOP_TRANSPORT]: 1.8,
  },
  // Fighters dominate air-to-air
  [UnitClass.FIGHTER_JET]: {
    [UnitClass.HEAVY_BOMBER]: 1.5,
    [UnitClass.HELICOPTER]: 1.5,
    [UnitClass.RECON_DRONE]: 2.0,
    [UnitClass.TROOP_TRANSPORT]: 1.3,
  },
  // Bombers excel vs ground
  [UnitClass.HEAVY_BOMBER]: {
    [UnitClass.GROUND_TANK]: 1.5,
    [UnitClass.INFANTRY]: 2.0,
    [UnitClass.SPECIAL_FORCES]: 1.5,
    [UnitClass.MILITARY_BASE]: 1.5,
    [UnitClass.MISSILE_LAUNCHER]: 1.3,
    'CITY': 1.3,
  },
  // Submarines counter surface ships
  [UnitClass.SUBMARINE]: {
    [UnitClass.AIRCRAFT_CARRIER]: 2.0,
    [UnitClass.BATTLESHIP]: 1.5,
    [UnitClass.DESTROYER]: 1.3,
    [UnitClass.FRIGATE]: 1.5,
  },
  // Destroyers counter submarines
  [UnitClass.DESTROYER]: {
    [UnitClass.SUBMARINE]: 2.0,
    [UnitClass.PATROL_BOAT]: 1.3,
  },
  // Tanks strong vs infantry
  [UnitClass.GROUND_TANK]: {
    [UnitClass.INFANTRY]: 1.5,
    [UnitClass.SPECIAL_FORCES]: 1.3,
  },
  // Infantry weak vs vehicles, strong at capturing
  [UnitClass.INFANTRY]: {
    [UnitClass.GROUND_TANK]: 0.5,
    [UnitClass.MISSILE_LAUNCHER]: 0.7,
    'CITY': 1.5, // Bonus for capturing
  },
  // Missile Launcher bonus vs structures
  [UnitClass.MISSILE_LAUNCHER]: {
    [UnitClass.MILITARY_BASE]: 1.5,
    [UnitClass.COMMAND_CENTER]: 1.3,
    'CITY': 1.4,
  },
  // Battleship bombardment
  [UnitClass.BATTLESHIP]: {
    [UnitClass.MILITARY_BASE]: 1.5,
    [UnitClass.PORT]: 1.5,
    'CITY': 1.3,
  },
};

// =============================================
// UNIT CONFIGURATION - FULLY REBALANCED
// =============================================
export const UNIT_CONFIG: Record<UnitClass, ExtendedUnitStats> = {
  // --- BUILDINGS / STATIC ---
  [UnitClass.COMMAND_CENTER]: { hp: 12000, maxHp: 12000, attack: 500, range: 100, speed: 0, vision: 500, cost: { gold: 0, oil: 0 }, validTargets: CAT_ALL },
  [UnitClass.MOBILE_COMMAND_CENTER]: { hp: 6000, maxHp: 6000, attack: 150, range: 50, speed: 1.5, vision: 300, cost: { gold: 4000, oil: 1500 }, validTargets: CAT_ALL },
  [UnitClass.MILITARY_BASE]: { hp: 3500, maxHp: 3500, attack: 250, range: 80, speed: 0, vision: 200, cost: { gold: 1200, oil: 400 }, validTargets: CAT_ALL },
  [UnitClass.AIRBASE]: { hp: 2500, maxHp: 2500, attack: 0, range: 0, speed: 0, vision: 250, cost: { gold: 1500, oil: 600 }, validTargets: [] },
  [UnitClass.PORT]: { hp: 3500, maxHp: 3500, attack: 120, range: 50, speed: 0, vision: 200, cost: { gold: 2000, oil: 800 }, validTargets: CAT_ALL },

  // --- INFANTRY (Capture specialists) ---
  [UnitClass.INFANTRY]: {
    hp: 120, maxHp: 120, attack: 35, range: 8, speed: 2.0, vision: 40,
    cost: { gold: 75, oil: 0 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.SPECIAL_FORCES]: {
    hp: 250, maxHp: 250, attack: 100, range: 15, speed: 1.5, vision: 80,
    cost: { gold: 300, oil: 75 }, canCapture: true,
    validTargets: CAT_ALL
  },

  // --- GROUND VEHICLES ---
  [UnitClass.GROUND_TANK]: {
    hp: 1000, maxHp: 1000, attack: 220, range: 18, speed: 2.5, vision: 50,
    cost: { gold: 450, oil: 120 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.MISSILE_LAUNCHER]: {
    hp: 350, maxHp: 350, attack: 400, range: 80, speed: 1.0, vision: 60,
    cost: { gold: 550, oil: 180 },
    validTargets: CAT_ALL
  },
  [UnitClass.SAM_LAUNCHER]: {
    hp: 350, maxHp: 350, attack: 350, range: 100, speed: 1.0, vision: 80,
    cost: { gold: 400, oil: 150 },
    validTargets: CAT_ALL
  },

  // --- AIR (NERFED - was overpowered) ---
  [UnitClass.FIGHTER_JET]: {
    hp: 300, maxHp: 300, attack: 180, range: 80, speed: 25.0, vision: 120,
    cost: { gold: 500, oil: 200 },
    validTargets: CAT_ALL
  },
  [UnitClass.HEAVY_BOMBER]: {
    hp: 800, maxHp: 800, attack: 600, range: 150, speed: 6.0, vision: 100,
    cost: { gold: 1200, oil: 600 },
    validTargets: CAT_ALL
  },
  [UnitClass.TROOP_TRANSPORT]: {
    hp: 600, maxHp: 600, attack: 20, range: 30, speed: 12.0, vision: 80,
    cost: { gold: 400, oil: 250 }, canCapture: false,
    validTargets: CAT_ALL
  },
  [UnitClass.HELICOPTER]: {
    hp: 350, maxHp: 350, attack: 150, range: 35, speed: 6.0, vision: 70,
    cost: { gold: 350, oil: 100 }, canCapture: true, // NEW: can capture
    validTargets: CAT_ALL
  },
  [UnitClass.RECON_DRONE]: {
    hp: 80, maxHp: 80, attack: 10, range: 40, speed: 15.0, vision: 300,
    cost: { gold: 150, oil: 50 },
    validTargets: CAT_ALL
  },

  // --- SEA (BUFFED - was underutilized) ---
  [UnitClass.AIRCRAFT_CARRIER]: {
    hp: 4000, maxHp: 4000, attack: 100, range: 250, speed: 2.5, vision: 200,
    cost: { gold: 2000, oil: 1200 },
    validTargets: CAT_ALL
  },
  [UnitClass.DESTROYER]: {
    hp: 2000, maxHp: 2000, attack: 300, range: 120, speed: 8.0, vision: 120,
    cost: { gold: 700, oil: 400 },
    validTargets: CAT_ALL
  },
  [UnitClass.FRIGATE]: {
    hp: 1500, maxHp: 1500, attack: 250, range: 100, speed: 6.0, vision: 100,
    cost: { gold: 500, oil: 250 },
    validTargets: CAT_ALL
  },
  [UnitClass.BATTLESHIP]: {
    hp: 5000, maxHp: 5000, attack: 700, range: 180, speed: 2.0, vision: 100,
    cost: { gold: 1800, oil: 1000 },
    validTargets: CAT_ALL
  },
  [UnitClass.SUBMARINE]: {
    hp: 1000, maxHp: 1000, attack: 500, range: 70, speed: 4.0, vision: 60,
    cost: { gold: 800, oil: 350 },
    validTargets: CAT_ALL
  },
  [UnitClass.PATROL_BOAT]: {
    hp: 200, maxHp: 200, attack: 80, range: 30, speed: 10.0, vision: 80,
    cost: { gold: 100, oil: 25 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.MINELAYER]: {
    hp: 350, maxHp: 350, attack: 400, range: 15, speed: 4.0, vision: 50,
    cost: { gold: 250, oil: 80 },
    validTargets: CAT_ALL
  },
  // STRATEGIC
  [UnitClass.MISSILE_SILO]: {
    hp: 4000, maxHp: 4000, attack: 0, range: 0, speed: 0, vision: 300,
    cost: { gold: 3500, oil: 1500 },
    validTargets: []
  },
};

export const AIR_MAPPING: Record<string, UnitClass> = {
  'B747': UnitClass.HEAVY_BOMBER, 'B777': UnitClass.HEAVY_BOMBER, 'A380': UnitClass.HEAVY_BOMBER, 'A340': UnitClass.HEAVY_BOMBER,
  'B737': UnitClass.TROOP_TRANSPORT, 'A320': UnitClass.TROOP_TRANSPORT, 'A321': UnitClass.TROOP_TRANSPORT,
  'C172': UnitClass.RECON_DRONE, 'PA28': UnitClass.RECON_DRONE, 'PC12': UnitClass.RECON_DRONE, 'GLID': UnitClass.RECON_DRONE,
  'F16': UnitClass.FIGHTER_JET, 'EUFI': UnitClass.FIGHTER_JET, 'GRIP': UnitClass.FIGHTER_JET,
};

export const SEA_MAPPING: Record<string, UnitClass> = {
  'Cargo': UnitClass.AIRCRAFT_CARRIER, 'Tanker': UnitClass.DESTROYER, 'Passenger': UnitClass.TROOP_TRANSPORT,
  'Fishing': UnitClass.PATROL_BOAT, 'Tug': UnitClass.MINELAYER, 'Pleasure Craft': UnitClass.PATROL_BOAT, 'High Speed Craft': UnitClass.PATROL_BOAT,
};

export const DEFAULT_AIR_CLASS = UnitClass.FIGHTER_JET;
export const DEFAULT_SEA_CLASS = UnitClass.DESTROYER;

export const SCENARIOS = {
  WORLD: { id: 'WORLD', name: 'World Map', bounds: { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 } },
  NORTH_AMERICA: { id: 'NORTH_AMERICA', name: 'North America', bounds: { minLat: 15, maxLat: 75, minLng: -170, maxLng: -50 } },
  SOUTH_AMERICA: { id: 'SOUTH_AMERICA', name: 'South America', bounds: { minLat: -60, maxLat: 15, minLng: -90, maxLng: -30 } },
  EUROPE: { id: 'EUROPE', name: 'Europe', bounds: { minLat: 35, maxLat: 72, minLng: -25, maxLng: 45 } },
  AFRICA: { id: 'AFRICA', name: 'Africa', bounds: { minLat: -35, maxLat: 38, minLng: -20, maxLng: 55 } },
  ASIA: { id: 'ASIA', name: 'Asia', bounds: { minLat: 0, maxLat: 75, minLng: 45, maxLng: 180 } },
};
