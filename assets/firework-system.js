const THREE = window.THREE;
const TAU = Math.PI * 2;

const vertexShader = `
  attribute vec3 aDirection;
  attribute float aSpeed;
  attribute float aSeed;
  attribute float aTrail;
  uniform vec3 uOrigin;
  uniform float uAge;
  uniform float uDuration;
  uniform float uPointSize;
  varying float vLife;
  varying float vSeed;
  varying float vTrail;

  void main() {
    float sampleAge = max(0.0, uAge - aTrail * 0.17);
    float life = clamp(sampleAge / uDuration, 0.0, 1.0);
    float dragTime = (1.0 - exp(-1.42 * sampleAge)) / 1.42;
    vec3 travel = aDirection * aSpeed * dragTime;
    travel.y -= 0.34 * sampleAge * sampleAge;
    vec3 worldPosition = uOrigin + travel;
    vec4 viewPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    float flicker = 0.78 + 0.22 * sin(uAge * 32.0 + aSeed * 41.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = uPointSize * (300.0 / max(1.0, -viewPosition.z)) * (0.72 + aSeed * 0.72) * flicker;
    vLife = life;
    vSeed = aSeed;
    vTrail = aTrail;
  }
`;

const fragmentShader = `
  uniform float uHue;
  varying float vLife;
  varying float vSeed;
  varying float vTrail;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float radius = length(centered);
    if (radius > 0.5) discard;
    float core = smoothstep(0.5, 0.02, radius);
    float halo = smoothstep(0.5, 0.14, radius) * 0.48;
    float fadeIn = smoothstep(0.0, 0.06, vLife);
    float fadeOut = 1.0 - smoothstep(0.48, 1.0, vLife);
    float trailFade = 1.0 - vTrail * 0.72;
    float hue = fract(uHue + (vSeed - 0.5) * 0.18 + vTrail * 0.025);
    vec3 color = hsl2rgb(vec3(hue, 0.96, 0.66 + vSeed * 0.2));
    float alpha = (core + halo) * fadeIn * fadeOut * trailFade;
    gl_FragColor = vec4(color * (1.35 + core * 1.2), alpha);
  }
`;

function randomDirection() {
  const y = Math.random() * 2 - 1;
  const angle = Math.random() * TAU;
  const planar = Math.sqrt(1 - y * y);
  return new THREE.Vector3(planar * Math.cos(angle), y, planar * Math.sin(angle));
}

function createGeometry(mobile) {
  const sparkCount = mobile ? 110 : 190;
  const trailSegments = mobile ? 4 : 5;
  const count = sparkCount * trailSegments;
  const positions = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const seeds = new Float32Array(count);
  const trails = new Float32Array(count);
  for (let spark = 0; spark < sparkCount; spark += 1) {
    const direction = randomDirection();
    direction.x += (Math.random() - 0.5) * 0.08;
    direction.y += (Math.random() - 0.5) * 0.08;
    direction.z += (Math.random() - 0.5) * 0.08;
    direction.normalize();
    const speed = 1.72 + Math.pow(Math.random(), 0.42) * 2.25;
    const seed = Math.random();
    for (let trail = 0; trail < trailSegments; trail += 1) {
      const index = spark * trailSegments + trail;
      directions.set([direction.x, direction.y, direction.z], index * 3);
      speeds[index] = speed;
      seeds[index] = seed;
      trails[index] = trail / trailSegments;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aDirection', new THREE.BufferAttribute(directions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aTrail', new THREE.BufferAttribute(trails, 1));
  return geometry;
}

export class FireworkSystem {
  constructor({ scene, mobile }) {
    this.scene = scene;
    this.duration = 1.65;
    this.geometry = createGeometry(mobile);
    this.palette = [0.01, 0.08, 0.47, 0.55, 0.72, 0.86, 0.94];
    this.slots = Array.from({ length: mobile ? 2 : 3 }, () => this.createSlot(mobile));
  }

  createSlot(mobile) {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uOrigin: { value: new THREE.Vector3() },
        uAge: { value: 0 },
        uDuration: { value: this.duration },
        uPointSize: { value: mobile ? 0.105 : 0.09 },
        uHue: { value: 0.55 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(this.geometry, material);
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = 5;
    this.scene.add(points);
    return { points, material, age: this.duration, active: false };
  }

  burstAt(x, y, z = 0) {
    const slot = this.slots.find(item => !item.active) || this.slots.reduce((oldest, item) => item.age > oldest.age ? item : oldest);
    slot.age = 0;
    slot.active = true;
    slot.points.visible = true;
    slot.material.uniforms.uAge.value = 0;
    slot.material.uniforms.uOrigin.value.set(x, y, z);
    slot.material.uniforms.uHue.value = this.palette[Math.floor(Math.random() * this.palette.length)];
  }

  update(delta) {
    this.slots.forEach(slot => {
      if (!slot.active) return;
      slot.age += delta;
      slot.material.uniforms.uAge.value = slot.age;
      if (slot.age >= this.duration) {
        slot.active = false;
        slot.points.visible = false;
      }
    });
  }

  dispose() {
    this.slots.forEach(slot => {
      this.scene.remove(slot.points);
      slot.material.dispose();
    });
    this.geometry.dispose();
  }
}
