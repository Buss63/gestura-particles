import { createModelData, MODEL_INDEX } from './model-library.js';

const THREE = window.THREE;

const fullscreenVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const copyFragment = `
  precision highp float;
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(uTexture, vUv); }
`;

const velocityFragment = `
  precision highp float;
  uniform sampler2D uPosition;
  uniform sampler2D uVelocity;
  uniform sampler2D uTarget;
  uniform float uTime;
  uniform float uDelta;
  uniform float uScale;
  uniform float uAttraction;
  uniform float uDamping;
  uniform float uModel;
  uniform vec3 uHand;
  uniform vec2 uHandVelocity;
  uniform float uHandStrength;
  uniform vec3 uBurstOrigin;
  uniform float uBurst;
  varying vec2 vUv;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec4 positionSample = texture2D(uPosition, vUv);
    vec3 position = positionSample.xyz;
    vec3 velocity = texture2D(uVelocity, vUv).xyz;
    vec4 targetSample = texture2D(uTarget, vUv);
    vec3 desired = targetSample.xyz * uScale;
    float phase = targetSample.w * 6.2831853;

    if (uModel == 1.0) {
      float bloom = 0.94 + 0.06 * sin(uTime * 0.72 + phase);
      desired.xz *= bloom;
      desired.y += 0.035 * sin(uTime + phase);
    } else if (uModel == 3.0) {
      desired *= 1.0 + 0.028 * sin(uTime * 1.5 + phase * 2.0);
    } else if (uModel == 6.0) {
      float breath = 0.90 + 0.10 * sin(uTime * 0.52 + phase * 0.35);
      desired.xz *= breath;
      desired.y *= 0.96 + 0.04 * sin(uTime * 0.6 + phase);
    }

    vec3 force = (desired - position) * uAttraction;
    float noiseSeed = hash(vec3(vUv, uTime * 0.025));
    vec3 drift = vec3(
      sin(uTime * 0.31 + position.y * 1.7 + noiseSeed * 6.0),
      cos(uTime * 0.27 + position.z * 1.5 + noiseSeed * 4.0),
      sin(uTime * 0.29 + position.x * 1.8 + noiseSeed * 5.0)
    ) * 0.0035;
    force += drift;

    vec2 handDelta = position.xy - uHand.xy;
    float handDistance = length(handDelta);
    float influence = smoothstep(2.15, 0.0, handDistance) * uHandStrength;
    vec2 radial = handDelta / max(handDistance, 0.06);
    vec2 tangent = vec2(-radial.y, radial.x);
    force.xy += (radial * 0.115 + tangent * (0.095 + length(uHandVelocity) * 1.8)) * influence;
    force.xy += uHandVelocity * influence * 0.42;

    vec3 burstDelta = position - uBurstOrigin;
    float burstDistance = length(burstDelta);
    vec3 burstDirection = burstDelta / max(burstDistance, 0.08);
    force += burstDirection * uBurst * (0.32 + noiseSeed * 0.46) * smoothstep(4.9, 0.0, burstDistance);

    velocity += force * min(uDelta * 60.0, 1.5);
    velocity *= pow(uDamping, min(uDelta * 60.0, 2.0));
    float speed = length(velocity);
    float speedLimit = mix(0.34, 0.76, clamp(uBurst, 0.0, 1.0));
    if (speed > speedLimit) velocity *= speedLimit / speed;
    gl_FragColor = vec4(velocity, 1.0);
  }
`;

const positionFragment = `
  precision highp float;
  uniform sampler2D uPosition;
  uniform sampler2D uVelocity;
  uniform float uDelta;
  varying vec2 vUv;
  void main() {
    vec4 current = texture2D(uPosition, vUv);
    vec3 velocity = texture2D(uVelocity, vUv).xyz;
    vec3 nextPosition = current.xyz + velocity * min(uDelta * 60.0, 1.5);
    if (length(nextPosition) > 30.0) nextPosition *= 0.08;
    gl_FragColor = vec4(nextPosition, current.w);
  }
`;

