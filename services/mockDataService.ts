
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
  { name: "Atlanta", lat: 33.7490, lng: -84.3880, tier: 2, country: "USA", isCoastal: false },
  { name: "Dallas", lat: 32.7767, lng: -96.7970, tier: 2, country: "USA", isCoastal: false },
  { name: "Las Vegas", lat: 36.1699, lng: -115.1398, tier: 3, country: "USA", isCoastal: false },
  { name: "Ottawa", lat: 45.4215, lng: -75.6972, tier: 1, country: "Canada", isCoastal: false },
  { name: "Toronto", lat: 43.6532, lng: -79.3832, tier: 1, country: "Canada", isCoastal: false },
  { name: "Vancouver", lat: 49.2827, lng: -123.1207, tier: 2, country: "Canada", isCoastal: true },
  { name: "Montreal", lat: 45.5017, lng: -73.5673, tier: 2, country: "Canada", isCoastal: true },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, tier: 1, country: "Mexico", isCoastal: false },
  { name: "Cancún", lat: 21.1619, lng: -86.8515, tier: 3, country: "Mexico", isCoastal: true },
  { name: "Guadalajara", lat: 20.6597, lng: -103.3496, tier: 2, country: "Mexico", isCoastal: false },
  { name: "Monterrey", lat: 25.6866, lng: -100.3161, tier: 2, country: "Mexico", isCoastal: false },

  // --- SOUTH AMERICA ---
  { name: "Brasília", lat: -15.8267, lng: -47.9218, tier: 1, country: "Brazil", isCoastal: false },
  { name: "São Paulo", lat: -23.5505, lng: -46.6333, tier: 1, country: "Brazil", isCoastal: false },
  { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, tier: 1, country: "Brazil", isCoastal: true },
  { name: "Salvador", lat: -12.9777, lng: -38.5016, tier: 2, country: "Brazil", isCoastal: true },
  { name: "Manaus", lat: -3.1190, lng: -60.0217, tier: 3, country: "Brazil", isCoastal: false },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, tier: 1, country: "Argentina", isCoastal: true },
  { name: "Córdoba", lat: -31.4201, lng: -64.1888, tier: 2, country: "Argentina", isCoastal: false },
  { name: "Bogotá", lat: 4.7110, lng: -74.0721, tier: 1, country: "Colombia", isCoastal: false },
  { name: "Medellín", lat: 6.2442, lng: -75.5812, tier: 2, country: "Colombia", isCoastal: false },
  { name: "Cali", lat: 3.4516, lng: -76.5320, tier: 2, country: "Colombia", isCoastal: false },
  { name: "Barranquilla", lat: 10.9685, lng: -74.7813, tier: 2, country: "Colombia", isCoastal: true },
  { name: "Cartagena", lat: 10.3910, lng: -75.4794, tier: 3, country: "Colombia", isCoastal: true },
  { name: "Santiago", lat: -33.4489, lng: -70.6693, tier: 1, country: "Chile", isCoastal: false },
  { name: "Valparaíso", lat: -33.0472, lng: -71.6127, tier: 2, country: "Chile", isCoastal: true },
  { name: "Lima", lat: -12.0464, lng: -77.0428, tier: 1, country: "Peru", isCoastal: true },
  { name: "Cusco", lat: -13.5320, lng: -71.9675, tier: 3, country: "Peru", isCoastal: false },
  { name: "Montevideo", lat: -34.9011, lng: -56.1645, tier: 1, country: "Uruguay", isCoastal: true },
  { name: "Caracas", lat: 10.4806, lng: -66.9036, tier: 1, country: "Venezuela", isCoastal: true },
  { name: "Quito", lat: -0.1807, lng: -78.4678, tier: 1, country: "Ecuador", isCoastal: false },
  { name: "La Paz", lat: -16.5000, lng: -68.1193, tier: 1, country: "Bolivia", isCoastal: false },

  // --- EUROPE ---
  { name: "London", lat: 51.5074, lng: -0.1278, tier: 1, country: "UK", isCoastal: false },
  { name: "Manchester", lat: 53.4808, lng: -2.2426, tier: 2, country: "UK", isCoastal: false },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883, tier: 2, country: "UK", isCoastal: true },
  { name: "Paris", lat: 48.8566, lng: 2.3522, tier: 1, country: "France", isCoastal: false },
  { name: "Marseille", lat: 43.2965, lng: 5.3698, tier: 2, country: "France", isCoastal: true },
  { name: "Lyon", lat: 45.7640, lng: 4.8357, tier: 2, country: "France", isCoastal: false },
  { name: "Berlin", lat: 52.5200, lng: 13.4050, tier: 1, country: "Germany", isCoastal: false },
  { name: "Hamburg", lat: 53.5511, lng: 9.9937, tier: 2, country: "Germany", isCoastal: true },
  { name: "Frankfurt", lat: 50.1109, lng: 8.6821, tier: 2, country: "Germany", isCoastal: false },
  { name: "Munich", lat: 48.1351, lng: 11.5820, tier: 2, country: "Germany", isCoastal: false },
  { name: "Madrid", lat: 40.4168, lng: -3.7038, tier: 1, country: "Spain", isCoastal: false },
  { name: "Barcelona", lat: 41.3851, lng: 2.1734, tier: 2, country: "Spain", isCoastal: true },
  { name: "Rome", lat: 41.9028, lng: 12.4964, tier: 1, country: "Italy", isCoastal: false },
  { name: "Milan", lat: 45.4642, lng: 9.1900, tier: 2, country: "Italy", isCoastal: false },
  { name: "Naples", lat: 40.8518, lng: 14.2681, tier: 3, country: "Italy", isCoastal: true },
  { name: "Moscow", lat: 55.7558, lng: 37.6173, tier: 1, country: "Russia", isCoastal: false },
  { name: "St. Petersburg", lat: 59.9343, lng: 30.3351, tier: 1, country: "Russia", isCoastal: true },
  { name: "Novosibirsk", lat: 55.0084, lng: 82.9357, tier: 2, country: "Russia", isCoastal: false },
  { name: "Yekaterinburg", lat: 56.8389, lng: 60.6057, tier: 2, country: "Russia", isCoastal: false },
  { name: "Vladivostok", lat: 43.1198, lng: 131.8869, tier: 2, country: "Russia", isCoastal: true },
  { name: "Omsk", lat: 54.9924, lng: 73.3686, tier: 2, country: "Russia", isCoastal: false },
  { name: "Kazan", lat: 55.7961, lng: 49.1089, tier: 2, country: "Russia", isCoastal: false },
  { name: "Murmansk", lat: 68.9585, lng: 33.0827, tier: 3, country: "Russia", isCoastal: true },
  { name: "Archangel", lat: 64.5394, lng: 40.5433, tier: 3, country: "Russia", isCoastal: true },
  { name: "Kyiv", lat: 50.4501, lng: 30.5234, tier: 1, country: "Ukraine", isCoastal: false },
  { name: "Warsaw", lat: 52.2297, lng: 21.0122, tier: 1, country: "Poland", isCoastal: false },
  { name: "Istanbul", lat: 41.0082, lng: 28.9784, tier: 1, country: "Turkey", isCoastal: true },
  { name: "Ankara", lat: 39.9334, lng: 32.8597, tier: 2, country: "Turkey", isCoastal: false },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041, tier: 1, country: "Netherlands", isCoastal: true },
  { name: "Brussels", lat: 50.8503, lng: 4.3517, tier: 1, country: "Belgium", isCoastal: false },
  { name: "Vienna", lat: 48.2082, lng: 16.3738, tier: 1, country: "Austria", isCoastal: false },
  { name: "Zurich", lat: 47.3769, lng: 8.5417, tier: 2, country: "Switzerland", isCoastal: false },
  { name: "Stockholm", lat: 59.3293, lng: 18.0686, tier: 1, country: "Sweden", isCoastal: true },
  { name: "Gothenburg", lat: 57.7089, lng: 11.9746, tier: 2, country: "Sweden", isCoastal: true },
  { name: "Oslo", lat: 59.9139, lng: 10.7522, tier: 1, country: "Norway", isCoastal: true },
  { name: "Bergen", lat: 60.3913, lng: 5.3221, tier: 2, country: "Norway", isCoastal: true },
  { name: "Helsinki", lat: 60.1699, lng: 24.9384, tier: 1, country: "Finland", isCoastal: true },
  { name: "Copenhagen", lat: 55.6761, lng: 12.5683, tier: 1, country: "Denmark", isCoastal: true },
  { name: "Reykjavik", lat: 64.1466, lng: -21.9426, tier: 3, country: "Iceland", isCoastal: true },
  { name: "Athens", lat: 37.9838, lng: 23.7275, tier: 1, country: "Greece", isCoastal: true },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393, tier: 1, country: "Portugal", isCoastal: true },
  { name: "Dublin", lat: 53.3498, lng: -6.2603, tier: 1, country: "Ireland", isCoastal: true },

  // --- ASIA ---
  { name: "Beijing", lat: 39.9042, lng: 116.4074, tier: 1, country: "China", isCoastal: false },
  { name: "Shanghai", lat: 31.2304, lng: 121.4737, tier: 1, country: "China", isCoastal: true },
  { name: "Guangzhou", lat: 23.1291, lng: 113.2644, tier: 1, country: "China", isCoastal: true },
  { name: "Shenzhen", lat: 22.5431, lng: 114.0579, tier: 2, country: "China", isCoastal: true },
  { name: "Hong Kong", lat: 22.3193, lng: 114.1694, tier: 2, country: "China", isCoastal: true },
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, tier: 1, country: "Japan", isCoastal: true },
  { name: "Osaka", lat: 34.6937, lng: 135.5023, tier: 2, country: "Japan", isCoastal: true },
  { name: "Seoul", lat: 37.5665, lng: 126.9780, tier: 1, country: "South Korea", isCoastal: false },
  { name: "Busan", lat: 35.1796, lng: 129.0756, tier: 2, country: "South Korea", isCoastal: true },
  { name: "Mumbai", lat: 19.0760, lng: 72.8777, tier: 1, country: "India", isCoastal: true },
  { name: "Delhi", lat: 28.6139, lng: 77.2090, tier: 1, country: "India", isCoastal: false },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946, tier: 2, country: "India", isCoastal: false },
  { name: "Kolkata", lat: 22.5726, lng: 88.3639, tier: 2, country: "India", isCoastal: true },
  { name: "Jakarta", lat: -6.2088, lng: 106.8456, tier: 1, country: "Indonesia", isCoastal: true },
  { name: "Bangkok", lat: 13.7563, lng: 100.5018, tier: 1, country: "Thailand", isCoastal: true },
  { name: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297, tier: 1, country: "Vietnam", isCoastal: true },
  { name: "Hanoi", lat: 21.0285, lng: 105.8542, tier: 2, country: "Vietnam", isCoastal: false },
  { name: "Manila", lat: 14.5995, lng: 120.9842, tier: 1, country: "Philippines", isCoastal: true },
  { name: "Tehran", lat: 35.6892, lng: 51.3890, tier: 1, country: "Iran", isCoastal: false },
  { name: "Baghdad", lat: 33.3152, lng: 44.3661, tier: 2, country: "Iraq", isCoastal: false },
  { name: "Riyadh", lat: 24.7136, lng: 46.6753, tier: 1, country: "Saudi Arabia", isCoastal: false },
  { name: "Jeddah", lat: 21.5433, lng: 39.1728, tier: 2, country: "Saudi Arabia", isCoastal: true },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, tier: 2, country: "UAE", isCoastal: true },
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818, tier: 2, country: "Israel", isCoastal: true },
  { name: "Karachi", lat: 24.8607, lng: 67.0011, tier: 1, country: "Pakistan", isCoastal: true },
  { name: "Dhaka", lat: 23.8103, lng: 90.4125, tier: 1, country: "Bangladesh", isCoastal: false },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, tier: 1, country: "Singapore", isCoastal: true },
  { name: "Kuala Lumpur", lat: 3.1390, lng: 101.6869, tier: 1, country: "Malaysia", isCoastal: false },
  { name: "Taipei", lat: 25.0330, lng: 121.5654, tier: 1, country: "Taiwan", isCoastal: true },

  // --- AFRICA ---
  { name: "Cairo", lat: 30.0444, lng: 31.2357, tier: 1, country: "Egypt", isCoastal: false },
  { name: "Alexandria", lat: 31.2001, lng: 29.9187, tier: 2, country: "Egypt", isCoastal: true },
  { name: "Lagos", lat: 6.5244, lng: 3.3792, tier: 1, country: "Nigeria", isCoastal: true },
  { name: "Abuja", lat: 9.0765, lng: 7.3986, tier: 2, country: "Nigeria", isCoastal: false },
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473, tier: 1, country: "South Africa", isCoastal: false },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241, tier: 2, country: "South Africa", isCoastal: true },
  { name: "Nairobi", lat: -1.2921, lng: 36.8219, tier: 1, country: "Kenya", isCoastal: false },
  { name: "Casablanca", lat: 33.5731, lng: -7.5898, tier: 1, country: "Morocco", isCoastal: true },
  { name: "Algiers", lat: 36.7538, lng: 3.0588, tier: 2, country: "Algeria", isCoastal: true },
  { name: "Addis Ababa", lat: 9.0300, lng: 38.7400, tier: 1, country: "Ethiopia", isCoastal: false },
  { name: "Khartoum", lat: 15.5007, lng: 32.5599, tier: 2, country: "Sudan", isCoastal: false },
  { name: "Mogadishu", lat: 2.0469, lng: 45.3182, tier: 3, country: "Somalia", isCoastal: true },
  { name: "Dakar", lat: 14.7167, lng: -17.4677, tier: 2, country: "Senegal", isCoastal: true },
  { name: "Accra", lat: 5.6037, lng: -0.1870, tier: 2, country: "Ghana", isCoastal: true },
  { name: "Abidjan", lat: 5.3600, lng: -4.0083, tier: 2, country: "Ivory Coast", isCoastal: true },
  { name: "Kinshasa", lat: -4.4419, lng: 15.2663, tier: 1, country: "DRC", isCoastal: false },
  { name: "Luanda", lat: -8.8390, lng: 13.2894, tier: 2, country: "Angola", isCoastal: true },
  { name: "Dar es Salaam", lat: -6.7924, lng: 39.2083, tier: 2, country: "Tanzania", isCoastal: true },

  // --- OCEANIA ---
  { name: "Sydney", lat: -33.8688, lng: 151.2093, tier: 1, country: "Australia", isCoastal: true },
  { name: "Melbourne", lat: -37.8136, lng: 144.9631, tier: 1, country: "Australia", isCoastal: true },
  { name: "Brisbane", lat: -27.4698, lng: 153.0251, tier: 2, country: "Australia", isCoastal: true },
  { name: "Perth", lat: -31.9505, lng: 115.8605, tier: 2, country: "Australia", isCoastal: true },
  { name: "Auckland", lat: -36.8485, lng: 174.7633, tier: 1, country: "New Zealand", isCoastal: true },
  { name: "Wellington", lat: -41.2865, lng: 174.7762, tier: 2, country: "New Zealand", isCoastal: true },
];

