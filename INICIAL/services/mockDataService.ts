
import { Faction, GameUnit, RealWorldData, UnitClass, POI, POIType } from '../types';
import { AIR_MAPPING, SEA_MAPPING, UNIT_CONFIG, DEFAULT_AIR_CLASS, DEFAULT_SEA_CLASS, FACTION_PRESETS, POI_CONFIG } from '../constants';

const PLANE_TYPES = ['B747', 'A380', 'B737', 'A320', 'C172', 'PC12', 'B777', 'A340'];
const SHIP_TYPES = ['Cargo', 'Tanker', 'Fishing', 'Tug', 'Passenger', 'Pleasure Craft'];

interface WorldCity {
  name: string;
  lat: number;
  lng: number;
  tier: 1 | 2 | 3; 
  country: string;
  isCoastal: boolean;
}

const GLOBAL_CITIES: WorldCity[] = [
    // --- NORTH AMERICA ---
    { name: "Washington D.C.", lat: 38.9072, lng: -77.0369, tier: 1, country: "USA", isCoastal: true },
    { name: "New York City", lat: 40.7128, lng: -74.0060, tier: 1, country: "USA", isCoastal: true },
    { name: "Los Angeles", lat: 34.0522, lng: -118.2437, tier: 1, country: "USA", isCoastal: true },
    { name: "Chicago", lat: 41.8781, lng: -87.6298, tier: 1, country: "USA", isCoastal: false },
    { name: "Houston", lat: 29.7604, lng: -95.3698, tier: 2, country: "USA", isCoastal: true },
    { name: "Phoenix", lat: 33.4484, lng: -112.0740, tier: 2, country: "USA", isCoastal: false },
    { name: "San Francisco", lat: 37.7749, lng: -122.4194, tier: 2, country: "USA", isCoastal: true },
    { name: "Seattle", lat: 47.6062, lng: -122.3321, tier: 2, country: "USA", isCoastal: true },
    { name: "Miami", lat: 25.7617, lng: -80.1918, tier: 2, country: "USA", isCoastal: true },
    { name: "Denver", lat: 39.7392, lng: -104.9903, tier: 2, country: "USA", isCoastal: false },
    { name: "Boston", lat: 42.3601, lng: -71.0589, tier: 2, country: "USA", isCoastal: true },
    { name: "New Orleans", lat: 29.9511, lng: -90.0715, tier: 3, country: "USA", isCoastal: true },
    { name: "Honolulu", lat: 21.3069, lng: -157.8583, tier: 2, country: "USA", isCoastal: true },
    { name: "Ottawa", lat: 45.4215, lng: -75.6972, tier: 1, country: "Canada", isCoastal: false },
    { name: "Toronto", lat: 43.6532, lng: -79.3832, tier: 1, country: "Canada", isCoastal: false },
    { name: "Vancouver", lat: 49.2827, lng: -123.1207, tier: 2, country: "Canada", isCoastal: true },
    { name: "Mexico City", lat: 19.4326, lng: -99.1332, tier: 1, country: "Mexico", isCoastal: false },
    { name: "Cancún", lat: 21.1619, lng: -86.8515, tier: 3, country: "Mexico", isCoastal: true },

    // --- SOUTH AMERICA ---
    { name: "Brasília", lat: -15.8267, lng: -47.9218, tier: 1, country: "Brazil", isCoastal: false },
    { name: "São Paulo", lat: -23.5505, lng: -46.6333, tier: 1, country: "Brazil", isCoastal: false },
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, tier: 1, country: "Brazil", isCoastal: true },
    { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, tier: 1, country: "Argentina", isCoastal: true },
    { name: "Bogotá", lat: 4.7110, lng: -74.0721, tier: 1, country: "Colombia", isCoastal: false },
    { name: "Medellín", lat: 6.2442, lng: -75.5812, tier: 2, country: "Colombia", isCoastal: false },
    { name: "Cali", lat: 3.4516, lng: -76.5320, tier: 2, country: "Colombia", isCoastal: false },
    { name: "Barranquilla", lat: 10.9685, lng: -74.7813, tier: 2, country: "Colombia", isCoastal: true },
    { name: "Cartagena", lat: 10.3910, lng: -75.4794, tier: 3, country: "Colombia", isCoastal: true },
    { name: "Santiago", lat: -33.4489, lng: -70.6693, tier: 1, country: "Chile", isCoastal: false },
    { name: "Lima", lat: -12.0464, lng: -77.0428, tier: 1, country: "Peru", isCoastal: true },
    { name: "Montevideo", lat: -34.9011, lng: -56.1645, tier: 1, country: "Uruguay", isCoastal: true },

    // --- EUROPE ---
    { name: "London", lat: 51.5074, lng: -0.1278, tier: 1, country: "UK", isCoastal: false },
    { name: "Paris", lat: 48.8566, lng: 2.3522, tier: 1, country: "France", isCoastal: false },
    { name: "Marseille", lat: 43.2965, lng: 5.3698, tier: 2, country: "France", isCoastal: true },
    { name: "Berlin", lat: 52.5200, lng: 13.4050, tier: 1, country: "Germany", isCoastal: false },
    { name: "Hamburg", lat: 53.5511, lng: 9.9937, tier: 2, country: "Germany", isCoastal: true },
    { name: "Frankfurt", lat: 50.1109, lng: 8.6821, tier: 2, country: "Germany", isCoastal: false },
    { name: "Madrid", lat: 40.4168, lng: -3.7038, tier: 1, country: "Spain", isCoastal: false },
    { name: "Rome", lat: 41.9028, lng: 12.4964, tier: 1, country: "Italy", isCoastal: false },
    { name: "Naples", lat: 40.8518, lng: 14.2681, tier: 3, country: "Italy", isCoastal: true },
    { name: "Moscow", lat: 55.7558, lng: 37.6173, tier: 1, country: "Russia", isCoastal: false },
    { name: "St. Petersburg", lat: 59.9343, lng: 30.3351, tier: 1, country: "Russia", isCoastal: true },
    { name: "Kyiv", lat: 50.4501, lng: 30.5234, tier: 1, country: "Ukraine", isCoastal: false },
    { name: "Warsaw", lat: 52.2297, lng: 21.0122, tier: 1, country: "Poland", isCoastal: false },
    { name: "Istanbul", lat: 41.0082, lng: 28.9784, tier: 1, country: "Turkey", isCoastal: true },

    // --- ASIA ---
    { name: "Beijing", lat: 39.9042, lng: 116.4074, tier: 1, country: "China", isCoastal: false },
    { name: "Shanghai", lat: 31.2304, lng: 121.4737, tier: 1, country: "China", isCoastal: true },
    { name: "Guangzhou", lat: 23.1291, lng: 113.2644, tier: 1, country: "China", isCoastal: true },
    { name: "Shenzhen", lat: 22.5431, lng: 114.0579, tier: 2, country: "China", isCoastal: true },
    { name: "Tokyo", lat: 35.6762, lng: 139.6503, tier: 1, country: "Japan", isCoastal: true },
    { name: "Seoul", lat: 37.5665, lng: 126.9780, tier: 1, country: "South Korea", isCoastal: false },
    { name: "Busan", lat: 35.1796, lng: 129.0756, tier: 2, country: "South Korea", isCoastal: true },
    { name: "Mumbai", lat: 19.0760, lng: 72.8777, tier: 1, country: "India", isCoastal: true },
    { name: "Delhi", lat: 28.6139, lng: 77.2090, tier: 1, country: "India", isCoastal: false },
    { name: "Jakarta", lat: -6.2088, lng: 106.8456, tier: 1, country: "Indonesia", isCoastal: true },
    { name: "Bangkok", lat: 13.7563, lng: 100.5018, tier: 1, country: "Thailand", isCoastal: true },
    { name: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297, tier: 1, country: "Vietnam", isCoastal: true },
    { name: "Manila", lat: 14.5995, lng: 120.9842, tier: 1, country: "Philippines", isCoastal: true },
    { name: "Tehran", lat: 35.6892, lng: 51.3890, tier: 1, country: "Iran", isCoastal: false },
    { name: "Riyadh", lat: 24.7136, lng: 46.6753, tier: 1, country: "Saudi Arabia", isCoastal: false },
    { name: "Dubai", lat: 25.2048, lng: 55.2708, tier: 2, country: "UAE", isCoastal: true },

    // --- AFRICA ---
    { name: "Cairo", lat: 30.0444, lng: 31.2357, tier: 1, country: "Egypt", isCoastal: false },
    { name: "Lagos", lat: 6.5244, lng: 3.3792, tier: 1, country: "Nigeria", isCoastal: true },
    { name: "Johannesburg", lat: -26.2041, lng: 28.0473, tier: 1, country: "South Africa", isCoastal: false },
    { name: "Cape Town", lat: -33.9249, lng: 18.4241, tier: 2, country: "South Africa", isCoastal: true },
    { name: "Nairobi", lat: -1.2921, lng: 36.8219, tier: 1, country: "Kenya", isCoastal: false },
    { name: "Casablanca", lat: 33.5731, lng: -7.5898, tier: 1, country: "Morocco", isCoastal: true },

    // --- OCEANIA ---
    { name: "Sydney", lat: -33.8688, lng: 151.2093, tier: 1, country: "Australia", isCoastal: true },
    { name: "Melbourne", lat: -37.8136, lng: 144.9631, tier: 1, country: "Australia", isCoastal: true },
    { name: "Auckland", lat: -36.8485, lng: 174.7633, tier: 1, country: "New Zealand", isCoastal: true },
];

