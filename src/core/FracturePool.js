import * as THREE from "three/webgpu";

/**
 * Small pool of fracture workers. `fracture()` resolves with centred
 * BufferGeometries (outer/inner material groups preserved) and their centres
 * in the source mesh's local space.
 */
export class FracturePool {
  constructor(size = Math.min(3, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1))) {
    this.workers = Array.from({ length: size }, () => {
      const worker = new Worker(new URL("./fracture.worker.js", import.meta.url), { type: "module" });
      const entry = { worker, busy: 0 };
      worker.onmessage = ({ data }) => this.onResult(entry, data);
      return entry;
    });
    this.pending = new Map();
    this.nextId = 1;
  }

  fracture(geometry, { fragmentCount, impactPoint, impactRadius = 0.5, seed }) {
    const id = this.nextId++;
    const entry = this.workers.reduce((a, b) => (b.busy < a.busy ? b : a));
    entry.busy++;

    const payload = {
      position: new Float32Array(geometry.attributes.position.array),
      normal: new Float32Array(geometry.attributes.normal.array),
      uv: new Float32Array(geometry.attributes.uv.array),
      index: new Uint32Array(geometry.index.array),
      groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      entry.worker.postMessage(
        {
          id,
          geometry: payload,
          fragmentCount,
          impactPoint: impactPoint?.toArray(),
          impactRadius,
          seed: seed ?? Math.floor(Math.random() * 1e9),
        },
        [payload.position.buffer, payload.normal.buffer, payload.uv.buffer, payload.index.buffer],
      );
    });
  }

  onResult(entry, { id, fragments, error }) {
    entry.busy--;
    const job = this.pending.get(id);
    this.pending.delete(id);
    if (!job) return;
    if (error) {
      job.reject(new Error(error));
      return;
    }
    job.resolve(
      fragments.map((f) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(f.position, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(f.normal, 3));
        geometry.setAttribute("uv", new THREE.BufferAttribute(f.uv, 2));
        geometry.setIndex(new THREE.BufferAttribute(f.index, 1));
        for (const g of f.groups) geometry.addGroup(g.start, g.count, g.materialIndex);
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        return { geometry, center: new THREE.Vector3().fromArray(f.center) };
      }),
    );
  }
}
