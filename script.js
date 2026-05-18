console.log('JS LOADED');

/* =========================
   缓存 DOM
========================= */
const tabs = document.querySelectorAll('.tab');
const contents = document.querySelectorAll('.tab-content');
const indicator = document.querySelector('.tab-indicator');
const toolsGroups = document.querySelectorAll('.tools');
const tabsEl = document.querySelector('.tabs');
const riveInstances = new Map();

/* =========================
   Indicator（稳定版）
========================= */
function moveIndicator(el) {
  if (!el || !indicator) return;

  indicator.style.left = el.offsetLeft + 'px';
  indicator.style.width = el.offsetWidth + 'px';
}

function updateIndicator() {
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      moveIndicator(activeTab);

      // ✅ 初始化完成后再显示
      indicator.classList.add('ready');
    });
  });
}

/* =========================
   tools 同步
========================= */
function updateTools(target) {
  toolsGroups.forEach(group => {
    group.classList.toggle('active', group.dataset.tools === target);
  });
}

/* =========================
   Rive
========================= */
function initRiveCanvases(scope) {
  if (!window.rive) {
    document.documentElement.dataset.riveRuntime = 'missing';
    return;
  }

  document.documentElement.dataset.riveRuntime = 'webgl2';

  const root = scope ? document.getElementById(scope) : document;
  if (!root) return;

  root.querySelectorAll('.rive-canvas').forEach(canvas => {
    if (riveInstances.has(canvas)) {
      const instance = riveInstances.get(canvas);
      resizeRiveCanvas(instance);
      return;
    }

    let instance;

    instance = new rive.Rive({
      src: canvas.dataset.riveSrc,
      canvas,
      artboard: canvas.dataset.riveArtboard,
      stateMachines: canvas.dataset.riveStateMachine,
      autoplay: true,
      useOffscreenRenderer: true,
      fit: rive.Fit.Contain,
      alignment: rive.Alignment.Center,
      onLoad: () => {
        resizeRiveCanvas(instance);
        canvas.dataset.riveLoaded = 'true';
      }
    });

    riveInstances.set(canvas, instance);
  });
}

function resizeRiveCanvas(instance) {
  instance.resizeDrawingSurfaceToCanvas(2.5);
}

/* =========================
   Tabs 切换
========================= */
tabs.forEach(tab => {
  tab.addEventListener('click', () => {

    const target = tab.dataset.tab;

    // tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // content
    contents.forEach(c => {
      c.classList.toggle('active', c.id === target);
    });

    // tools
    updateTools(target);

    // indicator
    updateIndicator();

    // rive
    initRiveCanvases(target);
  });
});

/* =========================
   Resize（防抖）
========================= */
let resizeTimer;

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);

  resizeTimer = setTimeout(() => {
    updateIndicator();
    handleSidebar();
    riveInstances.forEach(instance => {
      resizeRiveCanvas(instance);
    });
  }, 80);
});

/* =========================
   Scroll Header（优化）
========================= */
let ticking = false;

function updateTabsHeight(scroll) {
  if (!tabsEl) return;

  const maxScroll = 150;
  const start = 88;
  const end = 56;

  let progress = Math.min(scroll / maxScroll, 1);
  progress = 1 - Math.pow(1 - progress, 2);

  const value = start - (start - end) * progress;

  tabsEl.style.setProperty('--tabs-h', value + 'px');
}

window.addEventListener('scroll', () => {

  if (!ticking) {

    requestAnimationFrame(() => {

      updateTabsHeight(window.scrollY);
      ticking = false;

    });

    ticking = true;
  }

});

/* =========================
   Sidebar 控制
========================= */
let isMobile = window.innerWidth <= 1000;

function handleSidebar() {
  const nowMobile = window.innerWidth <= 1000;

  if (nowMobile !== isMobile) {
    document.body.classList.toggle('left-hidden', nowMobile);
    isMobile = nowMobile;
  }
}

/* =========================
   Init（终极稳定版）
========================= */
window.addEventListener('load', () => {

  // 1️⃣ 等字体加载（关键）
  document.fonts.ready.then(() => {

    // 2️⃣ 初始化 scroll 高度（避免默认错位）
    updateTabsHeight(window.scrollY);

    // 3️⃣ 双帧确保布局稳定
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {

        updateIndicator();
        handleSidebar();

        // 同步 tools
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
          updateTools(activeTab.dataset.tab);
          initRiveCanvases(activeTab.dataset.tab);
        }

      });
    });

  });

});
