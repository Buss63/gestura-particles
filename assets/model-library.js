export const MODEL_META = [
  { id: 'heart', name: '爱心', tag: '01 / 心动', scale: 1.02, rotationLimit: 1.0 },
  { id: 'flower', name: '花朵', tag: '02 / 盛放', scale: 1.03, rotationLimit: 1.0 },
  { id: 'saturn', name: '土星', tag: '03 / 星环', scale: 1.05, rotationLimit: 1.0 },
  { id: 'firework', name: '烟花', tag: '04 / 绽放', scale: 1.0, rotationLimit: 1.0 },
  { id: 'earth', name: '地球', tag: '05 / 蓝星', scale: 1.05, rotationLimit: 1.0 },
  { id: 'landscape', name: '千里江山', tag: '06 / 山水', scale: 0.92, rotationLimit: 0.42 },
  { id: 'epiphyllum', name: '昙花', tag: '07 / 一现', scale: 1.02, rotationLimit: 0.86 }
];

export const MODEL_INDEX = Object.fromEntries(MODEL_META.map((item, index) => [item.id, index]));

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rngFactory(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(value, center, width) {
  const delta = (value - center) / width;
  return Math.exp(-delta * delta);
}

function write(target, aux, index, x, y, z, group, seed, size, phase) {
  const offset = index * 4;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
  target[offset + 3] = phase;
  aux[offset] = seed;
  aux[offset + 1] = group;
  aux[offset + 2] = size;
  aux[offset + 3] = phase;
}

function heartPoint(random, index, count) {
  const t = random() * TAU;
  const shell = Math.pow(random(), 0.42);
  const hx = 16 * Math.pow(Math.sin(t), 3) / 16;
  const hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
  const depth = (random() - 0.5) * 0.7 * (0.25 + 0.75 * (1 - shell));
  return [hx * shell * 2.2, (hy * shell - 0.1) * 2.05, depth, 0.08 + 0.18 * (index / count)];
}

function flowerPoint(random) {
  const petal = Math.floor(random() * 10);
  const along = Math.pow(random(), 0.52);
  const width = (random() - 0.5) * Math.sin(along * Math.PI);
  const angle = petal * TAU / 10 + width * 0.58;
  const lift = 0.22 + Math.sin(along * Math.PI) * 0.72;
  const radius = 0.15 + along * (1.65 + 0.26 * Math.sin(petal * 1.7));
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius * 0.86;
  const y = (along - 0.32) * lift + Math.cos(along * Math.PI) * 0.16;
  return [x, y, z, petal / 10];
}

function saturnPoint(random) {
  if (random() < 0.54) {
    const u = random() * 2 - 1;
    const angle = random() * TAU;
    const radius = 0.96 + (random() - 0.5) * 0.08;
    const planar = Math.sqrt(1 - u * u);
    return [radius * planar * Math.cos(angle), radius * u, radius * planar * Math.sin(angle), 0.15];
  }
  const band = Math.floor(random() * 5);
  const angle = random() * TAU;
  const radius = 1.35 + band * 0.2 + (random() - 0.5) * 0.11;
  const tilt = 0.42;
  const x = Math.cos(angle) * radius;
  const rawY = (random() - 0.5) * 0.045;
  const rawZ = Math.sin(angle) * radius;
  return [x, rawY * Math.cos(tilt) - rawZ * Math.sin(tilt), rawY * Math.sin(tilt) + rawZ * Math.cos(tilt), 0.4 + band * 0.1];
}

function fireworkPoint(random, index) {
  if (random() < 0.16) {
    const radius = Math.pow(random(), 0.45) * 0.55;
    const u = random() * 2 - 1;
    const angle = random() * TAU;
    const planar = Math.sqrt(1 - u * u);
    return [radius * planar * Math.cos(angle), radius * u, radius * planar * Math.sin(angle), 0.05];
  }
  const ray = index % 64;
  const azimuth = ray * TAU / 64 + (random() - 0.5) * 0.08;
  const elevation = ((ray * 17) % 31) / 30 * Math.PI - Math.PI / 2;
  const radius = 0.22 + Math.pow(random(), 0.48) * 2.55;
  return [
    Math.cos(elevation) * Math.cos(azimuth) * radius,
    Math.sin(elevation) * radius,
    Math.cos(elevation) * Math.sin(azimuth) * radius,
    ray / 64
  ];
}

function earthPoint(random) {
  const u = random() * 2 - 1;
  const longitude = random() * TAU;
  const radius = 1.35 + (random() - 0.5) * 0.035;
  const planar = Math.sqrt(1 - u * u);
  const latitude = Math.asin(u);
  const landField = Math.sin(longitude * 2.1 + Math.sin(latitude * 4.2)) +
    0.62 * Math.sin(longitude * 5.2 - latitude * 2.8) +
    0.35 * Math.cos(longitude * 9.1 + latitude * 5.6);
  const polar = Math.abs(latitude) > 1.12;
  const group = polar ? 0.94 : landField > 0.45 ? 0.62 : 0.22;
  return [radius * planar * Math.cos(longitude), radius * u, radius * planar * Math.sin(longitude), group];
}

function landscapePoint(random) {
  const role = random();
  const x = (random() - 0.5) * 6.2;
  if (role < 0.66) {
    const layer = Math.floor(random() * 4);
    const peaks = gaussian(x, -2.25, 0.74) * 1.35 + gaussian(x, -0.75, 0.55) * 1.8 +
      gaussian(x, 0.72, 0.9) * 1.46 + gaussian(x, 2.35, 0.62) * 1.12;
    const ridge = peaks * (0.55 + layer * 0.16) + Math.sin(x * (2.2 + layer * 0.2)) * 0.08;
    const y = -0.74 + random() * Math.max(0.15, ridge);
    const z = (layer - 1.5) * 0.28 + (random() - 0.5) * 0.12;
    return [x, y, z, 0.45 + layer * 0.1];
  }
  if (role < 0.86) {
    const y = -1.12 + random() * 0.38;
    const z = (random() - 0.5) * 0.82;
    return [x, y + Math.sin(x * 2.7 + z * 5.0) * 0.04, z, 0.16];
  }
  const cloudX = (random() - 0.5) * 5.2;
  const cloudY = 0.25 + random() * 1.4;
  return [cloudX, cloudY, (random() - 0.5) * 0.5, 0.82];
}

function epiphyllumPoint(random) {
  if (random() < 0.12) {
    const angle = random() * TAU;
    const radius = random() * 0.22;
    return [Math.cos(angle) * radius, (random() - 0.5) * 1.4, Math.sin(angle) * radius, 0.92];
  }
  const petal = Math.floor(random() * 16);
  const along = Math.pow(random(), 0.62);
  const angle = petal * TAU / 16 + (random() - 0.5) * 0.12;
  const curl = Math.sin(along * Math.PI) * (0.45 + (petal % 2) * 0.18);
  const radius = 0.1 + along * (1.45 + 0.25 * (petal % 3));
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = -0.42 + along * 0.68 + curl;
  return [x, y, z, petal / 16];
}

const generators = { heart: heartPoint, flower: flowerPoint, saturn: saturnPoint, firework: fireworkPoint, earth: earthPoint, landscape: landscapePoint, epiphyllum: epiphyllumPoint };

export function createModelData(kind, count) {
  const generator = generators[kind] || generators.saturn;
  const seed = 0x9e3779b9 ^ (MODEL_INDEX[kind] ?? 0) * 0x85ebca6b ^ count;
  const random = rngFactory(seed);
  const target = new Float32Array(count * 4);
  const aux = new Float32Array(count * 4);
  for (let index = 0; index < count; index += 1) {
    const point = generator(random, index, count);
    const pointSeed = random();
    const size = 0.62 + random() * 0.92;
    write(target, aux, index, point[0], point[1], point[2], clamp(point[3], 0, 1), pointSeed, size, random());
  }
  return { target, aux, meta: MODEL_META[MODEL_INDEX[kind] ?? 2] };
}

export function textureSideForCount(requested, mobile = false) {
  const maxSide = mobile ? 160 : 256;
  const minSide = mobile ? 96 : 128;
  const side = Math.ceil(Math.sqrt(requested) / 32) * 32;
  return clamp(side, minSide, maxSide);
}
