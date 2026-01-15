import * as THREE from 'three';

export class Ocean {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.init();
    }

    init() {
        const geometry = new THREE.PlaneGeometry(10000, 10000);
        const material = new THREE.MeshPhongMaterial({
            color: 0x006994,
            shininess: 60,
            specular: 0xffffff,
            transparent: true,
            opacity: 0.8
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // TODO: Add shader based water later for realism
    }

    update(dt) {
        // Create simple wave movement visual if needed
    }
}
