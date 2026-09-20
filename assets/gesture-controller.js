const HAND_SOURCES = [
  { script: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js', assets: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/', name: '主识别通道' },
  { script: 'https://unpkg.com/@mediapipe/hands/hands.js', assets: 'https://unpkg.com/@mediapipe/hands/', name: '备用识别通道' }
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.src === url);
    if (existing) {
      if (window.Hands) resolve();
      else {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
      }
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('script-load-failed'));
    document.head.appendChild(script);
  });
}

export class GestureController {
  constructor({ video, mobile, onGesture, onStatus }) {
    this.video = video;
    this.mobile = mobile;
    this.onGesture = onGesture;
    this.onStatus = onStatus;
    this.sourceIndex = 0;
    this.hands = null;
    this.stream = null;
    this.running = false;
    this.lastFrame = 0;
    this.failures = 0;
    this.lastSeen = 0;
    this.lastBurst = -Infinity;
    this.candidateType = 'palm';
    this.candidateSince = 0;
    this.stableType = 'palm';
    this.smooth = { x: 0.5, y: 0.5, openness: 1 };
    this.previous = { x: 0.5, y: 0.5, time: performance.now() };
  }

  async loadLibrary() {
    if (window.Hands) return;
    let lastError;
    for (let index = 0; index < HAND_SOURCES.length; index += 1) {
      try {
        this.sourceIndex = index;
        this.onStatus('loading', `正在加载${HAND_SOURCES[index].name}`);
        await loadScript(HAND_SOURCES[index].script);
        if (window.Hands) return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('hands-unavailable');
  }

  configure() {
    const source = HAND_SOURCES[this.sourceIndex];
    this.hands = new window.Hands({ locateFile: file => source.assets + file });
    this.hands.setOptions({
      maxNumHands: this.mobile ? 1 : 2,
      modelComplexity: this.mobile ? 0 : 1,
      minDetectionConfidence: this.mobile ? 0.34 : 0.42,
      minTrackingConfidence: this.mobile ? 0.32 : 0.42
    });
    this.hands.onResults(results => this.handleResults(results));
  }

  fingerExtended(landmarks, tipIndex, pipIndex, mcpIndex) {
    const wrist = landmarks[0];
    const tipDistance = distance(landmarks[tipIndex], wrist);
    const pipDistance = distance(landmarks[pipIndex], wrist);
    const segmentStraightness = distance(landmarks[tipIndex], landmarks[mcpIndex]) / Math.max(0.001, distance(landmarks[pipIndex], landmarks[mcpIndex]));
    return tipDistance > pipDistance * 1.04 && segmentStraightness > 1.22;
  }

  classify(landmarks) {
    const wrist = landmarks[0];
    const palmSize = Math.max(0.001, distance(landmarks[9], wrist));
    const extended = {
      index: this.fingerExtended(landmarks, 8, 6, 5),
      middle: this.fingerExtended(landmarks, 12, 10, 9),
      ring: this.fingerExtended(landmarks, 16, 14, 13),
      pinky: this.fingerExtended(landmarks, 20, 18, 17)
    };
    const tipDistances = [4, 8, 12, 16, 20].map(index => distance(landmarks[index], wrist) / palmSize);
    const rawOpenness = tipDistances.reduce((sum, value) => sum + value, 0) / tipDistances.length;
    const openness = clamp((rawOpenness - 1.05) / 0.92, 0, 1);
    const vSeparation = distance(landmarks[8], landmarks[12]) / palmSize;
    const foldedOthers = [extended.middle, extended.ring, extended.pinky].filter(value => !value).length;
    const foldedVictoryFingers = [extended.ring, extended.pinky].filter(value => !value).length;
    const victory = extended.index && extended.middle && foldedVictoryFingers >= 1 && vSeparation > 0.24;
    const pointing = extended.index && !extended.middle && foldedOthers >= 2;
    return { type: victory ? 'victory' : pointing ? 'point' : 'palm', openness };
  }

  stabilize(candidate, now) {
    if (candidate !== this.candidateType) {
      this.candidateType = candidate;
      this.candidateSince = now;
    }
    const required = candidate === 'point' ? 70 : candidate === 'victory' ? 95 : 60;
    if (candidate !== this.stableType && now - this.candidateSince >= required) this.stableType = candidate;
    return this.stableType;
  }

  handleResults(results) {
    const landmarks = results.multiHandLandmarks && results.multiHandLandmarks[0];
    const now = performance.now();
    if (!landmarks) {
      if (now - this.lastSeen > 600) {
        this.onStatus('searching', this.mobile ? '请把整只手放入右上角画面' : '请让手心完整出现在摄像头画面');
        this.onGesture({ active: false, type: 'none' });
      }
      return;
    }
    this.lastSeen = now;
    const classification = this.classify(landmarks);
    const type = this.stabilize(classification.type, now);
    const rawX = 1 - landmarks[9].x;
    const rawY = landmarks[9].y;
    const previousX = this.smooth.x;
    const previousY = this.smooth.y;
    const positionSmoothing = type === 'victory' ? 0.32 : 0.46;
    this.smooth.x += (rawX - this.smooth.x) * positionSmoothing;
    this.smooth.y += (rawY - this.smooth.y) * positionSmoothing;
    this.smooth.openness += (classification.openness - this.smooth.openness) * 0.44;
    const elapsed = Math.max(16, now - this.previous.time);
    const velocityX = (this.smooth.x - previousX) * 1000 / elapsed;
    const velocityY = (this.smooth.y - previousY) * 1000 / elapsed;
    this.previous = { x: this.smooth.x, y: this.smooth.y, time: now };
    const event = {
      active: true,
      type,
      openness: this.smooth.openness,
      x: this.smooth.x,
      y: this.smooth.y,
      velocityX,
      velocityY,
      rotateX: type === 'victory' ? (this.smooth.y - previousY) * 8.6 : 0,
      rotateY: type === 'victory' ? (this.smooth.x - previousX) * 11.8 : 0,
      burst: false,
      tipX: 1 - landmarks[8].x,
      tipY: landmarks[8].y
    };
    if (type === 'point' && now - this.lastBurst > 860) {
      event.burst = true;
      this.lastBurst = now;
    }
    this.onGesture(event);
    if (type === 'point') this.onStatus('point', '单食指 · 指尖烟花');
    else if (type === 'victory') this.onStatus('victory', 'V 手势 · 摇摆旋转');
    else if (this.smooth.openness < 0.38) this.onStatus('closed', '握拳 · 粒子聚合');
    else this.onStatus('open', '张掌 · 粒子展开');
  }

  async start() {
    try {
      this.onStatus('loading', '正在连接摄像头与识别模块');
      if (!this.stream) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: this.mobile ? 640 : 960 }, height: { ideal: this.mobile ? 480 : 720 } },
          audio: false
        });
        this.video.srcObject = this.stream;
        await this.video.play();
        this.video.classList.add('on');
      }
      await this.loadLibrary();
      this.configure();
      this.failures = 0;
      this.running = true;
      this.onStatus('searching', '手心朝向镜头，让整只手进入画面');
      requestAnimationFrame(time => this.loop(time));
    } catch (error) {
      this.running = false;
      this.onStatus('error', this.stream ? '手势模块加载失败，请检查网络后重试' : '请允许摄像头权限后重试');
      throw error;
    }
  }

  async loop(time) {
    if (!this.running) return;
    const interval = this.mobile ? 48 : 30;
    if (this.video.readyState >= 2 && this.hands && time - this.lastFrame >= interval) {
      this.lastFrame = time;
      try {
        await this.hands.send({ image: this.video });
        this.failures = 0;
      } catch (error) {
        this.failures += 1;
        if (this.failures === 1 && this.sourceIndex < HAND_SOURCES.length - 1) {
          this.sourceIndex += 1;
          this.configure();
          this.onStatus('loading', '主通道失败，正在切换备用识别通道');
        } else if (this.failures > 2) {
          this.running = false;
          this.onStatus('error', '识别资源加载失败，请检查网络后重试');
          return;
        }
      }
    }
    requestAnimationFrame(nextTime => this.loop(nextTime));
  }
}
