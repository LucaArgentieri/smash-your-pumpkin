import * as THREE from "three/webgpu";
import {
  abs,
  clamp,
  color,
  float,
  fract,
  hash,
  instanceIndex,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  step,
  time,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { PALETTE } from "../config.js";

export const TABLE = { width: 9, depth: 5, thickness: 0.4 };

/**
 * Leshy-style cabin: a worn table with carved card slots, candles, a violet
 * moon staring from the dark and dust drifting through the candlelight.
 */
export class Cabin {
  constructor(scene, physics) {
    this.scene = scene;
    scene.background = new THREE.Color(PALETTE.night);
    scene.fog = new THREE.FogExp2(PALETTE.fog, 0.055);

    this.addLights();
    this.addTable();
    this.candles = [
      this.addCandle(new THREE.Vector3(-3.3, 0, -1.4), 1.0),
      this.addCandle(new THREE.Vector3(-2.75, 0, -1.9), 0.65),
      this.addCandle(new THREE.Vector3(3.4, 0, -1.2), 0.85),
    ];
    this.addMoon();
    this.addDust();

    physics.addStaticBox({ y: -TABLE.thickness / 2 }, { hx: TABLE.width / 2, hy: TABLE.thickness / 2, hz: TABLE.depth / 2 });
    physics.addStaticBox({ y: -4.1 }, { hx: 40, hy: 0.1, hz: 40 });
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0x4b2a6e, 0x0a0410, 0.6));

    const moonLight = new THREE.DirectionalLight(PALETTE.moon, 1.1);
    moonLight.position.set(-2, 7, -6);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(1024, 1024);
    const cam = moonLight.shadow.camera;
    cam.left = -5;
    cam.right = 5;
    cam.top = 4;
    cam.bottom = -4;
    cam.near = 1;
    cam.far = 20;
    moonLight.shadow.bias = -0.0015;
    this.scene.add(moonLight);

    // Warm key light from the player's side, as if from a lantern behind them.
    const key = new THREE.PointLight(0xff8a3a, 9, 12, 1.6);
    key.position.set(0.5, 3.2, 3.4);
    this.scene.add(key);
    this.key = key;

    // Hanging lantern right above the pumpkin spot: the pumpkin is the stage.
    const lantern = new THREE.SpotLight(0xffa04a, 26, 9, 0.55, 0.85, 1.4);
    lantern.position.set(0.3, 4.2, 1.2);
    lantern.target.position.set(0, 0.3, 0.1);
    lantern.castShadow = true;
    lantern.shadow.mapSize.set(1024, 1024);
    lantern.shadow.bias = -0.002;
    this.scene.add(lantern, lantern.target);
  }

  addTable() {
    const geometry = new THREE.BoxGeometry(TABLE.width, TABLE.thickness, TABLE.depth);
    const material = new THREE.MeshStandardNodeMaterial({ metalness: 0 });

    const p = positionWorld;
    const grain = mx_fractal_noise_float(vec3(p.x.mul(0.35), p.z.mul(7), 0), 4, 2, 0.5);
    const planks = fract(p.z.mul(0.9).add(0.5));
    const seam = step(0.97, planks).add(step(planks, 0.02));
    const knots = float(1).sub(smoothstep(0.0, 0.08, mx_worley_noise_float(vec3(p.x.mul(0.8), p.z.mul(1.6), 3))));
    let wood = mix(color(0x2a140c), color(0x5c3218), clamp(grain.add(0.5), 0, 1));
    wood = mix(wood, color(0x120805), max(seam, knots.mul(0.7)));

    // Card slots carved into the wood around the pumpkin spot, 4 x 2 grid.
    const slotUV = vec2(p.x.add(2.2).div(1.1), p.z.add(1.5).div(1.5));
    const cell = fract(slotUV);
    const inGrid = step(0, slotUV.x).mul(step(slotUV.x, 4)).mul(step(0, slotUV.y)).mul(step(slotUV.y, 2));
    const edge = max(abs(cell.x.sub(0.5)).mul(1.1), abs(cell.y.sub(0.5)).mul(1.04));
    const groove = smoothstep(0.43, 0.45, edge).mul(float(1).sub(smoothstep(0.48, 0.5, edge))).mul(inGrid);
    wood = mix(wood, color(0x0a0403), groove.mul(0.85));

    // Old stains.
    const stain = smoothstep(0.55, 0.75, mx_noise_float(vec3(p.x.mul(0.6), p.z.mul(0.6), 9)).mul(0.5).add(0.5));
    wood = mix(wood, color(0x1a0a08), stain.mul(0.5));

    material.colorNode = wood;
    material.roughnessNode = mix(float(0.75), float(0.95), grain.add(0.5));

    const table = new THREE.Mesh(geometry, material);
    table.position.y = -TABLE.thickness / 2;
    table.receiveShadow = true;
    this.scene.add(table);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardNodeMaterial({ color: 0x0c0610, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -4;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  addCandle(position, height) {
    const group = new THREE.Group();
    group.position.copy(position);

    const seed = position.x * 3.7;
    const wax = new THREE.MeshStandardNodeMaterial({ roughness: 0.6 });
    const drip = mx_noise_float(vec3(uv().x.mul(12), positionLocal.y.mul(3), seed));
    wax.colorNode = mix(color(0xe9dcc0), color(0xb8a27c), clamp(drip.add(0.3), 0, 1));
    // Light scattering through the wax near the flame.
    wax.emissiveNode = color(0xff9a40).mul(smoothstep(height * 0.15, height * 0.5, positionLocal.y).mul(0.5));

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, height, 12), wax);
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);

    const flameMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const flicker = mx_noise_float(vec2(time.mul(5), seed));
    const sway = vec3(
      sin(time.mul(7).add(seed)).mul(0.012).add(flicker.mul(0.015)),
      0,
      sin(time.mul(5.3).add(seed)).mul(0.008),
    );
    flameMaterial.positionNode = positionLocal.add(sway.mul(positionLocal.y.add(0.06).mul(14)));
    const core = float(1).sub(smoothstep(-0.04, 0.09, positionLocal.y));
    flameMaterial.colorNode = mix(color(0xff5a14), color(0xffe9a8), core).mul(flicker.mul(0.4).add(4));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8).scale(1, 2.4, 1), flameMaterial);
    flame.position.y = height + 0.1;
    group.add(flame);

    const light = new THREE.PointLight(PALETTE.candle, 4, 7, 1.7);
    light.position.y = height + 0.18;
    group.add(light);

    this.scene.add(group);
    return { light, base: 4 + height * 2, seed: Math.random() * 100 };
  }

  addMoon() {
    const material = new THREE.MeshBasicNodeMaterial({ fog: false });
    const p = positionLocal.mul(1.4);
    const craters = smoothstep(0.0, 0.35, mx_worley_noise_float(p.mul(1.6)));
    const mottling = mx_fractal_noise_float(p.mul(2.5), 4, 2, 0.5).mul(0.5).add(0.5);
    const rim = smoothstep(0.2, 1, positionLocal.z.div(2.6));
    const moonColor = mix(color(0x6b4fb0), color(PALETTE.moon), clamp(mottling.mul(craters), 0, 1));
    material.colorNode = moonColor.mul(rim.mul(0.9).add(0.5)).mul(1.6);

    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 48, 24), material);
    moon.position.set(4.2, 2.3, -17);
    moon.lookAt(0, 2, 5);
    this.scene.add(moon);

    // Soft halo sprite behind it.
    const haloMaterial = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    const d = uv().sub(0.5).length();
    haloMaterial.colorNode = color(0x7d4bd6).mul(0.9);
    haloMaterial.opacityNode = float(1).sub(smoothstep(0.15, 0.5, d)).mul(0.45);
    const halo = new THREE.Sprite(haloMaterial);
    halo.scale.setScalar(12);
    halo.position.copy(moon.position).add(new THREE.Vector3(0, 0, -1));
    this.scene.add(halo);
  }

  addDust() {
    const count = 160;
    const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const seed = vec3(hash(instanceIndex), hash(instanceIndex.add(101)), hash(instanceIndex.add(211)));
    const drift = time.mul(0.04).add(seed.x.mul(10));
    const x = seed.x.mul(10).sub(5).add(sin(drift.mul(3)).mul(0.3));
    const y = fract(seed.y.add(time.mul(0.012).mul(seed.z.add(0.5)))).mul(4.5).add(0.1);
    const z = seed.z.mul(6).sub(3.5).add(sin(drift.mul(2.3)).mul(0.25));
    material.positionNode = vec3(x, y, z);
    material.scaleNode = seed.y.mul(0.018).add(0.008);
    const twinkle = sin(time.mul(seed.z.mul(3).add(1)).add(seed.x.mul(40))).mul(0.5).add(0.5);
    material.colorNode = color(0xffc27a).mul(twinkle.mul(2).add(0.6));
    material.opacityNode = float(1).sub(smoothstep(0.1, 0.5, uv().sub(0.5).length())).mul(0.8);

    const dust = new THREE.Sprite(material);
    dust.count = count;
    dust.frustumCulled = false;
    this.scene.add(dust);
  }

  update(elapsed) {
    for (const candle of this.candles) {
      const t = elapsed * 9 + candle.seed;
      const flicker = Math.sin(t) * 0.25 + Math.sin(t * 2.3) * 0.15 + (Math.random() - 0.5) * 0.25;
      candle.light.intensity = candle.base * (1 + flicker * 0.35);
    }
    this.key.intensity = 9 + Math.sin(elapsed * 1.3) * 0.6;
  }
}
