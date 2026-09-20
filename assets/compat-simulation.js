import { createModelData, MODEL_INDEX } from './model-library.js';

const THREE = window.THREE;

const vertexShader = `
  attribute float aSize;
  attribute float aSeed;
  attribute float aGroup;
  varying vec3 vColor;
  varying float vSeed;
  uniform float uPointSize;
  uniform float uBaseHue;
  uniform float uHueShift;
  uniform float uModel;

  vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
  }

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float hue = fract(uBaseHue + uHueShift + aSeed * 0.14 + aGroup * 0.24);
    if (uModel == 3.0) hue = fract(aGroup * 0.82 + aSeed * 0.18 + uHueShift);
    if (uModel == 4.0) hue = mix(0.55, 0.32, step(0.48, aGroup)) + aSeed * 0.045;
    vColor = hsl2rgb(vec3(fract(hue), 0.92, 0.6 + aSeed * 0.2));
    vSeed = aSeed;
    gl_PointSize = aSize * uPointSize * (205.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  precision highp float;
  uniform float uGlow;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float distanceToCenter = length(uv);
    if (distanceToCenter > 0.5) discard;
    float core = smoothstep(0.34, 0.025, distanceToCenter);
    float halo = smoothstep(0.5, 0.06, distanceToCenter) * 0.46;
    gl_FragColor = vec4(vColor * (core * 1.12 + halo * uGlow), (core + halo * uGlow) * 0.94);
  }
`;

export class CompatParticleSimulation {
  constructor({ scene, count, model = 'saturn' }) {
    this.scene = scene;
    this.count = count;
    this.model = model;
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.18);
    this.scene.add(this.group);
    this.modelData = createModelData(model, count);
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.geometry = new THREE.BufferGeometry();
    const seeds = new Float32Array(count);
    const groups = new Float32Array(count);
    const sizes = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const offset3 = index * 3;
      const offset4 = index * 4;
      this.positions[offset3] = (Math.random() - 0.5) * 10;
      this.positions[offset3 + 1] = (Math.random() - 0.5) * 7;
      this.positions[offset3 + 2] = (Math.random() - 0.5) * 5;
      seeds[index] = this.modelData.aux[offset4];
      groups[index] = this.modelData.aux[offset4 + 1];
      sizes[index] = this.modelData.aux[offset4 + 2];
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aGroup', new THREE.BufferAttribute(groups, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPointSize: { value: 0.082 }, uBaseHue: { value: 0.53 }, uHueShift: { value: 0 },
        uGlow: { value: 0.92 }, uModel: { value: MODEL_INDEX[model] }
      }
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setModel(model) {
    this.model = model;
    this.modelData = createModelData(model, this.count);
    this.material.uniforms.uModel.value = MODEL_INDEX[model];
    const seeds = this.geometry.getAttribute('aSeed');
    const groups = this.geometry.getAttribute('aGroup');
    const sizes = this.geometry.getAttribute('aSize');
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 4;
      seeds.array[index] = this.modelData.aux[offset];
      groups.array[index] = this.modelData.aux[offset + 1];
      sizes.array[index] = this.modelData.aux[offset + 2];
    }
    seeds.needsUpdate = true;
    groups.needsUpdate = true;
    sizes.needsUpdate = true;
  }

  update(delta, state) {
    const frameScale = Math.min(delta * 60, 1.5);
    const target = this.modelData.target;
    for (let index = 0; index < this.count; index += 1) {
      const offset3 = index * 3;
      const offset4 = index * 4;
      let targetX = target[offset4] * state.scale * this.modelData.meta.scale;
      let targetY = target[offset4 + 1] * state.scale * this.modelData.meta.scale;
      let targetZ = target[offset4 + 2] * state.scale * this.modelData.meta.scale;
      if (this.model === 'flower' || this.model === 'epiphyllum') {
        const bloom = 0.94 + 0.06 * Math.sin(state.time * 0.65 + target[offset4 + 3] * 6.28);
        targetX *= bloom;
        targetZ *= bloom;
      }
      let vx = this.velocities[offset3] + (targetX - this.positions[offset3]) * state.attraction * frameScale;
      let vy = this.velocities[offset3 + 1] + (targetY - this.positions[offset3 + 1]) * state.attraction * frameScale;
      let vz = this.velocities[offset3 + 2] + (targetZ - this.positions[offset3 + 2]) * state.attraction * frameScale;
      const dx = this.positions[offset3] - state.hand.x;
      const dy = this.positions[offset3 + 1] - state.hand.y;
      const distance = Math.hypot(dx, dy);
      if (state.handStrength > 0 && distance < 2.15) {
        const influence = (1 - distance / 2.15) * state.handStrength;
        const inverse = 1 / Math.max(distance, 0.06);
        vx += (dx * inverse * 0.09 - dy * inverse * 0.07 + state.handVelocity.x * 0.3) * influence;
        vy += (dy * inverse * 0.09 + dx * inverse * 0.07 + state.handVelocity.y * 0.3) * influence;
      }
      if (state.burst > 0) {
        const bx = this.positions[offset3] - state.burstOrigin.x;
        const by = this.positions[offset3 + 1] - state.burstOrigin.y;
        const bz = this.positions[offset3 + 2] - state.burstOrigin.z;
        const burstDistance = Math.hypot(bx, by, bz);
        if (burstDistance < 4.6) {
          const power = state.burst * (1 - burstDistance / 4.6) * 0.18 / Math.max(burstDistance, 0.08);
          vx += bx * power;
          vy += by * power;
          vz += bz * power;
        }
      }
      const damping = Math.pow(state.damping, frameScale);
      vx *= damping;
      vy *= damping;
      vz *= damping;
      this.velocities[offset3] = vx;
      this.velocities[offset3 + 1] = vy;
      this.velocities[offset3 + 2] = vz;
      this.positions[offset3] += vx * frameScale;
      this.positions[offset3 + 1] += vy * frameScale;
      this.positions[offset3 + 2] += vz * frameScale;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.material.uniforms.uHueShift.value = this.group.rotation.y * 0.075;
  }

  setVisuals({ hue, glow, pointSize }) {
    this.material.uniforms.uBaseHue.value = hue;
    this.material.uniforms.uGlow.value = glow;
    this.material.uniforms.uPointSize.value = pointSize;
  }

  setRotation(x, y) {
    this.group.rotation.x = x;
    this.group.rotation.y = y;
  }

  dispose() {
    this.scene.remove(this.group);
    this.geometry.dispose();
    this.material.dispose();
  }
}
