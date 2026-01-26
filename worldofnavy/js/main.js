import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Ship } from './ship.js';
import { InputController } from './input.js';
import { CameraController } from './camera.js';
import { Ocean } from './ocean.js';

class Game {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.ships = [];
        this.input = new InputController();
        this.cameraController = null;
        this.isMobile = false;
        this.ocean = null;
        this.assets = {}; // Store loaded GLB models

        // Audio
        this.listener = new THREE.AudioListener();
        this.gunSounds = [];
        this.menuMusic = null;
        this.engineSound = null;

        this.playerShip = null;
        this.selectedShipModelName = null; // Store user choice
        this.ships = [];
        this.projectiles = [];
        this.islands = [];
        this.isPlaying = false;

        this.init();
    }

    async init() {
        // Setup Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.0003); // Distance fog

        // Setup Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Setup Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(100, 200, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        // Setup Ocean
        this.ocean = new Ocean(this.scene);

        // Create Islands
        this.createIslands();

        // Load Assets
        // Load Assets (Background)
        this.loadingPromise = this.loadAssets();

        // Show Main Menu Immediately
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';

        // Setup UI Listeners
        this.setupMenus();

        window.addEventListener('resize', () => this.onWindowResize());

        // Game Events
        window.addEventListener('ship-shoot', (e) => this.onShipShoot(e.detail));

        // Raycaster for aiming
        this.raycaster = new THREE.Raycaster();
        this.aimPoint = new THREE.Vector3();

        // Mobile Detection
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
            this.setupMobileControls();
        }

        // Start Loop
        this.animate();
    }

    loadAssets() {
        const loader = new GLTFLoader();
        // Static list of models
        this.modelFiles = ['bismarck.glb', 'graf_spee_low_poly.glb', 'hms_ardrossan.glb', 'hms_aurora.glb', 'uss_nc_battleship.glb'];
        const loadingBar = document.getElementById('loading-bar');

        // Helper to load one model
        const loadModel = (name) => {
            return new Promise((resolve, reject) => {
                loader.load(name, (gltf) => {
                    this.assets[name] = gltf.scene;
                    console.log(`Loaded ${name}`);
                    resolve();
                }, (xhr) => {
                    // Optional: Update global progress if we were showing it
                }, (error) => {
                    console.error(`Error loading ${name}`, error);
                    resolve(); // Resolve anyway to not block game
                });
            });
        };

        const promises = this.modelFiles.map(name => loadModel(name));

        // Create the loading promise that startGame will await
        const assetsPromise = Promise.all(promises);

        // --- Load Audio (Parallel) ---
        const audioLoader = new THREE.AudioLoader();
        this.gunSounds = [];
        const soundFiles = [
            'ship_gun_sound/canon-sound_01-81029.mp3',
            'ship_gun_sound/warship-main-battery-opening-fire-101056.mp3'
        ];

        soundFiles.forEach(file => {
            audioLoader.load(file, (buffer) => {
                const sound = new THREE.Audio(this.listener);
                sound.setBuffer(buffer);
                sound.setVolume(0.5);
                this.gunSounds.push(sound);
            });
        });

        // Load Menu Music
        audioLoader.load('mainmenu_music/pirates-163389.mp3', (buffer) => {
            this.menuMusic = new THREE.Audio(this.listener);
            this.menuMusic.setBuffer(buffer);
            this.menuMusic.setLoop(true);
            this.menuMusic.setVolume(0.4);
            // Play immediately if menu is visible
            if (document.getElementById('main-menu').style.display === 'flex') {
                this.menuMusic.play();
            }
        });

        // Load Engine Sound
        audioLoader.load('shipsenginesound/big-ship-stationary-1-26891.mp3', (buffer) => {
            this.engineSound = new THREE.Audio(this.listener);
            this.engineSound.setBuffer(buffer);
            this.engineSound.setLoop(true);
            this.engineSound.setVolume(0.2);
        });

        return assetsPromise;
    }

    setupMenus() {
        // Main Menu Button
        document.getElementById('btn-menu-start').addEventListener('click', () => {
            this.showShipSelection();
        });

        document.getElementById('btn-menu-help').addEventListener('click', () => {
            document.getElementById('main-menu').style.display = 'none';
            document.getElementById('instructions-screen').style.display = 'flex';
        });

        // Instruction Back Button
        document.getElementById('btn-instruct-back').addEventListener('click', () => {
            document.getElementById('instructions-screen').style.display = 'none';
            document.getElementById('main-menu').style.display = 'flex';
        });

        // Exit Button
        document.getElementById('btn-menu-exit').addEventListener('click', () => {
            window.location.href = '../desktop.html'; // Return to desktop
        });
    }

    showShipSelection() {
        document.getElementById('main-menu').style.display = 'none';
        const screen = document.getElementById('ship-selection-screen');
        screen.style.display = 'flex';
        const grid = document.getElementById('ship-grid');
        grid.innerHTML = ''; // Clear prev

        // Use static list since assets might not be loaded yet
        const models = this.modelFiles || ['bismarck.glb', 'graf_spee_low_poly.glb', 'hms_ardrossan.glb', 'hms_aurora.glb', 'uss_nc_battleship.glb'];

        models.forEach(name => {
            const card = document.createElement('div');
            card.className = 'ship-card';

            // Clean Name (remove .glb)
            const cleanName = name.replace('.glb', '').replace(/_/g, ' ');

            card.innerHTML = `<div class="ship-name">${cleanName}</div>`;

            card.addEventListener('click', () => {
                this.selectedShipModelName = name;
                this.startGame();
            });

            grid.appendChild(card);
        });
    }

    async startGame() {
        // Show loading if assets aren't ready
        const loadingScreen = document.getElementById('loading-screen');
        if (this.loadingPromise) {
            loadingScreen.style.display = 'flex';
            loadingScreen.querySelector('h1').innerText = "Preparing Ships";
            loadingScreen.querySelector('p').innerText = "Please wait, loading heavy assets...";

            // Wait for assets
            await this.loadingPromise;

            loadingScreen.style.display = 'none';
        }

        document.getElementById('ship-selection-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        this.isPlaying = true;

        // Audio Transition
        if (this.menuMusic && this.menuMusic.isPlaying) this.menuMusic.stop();
        if (this.engineSound) this.engineSound.play();

        // Show Mobile UI if applicable
        if (this.isMobile) {
            document.getElementById('mobile-ui').style.display = 'block';
        }

        // Request Lock
        // Only lock pointer if NOT mobile (or if user wants to use mouse on mobile?)
        // Generally mobile doesn't use pointer lock for joystick controls
        if (!this.isMobile) {
            document.body.requestPointerLock();
        }

        // Ensure manual click also locks if user unlocks via ESC
        document.addEventListener('click', () => {
            if (this.isPlaying && !this.isMobile) {
                document.body.requestPointerLock();
            }
        });

        // Create Ships (3v3)
        this.spawnShips();

        // Setup Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
        this.cameraController = new CameraController(this.camera, this.playerShip);

        // Audio Listener
        if (this.listener) {
            this.camera.add(this.listener);
        }
    }

    spawnShips() {
        const modelNames = Object.keys(this.assets);

        // Helper to get random model data
        const getRandomModelData = () => {
            const name = modelNames[Math.floor(Math.random() * modelNames.length)];
            return { mesh: this.assets[name].clone(), name: name };
        };

        // --- SPAWN CONFIGURATION (Line Battle) ---
        // Team 0 (Blue/Player): Bottom of map (Z = +600), facing Up (-Z)
        // Team 1 (Red/Enemy): Top of map (Z = -600), facing Down (+Z)

        const spacing = 150; // Distance between ships in line
        const startZ = 600;

        // 1. Team 0 (Player + 2 Allies)
        // Positions: Left (-150), Center (0), Right (+150)
        // Player in Center (0)

        // Player (Center) - Use SELECTED Model
        const playerModelName = this.selectedShipModelName || getRandomModelData().name;
        const playerMesh = this.assets[playerModelName].clone();

        this.playerShip = new Ship(this.scene, playerMesh, 0, true, playerModelName);
        this.playerShip.container.position.set(0, 0, startZ);
        this.playerShip.container.rotation.y = Math.PI; // Face -Z (Up/Forward relative to camera start)
        this.ships.push(this.playerShip);

        // Ally 1 (Left)
        let data = getRandomModelData();
        let ally1 = new Ship(this.scene, data.mesh, 0, false, data.name);
        ally1.container.position.set(-spacing, 0, startZ);
        ally1.container.rotation.y = Math.PI;
        this.ships.push(ally1);

        // Ally 2 (Right)
        data = getRandomModelData();
        let ally2 = new Ship(this.scene, data.mesh, 0, false, data.name);
        ally2.container.position.set(spacing, 0, startZ);
        ally2.container.rotation.y = Math.PI;
        this.ships.push(ally2);


        // 2. Team 1 (3 Enemies)
        // Positions: Left (-150), Center (0), Right (+150) on opposite side (-Z)

        for (let i = 0; i < 3; i++) {
            data = getRandomModelData();
            const ship = new Ship(this.scene, data.mesh, 1, false, data.name);

            // Calculate X: -150, 0, 150
            const xPos = (i - 1) * spacing;

            ship.container.position.set(xPos, 0, -startZ);
            ship.container.rotation.y = 0; // Face +Z (Down towards player)
            this.ships.push(ship);
        }
    }

    createIslands() {
        // Diverse Geometries
        const matGreen = new THREE.MeshPhongMaterial({ color: 0x228B22, flatShading: true }); // Forest
        const matSand = new THREE.MeshPhongMaterial({ color: 0xE6C288, flatShading: true });  // Sand/Lowland
        const matRock = new THREE.MeshPhongMaterial({ color: 0x808080, flatShading: true });  // Mountain Rock

        // Helper to create an island group
        const createIslandMesh = (type, x, z) => {
            const group = new THREE.Group();
            group.position.set(x, 0, z);
            let collisionRadius = 30;

            if (type === 'mountain') {
                // High Peak
                const mountain = new THREE.Mesh(new THREE.ConeGeometry(40, 70, 7), matRock);
                mountain.position.y = 10;
                group.add(mountain);

                // Base
                const base = new THREE.Mesh(new THREE.CylinderGeometry(50, 60, 10, 7), matGreen);
                base.position.y = -2;
                group.add(base);

                collisionRadius = 55;
            }
            else if (type === 'lowland') {
                // Flat Sandy Island
                const ground = new THREE.Mesh(new THREE.CylinderGeometry(60, 70, 5, 8), matSand);
                ground.position.y = 0;
                group.add(ground);

                // Some vegetation clumps (Cones)
                for (let i = 0; i < 5; i++) {
                    const tree = new THREE.Mesh(new THREE.ConeGeometry(5, 15, 5), matGreen);
                    tree.position.set(
                        (Math.random() - 0.5) * 80,
                        7.5,
                        (Math.random() - 0.5) * 80
                    );
                    group.add(tree);
                }
                collisionRadius = 65;
            }
            else if (type === 'archipelago') {
                // Cluster of small islands
                const main = new THREE.Mesh(new THREE.DodecahedronGeometry(30, 0), matGreen); // jagged rock
                main.scale.y = 0.5;
                main.position.y = 5;
                group.add(main);

                // Small satellite rocks
                for (let i = 0; i < 3; i++) {
                    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(15, 0), matRock);
                    rock.position.set(
                        (Math.random() - 0.5) * 90,
                        2,
                        (Math.random() - 0.5) * 90
                    );
                    group.add(rock);
                }
                collisionRadius = 70; // Wide area
            }

            this.scene.add(group);
            return collisionRadius;
        };

        const configs = [
            { type: 'mountain', x: 0, z: 0 },         // Center Peak
            { type: 'lowland', x: 200, z: 150 },      // Right Flank
            { type: 'lowland', x: -200, z: -150 },    // Left Flank
            { type: 'archipelago', x: 250, z: -100 }, // Complex Obstacle
            { type: 'archipelago', x: -250, z: 100 }, // Complex Obstacle
            { type: 'mountain', x: 0, z: 350 },       // Front Shield
            { type: 'mountain', x: 0, z: -350 }       // Back Shield
        ];

        configs.forEach(cfg => {
            const rad = createIslandMesh(cfg.type, cfg.x, cfg.z);
            this.islands.push({
                x: cfg.x,
                z: cfg.z,
                radius: rad
            });
        });
    }

    update() {
        if (!this.isPlaying) return;

        const dt = this.clock.getDelta();

        // Update Ships
        this.ships.forEach(ship => {
            // For player, we pass the aim target
            let aimTarget = null;
            if (ship.isPlayer) {
                // Raycast from camera center to water level (y=0)
                this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
                const intersects = this.raycaster.intersectObject(this.ocean.mesh);
                if (intersects.length > 0) {
                    this.aimPoint.copy(intersects[0].point);
                    aimTarget = this.aimPoint;
                }
            }
            // Pass islands for collision/avoidance
            ship.update(dt, this.input, this.ships, this.islands, aimTarget);
        });

        // Update Camera
        if (this.cameraController) {
            // Pass the input controller so it can read mouse deltas
            this.cameraController.updateWithInput(dt, this.input);
        }

        // Reset input deltas (game loop end)
        this.input.update();

        // Update Projectiles
        this.updateProjectiles(dt);

        // Water Animation
        if (this.ocean) this.ocean.update(dt);

        // UI Updates
        this.updateUI();
    }

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.mesh.translateZ(p.speed * dt); // Move forward relative to rotation
            p.mesh.position.y -= 0.1 * dt; // Gravity

            p.life -= dt;

            let hit = false;

            // 1. Island Collision Check
            for (const island of this.islands) {
                const dx = p.mesh.position.x - island.x;
                const dz = p.mesh.position.z - island.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < island.radius) {
                    hit = true;
                    break; // Destroy projectile
                }
            }

            // 2. Ship Hitbox Check (If not already hit island)
            if (!hit) {
                for (const ship of this.ships) {
                    if (ship.teamId !== p.teamId && ship.hp > 0) {
                        // Use container position
                        const dist = p.mesh.position.distanceTo(ship.container.position);
                        if (dist < 20) { // Hit radius
                            hit = true;
                            ship.hp -= 50; // Damage
                            if (ship.hp <= 0) {
                                ship.container.visible = false; // Poof
                                // Simple win check
                                this.checkWinCondition();
                            }
                            break;
                        }
                    }
                }
            }

            if (p.life <= 0 || p.mesh.position.y < -5 || hit) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    }

    onShipShoot(data) {
        // Play Sound (Random)
        if (this.gunSounds && this.gunSounds.length > 0) {
            const sound = this.gunSounds[Math.floor(Math.random() * this.gunSounds.length)];
            if (sound.isPlaying) sound.stop();
            sound.play(); // Global audio for now (simple)

            // Note: For 3D spatial audio, we'd need a sound object per ship or pool.
            // Given the browser limits and simplicity, a global "BANG" is okay for now,
            // or we could try to attach it to the camera listener but play it "from" the position theoretically.
            // Simple approach: Just play the Audio object we loaded.
        }

        // Spawn 4 projectiles (Salvo)
        const spread = 2; // Spread distance
        for (let i = 0; i < 4; i++) {
            const geometry = new THREE.SphereGeometry(0.5, 8, 8);
            const material = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
            const bullet = new THREE.Mesh(geometry, material);

            // Start at ship position
            bullet.position.copy(data.origin);
            bullet.position.y += 5; // Height of deck

            // Offset for separate barrels logic (simple random spread for now)
            bullet.position.x += (Math.random() - 0.5) * spread;
            bullet.position.z += (Math.random() - 0.5) * spread;

            // Rotation determines direction
            bullet.rotation.copy(data.rotation);
            // Slight randomness to spread
            bullet.rotation.y += (Math.random() - 0.5) * 0.05;

            this.scene.add(bullet);

            this.projectiles.push({
                mesh: bullet,
                speed: 150, // Projectile speed
                life: 3.0, // Seconds
                teamId: data.teamId
            });
        }
    }

    checkWinCondition() {
        const alliesAlive = this.ships.filter(s => s.teamId === 0 && s.hp > 0).length;
        const enemiesAlive = this.ships.filter(s => s.teamId === 1 && s.hp > 0).length;

        if (alliesAlive === 0 || enemiesAlive === 0) {
            document.getElementById('game-over').style.display = 'flex';
            document.getElementById('result-title').innerText = alliesAlive > 0 ? "Victory!" : "Defeat!";
            this.isPlaying = false;
        }
    }

    updateUI() {
        if (this.playerShip) {
            document.getElementById('speed-display').innerText = Math.abs(Math.round(this.playerShip.speed * 10)); // Arbitrary scale
            const hpPercent = (this.playerShip.hp / this.playerShip.maxHp) * 100;
            document.getElementById('player-hp-bar').style.width = `${hpPercent}%`;

            // Reload Indicator
            // Ship stores time in seconds (Date.now()/1000)
            const now = Date.now() / 1000;
            const isReady = (now - this.playerShip.lastShotTime) >= this.playerShip.reloadTime;
            const crosshair = document.getElementById('crosshair');

            if (isReady) {
                crosshair.style.color = '#00FF00'; // Green (Ready)
                crosshair.style.fontWeight = 'bold';
            } else {
                crosshair.style.color = '#FFA500'; // Orange (Reloading)
                crosshair.style.fontWeight = 'normal';
            }
        }

        // Update Score Icons
        const blueContainer = document.getElementById('team-blue-icons');
        const redContainer = document.getElementById('team-red-icons');

        if (blueContainer && redContainer) {
            // Helper to sync icons
            const syncIcons = (container, teamId, cssClass) => {
                const ships = this.ships.filter(s => s.teamId === teamId);

                if (container.children.length !== ships.length) {
                    container.innerHTML = '';
                    ships.forEach(() => {
                        const icon = document.createElement('div');
                        icon.className = `ship-icon ${cssClass}`;
                        container.appendChild(icon);
                    });
                }

                ships.forEach((ship, index) => {
                    const icon = container.children[index];
                    if (ship.hp <= 0) {
                        if (!icon.classList.contains('dead')) icon.classList.add('dead');
                    } else {
                        if (icon.classList.contains('dead')) icon.classList.remove('dead');
                    }
                });
            };

            syncIcons(blueContainer, 0, 'icon-ally');
            syncIcons(redContainer, 1, 'icon-enemy');
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.update();
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    setupMobileControls() {
        // Just init logic, show it in startGame
        this.isMobile = true;

        // 1. Joystick (Static mode so it's always visible)
        // Ensure nipplejs is available (loaded via script tag in index.html)
        const manager = nipplejs.create({
            zone: document.getElementById('joystick-zone'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 100
        });

        manager.on('move', (evt, data) => {
            if (!data.vector) return;

            // Get normalized values (-1 to 1)
            const x = data.vector.x;
            const y = data.vector.y;

            // Reset all
            this.input.keys.forward = false;
            this.input.keys.backward = false;
            this.input.keys.left = false;
            this.input.keys.right = false;

            // Threshold for activation
            const threshold = 0.3;

            // Enable ALL directions
            // nipplejs: positive y = nipple pushed UP, negative y = nipple pushed DOWN
            if (y > threshold) this.input.keys.forward = true;   // UP = forward
            if (y < -threshold) this.input.keys.backward = true; // DOWN = backward
            if (x > threshold) this.input.keys.right = true;
            if (x < -threshold) this.input.keys.left = true;
        });

        manager.on('end', () => {
            this.input.keys.forward = false;
            this.input.keys.backward = false;
            this.input.keys.left = false;
            this.input.keys.right = false;
        });

        // 2. Look (Touch Drag) - with touch identifier for multi-touch
        const lookZone = document.getElementById('look-zone');
        let lookTouchId = null;
        let lastX = 0;
        let lastY = 0;

        lookZone.addEventListener('touchstart', (e) => {
            if (lookTouchId === null) {
                const touch = e.changedTouches[0];
                lookTouchId = touch.identifier;
                lastX = touch.clientX;
                lastY = touch.clientY;
            }
        }, { passive: true });

        lookZone.addEventListener('touchmove', (e) => {
            e.preventDefault();

            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                if (touch.identifier === lookTouchId) {
                    const x = touch.clientX;
                    const y = touch.clientY;

                    // Send delta to InputController
                    this.input.mouseDeltaX = (x - lastX) * 2;
                    this.input.mouseDeltaY = (y - lastY) * 2;

                    lastX = x;
                    lastY = y;
                    break;
                }
            }
        }, { passive: false });

        lookZone.addEventListener('touchend', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === lookTouchId) {
                    lookTouchId = null;
                    break;
                }
            }
        }, { passive: true });

        lookZone.addEventListener('touchcancel', (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === lookTouchId) {
                    lookTouchId = null;
                    break;
                }
            }
        }, { passive: true });

        // 3. Fire Button
        const fireBtn = document.getElementById('btn-fire');
        if (fireBtn) {
            fireBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.keys.fire = true;
            });
            fireBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.input.keys.fire = false;
            });
        }
    }

    onWindowResize() {
        if (this.camera && this.renderer) {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
    }
}

// Start Game
window.onload = () => {
    new Game();
};
