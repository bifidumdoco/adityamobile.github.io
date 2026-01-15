
import * as THREE from 'three';

export class Ship {
    constructor(scene, model, teamId, isPlayer = false, modelName = "") {
        this.scene = scene;
        this.modelMesh = model; // Rename to differentiate from container
        this.teamId = teamId; // 0 = Ally/Player, 1 = Enemy
        this.isPlayer = isPlayer;
        this.modelName = modelName;

        // Stats
        this.hp = 1000;
        this.maxHp = 1000;
        this.speed = 0;
        this.maxSpeed = 0.6; // Reduced from 1.0
        this.acceleration = 0.005; // Reduced from 0.01
        this.deceleration = 0.003;
        this.turnSpeed = 0.008; // Slightly slower turn

        // Shooting
        this.lastShotTime = 0;
        this.reloadTime = 2.0; // Seconds

        // AI State
        this.evasionTimer = 0;
        this.evasionDir = 1; // 1 or -1
        this.evasionInterval = 3.0; // Change dir every 3 seconds
        this.stuckTimer = 0; // If hit island, reverse for a bit

        // Map Boundaries
        this.mapLimit = 800; // World is -800 to 800
        this.boundaryBuffer = 100; // Start turning when 100 units close

        // Create Container
        this.container = new THREE.Group();
        this.scene.add(this.container);

        this.init();
    }

    init() {
        // Add model to container
        this.container.add(this.modelMesh);

        // --- 1. Normalize Size & Orientation ---
        // Calculate current bounding box
        const box = new THREE.Box3().setFromObject(this.modelMesh);
        const size = new THREE.Vector3();
        box.getSize(size);

        // FIX: Ships moving sideways
        // If Width (X) > Length (Z), model is facing X. Rotate it to face Z.
        if (size.x > size.z) {
            // Rotate 90 degrees around Y to align with Z
            this.modelMesh.rotation.y = -Math.PI / 2;

            // Swap dimesions for calc
            const temp = size.x;
            size.x = size.z;
            size.z = temp;
        } else {
            // Already Z aligned mostly
            // Check if it's facing -Z or +Z? Hard to tell without visual,
            // but usually Z-long models are fine or 180 off.
            // We assume standard forward is fine for now.
        }

        // SPECIFIC FIXES (Orientation, Position, Camera)
        this.optimalCameraDist = 150; // Default

        if (this.modelName.includes("graf_spee")) {
            // Fix Rotation
            this.modelMesh.rotation.y += Math.PI;
            // Fix Height (Too High -> Lower it)
            this.modelMesh.position.y = -2;
        }

        if (this.modelName.includes("uss_nc")) {
            // Fix Height (Too Low -> Raise it, but not too high)
            // User asked to lower it so half body is in water.
            // Previous was 4. Let's try 1.5
            this.modelMesh.position.y = 1.5;
        }

        if (this.modelName.includes("hms_ardrossan")) {
            // Camera Closer
            this.optimalCameraDist = 100;
        }

        // Target length (Z-axis usually)
        const targetLength = 40;

        // Find the max dimension to use as "length"
        const maxDim = Math.max(size.x, size.y, size.z);

        if (maxDim > 0) {
            const scaleFactor = targetLength / maxDim;
            this.modelMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        // Re-center collision helper or offset logic if needed
        // (GLBs often have weird pivots, but resizing helps)

        // Add minimal team marker (to container, so it doesn't rotate with mesh corrections)
        const markerGeo = new THREE.SphereGeometry(2, 8, 8);
        const color = this.teamId === 0 ? 0x00FF00 : 0xFF0000;
        const markerMat = new THREE.MeshBasicMaterial({ color: color });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.y = 30; // High above ship
        this.container.add(marker);

        // Add simple hitbox helper (invisible usually)
        this.hitboxRadius = 15; // Slightly larger for gameplay feel
    }

    // Updated update signature
    update(dt, input, allShips, islands = [], aimTarget = null) {
        if (this.hp <= 0) return; // Dead

        if (this.isPlayer) {
            this.handlePlayerInput(input, aimTarget);
        } else {
            this.handleAI(dt, allShips, islands);
        }

        this.applyPhysics(islands);
    }

    handlePlayerInput(input, aimTarget) {
        // Throttle
        if (input.keys.forward) {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
        } else if (input.keys.backward) {
            this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed * 0.5);
        } else {
            // Drag / Decay
            if (this.speed > 0) this.speed = Math.max(0, this.speed - this.deceleration);
            if (this.speed < 0) this.speed = Math.min(0, this.speed + this.deceleration);
        }

        // Turn (Only if moving or barely moving) - "Tank Controls" for Boat
        if (true) { // Rudders work even if slow, but rotation checks speed in realistic sim. Here arcade.
            // Actually, WoWs: Rudder updates angle, Ship turns if speed != 0.
            // Simplified:
            if (input.keys.left) this.container.rotation.y += this.turnSpeed;
            if (input.keys.right) this.container.rotation.y -= this.turnSpeed;
        }

        // Aiming (Turret Rotation)
        // We calculate the rotation needed to face the aimTarget
        let fireRotation = this.container.rotation.clone(); // Default to ship forward

        if (aimTarget) {
            const dx = aimTarget.x - this.container.position.x;
            const dz = aimTarget.z - this.container.position.z;
            const angle = Math.atan2(dx, dz);
            // In Three.js, rotation.y=0 usually faces +Z. 
            // We construct a rotation object.
            // Note: fireRotation is an Euler.
            fireRotation.set(0, angle, 0);
        }

        // Fire
        if (input.keys.fire) {
            this.fire(fireRotation);
        }
    }

