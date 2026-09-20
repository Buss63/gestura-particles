import { MODEL_META } from './model-library.js';

const ICONS = { loading: '⌁', searching: '⌁', thumb: '👍', point: '✹', victory: 'V', closed: '✦', open: '✋', error: '!', free: '✦' };

export class UiController {
  constructor({ mobile, onModel, onDensity, onColor, onGlow, onCamera }) {
    this.mobile = mobile;
    this.onModel = onModel;
    this.onDensity = onDensity;
    this.onColor = onColor;
    this.onGlow = onGlow;
    this.onCamera = onCamera;
    this.modelGrid = document.getElementById('modelGrid');
    this.density = document.getElementById('density');
    this.densityOut = document.getElementById('densityOut');
    this.countTag = document.getElementById('countTag');
    this.cameraButton = document.getElementById('cameraBtn');
    this.fullscreenButton = document.getElementById('fullscreenBtn');
    this.panel = document.getElementById('controls');
    this.panelToggle = document.getElementById('panelToggle');
    this.modeTag = document.getElementById('modeTag');
    this.renderModels();
    this.bind();
  }

  renderModels() {
    this.modelGrid.innerHTML = MODEL_META.map((item, index) => `
      <button class="model${index === 2 ? ' active' : ''}" data-model="${item.id}">
        <b>${item.name}</b><small>${item.tag}</small>
      </button>
    `).join('');
  }

  bind() {
    this.modelGrid.addEventListener('click', event => {
      const button = event.target.closest('[data-model]');
      if (!button) return;
      this.modelGrid.querySelector('.active')?.classList.remove('active');
      button.classList.add('active');
      this.onModel(button.dataset.model);
    });
    this.density.addEventListener('input', () => this.updateDensityLabel(Number(this.density.value)));
    this.density.addEventListener('change', () => this.onDensity(Number(this.density.value)));
    document.getElementById('baseColor').addEventListener('input', event => {
      document.getElementById('colorOut').textContent = event.target.value.toUpperCase();
      this.onColor(event.target.value);
    });
    document.getElementById('glow').addEventListener('input', event => {
      document.getElementById('glowOut').textContent = `${event.target.value}%`;
      this.onGlow(Number(event.target.value) / 100);
    });
    this.cameraButton.addEventListener('click', async () => {
      this.cameraButton.disabled = true;
      this.cameraButton.textContent = '正在连接识别模块';
      try {
        await this.onCamera();
        this.cameraButton.textContent = '摄像头手势已启用';
      } catch (error) {
        this.cameraButton.textContent = '重新连接手势识别';
        this.cameraButton.disabled = false;
      }
    });
    this.fullscreenButton.addEventListener('click', () => this.toggleFullscreen());
    document.addEventListener('fullscreenchange', () => this.updateFullscreenLabel());
    this.panelToggle.addEventListener('click', () => {
      this.panel.classList.toggle('collapsed');
      this.panelToggle.setAttribute('aria-expanded', String(!this.panel.classList.contains('collapsed')));
    });
  }

  updateDensityLabel(count) {
    this.densityOut.textContent = count.toLocaleString();
    this.countTag.textContent = `${Math.round(count / 1000)}K 粒子`;
  }

  setDensityRange({ min, max, value }) {
    this.density.min = min;
    this.density.max = max;
    this.density.step = 1024;
    this.density.value = value;
    this.updateDensityLabel(value);
  }

  setMode(mode, count) {
    this.modeTag.textContent = mode === 'gpu' ? 'GPU 高质量' : '兼容模式';
    this.modeTag.dataset.mode = mode;
    this.updateDensityLabel(count);
  }

  setSystemStatus(text) {
    document.getElementById('systemStatus').textContent = text;
  }

  setGesture(kind, detail) {
    const names = { loading: '加载手势模块', searching: '正在寻找手掌', thumb: '大拇指干扰', point: '食指烟花', victory: '双指旋转', closed: '粒子聚合', open: '手掌展开', error: '手势模块未连接', free: '自由漫游' };
    document.getElementById('gestureIcon').textContent = ICONS[kind] || '✦';
    document.getElementById('gestureName').textContent = names[kind] || names.free;
    document.getElementById('gestureDetail').textContent = detail;
    document.querySelectorAll('[data-gesture-kind]').forEach(item => {
      item.classList.toggle('active', item.dataset.gestureKind.split(' ').includes(kind));
    });
    if (kind === 'error') {
      this.cameraButton.disabled = false;
      this.cameraButton.textContent = '重新连接手势识别';
    }
  }

  pulseBurst() {
    const card = document.querySelector('.gesture-card');
    card.classList.remove('bursting');
    void card.offsetWidth;
    card.classList.add('bursting');
    setTimeout(() => card.classList.remove('bursting'), 520);
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      this.setGesture('error', '当前浏览器不允许进入全屏');
    }
  }

  updateFullscreenLabel() {
    this.fullscreenButton.textContent = document.fullscreenElement ? '退出全屏' : '全屏显示';
  }
}
