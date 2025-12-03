import React, { useEffect, useState } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import { TerrainService } from '../services/terrainService';
import { UnitClass } from '../types';

interface Props {
    gameMode: string;
    placementType: UnitClass | null;
}

const PlacementOverlay: React.FC<Props> = ({ gameMode, placementType }) => {
    const [geoJsonData, setGeoJsonData] = useState<any>(null);

    useEffect(() => {
        const data = TerrainService.getWorldData();
        if (data) {
            setGeoJsonData(data);
        } else {
            // Poll if not ready (simple solution)
            const interval = setInterval(() => {
                const d = TerrainService.getWorldData();
                if (d) {
                    setGeoJsonData(d);
                    clearInterval(interval);
                }
            }, 500);
            return () => clearInterval(interval);
        }
    }, []);

    if (gameMode !== 'PLACING_STRUCTURE' || !placementType || !geoJsonData) return null;

    // Determine Color based on Unit Type
    // Land Units (Airbase, Base) -> Green Land
    // Sea Units (Port) -> Red Land (indicating Water is the target, or invert logic?)
    // Let's go with: Green = Valid Area.

    // If placing AIRBASE/BASE (Land): Land is Green.
    // If placing PORT (Water): Land is Red (Invalid).

    const isLandStructure = placementType === UnitClass.AIRBASE || placementType === UnitClass.MILITARY_BASE;

    // VISUAL LOGIC:
    // Land Structure: Green Fill (Valid Land), Thin Green Stroke
    // Port: Red Fill (Invalid Land), THICK Green Stroke (Valid Coastline Corridor)

    const color = isLandStructure ? '#22c55e' : '#22c55e'; // Always Green Stroke (Coast is valid)
    const weight = isLandStructure ? 1 : 15; // THICK stroke for Ports to create a "Corridor"
    const fillColor = isLandStructure ? '#22c55e' : '#ef4444'; // Red fill for Port (Invalid Land)
    const fillOpacity = isLandStructure ? 0.2 : 0.5; // Darker red to emphasize "NO"

    return (
        <GeoJSON
            data={geoJsonData}
            style={{
                color: color,
                weight: weight,
                fillColor: fillColor,
                fillOpacity: fillOpacity,
                interactive: false,
                lineCap: 'round',
                lineJoin: 'round'
            }}
        />
    );
};

export default PlacementOverlay;