    handleAI(dt, allShips, islands) {
        // --- AI LOGIC UPDATE ---

        // 0. UNSICCK MANEUVER (Highest Priority)
        if (this.stuckTimer > 0) {
            this.stuckTimer -= dt;
            // Reverse hard!
            this.speed = Math.max(this.speed - this.acceleration * 2, -this.maxSpeed);
            // Turn hard to unwedge (one direction)
            this.container.rotation.y += this.turnSpeed;
            return; // Skip other logic
        }

        this.evasionTimer -= dt;
        if (this.evasionTimer <= 0) {
            this.evasionTimer = this.evasionInterval + Math.random() * 2;
            this.evasionDir = Math.random() > 0.5 ? 1 : -1;
        }

        const pos = this.container.position;
        let forcingTurn = false;

        // 1. Island Avoidance (Super High Priority)
        // Check if any island is close ahead
        for (const island of islands) {
            const dx = island.x - pos.x;
            const dz = island.z - pos.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            // If sufficiently close to care (Increased buffer)
            if (dist < island.radius + 200) {
                // Check if it is "in front" of us
                // Dot product of Ship Forward and Vector To Island

                // Ship Rotation to Vector
                const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.container.rotation.y);
                const toIsland = new THREE.Vector3(dx, 0, dz).normalize();

                const dot = forward.dot(toIsland);

                if (dot > 0.5) { // It's generally in front
                    // Steer AWAY
                    // Which way? Cross product up/down to see relative side
                    const cross = forward.cross(toIsland);
                    if (cross.y > 0) {
                        // Island is to the Left, Turn Right
                        this.container.rotation.y -= this.turnSpeed * 1.5;
                    } else {
                        // Island is to the Right, Turn Left
                        this.container.rotation.y += this.turnSpeed * 1.5;
                    }
                    forcingTurn = true;
                    // Dont check other islands, prioritize closest threat
                    break;
                }
            }
        }

        if (forcingTurn) {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            return;
        }

        // 2. Boundary Avoidance (Highest Priority)

        // Re-use logic variables if needed, but here we just check bounds
        // (No re-declaration)

        // Check X Bounds
        if (pos.x > this.mapLimit - this.boundaryBuffer) {
            this.container.rotation.y += this.turnSpeed; // Force turn Left
            forcingTurn = true;
        } else if (pos.x < -this.mapLimit + this.boundaryBuffer) {
            this.container.rotation.y -= this.turnSpeed; // Force turn Right
            forcingTurn = true;
        }

        // Check Z Bounds
        if (pos.z > this.mapLimit - this.boundaryBuffer) {
            this.container.rotation.y += this.turnSpeed;
            forcingTurn = true;
        } else if (pos.z < -this.mapLimit + this.boundaryBuffer) {
            this.container.rotation.y -= this.turnSpeed;
            forcingTurn = true;
        }

        // If forcing turn to avoid wall, accelerate and skip combat movement logic
        if (forcingTurn) {
            this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            return;
        }

        // 2. Combat Logic
        // Find nearest LIVING enemy
        let nearestEnemy = null;
        let minDist = Infinity;

        // Random factor to prevent switching targets 60 times a second if distances are close
        // But for simple "chase", simple nearest is fine.