const particleVertex = `
  precision highp float;
  attribute vec2 aReference;
  attribute float aSeed;
  attribute float aGroup;
  attribute float aSize;
  uniform sampler2D uPosition;
  uniform float uPointSize;
  uniform float uBaseHue;
  uniform float uHueShift;
  uniform float uModel;
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;

  vec3 hsl2rgb(vec3 hsl) {
    vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + hsl.y * (rgb - 0.5) * (1.0 - abs(2.0 * hsl.z - 1.0));
  }

  void main() {
    vec3 particlePosition = texture2D(uPosition, aReference).xyz;
    vec4 mvPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    float hue = fract(uBaseHue + uHueShift + aSeed * 0.14 + aGroup * 0.24);
    if (uModel == 3.0) hue = fract(aGroup * 0.82 + aSeed * 0.18 + uHueShift);
    if (uModel == 4.0) hue = mix(0.55, 0.32, step(0.48, aGroup)) + aSeed * 0.045;
    if (uModel == 5.0) hue = mix(0.58, 0.48, aGroup) + aSeed * 0.06;
    float lightness = 0.58 + aSeed * 0.22;
    vColor = hsl2rgb(vec3(fract(hue), 0.92, lightness));
    vSeed = aSeed;
    gl_PointSize = aSize * uPointSize * (205.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const particleFragment = `
  precision highp float;
  uniform float uGlow;
  uniform float uTime;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float distanceToCenter = length(uv);
    if (distanceToCenter > 0.5) discard;
    float core = smoothstep(0.34, 0.025, distanceToCenter);
    float halo = smoothstep(0.5, 0.06, distanceToCenter) * 0.46;
    float twinkle = 0.83 + 0.17 * sin(uTime * (0.7 + vSeed) + vSeed * 45.0);
    float alpha = (core + halo * uGlow) * twinkle;
    gl_FragColor = vec4(vColor * (core * 1.12 + halo * uGlow), alpha);
  }
