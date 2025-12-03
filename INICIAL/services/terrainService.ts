
import { POI, POIType, UnitClass } from "../types";

// Since we lack a geo-server, we use heuristics based on City data.
// - Close to ANY city = Land
// - Close to Coastal city = Coast
// - Far from any city = Ocean (Approximation)

const LAND_PROXIMITY_KM = 300; // Assumed land radius around major cities
const COAST_PROXIMITY_KM = 50;

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const TerrainService = {
    getTerrainType: (lat: number, lng: number, pois: POI[]): 'LAND' | 'OCEAN' | 'COAST' => {
        let minDist = Infinity;
        let nearestCity: POI | null = null;

        for (const poi of pois) {
            if (poi.type !== POIType.CITY) continue;
            const dist = getDistanceKm(lat, lng, poi.position.lat, poi.position.lng);
            if (dist < minDist) {
                minDist = dist;
                nearestCity = poi;
            }
        }

        if (!nearestCity) return 'OCEAN';
        
        if (minDist < COAST_PROXIMITY_KM && nearestCity.isCoastal) return 'COAST';
        if (minDist < LAND_PROXIMITY_KM) return 'LAND';
        
        return 'OCEAN';
    },

    isValidPlacement: (unitClass: UnitClass, lat: number, lng: number, pois: POI[]): boolean => {
        const terrain = TerrainService.getTerrainType(lat, lng, pois);
        
        if (unitClass === UnitClass.PORT) {
            return terrain === 'COAST' || terrain === 'OCEAN'; // Ports need water access
        }
        if (unitClass === UnitClass.AIRBASE || unitClass === UnitClass.MILITARY_BASE) {
            return terrain === 'LAND' || terrain === 'COAST'; // Bases need land
        }
        return true;
    },

    isValidMove: (unitClass: UnitClass, lat: number, lng: number, pois: POI[]): boolean => {
        const terrain = TerrainService.getTerrainType(lat, lng, pois);
        
        // Sea Units
        if ([UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.BATTLESHIP, UnitClass.AIRCRAFT_CARRIER, UnitClass.SUBMARINE, UnitClass.PATROL_BOAT].includes(unitClass)) {
             return terrain === 'OCEAN' || terrain === 'COAST';
        }
        
        // Land Units
        if ([UnitClass.GROUND_TANK, UnitClass.INFANTRY, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER, UnitClass.MOBILE_COMMAND_CENTER].includes(unitClass)) {
            return terrain === 'LAND' || terrain === 'COAST';
        }

        // Air units fly everywhere
        return true;
    }
};