const randomId = () => Math.random().toString(36).substr(2, 9);

export const fetchWorldData = async (centerLat: number, centerLng: number, radiusKm: number): Promise<{units: GameUnit[], pois: POI[], factions: Faction[]}> => {
  const units: GameUnit[] = [];
  const pois: POI[] = [];
  const factions: Faction[] = [];

  // 1. Generate Factions
  factions.push({
      id: 'PLAYER',
      name: 'Global Command (You)',
      color: '#3b82f6',
      type: 'PLAYER',
      gold: 5000,
      relations: {}
  });

  factions.push({
      id: 'NEUTRAL',
      name: 'Civilian Traffic',
      color: '#94a3b8',
      type: 'NEUTRAL',
      gold: 0,
      relations: { 'PLAYER': 0 }
  });

  const aiCount = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < aiCount; i++) {
      const preset = FACTION_PRESETS[i + 1];
      const id = `AI_${i}`;
      const initialRelation = Math.floor(Math.random() * 60) - 40; 
      factions.push({
          id: id,
          name: preset?.name || `Faction ${i}`,
          color: preset?.color || `#${Math.floor(Math.random()*16777215).toString(16)}`,
          type: 'AI',
          gold: 5000,
          relations: { 'PLAYER': initialRelation },
          aggression: 0.3 + Math.random() * 0.7,
          lastAiUpdate: 0,
          maxUnits: 50
      });
  }

  // Cross-populate relations
  factions.forEach(f1 => {
      if (f1.type !== 'AI') return;
      factions.forEach(f2 => {
          if (f1.id === f2.id) return;
          if (!f1.relations[f2.id]) {
               f1.relations[f2.id] = Math.floor(Math.random() * 200) - 100;
          }
      });
  });

  // 2. Load ALL Cities 
  GLOBAL_CITIES.forEach(city => {
      let ownerId = 'NEUTRAL';
      if (Math.random() < 0.8) {
          const aiFactions = factions.filter(f => f.type === 'AI');
          if (aiFactions.length > 0) {
              const randomAI = aiFactions[Math.floor(Math.random() * aiFactions.length)];
              ownerId = randomAI.id;
          }
      }

      const defaultStats = POI_CONFIG[POIType.CITY];

      pois.push({
          id: `CITY-${city.name.replace(/ /g, '').toUpperCase()}`,
          type: POIType.CITY,
          name: city.name, 
          position: { lat: city.lat, lng: city.lng },
          ownerFactionId: ownerId,
          tier: city.tier,
          isCoastal: city.isCoastal,
          hp: defaultStats.defaultHp,
          maxHp: defaultStats.defaultHp
      });
  });

  // 3. Generate Oil Rigs
  const oilCount = Math.floor(Math.random() * 30) + 15;
  for (let i = 0; i < oilCount; i++) {
      const stats = POI_CONFIG[POIType.OIL_RIG];
      pois.push({
          id: `OIL-${randomId()}`,
          type: POIType.OIL_RIG,
          name: `RIG-${Math.floor(Math.random() * 999)}`,
          position: { lat: (Math.random() * 120) - 60, lng: (Math.random() * 360) - 180 },
          ownerFactionId: 'NEUTRAL',
          tier: 3,
          hp: stats.defaultHp,
          maxHp: stats.defaultHp
      })
  }
  
  // 4. Generate Initial Units
  const unitCount = Math.floor(Math.random() * 80) + 40;
  for (let i = 0; i < unitCount; i++) {
    const isPlane = Math.random() > 0.4;
    const typeList = isPlane ? PLANE_TYPES : SHIP_TYPES;
    const type = typeList[Math.floor(Math.random() * typeList.length)];
    
    let lat = (Math.random() * 140) - 70;
    let lng = (Math.random() * 360) - 180;
    
    // Slight bias towards cities
    if (Math.random() > 0.3 && pois.length > 0) {
        const randomCity = pois[Math.floor(Math.random() * pois.length)];
        lat = randomCity.position.lat + (Math.random() - 0.5) * 5;
        lng = randomCity.position.lng + (Math.random() - 0.5) * 5;
    }

    const realData: RealWorldData = {
      id: randomId().toUpperCase(),
      type: type,
      callsign: isPlane ? `FLT${Math.floor(Math.random()*9000)}` : `VSSL${Math.floor(Math.random()*9000)}`,
      lat: lat,
      lng: lng,
      heading: Math.floor(Math.random() * 360),
      speedKts: isPlane ? 400 + Math.random() * 200 : 10 + Math.random() * 30,
      source: isPlane ? 'ADS-B' : 'AIS'
    };

    let assignedFaction = 'NEUTRAL';
    if (Math.random() < 0.6) {
        const aiFactions = factions.filter(f => f.type === 'AI');
        const randomAI = aiFactions[Math.floor(Math.random() * aiFactions.length)];
        assignedFaction = randomAI.id;
    }

    units.push(transmuteRealToGame(realData, assignedFaction));
  }

  return { units, pois, factions };
};

const transmuteRealToGame = (data: RealWorldData, factionId: string): GameUnit => {
  let unitClass: UnitClass;
  if (data.source === 'ADS-B') {
    unitClass = AIR_MAPPING[data.type] || DEFAULT_AIR_CLASS;
  } else {
    unitClass = SEA_MAPPING[data.type] || DEFAULT_SEA_CLASS;
  }
  const stats = UNIT_CONFIG[unitClass];
  return {
    id: data.id,
    unitClass,
    factionId,
    position: { lat: data.lat, lng: data.lng },
    heading: data.heading,
    realWorldIdentity: data,
    ...stats, 
  };
};
