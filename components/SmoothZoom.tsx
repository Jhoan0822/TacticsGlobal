import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

export const SmoothZoom = () => {
    const map = useMap();
    const zoomRef = useRef(map.getZoom());
    const targetZoomRef = useRef(map.getZoom());
    const rafRef = useRef<number>(null);

    useEffect(() => {
        // Disable default scroll zoom to take full control
        map.scrollWheelZoom.disable();

        // Initialize refs
        zoomRef.current = map.getZoom();
        targetZoomRef.current = map.getZoom();

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            // Calculate delta - adjust sensitivity here
            // e.deltaY is usually 100 or -100 per step, but varies by device
            const sensitivity = 0.0015;
            const delta = -e.deltaY * sensitivity;

            const minZoom = map.getMinZoom();
            const maxZoom = map.getMaxZoom();

            // Update target zoom
            targetZoomRef.current = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current + delta));
        };

        const container = map.getContainer();
        container.addEventListener('wheel', onWheel, { passive: false });

        const update = () => {
            // Linear interpolation (Lerp) for smooth movement
            // The factor (0.15) determines the "weight" or "friction"
            // Higher = snappier, Lower = floatier
            const current = zoomRef.current;
            const target = targetZoomRef.current;
            const diff = target - current;

            if (Math.abs(diff) > 0.0001) {
                const newZoom = current + diff * 0.15;
                zoomRef.current = newZoom;
                map.setZoom(newZoom, { animate: false });
            } else if (Math.abs(diff) > 0) {
                // Snap to target if very close to stop micro-adjustments
                zoomRef.current = target;
                map.setZoom(target, { animate: false });
            }

            rafRef.current = requestAnimationFrame(update);
        };

        rafRef.current = requestAnimationFrame(update);

        return () => {
            container.removeEventListener('wheel', onWheel);
            map.scrollWheelZoom.enable();
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [map]);

    return null;
};

export default SmoothZoom;
