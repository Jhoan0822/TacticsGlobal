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
            // Normalize longitude to -180 to 180 range
            let normLng = lng;
            while (normLng > 180) normLng -= 360;
            while (normLng < -180) normLng += 360;

            // Clamp latitude to valid range
            const normLat = Math.max(-85, Math.min(85, lat));

            // Convert to canvas coordinates using equirectangular projection
            const x = Math.floor((normLng + 180) * (TERRAIN_WIDTH / 360));
            const y = Math.floor((90 - normLat) * (TERRAIN_HEIGHT / 180));

            // Ensure we're within canvas bounds
            const safeX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, x));
            const safeY = Math.max(0, Math.min(TERRAIN_HEIGHT - 1, y));

            try {
                const pixel = terrainCtx.getImageData(safeX, safeY, 1, 1).data;
                return pixel[0] > 128;
            } catch (e) {
                console.warn('[TERRAIN] Failed to read pixel at', safeX, safeY);
                return false;
            }
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

        // IMPROVED: Use 8-direction sampling with larger offset (~13km instead of ~9km)
        const offset = 0.12;
        const diagonalOffset = offset * 0.707; // cos(45°)

        const neighbors = [
            TerrainService.isPointLand(lat + offset, lng),           // N
            TerrainService.isPointLand(lat - offset, lng),           // S
            TerrainService.isPointLand(lat, lng + offset),           // E
            TerrainService.isPointLand(lat, lng - offset),           // W
            TerrainService.isPointLand(lat + diagonalOffset, lng + diagonalOffset),  // NE
            TerrainService.isPointLand(lat + diagonalOffset, lng - diagonalOffset),  // NW
            TerrainService.isPointLand(lat - diagonalOffset, lng + diagonalOffset),  // SE
            TerrainService.isPointLand(lat - diagonalOffset, lng - diagonalOffset)   // SW
        ];

        const landCount = neighbors.filter(n => n).length;
        const oceanCount = neighbors.filter(n => !n).length;

        let result: 'LAND' | 'OCEAN' | 'COAST';

        // Determine terrain type based on current point and neighbors
        if (isLand) {
            // If center is land but has any ocean neighbors, it's coast
            result = oceanCount > 0 ? 'COAST' : 'LAND';
        } else {
            // If center is ocean but has any land neighbors, it's coast
            result = landCount > 0 ? 'COAST' : 'OCEAN';
        }

        terrainTypeCache.set(key, result);
        return result;
    },

    clearCache: () => terrainTypeCache.clear(),

    // Limit cache size to prevent memory leaks during long sessions
    _limitCacheSize: () => {
        if (terrainTypeCache.size > 10000) {
            // Clear oldest half of entries
            const entriesToDelete = Array.from(terrainTypeCache.keys()).slice(0, 5000);
            entriesToDelete.forEach(key => terrainTypeCache.delete(key));
        }
    },

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
    // IMPROVED: Larger search radius and validates terrain type
    findNearestWater: (lat: number, lng: number, pois: POI[] = []): { lat: number, lng: number } => {
        // If already in water (OCEAN or COAST), return current position
        if (!TerrainService.isPointLand(lat, lng)) {
            return { lat, lng };
        }

        // Extended search radius for better water finding
        const steps = [0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
        const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

        let bestWaterPoint: { lat: number; lng: number } | null = null;
        let bestDistance = Infinity;

        for (const step of steps) {
            for (const angle of angles) {
                const radians = angle * Math.PI / 180;
                const testLat = lat + step * Math.cos(radians);
                const testLng = lng + step * Math.sin(radians);

                // Check if this point is water
                if (!TerrainService.isPointLand(testLat, testLng)) {
                    // Prefer pure OCEAN over COAST for naval units
                    const terrainType = TerrainService.getTerrainType(testLat, testLng, pois);
                    if (terrainType === 'OCEAN' || terrainType === 'COAST') {
                        const dist = step;
                        if (dist < bestDistance) {
                            bestDistance = dist;
                            bestWaterPoint = { lat: testLat, lng: testLng };
                            // If we found OCEAN (not coast), prefer it and stop early
                            if (terrainType === 'OCEAN') {
                                console.log(`[TERRAIN] Found water at distance ${(step * 111).toFixed(1)}km, type: ${terrainType}`);
                                return bestWaterPoint;
                            }
                        }
                    }
                }
            }
            // If we found any water point at this step level, return it
            if (bestWaterPoint) {
                console.log(`[TERRAIN] Found water (coast) at distance ${(bestDistance * 111).toFixed(1)}km`);
                return bestWaterPoint;
            }
        }

        console.warn('[TERRAIN] No water found within search radius!');
        return { lat, lng };
    },

    /**
     * Find the nearest coast point (water adjacent to land) for port placement.
     * Player clicks on land near coast → returns the nearest water point on the coastline.
     * @param lat Click latitude
     * @param lng Click longitude
     * @param maxRangeKm Maximum search radius in km (default ~30km)
     * @returns Coast point coordinates or null if no coast found nearby
     */
    findNearestCoastPoint: (lat: number, lng: number, maxRangeKm: number = 30): { lat: number, lng: number } | null => {
        // Convert km to degrees (approximate: 1 degree ≈ 111km)
        const maxRangeDeg = maxRangeKm / 111;

        // Step sizes for search (degrees) - roughly 2km, 5km, 10km, 15km, 20km, 25km, 30km
        const steps = [0.02, 0.05, 0.1, 0.15, 0.2, 0.25, maxRangeDeg];
        // 16 directions for finer search
        const angles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];

        // Track best coast point found (closest to original click)
        let bestPoint: { lat: number, lng: number } | null = null;
        let bestDist = Infinity;

        for (const step of steps) {
            for (const angle of angles) {
                const radians = angle * Math.PI / 180;
                const testLat = lat + step * Math.cos(radians);
                const testLng = lng + step * Math.sin(radians);

                // Check if this point is in water
                if (TerrainService.isPointLand(testLat, testLng)) {
                    continue; // Skip land points
                }

                // Check if this water point is adjacent to land (= coastline)
                const adjacentOffset = 0.015; // ~1.5km check for adjacent land
                const hasAdjacentLand =
                    TerrainService.isPointLand(testLat + adjacentOffset, testLng) ||
                    TerrainService.isPointLand(testLat - adjacentOffset, testLng) ||
                    TerrainService.isPointLand(testLat, testLng + adjacentOffset) ||
                    TerrainService.isPointLand(testLat, testLng - adjacentOffset);

                if (hasAdjacentLand) {
                    // This is a coast point! Check if it's the closest one
                    const dist = Math.sqrt(Math.pow(testLat - lat, 2) + Math.pow(testLng - lng, 2));
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPoint = { lat: testLat, lng: testLng };
                    }
                }
            }

            // If we found a coast point at this step level, return it
            // (no need to search further - we want the closest)
            if (bestPoint) {
                console.log(`[TERRAIN] Found coast point at distance ${(bestDist * 111).toFixed(1)}km from click`);
                return bestPoint;
            }
        }

        console.log('[TERRAIN] No coast point found within range');
        return null;
    },

    debugTerrain: (lat: number, lng: number, pois: POI[]) => {
        const isLand = TerrainService.isPointLand(lat, lng);
        const terrain = TerrainService.getTerrainType(lat, lng, pois);
        const nearCoast = TerrainService.isNearCoast(lat, lng);
        console.log(`[TERRAIN] lat=${lat.toFixed(4)}, lng=${lng.toFixed(4)} | land=${isLand} | type=${terrain} | nearCoast=${nearCoast}`);
        return { isLand, terrain, nearCoast };
    }
};