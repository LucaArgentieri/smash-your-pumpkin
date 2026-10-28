import * as THREE from "three/webgpu";
import { cameraProjectionMatrix, cameraViewMatrix, floor, Fn, positionWorld, uniform, uv, varying, vec4 } from "three/tsl";

// PS1-era rendering traits, shared by every scene material: vertices snapped
// to the low-res pixel grid (the familiar wobble when the camera moves),
// affine texture mapping (textures swim across big polygons) and unfiltered
// texels. The low internal resolution itself lives in Renderer.

/** Size in pixels of the grid vertices snap to; set by Renderer on resize. */
export const snapGrid = uniform(new THREE.Vector2(320, 240));

const clipPosition = () => cameraProjectionMatrix.mul(cameraViewMatrix).mul(positionWorld);

const snappedVertex = Fn(() => {
  const clip = clipPosition();
  const half = snapGrid.mul(0.5);
  const ndc = clip.xy.div(clip.w);
  const snapped = floor(ndc.mul(half)).add(0.5).div(half);
  return vec4(snapped.mul(clip.w), clip.z, clip.w);
});

/** Applies vertex snapping to a material (not to sprites, which place themselves). */
export function ps1(material) {
  material.vertexNode = snappedVertex();
  return material;
}

/**
 * UVs interpolated without perspective correction: multiplied by clip w in
 * the vertex stage, divided back per pixel, so the division happens after
 * linear interpolation instead of before.
 */
export function affineUV(source = uv()) {
  const w = clipPosition().w;
  return varying(source.mul(w)).div(varying(w));
}

/** No texture filtering, like the original hardware (image textures only). */
export function unfiltered(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.needsUpdate = true;
  return texture;
}
