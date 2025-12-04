
import { UnitClass, UnitStats, POIType, WeaponType, Difficulty } from './types';

export const GAME_TICK_MS = 30; // Faster tick for "Frenetic" feel
export const COMBAT_RADIUS_KM = 30;
export const MAX_UNITS_ON_MAP = 200;

export const DIFFICULTY_CONFIG = {
  [Difficulty.EASY]: {
    WAVE_INTERVAL_MS: 60000, // Faster than before
    INTENSITY_GAIN: 0.1,
    AGGRESSION_MODIFIER: 0.8,
    RESOURCE_MULTIPLIER: 1.0,
  },
  [Difficulty.MEDIUM]: {
    WAVE_INTERVAL_MS: 30000, // 30s waves
    INTENSITY_GAIN: 0.2,
    AGGRESSION_MODIFIER: 1.5,
    RESOURCE_MULTIPLIER: 1.5,
  },
  [Difficulty.HARD]: {
    WAVE_INTERVAL_MS: 10000, // 10s waves (CHAOS)
    INTENSITY_GAIN: 0.5, // Instant chaos
    AGGRESSION_MODIFIER: 3.0, // Relentless
    RESOURCE_MULTIPLIER: 2.0, // Infinite money basically
  }
};

export const AI_CONFIG = {
  UPDATE_INTERVAL_MS: 500, // Think faster
  MIN_GOLD_RESERVE: 100, // Spend everything
  THREAT_SCAN_RADIUS: 1000, // See everything
  BASE_AGGRESSION: 1.0, // Always aggressive
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

export const POI_CONFIG = {
  [POIType.CITY]: { incomeGold: 50, incomeOil: 0, captureRadius: 0.1, defaultHp: 2000, captureThreshold: 0 },
  [POIType.OIL_RIG]: { incomeGold: 0, incomeOil: 50, captureRadius: 0.1, defaultHp: 500, captureThreshold: 0 },
  [POIType.GOLD_MINE]: { incomeGold: 100, incomeOil: 0, captureRadius: 0.1, defaultHp: 300, captureThreshold: 0 }
};

interface ExtendedUnitStats extends UnitStats {
  validTargets: string[];
}

// TARGET CATEGORIES - UNRESTRICTED
const CAT_ALL = [
  UnitClass.INFANTRY, UnitClass.SPECIAL_FORCES, UnitClass.GROUND_TANK, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER, UnitClass.MOBILE_COMMAND_CENTER, UnitClass.MILITARY_BASE, UnitClass.AIRBASE, UnitClass.PORT,
  UnitClass.FIGHTER_JET, UnitClass.HEAVY_BOMBER, UnitClass.TROOP_TRANSPORT, UnitClass.HELICOPTER, UnitClass.RECON_DRONE,
  UnitClass.AIRCRAFT_CARRIER, UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.BATTLESHIP, UnitClass.SUBMARINE, UnitClass.PATROL_BOAT, UnitClass.MINELAYER,
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
};

// UNRESTRICTED COMBAT CONFIG
// All units have 'validTargets' set to everything to support the "No Restrictions" rule.
// EXTREME OVERHAUL: SPEEDS 5x, ATTACK 3x
export const UNIT_CONFIG: Record<UnitClass, ExtendedUnitStats> = {
  // --- BUILDINGS / STATIC ---
  [UnitClass.COMMAND_CENTER]: { hp: 10000, maxHp: 10000, attack: 600, range: 100, speed: 0, vision: 500, cost: { gold: 0, oil: 0 }, validTargets: CAT_ALL },
  [UnitClass.MOBILE_COMMAND_CENTER]: { hp: 5000, maxHp: 5000, attack: 150, range: 50, speed: 1.5, vision: 300, cost: { gold: 5000, oil: 2000 }, validTargets: CAT_ALL },
  [UnitClass.MILITARY_BASE]: { hp: 3000, maxHp: 3000, attack: 300, range: 100, speed: 0, vision: 200, cost: { gold: 1500, oil: 500 }, validTargets: CAT_ALL },
  [UnitClass.AIRBASE]: { hp: 2000, maxHp: 2000, attack: 0, range: 0, speed: 0, vision: 250, cost: { gold: 2000, oil: 500 }, validTargets: [] },
  [UnitClass.PORT]: { hp: 3000, maxHp: 3000, attack: 150, range: 50, speed: 0, vision: 200, cost: { gold: 3000, oil: 1000 }, validTargets: CAT_ALL },

  // --- INFANTRY ---
  [UnitClass.INFANTRY]: {
    hp: 100, maxHp: 100, attack: 45, range: 5, speed: 1.5, vision: 30,
    cost: { gold: 50, oil: 0 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.SPECIAL_FORCES]: {
    hp: 200, maxHp: 200, attack: 120, range: 8, speed: 0.75, vision: 50,
    cost: { gold: 200, oil: 50 }, canCapture: true,
    validTargets: CAT_ALL
  },

  // --- GROUND VEHICLES ---
  [UnitClass.GROUND_TANK]: {
    hp: 1200, maxHp: 1200, attack: 270, range: 15, speed: 3.0, vision: 40,
    cost: { gold: 400, oil: 100 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.MISSILE_LAUNCHER]: {
    hp: 400, maxHp: 400, attack: 450, range: 100, speed: 0.75, vision: 40,
    cost: { gold: 600, oil: 200 },
    validTargets: CAT_ALL
  },
  [UnitClass.SAM_LAUNCHER]: {
    hp: 400, maxHp: 400, attack: 360, range: 120, speed: 0.75, vision: 60,
    cost: { gold: 500, oil: 100 },
    validTargets: CAT_ALL
  },

  // --- AIR ---
  [UnitClass.FIGHTER_JET]: {
    hp: 400, maxHp: 400, attack: 240, range: 100, speed: 40.0, vision: 150,
    cost: { gold: 300, oil: 100 },
    validTargets: CAT_ALL
  },
  [UnitClass.HEAVY_BOMBER]: {
    hp: 1000, maxHp: 1000, attack: 750, range: 200, speed: 8.0, vision: 100,
    cost: { gold: 800, oil: 400 },
    validTargets: CAT_ALL
  },
  [UnitClass.TROOP_TRANSPORT]: {
    hp: 800, maxHp: 800, attack: 30, range: 50, speed: 9.0, vision: 80,
    cost: { gold: 300, oil: 200 }, canCapture: false,
    validTargets: CAT_ALL
  },
  [UnitClass.HELICOPTER]: {
    hp: 300, maxHp: 300, attack: 120, range: 40, speed: 5.0, vision: 60,
    cost: { gold: 200, oil: 50 }, canCapture: false,
    validTargets: CAT_ALL
  },
  [UnitClass.RECON_DRONE]: {
    hp: 100, maxHp: 100, attack: 15, range: 50, speed: 12.0, vision: 300,
    cost: { gold: 100, oil: 0 },
    validTargets: CAT_ALL
  },

  // --- SEA ---
  [UnitClass.AIRCRAFT_CARRIER]: {
    hp: 5000, maxHp: 5000, attack: 150, range: 300, speed: 2.0, vision: 200,
    cost: { gold: 2500, oil: 1500 },
    validTargets: CAT_ALL
  },
  [UnitClass.DESTROYER]: {
    hp: 2500, maxHp: 2500, attack: 360, range: 150, speed: 10.0, vision: 120,
    cost: { gold: 800, oil: 500 },
    validTargets: CAT_ALL
  },
  [UnitClass.FRIGATE]: {
    hp: 1800, maxHp: 1800, attack: 240, range: 100, speed: 5.0, vision: 100,
    cost: { gold: 600, oil: 300 },
    validTargets: CAT_ALL
  },
  [UnitClass.BATTLESHIP]: {
    hp: 4000, maxHp: 4000, attack: 900, range: 200, speed: 2.5, vision: 100,
    cost: { gold: 1500, oil: 800 },
    validTargets: CAT_ALL
  },
  [UnitClass.SUBMARINE]: {
    hp: 1200, maxHp: 1200, attack: 600, range: 80, speed: 3.0, vision: 60,
    cost: { gold: 1000, oil: 400 },
    validTargets: CAT_ALL
  },
  [UnitClass.PATROL_BOAT]: {
    hp: 300, maxHp: 300, attack: 120, range: 40, speed: 6.0, vision: 60,
    cost: { gold: 150, oil: 50 }, canCapture: true, // ENABLED CAPTURE
    validTargets: CAT_ALL
  },
  [UnitClass.MINELAYER]: {
    hp: 400, maxHp: 400, attack: 300, range: 20, speed: 3.0, vision: 50,
    cost: { gold: 300, oil: 100 },
    validTargets: CAT_ALL
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
