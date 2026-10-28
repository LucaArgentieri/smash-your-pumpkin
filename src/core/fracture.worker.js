import { BufferAttribute, BufferGeometry, Vector3 } from "three";
import { DestructibleMesh, FractureOptions } from "@dgreenheck/three-pinata";

// Voronoi fracturing is too heavy for the main thread (hundreds of ms for a
// whole pumpkin), so it runs here and only raw arrays cross the boundary.

function toGeometry({ position, normal, uv, index, groups }) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("normal", new BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index, 1));
  for (const g of groups) geometry.addGroup(g.start, g.count, g.materialIndex);
  return geometry;
}

function fromGeometry(geometry, center) {
  return {
    position: geometry.attributes.position.array,
    normal: geometry.attributes.normal.array,
    uv: geometry.attributes.uv.array,
    index: geometry.index.array,
    groups: geometry.groups.map(({ start, count, materialIndex }) => ({ start, count, materialIndex })),
    center: center.toArray(),
  };
}

self.onmessage = ({ data }) => {
  const { id, geometry, fragmentCount, impactPoint, impactRadius, seed } = data;
  try {
    const mesh = new DestructibleMesh(toGeometry(geometry));
    mesh.updateMatrixWorld();

    const options = new FractureOptions({
      fractureMethod: "voronoi",
      fragmentCount,
      seed,
      voronoiOptions: {
        mode: "3D",
        impactPoint: impactPoint ? new Vector3().fromArray(impactPoint) : undefined,
        impactRadius,
      },
    });

    const fragments = mesh.fracture(options).map((f) => fromGeometry(f.geometry, f.position));
    const transfer = fragments.flatMap((f) => [
      f.position.buffer,
      f.normal.buffer,
      f.uv.buffer,
      f.index.buffer,
    ]);
    self.postMessage({ id, fragments }, transfer);
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
