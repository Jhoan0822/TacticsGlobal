import React, { useMemo, useState } from 'react';
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
    clipId: string;
    cx: number;
    cy: number;
    rUnits: number;
    factionColor: string;
}

const MAX_LAT = 85.05112878; 
const SVG_SIZE = 4096; 

const TerritoryLayer: React.FC<Props> = ({ units, pois, factions }) => {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoom: () => setZoom(map.getZoom())
  });

  const bounds = [[-MAX_LAT, -180], [MAX_LAT, 180]] as L.LatLngBoundsExpression;

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
    units.forEach(u => {
        if ((u.unitClass === UnitClass.COMMAND_CENTER || u.unitClass === UnitClass.MOBILE_COMMAND_CENTER) && u.hp > 0) {
            sites.push({
                id: u.id,
                lat: u.position.lat,
                lng: u.position.lng,
                factionId: u.factionId,
                radius: TERRITORY_CONFIG.HQ_RADIUS
            });
        }
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
    
    // Voronoi divides the map into "Cells" based on closest distance. 
    // This creates the "Non-overlapping" logic automatically.
    const delaunay = d3.Delaunay.from(projectedSites.map(s => [s.x, s.y]));
    const voronoi = delaunay.voronoi([0, 0, SVG_SIZE, SVG_SIZE]);

    const generatedGeometry: CachedGeometry[] = [];
    const generatedDefs: React.ReactNode[] = [];

    for (let i = 0; i < projectedSites.length; i++) {
        const site = projectedSites[i];
        const faction = factions.find(f => f.id === site.factionId);
        
        if (!faction || site.factionId === 'NEUTRAL') continue; 

        const gradientId = `grad-${site.id}`;
        const clipId = `clip-${site.id}`;

        // Radial Gradient: Center is solid, edges fade out.
        // This represents "Influence Strength".
        generatedDefs.push(
            <radialGradient key={gradientId} id={gradientId} cx={site.x} cy={site.y} r={site.rUnits} gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor={faction.color} stopOpacity={0.6} />
                <stop offset="70%" stopColor={faction.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={faction.color} stopOpacity={0} />
            </radialGradient>
        );

        // We clip the gradient by the Voronoi Cell.
        // This ensures the color stops exactly where the neighbor's cell begins.
        // Result: Clean borders, no overlap.
        generatedDefs.push(
             <clipPath key={clipId} id={clipId}>
                 <path d={voronoi.renderCell(i)} />
             </clipPath>
        );

        generatedGeometry.push({
            id: site.id,
            d: voronoi.renderCell(i), // Not strictly needed for drawing but good for ref
            gradientId: gradientId,
            clipId: clipId,
            cx: site.x,
            cy: site.y,
            rUnits: site.rUnits,
            factionColor: faction.color
        });
    }

    return { geometry: generatedGeometry, defs: generatedDefs };

  }, [units, pois, factions]);

  const unitsPerPixel = SVG_SIZE / (256 * Math.pow(2, zoom));
  
  // Calculate stroke relative to zoom so borders don't disappear or get too fat
  const strokeWidth = 1.0 * unitsPerPixel;

  if (geometry.length === 0) return null;

  return (
    <SVGOverlay attributes={{ viewBox: `0 0 ${SVG_SIZE} ${SVG_SIZE}`, preserveAspectRatio: "none" }} bounds={bounds}>
        <defs>
            {defs}
        </defs>
        <g style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))' }}> 
            {geometry.map(geo => (
                <React.Fragment key={geo.id}>
                    {/* The Territory Fill */}
                    <circle 
                        cx={geo.cx} 
                        cy={geo.cy} 
                        r={geo.rUnits * 1.5} // Draw slightly larger than logic radius to ensure it hits the voronoi edge
                        fill={`url(#${geo.gradientId})`} 
                        clipPath={`url(#${geo.clipId})`} // CLIP IT by Voronoi
                    />
                    
                    {/* The Hard Border (Voronoi Edge) */}
                    <path 
                        d={geo.d}
                        fill="none"
                        stroke={geo.factionColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={0.3}
                    />
                </React.Fragment>
            ))}
        </g>
    </SVGOverlay>
  );
};

export default TerritoryLayer;