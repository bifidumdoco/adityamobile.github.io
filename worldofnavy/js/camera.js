import * as THREE from 'three';

export class CameraController {
    constructor(camera, targetShip) {
        this.camera = camera;
        this.target = targetShip;

        // Settings
        this.distance = targetShip && targetShip.optimalCameraDist ? targetShip.optimalCameraDist : 150;
        this.minDistance = 50;
        this.maxDistance = 300;
        this.height = 40;
        this.rotationSpeed = 0.002;

        // State
        this.currentAngleX = 0; // Horizontal orbit
        this.currentAngleY = 0.3; // Vertical angle (radians)

        // Initial setup
        this.updateCameraPosition();
    }

    update(dt) {
        if (!this.target) return;

        // Get Input (we need to access the game's input controller ideally, 
        // but for decoupling, we can pass input state or check global if needed.
        // For now, let's assume we can read input from the target's game instance reference logic 
        // or just use the mouse deltas we can get from DOM. 
        // WAIT, I should pass input to update(). Let's refactor `main.js` to pass input here.
        // BUT main.js `update` calls `this.cameraController.update(dt)`. 
        // I will assume input is handled by looking at the InputController singleton or passed in.

        // Actually, let's fix the API. `update(dt, input)`
    }

    // Better Design:
    updateWithInput(dt, input) {
        if (!this.target) return;

        // 1. Orbit Control (Mouse X)
        if (input.mouseDeltaX !== 0) {
            this.currentAngleX -= input.mouseDeltaX * this.rotationSpeed;
        }

        // 2. Pitch Control (Mouse Y)
        if (input.mouseDeltaY !== 0) {
            // Standard Control: Mouse Down (Positive Y) -> Look Down (increase angle, if 0 is top)
            // Or Mouse Up (Negative Y) -> Look Up
            // My offset calculation: y = dist * sin(angleY).
            // If angleY is 0, y=0 (water level). If angleY is 90 (PI/2), y=height.
            // Wait, previous code: Y = dist * sin(currentAngleY).
            // So higher AngleY = Higher Camera (Looking down from above?).
            // Let's visualize: Mouse Pull Down -> Camera goes UP (higher angle) -> looking more down?
            // Usually "Inverted" means Pull Down = Look Up.
            // "Non-Inverted" means Pull Down = Look Down.
            // If Camera goes UP, we look more DOWN at the ship.
            // So: Mouse Down (+Y) -> Increase AngleY -> Camera Up -> Look Down.

            this.currentAngleY += input.mouseDeltaY * this.rotationSpeed; // Changed -= to +=

            // Clamp pitch to avoid going under water or flipping
            this.currentAngleY = Math.max(0.1, Math.min(Math.PI / 2.5, this.currentAngleY));
        }

        // 3. Zoom (Scroll)
        if (input.scrollDelta !== 0) {
            this.distance += input.scrollDelta * 0.1;
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
        }

        this.updateCameraPosition();
    }

    updateCameraPosition() {
        if (!this.target || !this.target.container) return;

        const targetPos = this.target.container.position.clone();

        // Look slightly above the ship
        targetPos.y += 20;

        // Calculate offset
        // X = dist * sin(angleX) * cos(angleY)
        // Z = dist * cos(angleX) * cos(angleY)
        // Y = dist * sin(angleY)
        const offsetX = this.distance * Math.sin(this.currentAngleX) * Math.cos(this.currentAngleY);
        const offsetZ = this.distance * Math.cos(this.currentAngleX) * Math.cos(this.currentAngleY);
        const offsetY = this.distance * Math.sin(this.currentAngleY);

        this.camera.position.x = targetPos.x + offsetX;
        this.camera.position.z = targetPos.z + offsetZ;
        this.camera.position.y = targetPos.y + offsetY;

        this.camera.lookAt(targetPos);
    }
}