`;

function makeTexture(data, side) {
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  return texture;
}

function makeRenderTarget(side) {
  return new THREE.WebGLRenderTarget(side, side, {
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false
  });
}

export function detectGpuSimulation(renderer) {
  const context = renderer.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && context instanceof WebGL2RenderingContext;
  const colorBufferFloat = Boolean(context.getExtension('EXT_color_buffer_float'));
  const vertexTextures = renderer.capabilities.maxVertexTextures > 0;
  return { supported: isWebGL2 && colorBufferFloat && vertexTextures, isWebGL2, colorBufferFloat, vertexTextures };
}

export class GpuParticleSimulation {
  constructor({ renderer, scene, side, model = 'saturn' }) {
    this.renderer = renderer;
    this.scene = scene;
    this.side = side;
    this.count = side * side;
    this.model = model;
    this.group = new THREE.Group();
    this.group.scale.setScalar(1.18);
    this.scene.add(this.group);
    this.computeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.computeScene = new THREE.Scene();
    this.computeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.computeScene.add(this.computeQuad);
    this.positionTargets = [makeRenderTarget(side), makeRenderTarget(side)];
    this.velocityTargets = [makeRenderTarget(side), makeRenderTarget(side)];
    this.readIndex = 0;
    this.modelData = createModelData(model, this.count);
    this.targetTexture = makeTexture(this.modelData.target, side);
    this.copyMaterial = new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader: copyFragment, uniforms: { uTexture: { value: null } }, depthTest: false, depthWrite: false });
    this.velocityMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: velocityFragment,
      uniforms: {
        uPosition: { value: null }, uVelocity: { value: null }, uTarget: { value: this.targetTexture },
        uTime: { value: 0 }, uDelta: { value: 1 / 60 }, uScale: { value: 1 },
        uAttraction: { value: 0.052 }, uDamping: { value: 0.91 }, uModel: { value: MODEL_INDEX[model] },
        uHand: { value: new THREE.Vector3(99, 99, 0) }, uHandVelocity: { value: new THREE.Vector2() }, uHandStrength: { value: 0 },
        uBurstOrigin: { value: new THREE.Vector3() }, uBurst: { value: 0 }
      }, depthTest: false, depthWrite: false
    });
    this.positionMaterial = new THREE.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: positionFragment,
      uniforms: { uPosition: { value: null }, uVelocity: { value: null }, uDelta: { value: 1 / 60 } },
      depthTest: false, depthWrite: false
    });
    this.initializeTextures();
    this.createParticles();
  }

  renderCompute(material, target) {
    const previousTarget = this.renderer.getRenderTarget();
    this.computeQuad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.computeScene, this.computeCamera);
    this.renderer.setRenderTarget(previousTarget);
  }

  copyTexture(texture, target) {
    this.copyMaterial.uniforms.uTexture.value = texture;
    this.renderCompute(this.copyMaterial, target);
  }

  initializeTextures() {
    const positionData = new Float32Array(this.count * 4);
    const velocityData = new Float32Array(this.count * 4);
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 4;
      positionData[offset] = (Math.random() - 0.5) * 10;
      positionData[offset + 1] = (Math.random() - 0.5) * 7;
      positionData[offset + 2] = (Math.random() - 0.5) * 5;
      positionData[offset + 3] = this.modelData.target[offset + 3];
      velocityData[offset + 3] = 1;
    }
    const positionTexture = makeTexture(positionData, this.side);
    const velocityTexture = makeTexture(velocityData, this.side);
    this.copyTexture(positionTexture, this.positionTargets[0]);
    this.copyTexture(positionTexture, this.positionTargets[1]);
    this.copyTexture(velocityTexture, this.velocityTargets[0]);
    this.copyTexture(velocityTexture, this.velocityTargets[1]);
    positionTexture.dispose();
    velocityTexture.dispose();
  }

  createParticles() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.count * 3);
    const references = new Float32Array(this.count * 2);
    const seeds = new Float32Array(this.count);
    const groups = new Float32Array(this.count);
    const sizes = new Float32Array(this.count);
    for (let index = 0; index < this.count; index += 1) {
      const x = index % this.side;
      const y = Math.floor(index / this.side);
      references[index * 2] = (x + 0.5) / this.side;
      references[index * 2 + 1] = (y + 0.5) / this.side;
      seeds[index] = this.modelData.aux[index * 4];
      groups[index] = this.modelData.aux[index * 4 + 1];
      sizes[index] = this.modelData.aux[index * 4 + 2];
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aReference', new THREE.BufferAttribute(references, 2));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aGroup', new THREE.BufferAttribute(groups, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPosition: { value: this.positionTargets[this.readIndex].texture },
        uPointSize: { value: 0.074 }, uBaseHue: { value: 0.53 }, uHueShift: { value: 0 },
        uGlow: { value: 0.92 }, uModel: { value: MODEL_INDEX[this.model] }, uTime: { value: 0 }
      }
    });
    this.points = new THREE.Points(geometry, this.particleMaterial);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  setModel(model) {
    this.model = model;
    this.modelData = createModelData(model, this.count);
    this.targetTexture.dispose();
    this.targetTexture = makeTexture(this.modelData.target, this.side);
    this.velocityMaterial.uniforms.uTarget.value = this.targetTexture;
    this.velocityMaterial.uniforms.uModel.value = MODEL_INDEX[model];
    this.particleMaterial.uniforms.uModel.value = MODEL_INDEX[model];
    const seedAttribute = this.points.geometry.getAttribute('aSeed');
    const groupAttribute = this.points.geometry.getAttribute('aGroup');
    const sizeAttribute = this.points.geometry.getAttribute('aSize');
    for (let index = 0; index < this.count; index += 1) {
      seedAttribute.array[index] = this.modelData.aux[index * 4];
      groupAttribute.array[index] = this.modelData.aux[index * 4 + 1];
      sizeAttribute.array[index] = this.modelData.aux[index * 4 + 2];
    }
    seedAttribute.needsUpdate = true;
    groupAttribute.needsUpdate = true;
    sizeAttribute.needsUpdate = true;
  }

  update(delta, state) {
    const readPosition = this.positionTargets[this.readIndex];
    const readVelocity = this.velocityTargets[this.readIndex];
    const writeIndex = 1 - this.readIndex;
    const writeVelocity = this.velocityTargets[writeIndex];
    const writePosition = this.positionTargets[writeIndex];
    const velocityUniforms = this.velocityMaterial.uniforms;
    velocityUniforms.uPosition.value = readPosition.texture;
    velocityUniforms.uVelocity.value = readVelocity.texture;
    velocityUniforms.uTarget.value = this.targetTexture;
    velocityUniforms.uTime.value = state.time;
    velocityUniforms.uDelta.value = delta;
    velocityUniforms.uScale.value = state.scale * this.modelData.meta.scale;
    velocityUniforms.uAttraction.value = state.attraction;
    velocityUniforms.uDamping.value = state.damping;
    velocityUniforms.uHand.value.copy(state.hand);
    velocityUniforms.uHandVelocity.value.copy(state.handVelocity);
    velocityUniforms.uHandStrength.value = state.handStrength;
    velocityUniforms.uBurstOrigin.value.copy(state.burstOrigin);
    velocityUniforms.uBurst.value = state.burst;
    this.renderCompute(this.velocityMaterial, writeVelocity);
    this.positionMaterial.uniforms.uPosition.value = readPosition.texture;
    this.positionMaterial.uniforms.uVelocity.value = writeVelocity.texture;
    this.positionMaterial.uniforms.uDelta.value = delta;
    this.renderCompute(this.positionMaterial, writePosition);
    this.readIndex = writeIndex;
    this.particleMaterial.uniforms.uPosition.value = writePosition.texture;
    this.particleMaterial.uniforms.uTime.value = state.time;
    this.particleMaterial.uniforms.uHueShift.value = this.group.rotation.y * 0.075;
  }

  setVisuals({ hue, glow, pointSize }) {
    this.particleMaterial.uniforms.uBaseHue.value = hue;
    this.particleMaterial.uniforms.uGlow.value = glow;
    this.particleMaterial.uniforms.uPointSize.value = pointSize;
  }

  setRotation(x, y) {
    this.group.rotation.x = x;
    this.group.rotation.y = y;
  }

  dispose() {
    this.scene.remove(this.group);
    this.points.geometry.dispose();
    this.particleMaterial.dispose();
    this.targetTexture.dispose();
    this.copyMaterial.dispose();
    this.velocityMaterial.dispose();
    this.positionMaterial.dispose();
    this.computeQuad.geometry.dispose();
    this.positionTargets.forEach(target => target.dispose());
    this.velocityTargets.forEach(target => target.dispose());
  }
}
