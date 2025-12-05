import { POI, POIType, UnitClass, GameUnit } from "../types";
import * as d3 from 'd3';
import { isPointInFactionTerritory } from './territoryService';

// Cache for the GeoJSON data
let worldGeoJson: any = null;
let isLoading = false;

// CACHE & OPTIMIZATION - HIGHER RESOLUTION
const TERRAIN_WIDTH = 4096;
const TERRAIN_HEIGHT = 2048;
let terrainCtx: CanvasRenderingContext2D | null = null;

// Spatial Cache
const terrainTypeCache = new Map<string, 'LAND' | 'OCEAN' | 'COAST'>();

const CACHE_PRECISION = 100;
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

            if (rawData.type === 'FeatureCollection' && Array.isArray(rawData.features)) {
                rawData.features = rawData.features.filter((feature: any) => {
                    return !d3.geoContains(feature, [0, 0]);
                });
            }

            worldGeoJson = rawData;

            const canvas = document.createElement('canvas');
            canvas.width = TERRAIN_WIDTH;
            canvas.height = TERRAIN_HEIGHT;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
                ctx.fillStyle = '#000000';
                ctx.fillRect(0, 0, TERRAIN_WIDTH, TERRAIN_HEIGHT);
                ctx.fillStyle = '#FFFFFF';

                const projection = d3.geoEquirectangular()
                    .fitSize([TERRAIN_WIDTH, TERRAIN_HEIGHT], worldGeoJson);
                const path = d3.geoPath().projection(projection).context(ctx);

                ctx.beginPath();
                path(worldGeoJson);
                ctx.fill();

                terrainCtx = ctx;
                console.log("Terrain Rasterized @ 4096x2048");
            }
        }
    } catch (e) {
        console.error("Error loading terrain data", e);
    } finally {
        isLoading = false;
    }
};

loadGeoJson();

const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const TerrainService = {
    isReady: () => !!worldGeoJson,
    getWorldData: () => worldGeoJson,

    isPointLand: (lat: number, lng: number): boolean => {
        if (terrainCtx) {
            const x = Math.floor((lng + 180) * (TERRAIN_WIDTH / 360));
            const y = Math.floor((90 - lat) * (TERRAIN_HEIGHT / 180));
            const safeX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, x));
            const safeY = Math.max(0, Math.min(TERRAIN_HEIGHT - 1, y));
            const pixel = terrainCtx.getImageData(safeX, safeY, 1, 1).data;
            return pixel[0] > 128;
        }
        if (worldGeoJson) {
            return d3.geoContains(worldGeoJson, [lng, lat]);
        }
        return false;
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
        const offset = 0.08;
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

    clearCache: () => terrainTypeCache.clear(),

    // Check if point is near coastline (within ~30km)
    isNearCoast: (lat: number, lng: number): boolean => {
        const offset = 0.27;
        const centerIsLand = TerrainService.isPointLand(lat, lng);

        const samples = [
            TerrainService.isPointLand(lat + offset, lng),
            TerrainService.isPointLand(lat - offset, lng),
            TerrainService.isPointLand(lat, lng + offset),
            TerrainService.isPointLand(lat, lng - offset),
            TerrainService.isPointLand(lat + offset * 0.7, lng + offset * 0.7),
            TerrainService.isPointLand(lat - offset * 0.7, lng + offset * 0.7),
            TerrainService.isPointLand(lat + offset * 0.7, lng - offset * 0.7),
            TerrainService.isPointLand(lat - offset * 0.7, lng - offset * 0.7)
        ];

        if (centerIsLand) {
            return samples.some(s => !s);
        } else {
            return samples.some(s => s);
        }
    },

    isValidPlacement: (unitClass: UnitClass, lat: number, lng: number, pois: POI[],
        playerUnits?: GameUnit[],
        playerId?: string): boolean => {

        if (unitClass === UnitClass.PORT) {
            const nearCoast = TerrainService.isNearCoast(lat, lng);
            if (!nearCoast) {
                console.log('[PLACEMENT] Port rejected - not within 30km of coastline');
                return false;
            }
        }

        if (unitClass === UnitClass.AIRBASE || unitClass === UnitClass.MILITARY_BASE) {
            const terrain = TerrainService.getTerrainType(lat, lng, pois);
            if (terrain === 'OCEAN') {
                console.log('[PLACEMENT] Structure rejected - terrain: OCEAN');
                return false;
            }
        }

        if (playerId && playerUnits) {
            const inTerritory = isPointInFactionTerritory(lat, lng, playerId, pois, playerUnits);
            if (!inTerritory) {
                console.log('[PLACEMENT] Structure rejected - not in faction territory');
                return false;
            }
        }

        return true;
    },

    isValidMove: (unitClass: UnitClass, lat: number, lng: number, pois: POI[]): boolean => {
        const terrain = TerrainService.getTerrainType(lat, lng, pois);

        if ([UnitClass.DESTROYER, UnitClass.FRIGATE, UnitClass.BATTLESHIP, UnitClass.AIRCRAFT_CARRIER, UnitClass.SUBMARINE, UnitClass.PATROL_BOAT, UnitClass.MINELAYER].includes(unitClass)) {
            return terrain === 'OCEAN' || terrain === 'COAST';
        }

        if ([UnitClass.GROUND_TANK, UnitClass.INFANTRY, UnitClass.MISSILE_LAUNCHER, UnitClass.SAM_LAUNCHER, UnitClass.MOBILE_COMMAND_CENTER].includes(unitClass)) {
            return terrain === 'LAND' || terrain === 'COAST';
        }

        return true;
    },

    // Find nearest water point for naval unit spawning
    findNearestWater: (lat: number, lng: number): { lat: number, lng: number } => {
        if (!TerrainService.isPointLand(lat, lng)) {
            return { lat, lng };
        }

        const steps = [0.05, 0.1, 0.15, 0.2, 0.3];
        const angles = [0, 45, 90, 135, 180, 225, 270, 315];

        for (const step of steps) {
            for (const angle of angles) {
                const radians = angle * Math.PI / 180;
                const testLat = lat + step * Math.cos(radians);
                const testLng = lng + step * Math.sin(radians);

                if (!TerrainService.isPointLand(testLat, testLng)) {
                    return { lat: testLat, lng: testLng };
                }
            }
        }

        return { lat, lng };
    },

    debugTerrain: (lat: number, lng: number, pois: POI[]) => {
        const isLand = TerrainService.isPointLand(lat, lng);
        const terrain = TerrainService.getTerrainType(lat, lng, pois);
        const nearCoast = TerrainService.isNearCoast(lat, lng);
        console.log(`[TERRAIN] lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)} | land=${isLand} | type=${terrain} | nearCoast=${nearCoast}`);
        return { isLand, terrain, nearCoast };
    }
};