const randomId = () => Math.random().toString(36).substr(2, 9);

// Export function to get cities for games
export const getMockCities = (): POI[] => {
  const cities: POI[] = GLOBAL_CITIES.map((city, idx) => {
    const defaultStats = POI_CONFIG[POIType.CITY];
    return {
      id: `CITY-${city.name.replace(/ /g, '').toUpperCase()}`,
      type: POIType.CITY,
      name: city.name,
      position: { lat: city.lat, lng: city.lng },
      ownerFactionId: undefined, // Start unclaimed - players/bots select, then remaining become NEUTRAL
      tier: city.tier || 3,
      isCoastal: city.isCoastal,
      hp: defaultStats.defaultHp,
      maxHp: defaultStats.defaultHp
    };
  });

  // Add OIL_RIG resources (in ocean areas)
  const oilRigLocations = [
    { name: "North Sea Platform", lat: 57.5, lng: 2.0 },
    { name: "Gulf of Mexico Alpha", lat: 26.0, lng: -93.0 },
    { name: "Gulf of Mexico Bravo", lat: 27.5, lng: -88.5 },
    { name: "Persian Gulf Rig", lat: 26.5, lng: 52.0 },
    { name: "Caspian Reserve", lat: 40.0, lng: 51.0 },
    { name: "South China Sea Rig", lat: 14.0, lng: 115.0 },
    { name: "North Atlantic", lat: 62.0, lng: -3.0 },
    { name: "Argentina Basin", lat: -45.0, lng: -60.0 },
    { name: "West Africa Offshore", lat: -5.0, lng: 10.0 },
    { name: "Alaska North Slope", lat: 70.0, lng: -150.0 },
    { name: "Barents Sea", lat: 72.0, lng: 35.0 },
    { name: "Timor Sea", lat: -11.0, lng: 125.0 },
    { name: "Bay of Bengal", lat: 15.0, lng: 88.0 },
    { name: "Mediterranean East", lat: 34.0, lng: 31.0 },
    { name: "Adriatic Platform", lat: 43.0, lng: 15.0 },
  ];

  const oilStats = POI_CONFIG[POIType.OIL_RIG];
  oilRigLocations.forEach((rig, idx) => {
    cities.push({
      id: `OIL-${idx}`,
      type: POIType.OIL_RIG,
      name: rig.name,
      position: { lat: rig.lat, lng: rig.lng },
      ownerFactionId: undefined,
      tier: 3,
      isCoastal: true,
      hp: oilStats.defaultHp,
      maxHp: oilStats.defaultHp
    });
  });

  // Add GOLD_MINE resources (on land, strategic locations)
  const goldMineLocations = [
    { name: "South African Mines", lat: -26.2, lng: 28.0 },
    { name: "Siberian Gold", lat: 62.0, lng: 130.0 },
    { name: "Nevada Reserves", lat: 40.0, lng: -117.0 },
    { name: "Australian Goldfields", lat: -31.0, lng: 121.0 },
    { name: "Andes Mines", lat: -21.0, lng: -68.0 },
    { name: "Canadian Shield", lat: 54.0, lng: -100.0 },
    { name: "Ghana Deposits", lat: 6.0, lng: -2.0 },
    { name: "Uzbekistan Sites", lat: 42.0, lng: 65.0 },
    { name: "Papua New Guinea", lat: -5.5, lng: 145.0 },
    { name: "Amazon Basin", lat: -3.0, lng: -52.0 },
    { name: "Mexican Sierra", lat: 24.0, lng: -106.0 },
    { name: "Ural Mountains", lat: 57.0, lng: 59.0 },
  ];

  const goldStats = POI_CONFIG[POIType.GOLD_MINE];
  goldMineLocations.forEach((mine, idx) => {
    cities.push({
      id: `GOLD-${idx}`,
      type: POIType.GOLD_MINE,
      name: mine.name,
      position: { lat: mine.lat, lng: mine.lng },
      ownerFactionId: undefined,
      tier: 3,
      isCoastal: false,
      hp: goldStats.defaultHp,
      maxHp: goldStats.defaultHp
    });
  });

  return cities;
};

