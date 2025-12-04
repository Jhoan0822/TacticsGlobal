import { POI, POIType, UnitClass, GameUnit } from "../types";
import * as d3 from 'd3';
import { isPointInFactionTerritory } from './territoryService';

// Cache for the GeoJSON data
let worldGeoJson: any = null;
let isLoading = false;

// CACHE & OPTIMIZATION
// We use a Canvas to rasterize the world map for O(1) terrain lookups
const TERRAIN_WIDTH = 2048;
const TERRAIN_HEIGHT = 1024;
let terrainCtx: CanvasRenderingContext2D | null = null;

// Spatial Cache
const landCache = new Map<string, boolean>();
const terrainTypeCache = new Map<string, 'LAND' | 'OCEAN' | 'COAST'>();

// Round coordinates to ~1km precision for caching (0.01 degrees)
const CACHE_PRECISION = 100; // 2 decimal places
const getCacheKey = (lat: number, lng: number) => {
    return `${Math.round(lat * CACHE_PRECISION)},${Math.round(lng * CACHE_PRECISION)}`;
};

// Load the GeoJSON once
const loadGeoJson = async () => {
    if (worldGeoJson || isLoading) return;
    isLoading = true;
    try {
        const response = await fetch('/world.geojson');
        if (response.ok) {
            const rawData = await response.json();

            // Filter out features that contain [0,0] (Null Island - Ocean)
            if (rawData.type === 'FeatureCollection' && Array.isArray(rawData.features)) {
                rawData.features = rawData.features.filter((feature: any) => {
                    return !d3.geoContains(feature, [0, 0]);
                });
            }

            worldGeoJson = rawData;

            // RASTERIZE TO CANVAS
            const canvas = document.createElement('canvas');
            canvas.width = TERRAIN_WIDTH;
            canvas.height = TERRAIN_HEIGHT;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
                ctx.fillStyle = '#000000'; // Ocean
                ctx.fillRect(0, 0, TERRAIN_WIDTH, TERRAIN_HEIGHT);

                ctx.fillStyle = '#FFFFFF'; // Land

                // D3 Projection to map GeoJSON to Canvas
                const projection = d3.geoEquirectangular()
                    .fitSize([TERRAIN_WIDTH, TERRAIN_HEIGHT], worldGeoJson);

                const path = d3.geoPath().projection(projection).context(ctx);

                ctx.beginPath();
                path(worldGeoJson);
                ctx.fill();

                terrainCtx = ctx;
                console.log("Terrain Rasterized for O(1) Lookup");
            }

            console.log("Terrain Data Loaded & Filtered");
        } else {
            console.error("Failed to load terrain data");
        }
    } catch (e) {
        console.error("Error loading terrain data", e);
    } finally {
        isLoading = false;
    }
};

// Trigger load immediately
loadGeoJson();

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const TerrainService = {
    // ASYNC INIT CHECK
    isReady: () => !!worldGeoJson,
    getWorldData: () => worldGeoJson,

    // Helper to check if a point is Land using Raster Lookup
    isPointLand: (lat: number, lng: number): boolean => {
        if (!terrainCtx) return false;

        const x = Math.floor((lng + 180) * (TERRAIN_WIDTH / 360));
        const y = Math.floor((90 - lat) * (TERRAIN_HEIGHT / 180));

        const safeX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, x));
        const safeY = Math.max(0, Math.min(TERRAIN_HEIGHT - 1, y));

        const pixel = terrainCtx.getImageData(safeX, safeY, 1, 1).data;
        return pixel[0] > 128;
    },

    getTerrainType: (lat: number, lng: number, pois: POI[]): 'LAND' | 'OCEAN' | 'COAST' => {
        const key = getCacheKey(lat, lng);
        if (terrainTypeCache.has(key)) return terrainTypeCache.get(key)!;

        if (!worldGeoJson) {
            let minDist = Infinity;
            for (const poi of pois) {
                if (poi.type !== POIType.CITY) continue;
                const dist = getDistanceKm(lat, lng, poi.position.lat, poi.position.lng);
                if (dist < minDist) minDist = dist;
            }
            return minDist < 300 ? 'LAND' : 'OCEAN';
        }

        const isLand = TerrainService.isPointLand(lat, lng);

        const offset = 0.1;
        const neighbors = [
            TerrainService.isPointLand(lat + offset, lng),
            TerrainService.isPointLand(lat - offset, lng),
            TerrainService.isPointLand(lat, lng + offset),
            TerrainService.isPointLand(lat, lng - offset)
        ];

        const hasLandNeighbor = neighbors.some(n => n);
        const hasOceanNeighbor = neighbors.some(n => !n);

        let result: 'LAND' | 'OCEAN' | 'COAST' = isLand ? 'LAND' : 'OCEAN';
        if (hasLandNeighbor && hasOceanNeighbor) {
            result = 'COAST';
        }

        terrainTypeCache.set(key, result);
        return result;
    },

    isValidPlacement: (unitClass: UnitClass, lat: number, lng: number, pois: POI[],
        playerUnits?: GameUnit[],
        playerId?: string): boolean => {
        const terrain = TerrainService.getTerrainType(lat, lng, pois);

        // TERRAIN CHECK
        if (unitClass === UnitClass.PORT) {
            if (terrain !== 'COAST' && terrain !== 'OCEAN') {
                console.log('[PLACEMENT] Port rejected - not coastal/ocean');
                return false;
            }
        }
        if (unitClass === UnitClass.AIRBASE || unitClass === UnitClass.MILITARY_BASE) {
            if (terrain !== 'LAND' && terrain !== 'COAST') {
                console.log('[PLACEMENT] Structure rejected - not land/coast');
                return false;
            }
        }

        // CONTROL AREA CHECK - Must be inside EXACT Voronoi polygon territory
        if (playerId && playerUnits) {
            const inTerritory = isPointInFactionTerritory(lat, lng, playerId, pois, playerUnits);

            if (!inTerritory) {
                console.log('[PLACEMENT] Structure rejected - not in faction Voronoi territory');
                return false;
            }
        }

        return true;
    },

    isValidMove: (unitClass: UnitClass, lat: number, lng: number, pois: POI[]): boolean => {
        const terrain = TerrainService.getTerrainType(lat, lng, pois);

        // Sea Units
        if ([UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.BATTLESHIP, UnitClass.AIRCRAFT_CARRIER, UnitClass.SUBMARINE, UnitClass.PATROL_BOAT, UnitClass.MINELAYER].includes(unitClass)) {
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