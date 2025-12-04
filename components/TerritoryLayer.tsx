import React, { useMemo, useState, useRef } from 'react';
import { SVGOverlay, useMap, useMapEvents } from 'react-leaflet';
import * as d3 from 'd3';
import L from 'leaflet';
import { GameUnit, Faction, POI, UnitClass } from '../types';
import { TERRITORY_CONFIG } from '../constants';

interface Props {
    units: GameUnit[];
    pois: POI[];
    factions: Faction[];
}

interface Site {
    id: string;
    lat: number;
    lng: number;
    factionId: string;
    radius: number;
}

interface CachedGeometry {
    id: string;
    d: string; // Voronoi Path Data
    gradientId: string;
    cx: number;
    cy: number;
    rUnits: number;
    factionColor: string;
}

const MAX_LAT = 85.05112878;
const SVG_SIZE = 4096;

const TerritoryLayer: React.FC<Props> = ({ units, pois, factions }) => {
    const map = useMap();
    // REMOVED: const [zoom, setZoom] = useState(map.getZoom());
    // REMOVED: useMapEvents({ zoom: ... });

    const bounds = [[-MAX_LAT, -180], [MAX_LAT, 180]] as L.LatLngBoundsExpression;

    // Extract HQs for Voronoi (Memoized to avoid breaking useMemo below)
    const hqs = useMemo(() => units.filter(u =>
        (u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER) && u.hp > 0
    ), [units]);

    // Throttle the heavy Voronoi calculation (max 5 times per second)
    const { geometry, defs } = useMemo(() => {
        const sites: Site[] = [];

        // GENERATE SITES FROM CITIES ONLY (plus HQ)
        pois.forEach(p => {
            let r = TERRITORY_CONFIG.CITY_TIER_3_RADIUS;
            if (p.tier === 1) r = TERRITORY_CONFIG.CITY_TIER_1_RADIUS;
            else if (p.tier === 2) r = TERRITORY_CONFIG.CITY_TIER_2_RADIUS;
            else if (p.type === 'OIL_RIG') r = TERRITORY_CONFIG.OIL_RIG_RADIUS;

            sites.push({
                id: p.id,
                lat: p.position.lat,
                lng: p.position.lng,
                factionId: p.ownerFactionId,
                radius: r
            });
        });

        // Add HQs as Sites
        hqs.forEach(u => {
            sites.push({
                id: u.id,
                lat: u.position.lat,
                lng: u.position.lng,
                factionId: u.factionId,
                radius: TERRITORY_CONFIG.HQ_RADIUS
            });
        });

        if (sites.length < 1) return { geometry: [], defs: [] };

        const projection = d3.geoMercator()
            .scale(SVG_SIZE / (2 * Math.PI))
            .translate([SVG_SIZE / 2, SVG_SIZE / 2]);

        const projectedSites = sites.map(s => {
            const safeLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, s.lat));
            const [x, y] = projection([s.lng, safeLat]) || [0, 0];

            const latRad = safeLat * Math.PI / 180;
            const distortion = 1 / Math.cos(latRad);

            const unitsPerDegree = SVG_SIZE / 360;
            const rUnits = s.radius * unitsPerDegree * distortion;

            return { ...s, x, y, rUnits };
        });

        const delaunay = d3.Delaunay.from(projectedSites.map(s => [s.x, s.y]));
        const voronoi = delaunay.voronoi([0, 0, SVG_SIZE, SVG_SIZE]);

        const generatedGeometry: CachedGeometry[] = [];
        const generatedDefs: React.ReactNode[] = [];

        for (let i = 0; i < projectedSites.length; i++) {
            const site = projectedSites[i];
            const faction = factions.find(f => f.id === site.factionId);

            if (!faction || site.factionId === 'NEUTRAL') continue;

            const gradientId = `grad-${site.id}`;
            const gradientRadius = 600;

            generatedDefs.push(
                <radialGradient key={gradientId} id={gradientId} cx={site.x} cy={site.y} r={gradientRadius} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={faction.color} stopOpacity={0.7} />
                    <stop offset="15%" stopColor={faction.color} stopOpacity={0.4} />
                    <stop offset="40%" stopColor={faction.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={faction.color} stopOpacity={0.05} />
                </radialGradient>
            );

            generatedGeometry.push({
                id: site.id,
                d: voronoi.renderCell(i),
                gradientId: gradientId,
                cx: site.x,
                cy: site.y,
                rUnits: site.rUnits,
                factionColor: faction.color
            });
        }

        return { geometry: generatedGeometry, defs: generatedDefs };

    }, [hqs, pois, factions]);

    if (geometry.length === 0) return null;

    return (
        <SVGOverlay attributes={{ viewBox: `0 0 ${SVG_SIZE} ${SVG_SIZE}`, preserveAspectRatio: "none" }} bounds={bounds}>
            <defs>
                {defs}
            </defs>
            <g style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}>
                {geometry.map(geo => (
                    <React.Fragment key={geo.id}>
                        <path
                            d={geo.d}
                            fill={`url(#${geo.gradientId})`}
                            stroke={geo.factionColor}
                            strokeWidth={2}
                            vectorEffect="non-scaling-stroke"
                            strokeOpacity={0.3}
                        />
                    </React.Fragment>
                ))}
            </g>
        </SVGOverlay>
    );
};

export default React.memo(TerritoryLayer, (prev, next) => {
    // 1. Check Factions (Colors/Relations might change)
    if (prev.factions !== next.factions) return false;

    // 2. Check POIs - ONLY check ownership changes, ignore HP updates
    if (prev.pois.length !== next.pois.length) return false;
    for (let i = 0; i < prev.pois.length; i++) {
        if (prev.pois[i].id !== next.pois[i].id) return false; // Should match if order preserved
        if (prev.pois[i].ownerFactionId !== next.pois[i].ownerFactionId) return false;
        // Ignore HP, Tier, etc. for Territory rendering
    }

    // 3. Check HQs - Only if they move or die
    const prevHQs = prev.units.filter(u => u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER);
    const nextHQs = next.units.filter(u => u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER);

    if (prevHQs.length !== nextHQs.length) return false;

    for (let i = 0; i < prevHQs.length; i++) {
        if (prevHQs[i].id !== nextHQs[i].id) return false;
        if (prevHQs[i].factionId !== nextHQs[i].factionId) return false;
        if (Math.abs(prevHQs[i].position.lat - nextHQs[i].position.lat) > 0.001) return false;
        if (Math.abs(prevHQs[i].position.lng - nextHQs[i].position.lng) > 0.001) return false;
    }

    return true;
});