export const fetchWorldData = async (centerLat: number, centerLng: number, radiusKm: number): Promise<{ units: GameUnit[], pois: POI[], factions: Faction[] }> => {
  const units: GameUnit[] = [];
  const pois: POI[] = [];
  const factions: Faction[] = [];

  // 1. Generate Factions
  factions.push({
    id: 'PLAYER',
    name: 'Global Command (You)',
    color: '#3b82f6',
    type: 'PLAYER',
    gold: 50000, // HIGH STARTING RESOURCES
    oil: 10000,
    relations: {}
  });

  factions.push({
    id: 'NEUTRAL',
    name: 'Civilian Traffic',
    color: '#94a3b8',
    type: 'NEUTRAL',
    gold: 0,
    oil: 0,
    relations: { 'PLAYER': 0 }
  });

  // CHAOS MODE: 40 AI FACTIONS (Massive Density)
  const aiCount = 40;
  for (let i = 0; i < aiCount; i++) {
    const preset = FACTION_PRESETS[i + 1] || { name: `Warlord ${i}`, color: `#${Math.floor(Math.random() * 16777215).toString(16)}` };
    const id = `AI_${i}`;

    factions.push({
      id: id,
      name: preset.name,
      color: preset.color,
      type: 'AI',
      gold: 50000, // HIGH STARTING RESOURCES
      oil: 10000,
      relations: { 'PLAYER': -50 }, // Dislike player by default
      aggression: 0.8 + Math.random() * 0.2, // VERY AGGRESSIVE (0.8 - 1.0)
      lastAiUpdate: 0,
      maxUnits: 100
    });
  }

  // RIVALRY SYSTEM: Assign a NEMESIS
  // Each AI hates one other specific AI with passion (-100)
  const aiFactions = factions.filter(f => f.type === 'AI');
  aiFactions.forEach((f1, idx) => {
    // Pick a random enemy that isn't self
    let targetIdx = (idx + 1) % aiFactions.length; // Circular rivalry chain A->B->C->A
    const nemesis = aiFactions[targetIdx];

    f1.relations[nemesis.id] = -100; // TOTAL WAR
    nemesis.relations[f1.id] = -100; // Mutual hatred

    // Randomize others
    aiFactions.forEach(f2 => {
      if (f1.id === f2.id || f2.id === nemesis.id) return;
      // Chaotic relations: -50 to +20
      f1.relations[f2.id] = Math.floor(Math.random() * 70) - 50;
    });
  });

  // 2. Load ALL Cities (HIGH OCCUPANCY)
  // Shuffle cities to randomize start locations
  const shuffledCities = [...GLOBAL_CITIES].sort(() => Math.random() - 0.5);
  const assignedCities = new Set<string>();

  // A. Assign 1 HQ per faction first (Guaranteed Start)
  factions.forEach(f => {
    if (f.id === 'NEUTRAL') return;

    // Find a city not yet assigned
    const cityData = shuffledCities.find(c => !assignedCities.has(c.name));
    if (cityData) {
      assignedCities.add(cityData.name);

      const defaultStats = POI_CONFIG[POIType.CITY];
      pois.push({
        id: `CITY-${cityData.name.replace(/ /g, '').toUpperCase()}`,
        type: POIType.CITY,
        name: cityData.name,
        position: { lat: cityData.lat, lng: cityData.lng },
        ownerFactionId: f.id, // OWNED BY FACTION
        tier: 3, // HQ is Tier 3
        isCoastal: cityData.isCoastal,
        hp: 5000, // Strong HQ
        maxHp: 5000
      });
    }
  });

  // B. Assign remaining cities to factions (30% Occupied, 70% NEUTRAL for defenders)
  shuffledCities.forEach(city => {
    if (assignedCities.has(city.name)) return;

    let ownerId = 'NEUTRAL';
    // 30% chance to be owned by a random AI (leaves 70% for neutral city defenders)
    if (Math.random() < 0.3) {
      const randomAI = aiFactions[Math.floor(Math.random() * aiFactions.length)];
      ownerId = randomAI.id;
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

  // REMOVED RANDOM FILLER CITIES LOOP

  // 3. Generate Oil Rigs & Gold Mines
  const oilCount = 50;
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

  const goldCount = 60; // Lots of gold mines
  for (let i = 0; i < goldCount; i++) {
    const stats = POI_CONFIG[POIType.GOLD_MINE];
    pois.push({
      id: `GOLD-${randomId()}`,
      type: POIType.GOLD_MINE,
      name: `MINE-${Math.floor(Math.random() * 999)}`,
      position: { lat: (Math.random() * 120) - 60, lng: (Math.random() * 360) - 180 },
      ownerFactionId: 'NEUTRAL',
      tier: 2,
      hp: stats.defaultHp,
      maxHp: stats.defaultHp
    });
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
      callsign: isPlane ? `FLT${Math.floor(Math.random() * 9000)}` : `VSSL${Math.floor(Math.random() * 9000)}`,
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
