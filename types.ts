
export enum UnitClass {
  COMMAND_CENTER = 'COMMAND_CENTER',
  MOBILE_COMMAND_CENTER = 'MOBILE_COMMAND_CENTER',
  MILITARY_BASE = 'MILITARY_BASE',
  AIRBASE = 'AIRBASE',
  PORT = 'PORT',

  // AIR
  HEAVY_BOMBER = 'HEAVY_BOMBER',
  FIGHTER_JET = 'FIGHTER_JET',
  TROOP_TRANSPORT = 'TROOP_TRANSPORT',
  HELICOPTER = 'HELICOPTER',
  RECON_DRONE = 'RECON_DRONE',

  // GROUND
  INFANTRY = 'INFANTRY',
  SPECIAL_FORCES = 'SPECIAL_FORCES',
  GROUND_TANK = 'GROUND_TANK',
  MISSILE_LAUNCHER = 'MISSILE_LAUNCHER',
  SAM_LAUNCHER = 'SAM_LAUNCHER',

  // SEA
  AIRCRAFT_CARRIER = 'AIRCRAFT_CARRIER',
  DESTROYER = 'DESTROYER',
  FRIGATE = 'FRIGATE',
  BATTLESHIP = 'BATTLESHIP',
  SUBMARINE = 'SUBMARINE',
  PATROL_BOAT = 'PATROL_BOAT',
  MINELAYER = 'MINELAYER',
}

export enum POIType {
  CITY = 'CITY',
  OIL_RIG = 'OIL_RIG',
  GOLD_MINE = 'GOLD_MINE'
}

export enum WeaponType {
  TRACER = 'TRACER',
  MISSILE = 'MISSILE',
  LASER = 'LASER'
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  type: 'PLAYER' | 'AI' | 'NEUTRAL' | 'BOT';
  gold: number;
  oil: number;
  relations: Record<string, number>;
  aggression?: number;
  lastAiUpdate?: number;
  maxUnits?: number;
}

export interface POI {
  id: string;
  type: POIType;
  position: { lat: number; lng: number };
  ownerFactionId: string;
  name: string;
  tier?: number; // 1 (Capital) to 3 (Outpost)
  isCoastal?: boolean;
  hp: number;
  maxHp: number;
}

export interface UnitStats {
  hp: number;
  maxHp: number;
  attack: number;
  range: number; // in km
  speed: number; // relative game speed
  vision: number; // fog of war clear radius in km
  cost?: { gold: number; oil: number };
  canCapture?: boolean;
}

export interface RealWorldData {
  id: string;
  type: string;
  callsign: string;
  lat: number;
  lng: number;
  heading: number;
  speedKts: number;
  origin?: string;
  destination?: string;
  source: 'ADS-B' | 'AIS';
}

export interface GameUnit extends UnitStats {
  id: string;
  unitClass: UnitClass;
  factionId: string;
  position: { lat: number; lng: number };
  heading: number;
  destination?: { lat: number; lng: number } | null;
  targetId?: string | null;
  lastAttackerId?: string | null;
  veterancy?: number; // 0-3
  kills?: number;
  realWorldIdentity?: RealWorldData;
  isBoosting?: boolean;
  cooldown?: number; // Fire rate cooldown
  // Auto-control modes for player units
  autoMode?: 'NONE' | 'DEFEND' | 'ATTACK' | 'PATROL';
  autoTarget?: boolean; // Auto-engage enemies in range
  homePosition?: { lat: number; lng: number }; // For patrol/defend
}

export interface Projectile {
  id: string;
  fromId: string;
  toId: string;
  fromPos: { lat: number; lng: number };
  toPos: { lat: number; lng: number };
  timestamp: number;
  isHit: boolean;
  weaponType: WeaponType;
  speed: number; // 0-1 interpolation speed
  progress: number; // 0-1
}

export interface Explosion {
  id: string;
  position: { lat: number; lng: number };
  timestamp: number;
  size: 'SMALL' | 'MEDIUM' | 'LARGE';
}

export interface LogMessage {
  id: string;
  text: string;
  type: 'info' | 'alert' | 'success' | 'combat';
  timestamp: number;
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
}

export interface GameState {
  factions: Faction[];
  units: GameUnit[];
  pois: POI[];
  projectiles: Projectile[];
  explosions: Explosion[];
  playerResources: {
    gold: number;
    oil: number;
    intel: number;
  };
  controlGroups: Record<number, string[]>; // Key 1-9 -> Array of Unit IDs
  territoryControlled: number;
  gameTick: number;
  gameMode: 'SELECT_BASE' | 'PLAYING' | 'PLACING_STRUCTURE';
  placementType?: UnitClass | null;
  messages: LogMessage[];
  difficulty: Difficulty;
  scenario: Scenario;
  localPlayerId: string;
  isClient?: boolean;
  pendingBotFactions?: string[]; // Bot faction IDs awaiting city assignment
  // Victory/Defeat State
  gameResult?: 'VICTORY' | 'DEFEAT' | null;
  gameStats?: {
    unitsKilled: number;
    unitsLost: number;
    citiesCaptured: number;
    goldEarned: number;
    startTime: number;
  };
}

export interface LobbyPlayer {
  id: string;
  name: string;
  factionIndex: number;
  isHost: boolean;
  isReady: boolean;
}

export interface LobbyState {
  players: LobbyPlayer[];
  scenarioId: string;
  difficulty: Difficulty;
  botCount: number;
  gameMode: 'DOMINATION' | 'SURVIVAL';
}

export interface Scenario {
  id: string;
  name: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}
