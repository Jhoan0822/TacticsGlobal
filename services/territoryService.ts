// Territory Service - Shared Voronoi calculation for territory and placement validation
import * as d3 from 'd3';
import { POI, GameUnit, UnitClass, POIType } from '../types';
import { TERRITORY_CONFIG } from '../constants';

const MAX_LAT = 85.05112878;
const SVG_SIZE = 4096;

export interface Site {
    id: string;
    lat: number;
    lng: number;
    factionId: string;
    radius: number;
    x?: number;
    y?: number;
}

export interface VoronoiCell {
    id: string;
    polygon: [number, number][]; // Array of [lat, lng]
    site: Site;
    factionId: string;
}

// Point-in-polygon check using ray casting algorithm
const isPointInPolygon = (lat: number, lng: number, polygon: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [yi, xi] = polygon[i]; // [lat, lng]
        const [yj, xj] = polygon[j];

        if (((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
};

// Calculate Voronoi cells for all sites
export const calculateVoronoiCells = (pois: POI[], units: GameUnit[]): VoronoiCell[] => {
    const sites: Site[] = [];

    // Generate sites from POIs (cities, oil rigs, gold mines)
    pois.forEach(p => {
        if (!p.ownerFactionId || p.ownerFactionId === 'NEUTRAL') return;

        let r = TERRITORY_CONFIG.CITY_TIER_3_RADIUS;
        if (p.tier === 1) r = TERRITORY_CONFIG.CITY_TIER_1_RADIUS;
        else if (p.tier === 2) r = TERRITORY_CONFIG.CITY_TIER_2_RADIUS;
        else if (p.type === POIType.OIL_RIG) r = TERRITORY_CONFIG.OIL_RIG_RADIUS;

        sites.push({
            id: p.id,
            lat: p.position.lat,
            lng: p.position.lng,
            factionId: p.ownerFactionId,
            radius: r
        });
    });

    // Add HQs as Sites
    units.filter(u =>
        (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER) &&
        u.hp > 0 &&
        u.factionId !== 'NEUTRAL'
    ).forEach(u => {
        sites.push({
            id: u.id,
            lat: u.position.lat,
            lng: u.position.lng,
            factionId: u.factionId,
            radius: TERRITORY_CONFIG.HQ_RADIUS
        });
    });

    if (sites.length < 1) return [];

    // Projection for calculation (Mercator)
    const projection = d3.geoMercator()
        .scale(SVG_SIZE / (2 * Math.PI))
        .translate([SVG_SIZE / 2, SVG_SIZE / 2]);

    const projectedSites = sites.map(s => {
        const safeLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, s.lat));
        const [x, y] = projection([s.lng, safeLat]) || [0, 0];
        return { ...s, x, y };
    });

    const delaunay = d3.Delaunay.from(projectedSites.map(s => [s.x!, s.y!]));
    const voronoi = delaunay.voronoi([0, 0, SVG_SIZE, SVG_SIZE]);

    const cells: VoronoiCell[] = [];

    for (let i = 0; i < projectedSites.length; i++) {
        const site = projectedSites[i];
        const polygonCoords = voronoi.cellPolygon(i);
        if (!polygonCoords) continue;

        // Convert back to LatLng
        const latLngPolygon: [number, number][] = polygonCoords.map(([x, y]) => {
            const coords = projection.invert!([x, y]);
            return [coords![1], coords![0]] as [number, number]; // [lat, lng]
        });

        cells.push({
            id: site.id,
            polygon: latLngPolygon,
            site: site,
            factionId: site.factionId
        });
    }

    return cells;
};

// Check if a point is inside any of the faction's Voronoi cells
export const isPointInFactionTerritory = (
    lat: number,
    lng: number,
    factionId: string,
    pois: POI[],
    units: GameUnit[]
): boolean => {
    const cells = calculateVoronoiCells(pois, units);

    // Filter to only this faction's cells
    const factionCells = cells.filter(c => c.factionId === factionId);

    // Check if point is inside any of the faction's polygons
    return factionCells.some(cell => isPointInPolygon(lat, lng, cell.polygon));
};