        allShips.forEach(other => {
            if (other.teamId !== this.teamId && other.hp > 0) {
                const dist = this.container.position.distanceTo(other.container.position);
                if (dist < minDist) {
                    minDist = dist;
                    nearestEnemy = other;
                }
            }
        });

        if (nearestEnemy) {
            // Logic: Move towards enemy, but stop if "Too Close" (Collision avoidance / Shooting range)
            // Let's say optimal range is 100-200.

            const dist = minDist;

            // Movement Logic
            if (dist > 150) {
                // Too far, speed up
                this.speed = Math.min(this.speed + this.acceleration, this.maxSpeed);
            } else if (dist < 80) {
                // Too close, reverse or stop
                this.speed = Math.max(this.speed - this.acceleration, -this.maxSpeed * 0.5);
            } else {
                // In range, maintain safe speed or slow down to aim better
                this.speed = Math.max(0, this.speed - this.deceleration);
            }

            // Turning Logic
            const targetPos = nearestEnemy.container.position;
            const dx = targetPos.x - this.container.position.x;
            const dz = targetPos.z - this.container.position.z;

            // Desired Angle (Azimuth)
            let desiredAngle = Math.atan2(dx, dz);

            // --- EVASION ---
            // If we are moving (not stopped), add slight offset to angle to "Zig-Zag"
            if (this.speed > 0.2 && dist > 100) {
                // Add +/- 20 degrees (0.35 rad) offset
                desiredAngle += 0.35 * this.evasionDir;
            }

            // Current Rotation (normalized 0 to 2PI ideally, but ThreeJS is loose)
            let currentAngle = this.container.rotation.y;

            // Simple turn towards desired angle
            // Using a helper to get smallest difference would be better, but simple Lerp logic:
            // ship.lookAt(target) works instantly. 
            // For smooth turn:

            // Calculate difference
            let diff = desiredAngle - currentAngle;
            // Normalize to -PI to PI
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;

            if (diff > 0.05) this.container.rotation.y += this.turnSpeed;
            else if (diff < -0.05) this.container.rotation.y -= this.turnSpeed;


            // Shooting Logic
            // The ship hull might not face target due to evasion, 
            // so we calculate true angle to target for the turrets (fire logic)
            const absoluteDx = targetPos.x - this.container.position.x;
            const absoluteDz = targetPos.z - this.container.position.z;
            const trueAimAngle = Math.atan2(absoluteDx, absoluteDz);

            // Check if our rotation is within firing arc (e.g. 90 degrees broadside or just 360 turret?)
            // Let's allow 360 turret for arcade fun, but check range
            if (dist < 500) {
                const aimRotation = new THREE.Euler(0, trueAimAngle, 0);
                this.fire(aimRotation);
            }
        } else {
            // No enemies? Stop.
            this.speed = Math.max(0, this.speed - this.deceleration);
        }
    }

    applyPhysics(islands = []) {
        // Move forward vector
        const prevPos = this.container.position.clone();

        this.container.translateZ(this.speed);

        // Collision Detection with Islands
        const shipRad = this.hitboxRadius;

        for (const island of islands) {
            const dx = this.container.position.x - island.x;
            const dz = this.container.position.z - island.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = shipRad + island.radius;

            if (dist < minDist) {
                // Collision!
                this.speed = 0; // Stop ship

                // Trigger AI UNSTICK (if AI)
                if (!this.isPlayer) {
                    this.stuckTimer = 2.0; // Reverse for 2 seconds
                }

                // Push out (simple resolution)
                // Use vector from island to ship
                // Normalized vector * minDist
                const angle = Math.atan2(dz, dx);
                this.container.position.x = island.x + Math.cos(angle) * minDist;
                this.container.position.z = island.z + Math.sin(angle) * minDist;
            }
        }
    }

    fire(rotation) {
        const now = Date.now() / 1000;
        if (now - this.lastShotTime < this.reloadTime) return;

        this.lastShotTime = now;

        console.log("Fired salvo!");
        // TODO: Actually spawn projectiles in the main game loop
        // We need a way to callback or event.
        // For now, we'll attach a metadata flag that the Main loop checks? 
        // Or better, Main loop calls a method "getNewProjectiles()"

        // Let's dispatch a custom event on the window for simplicity in this architecture
        const event = new CustomEvent('ship-shoot', {
            detail: {
                origin: this.container.position.clone(),
                rotation: rotation ? rotation.clone() : this.container.rotation.clone(),
                teamId: this.teamId,
                isPlayer: this.isPlayer
            }
        });
        window.dispatchEvent(event);
    }
}
