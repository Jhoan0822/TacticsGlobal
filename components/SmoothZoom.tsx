import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export const SmoothZoom = () => {
    const map = useMap();

    // State refs
    const targetZoomRef = useRef(map.getZoom());
    const currentZoomRef = useRef(map.getZoom());
    const isDraggingRef = useRef(false);
    const lastMousePosRef = useRef<L.Point | null>(null);
    const dragDeltaRef = useRef(L.point(0, 0));
    const cursorRef = useRef(L.point(0, 0));
    const rafRef = useRef<number>(null);

    useEffect(() => {
        // COMPLETELY DISABLE Native Handlers to prevent fighting
        map.dragging.disable();
        map.scrollWheelZoom.disable();
        map.doubleClickZoom.disable(); // Optional, but good for consistency

        // Initialize
        targetZoomRef.current = map.getZoom();
        currentZoomRef.current = map.getZoom();

        const container = map.getContainer();

        // --- EVENT HANDLERS ---

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();

            // Update cursor for zoom-around logic
            const rect = container.getBoundingClientRect();
            cursorRef.current = L.point(e.clientX - rect.left, e.clientY - rect.top);

            // Calculate Zoom Delta
            const sensitivity = 0.0015;
            const delta = -e.deltaY * sensitivity;
            const minZoom = map.getMinZoom();
            const maxZoom = map.getMaxZoom();

            targetZoomRef.current = Math.max(minZoom, Math.min(maxZoom, targetZoomRef.current + delta));
        };

        const onMouseDown = (e: MouseEvent) => {
            // Only left click drags
            if (e.button === 0) {
                isDraggingRef.current = true;
                const rect = container.getBoundingClientRect();
                lastMousePosRef.current = L.point(e.clientX - rect.left, e.clientY - rect.top);
                container.style.cursor = 'grabbing';
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const newPos = L.point(x, y);

            cursorRef.current = newPos;

            if (isDraggingRef.current && lastMousePosRef.current) {
                // Calculate drag delta since last event
                const diff = newPos.subtract(lastMousePosRef.current);
                dragDeltaRef.current = dragDeltaRef.current.add(diff);
                lastMousePosRef.current = newPos;
            }
        };

        const onMouseUp = () => {
            isDraggingRef.current = false;
            container.style.cursor = 'grab';
        };

        const onMouseLeave = () => {
            isDraggingRef.current = false;
            container.style.cursor = 'default';
        };

        // --- PHYSICS LOOP ---

        const update = () => {
            // 1. INTERPOLATE ZOOM
            const currentZ = currentZoomRef.current;
            const targetZ = targetZoomRef.current;
            const diffZ = targetZ - currentZ;

            let nextZ = currentZ;
            let zoomChanged = false;

            if (Math.abs(diffZ) > 0.0001) {
                nextZ = currentZ + diffZ * 0.15; // Smooth factor
                zoomChanged = true;
            } else if (Math.abs(diffZ) > 0) {
                nextZ = targetZ;
                zoomChanged = true;
            }

            currentZoomRef.current = nextZ;

            // 2. HANDLE DRAG & ZOOM
            // We need to calculate the new center.
            // If we are zooming, we zoom around the cursor.
            // If we are dragging, we shift the center.
            // We do both at once.

            if (zoomChanged || dragDeltaRef.current.x !== 0 || dragDeltaRef.current.y !== 0) {

                const currentCenter = map.getCenter();
                const currentZoom = map.getZoom(); // Use actual map zoom for projection base

                // A. Calculate Center shift due to Zoom
                // We want the LatLng under the cursor to remain at the cursor position.

                // Get the LatLng currently under the cursor
                // Note: We must use the map's current state for this projection
                const mouseLatLng = map.containerPointToLatLng(cursorRef.current);

                // Calculate where this LatLng needs to be at the NEW zoom level
                // We want project(mouseLatLng, nextZ) to be at cursorRef.current (relative to map pane)
                // The map center in pixel space is:
                // CenterPoint = ProjectedMouse - (CursorPos - HalfSize)

                const halfSize = map.getSize().divideBy(2);
                const projectedMouse = map.project(mouseLatLng, nextZ);
                const newCenterPoint = projectedMouse.subtract(cursorRef.current.subtract(halfSize));

                // B. Apply Drag
                // Drag moves the map, so the center point shifts by -dragDelta
                const finalCenterPoint = newCenterPoint.subtract(dragDeltaRef.current);

                // Convert back to LatLng
                const finalCenter = map.unproject(finalCenterPoint, nextZ);

                // Apply
                map.setView(finalCenter, nextZ, { animate: false });

                // Reset drag delta (we consumed it)
                dragDeltaRef.current = L.point(0, 0);
            }

            rafRef.current = requestAnimationFrame(update);
        };

        // Attach Listeners
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove); // Window to catch drags outside
        window.addEventListener('mouseup', onMouseUp);

        rafRef.current = requestAnimationFrame(update);

        return () => {
            // Cleanup
            container.removeEventListener('wheel', onWheel);
            container.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            if (rafRef.current) cancelAnimationFrame(rafRef.current);

            // Re-enable native handlers
            map.dragging.enable();
            map.scrollWheelZoom.enable();
            map.doubleClickZoom.enable();
            container.style.cursor = '';
        };
    }, [map]);

    return null;
};

export default SmoothZoom;
