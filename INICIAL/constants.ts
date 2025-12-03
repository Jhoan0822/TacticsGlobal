
import { UnitClass, UnitStats, POIType, WeaponType } from './types';

export const GAME_TICK_MS = 50;
export const COMBAT_RADIUS_KM = 30; 
export const MAX_UNITS_ON_MAP = 200;

export const AI_CONFIG = {
  UPDATE_INTERVAL_MS: 1000, 
  MIN_GOLD_RESERVE: 400,
  THREAT_SCAN_RADIUS: 500, 
  BASE_AGGRESSION: 0.8, // Increased aggression
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
  [POIType.CITY]: { incomeGold: 20, incomeOil: 0, captureRadius: 0.1, defaultHp: 2000, captureThreshold: 0 }, 
  [POIType.OIL_RIG]: { incomeGold: 0, incomeOil: 20, captureRadius: 0.1, defaultHp: 500, captureThreshold: 0 }
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
export const UNIT_CONFIG: Record<UnitClass, ExtendedUnitStats> = {
  // --- BUILDINGS / STATIC ---
  [UnitClass.COMMAND_CENTER]: { hp: 10000, maxHp: 10000, attack: 200, range: 100, speed: 0, vision: 500, cost: { gold: 0, oil: 0 }, validTargets: CAT_ALL },
  [UnitClass.MOBILE_COMMAND_CENTER]: { hp: 5000, maxHp: 5000, attack: 50, range: 50, speed: 0.3, vision: 300, cost: { gold: 5000, oil: 2000 }, validTargets: CAT_ALL },
  [UnitClass.MILITARY_BASE]: { hp: 3000, maxHp: 3000, attack: 100, range: 100, speed: 0, vision: 200, cost: { gold: 1500, oil: 500 }, validTargets: CAT_ALL },
  [UnitClass.AIRBASE]: { hp: 2000, maxHp: 2000, attack: 0, range: 0, speed: 0, vision: 250, cost: { gold: 2000, oil: 500 }, validTargets: [] },
  [UnitClass.PORT]: { hp: 3000, maxHp: 3000, attack: 50, range: 50, speed: 0, vision: 200, cost: { gold: 3000, oil: 1000 }, validTargets: CAT_ALL },

  // --- INFANTRY ---
  [UnitClass.INFANTRY]: { 
    hp: 100, maxHp: 100, attack: 15, range: 5, speed: 0.1, vision: 30, 
    cost: { gold: 50, oil: 0 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.SPECIAL_FORCES]: { 
    hp: 200, maxHp: 200, attack: 40, range: 8, speed: 0.15, vision: 50, 
    cost: { gold: 200, oil: 50 }, canCapture: true,
    validTargets: CAT_ALL
  },

  // --- GROUND VEHICLES ---
  [UnitClass.GROUND_TANK]: { 
    hp: 1200, maxHp: 1200, attack: 90, range: 15, speed: 0.2, vision: 40, 
    cost: { gold: 400, oil: 100 }, canCapture: true,
    validTargets: CAT_ALL
  },
  [UnitClass.MISSILE_LAUNCHER]: { 
    hp: 400, maxHp: 400, attack: 150, range: 100, speed: 0.15, vision: 40, 
    cost: { gold: 600, oil: 200 },
    validTargets: CAT_ALL
  },
  [UnitClass.SAM_LAUNCHER]: { 
    hp: 400, maxHp: 400, attack: 120, range: 120, speed: 0.15, vision: 60, 
    cost: { gold: 500, oil: 100 },
    validTargets: CAT_ALL
  },

  // --- AIR ---
  [UnitClass.FIGHTER_JET]: { 
    hp: 400, maxHp: 400, attack: 80, range: 100, speed: 3.0, vision: 150, 
    cost: { gold: 300, oil: 100 },
    validTargets: CAT_ALL
  },
  [UnitClass.HEAVY_BOMBER]: { 
    hp: 1000, maxHp: 1000, attack: 250, range: 200, speed: 1.6, vision: 100, 
    cost: { gold: 800, oil: 400 },
    validTargets: CAT_ALL
  },
  [UnitClass.TROOP_TRANSPORT]: { 
    hp: 800, maxHp: 800, attack: 10, range: 50, speed: 1.8, vision: 80, 
    cost: { gold: 300, oil: 200 }, canCapture: false,
    validTargets: CAT_ALL
  },
  [UnitClass.HELICOPTER]: { 
    hp: 300, maxHp: 300, attack: 40, range: 40, speed: 1.0, vision: 60, 
    cost: { gold: 200, oil: 50 }, canCapture: false,
    validTargets: CAT_ALL
  },
  [UnitClass.RECON_DRONE]: { 
    hp: 100, maxHp: 100, attack: 5, range: 50, speed: 2.4, vision: 300, 
    cost: { gold: 100, oil: 0 },
    validTargets: CAT_ALL
  },

  // --- SEA ---
  [UnitClass.AIRCRAFT_CARRIER]: { 
    hp: 5000, maxHp: 5000, attack: 50, range: 300, speed: 0.4, vision: 200, 
    cost: { gold: 2500, oil: 1500 },
    validTargets: CAT_ALL
  },
  [UnitClass.DESTROYER]: { 
    hp: 2500, maxHp: 2500, attack: 120, range: 150, speed: 0.8, vision: 120, 
    cost: { gold: 800, oil: 500 },
    validTargets: CAT_ALL
  },
  [UnitClass.FRIGATE]: { 
    hp: 1800, maxHp: 1800, attack: 80, range: 100, speed: 1.0, vision: 100, 
    cost: { gold: 600, oil: 300 },
    validTargets: CAT_ALL
  },
  [UnitClass.BATTLESHIP]: { 
    hp: 4000, maxHp: 4000, attack: 300, range: 200, speed: 0.5, vision: 100, 
    cost: { gold: 1500, oil: 800 },
    validTargets: CAT_ALL
  },
  [UnitClass.SUBMARINE]: { 
    hp: 1200, maxHp: 1200, attack: 200, range: 80, speed: 0.6, vision: 60, 
    cost: { gold: 1000, oil: 400 },
    validTargets: CAT_ALL
  },
  [UnitClass.PATROL_BOAT]: { 
    hp: 300, maxHp: 300, attack: 40, range: 40, speed: 1.2, vision: 60, 
    cost: { gold: 150, oil: 50 },
    validTargets: CAT_ALL
  },
  [UnitClass.MINELAYER]: { 
    hp: 400, maxHp: 400, attack: 100, range: 20, speed: 0.6, vision: 50, 
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
