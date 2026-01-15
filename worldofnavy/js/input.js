export class InputController {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            fire: false
        };
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.scrollDelta = 0;

        this._initListeners();
    }

    _initListeners() {
        // Keyboard
        document.addEventListener('keydown', (e) => this._onKeyDown(e));
        document.addEventListener('keyup', (e) => this._onKeyUp(e));

        // Mouse Move (Pointer Lock ideally, but simple for now)
        document.addEventListener('mousemove', (e) => this._onMouseMove(e));
        document.addEventListener('mousedown', () => this.keys.fire = true);
        document.addEventListener('mouseup', () => this.keys.fire = false);

        // Mouse Wheel
        document.addEventListener('wheel', (e) => this._onWheel(e));

        // Pointer Lock request on click REMOVED - Managed by Main Game Loop now
    }

    _onKeyDown(e) {
        switch (e.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'Space': this.keys.fire = true; break;
        }
    }

    _onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'Space': this.keys.fire = false; break;
        }
    }

    _onMouseMove(e) {
        // If pointer locked, use movementX/Y
        if (document.pointerLockElement === document.body) {
            this.mouseDeltaX = e.movementX;
            this.mouseDeltaY = e.movementY;
        } else {
            // Fallback (less accurate)
            this.mouseDeltaX = 0;
            this.mouseDeltaY = 0;
        }
    }

    _onWheel(e) {
        this.scrollDelta = e.deltaY;
    }

    // Called every frame to clear deltas
    update() {
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.scrollDelta = 0;
    }
}
