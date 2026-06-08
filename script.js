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
const riveRenderFrames = new Map();
const recorderState = {
  running: false,
  startTime: 0,
  frameId: null,
};
const RECORDER_TIMELINE_STEP_SECONDS = 2;
const RECORDER_TIMELINE_STEP_PX = 100;
const RECORDER_TIMELINE_SPEED_PX_PER_SECOND = 50;
const RECORDER_TIMELINE_LABEL_COUNT = 8;
const RECORDER_TICK_STEP_PX = 25;
const RECORDER_TICK_COUNT = 20;

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
   Media stability
========================= */
function setImageLoadingHints() {
  document.querySelectorAll('.tab-content img').forEach(img => {
    img.loading = img.closest('.tab-content.active') ? 'eager' : 'lazy';
    img.decoding = 'async';
  });

  document.querySelectorAll('.tab-content video').forEach(video => {
    video.preload = video.closest('.tab-content.active') ? 'auto' : 'metadata';
    video.removeAttribute('autoplay');
  });
}

function updateActiveMedia(target) {
  contents.forEach(content => {
    const isActive = content.id === target;

    content.querySelectorAll('img').forEach(img => {
      img.loading = isActive ? 'eager' : 'lazy';
      img.decoding = 'async';
    });

    content.querySelectorAll('video').forEach(video => {
      video.preload = isActive ? 'auto' : 'metadata';

      if (isActive) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  });
}

/* =========================
   Recorder timer
========================= */
const RECORDER_TIMER_MAX_SECONDS = 60 * 60 + 59.99;

function formatRecorderTime(totalSeconds) {
  const clamped = Math.min(totalSeconds, RECORDER_TIMER_MAX_SECONDS);
  const totalCentiseconds = Math.floor(clamped * 100 + 0.0001);
  const minutes = Math.floor(totalCentiseconds / 6000);
  const seconds = Math.floor((totalCentiseconds % 6000) / 100);
  const centiseconds = totalCentiseconds % 100;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function formatRecorderTimelineTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function initRecorderTimeline() {
  document.querySelectorAll('.recorder-mini-time-track').forEach(track => {
    if (track.dataset.timelineReady === 'true') return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < RECORDER_TIMELINE_LABEL_COUNT; i += 1) {
      const label = document.createElement('span');

      fragment.appendChild(label);
    }

    track.appendChild(fragment);
    track.dataset.timelineReady = 'true';
  });
}

function initRecorderTicks() {
  document.querySelectorAll('.recorder-tick-track').forEach(track => {
    if (track.dataset.tickReady === 'true') return;

    const fragment = document.createDocumentFragment();

    for (let i = 0; i < RECORDER_TICK_COUNT; i += 1) {
      const tick = document.createElement('span');

      fragment.appendChild(tick);
    }

    track.appendChild(fragment);
    track.dataset.tickReady = 'true';
  });
}

function getRecorderScrollState(elapsedSeconds) {
  const scrollDesignPx = elapsedSeconds * RECORDER_TIMELINE_SPEED_PX_PER_SECOND;
  const scrollSteps = scrollDesignPx / RECORDER_TIMELINE_STEP_PX;

  return {
    currentIndex: Math.floor(scrollSteps),
    progress: scrollSteps - Math.floor(scrollSteps),
  };
}

function updateRecorderTimeline(elapsedSeconds) {
  const { currentIndex } = getRecorderScrollState(elapsedSeconds);
  const scrollDesignPx = elapsedSeconds * RECORDER_TIMELINE_SPEED_PX_PER_SECOND;
  const currentTickPosition = scrollDesignPx / RECORDER_TICK_STEP_PX;

  document.querySelectorAll('.recorder-mini-time-track').forEach(track => {
    const firstIndex = Math.max(0, currentIndex - 3);

    Array.from(track.children).forEach((label, offset) => {
      const index = firstIndex + offset;
      const tickIndex = index * 4;
      const x = (tickIndex - currentTickPosition) * RECORDER_TICK_STEP_PX;

      if (Number(label.dataset.timelineIndex) !== index) {
        label.dataset.timelineIndex = String(index);
        label.textContent = formatRecorderTimelineTime(index * RECORDER_TIMELINE_STEP_SECONDS);
      }

      label.style.setProperty('--time-x', x);
    });
  });
}

function updateRecorderTicks(elapsedSeconds) {
  const scrollDesignPx = elapsedSeconds * RECORDER_TIMELINE_SPEED_PX_PER_SECOND;
  const tickSteps = scrollDesignPx / RECORDER_TICK_STEP_PX;
  const currentIndex = Math.floor(tickSteps);
  const progress = tickSteps - currentIndex;
  const firstIndex = Math.max(0, currentIndex - 8);

  document.querySelectorAll('.recorder-tick-track').forEach(track => {
    Array.from(track.children).forEach((tick, offset) => {
      const index = firstIndex + offset;
      const x = (index - currentIndex - progress) * RECORDER_TICK_STEP_PX;
      const isMajor = index % 4 === 0;

      tick.className = isMajor ? 'is-major' : '';
      tick.style.setProperty('--tick-x', x);
    });
  });
}

function renderRecorderTimer(timer, value) {
  let firstActiveIndex = -1;

  if (timer.children.length !== value.length) {
    timer.innerHTML = Array.from(value).map(() => '<span class="timer-char"></span>').join('');
  }

  for (let i = 0; i < value.length; i += 1) {
    if (value[i] >= '1' && value[i] <= '9') {
      firstActiveIndex = i;
      break;
    }
  }

  timer.setAttribute('aria-label', value);

  Array.from(timer.children).forEach((slot, index) => {
    const char = value[index];

    slot.textContent = char;
    slot.className = 'timer-char';
    slot.classList.toggle('is-active', firstActiveIndex !== -1 && index >= firstActiveIndex);
    slot.classList.toggle('timer-number', char >= '0' && char <= '9');
    slot.classList.toggle('timer-separator', char === ':' || char === '.');
    slot.classList.toggle('timer-colon', char === ':');
    slot.classList.toggle('timer-dot', char === '.');
  });
}

function initRecorderTimers() {
  if (document.documentElement.dataset.recorderTimerReady === 'true') return;

  const timers = document.querySelectorAll('.recorder-timer');
  if (!timers.length) return;

  document.documentElement.dataset.recorderTimerReady = 'true';
  initRecorderTimeline();
  initRecorderTicks();

  timers.forEach(timer => renderRecorderTimer(timer, '00:00.00'));
  updateRecorderTimeline(0);
  updateRecorderTicks(0);
  setupRecorderToggle();
}

function updateRecorderFrame() {
  const timers = document.querySelectorAll('.recorder-timer');

  if (!recorderState.running || !timers.length) {
    recorderState.frameId = null;
    return;
  }

  const elapsedSeconds = (performance.now() - recorderState.startTime) / 1000;
  const value = formatRecorderTime(elapsedSeconds);

  updateRecorderTimeline(elapsedSeconds);
  updateRecorderTicks(elapsedSeconds);

  timers.forEach(timer => {
    if (timer.dataset.timerValue !== value) {
      timer.dataset.timerValue = value;
      renderRecorderTimer(timer, value);
    }
  });

  if (elapsedSeconds >= RECORDER_TIMER_MAX_SECONDS) {
    stopRecorderPlayback();
    return;
  }

  recorderState.frameId = requestAnimationFrame(updateRecorderFrame);
}

function startRecorderFrameLoop() {
  if (recorderState.frameId !== null) return;

  updateRecorderFrame();
}

function resetRecorderOverlays() {
  const timers = document.querySelectorAll('.recorder-timer');

  timers.forEach(timer => {
    timer.dataset.timerValue = '00:00.00';
    renderRecorderTimer(timer, '00:00.00');
  });

  updateRecorderTimeline(0);
  updateRecorderTicks(0);
}

function resetRecorderRive(autoplay) {
  const canvas = document.querySelector('.recorder-rive-layer');
  if (!canvas) return;

  const instance = riveInstances.get(canvas);
  if (instance && typeof instance.cleanup === 'function') {
    instance.cleanup();
  }

  riveInstances.delete(canvas);
  canvas.dataset.riveAutoplay = autoplay ? 'true' : 'false';
  delete canvas.dataset.riveLoaded;
  delete canvas.dataset.riveError;
  createRiveInstance(canvas);
}

function startRecorderPlayback() {
  const card = document.querySelector('.recorder-rive-card');
  if (card) {
    card.dataset.recorderRunning = 'true';
  }

  recorderState.running = true;
  recorderState.startTime = performance.now();
  resetRecorderOverlays();
  resetRecorderRive(true);
  startRecorderFrameLoop();
}

function stopRecorderPlayback() {
  const card = document.querySelector('.recorder-rive-card');
  if (card) {
    card.dataset.recorderRunning = 'false';
  }

  recorderState.running = false;

  if (recorderState.frameId !== null) {
    cancelAnimationFrame(recorderState.frameId);
    recorderState.frameId = null;
  }

  resetRecorderOverlays();
  resetRecorderRive(false);
}

function setupRecorderToggle() {
  const card = document.querySelector('.recorder-rive-card');
  if (!card || card.dataset.recorderToggleBound === 'true') return;

  card.dataset.recorderToggleBound = 'true';
  card.dataset.recorderRunning = 'true';

  card.addEventListener('click', () => {
    if (recorderState.running) {
      stopRecorderPlayback();
    } else {
      startRecorderPlayback();
    }
  });

  startRecorderPlayback();
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
    if (canvas.dataset.riveDefer === 'true') {
      setupDeferredRiveCanvas(canvas);
      return;
    }

    if (riveInstances.has(canvas)) {
      const instance = riveInstances.get(canvas);
      resizeRiveCanvas(instance);
      return;
    }

    createRiveInstance(canvas);
  });
}

function createRiveInstance(canvas) {
  let instance;
  const loadTimer = setTimeout(() => {
    if (canvas.dataset.riveLoaded !== 'true') {
      canvas.dataset.riveError = 'load-timeout';
    }
  }, 5000);

  try {
    canvas.dataset.riveLoaded = 'false';
    canvas.dataset.riveExited = 'false';
    delete canvas.dataset.riveError;

    instance = new rive.Rive({
      src: canvas.dataset.riveSrc,
      canvas,
      artboard: canvas.dataset.riveArtboard,
      stateMachines: canvas.dataset.riveStateMachine,
      autoplay: canvas.dataset.riveAutoplay !== 'false',
      autoBind: canvas.dataset.riveAutoBind === 'true' || Boolean(canvas.dataset.riveInputs),
      useOffscreenRenderer: canvas.dataset.riveOffscreen !== 'false',
      fit: getRiveFit(canvas),
      alignment: rive.Alignment.Center,
      onLoad: () => {
        clearTimeout(loadTimer);
        resizeRiveCanvas(instance);
        requestAnimationFrame(() => resizeRiveCanvas(instance));
        canvas.dataset.riveLoaded = 'true';
        applyRiveInputs(instance, canvas);
        requestAnimationFrame(() => applyRiveInputs(instance, canvas));
        setupRiveClickCycle(canvas);
        setupRiveKeepRendering(instance, canvas);
        scheduleInitialRiveTrigger(instance, canvas);
        firePendingRiveTrigger(instance, canvas);
      },
      onLoadError: (error) => {
        clearTimeout(loadTimer);
        canvas.dataset.riveError = error && error.message ? error.message : String(error);
      }
    });

    riveInstances.set(canvas, instance);
  } catch (error) {
    clearTimeout(loadTimer);
    canvas.dataset.riveError = error && error.message ? error.message : String(error);
    console.error('Rive init failed', error);
  }
}

function getRiveFit(canvas) {
  const fit = canvas.dataset.riveFit;
  if (!fit) return rive.Fit.Contain;

  const normalizedFit = fit.toLowerCase();
  const match = Object.keys(rive.Fit).find(key => key.toLowerCase() === normalizedFit);
  return match ? rive.Fit[match] : rive.Fit.Contain;
}

function applyRiveInputs(instance, canvas) {
  if (!canvas.dataset.riveInputs) return;

  const stateMachineName = canvas.dataset.riveStateMachine;
  const inputs = typeof instance.stateMachineInputs === 'function'
    ? instance.stateMachineInputs(stateMachineName)
    : [];
  const status = [];

  canvas.dataset.riveInputs.split(',').forEach(entry => {
    const [rawName, rawValue = ''] = entry.split(':');
    const inputName = rawName && rawName.trim();
    if (!inputName) return;

    const valueText = rawValue.trim();
    const numericValue = Number(valueText);
    const value = Number.isNaN(numericValue) ? valueText : numericValue;
    const applied = setRiveValue(instance, inputs, inputName, value);
    status.push(`${inputName}:${applied}`);
  });

  canvas.dataset.riveInputStatus = status.join(',');
}

function setRiveValue(instance, inputs, inputName, value) {
  const viewModelInstance = instance.viewModelInstance;
  if (viewModelInstance && typeof viewModelInstance.number === 'function' && typeof value === 'number') {
    const numberProperty = viewModelInstance.number(inputName);
    if (numberProperty && 'value' in numberProperty) {
      numberProperty.value = value;
      return 'viewmodel';
    }
  }

  const directInput = Array.isArray(inputs)
    ? inputs.find(item => item.name === inputName)
    : null;
  if (directInput && 'value' in directInput) {
    directInput.value = value;
    return 'state-machine';
  }

  if (typeof instance.setNumberStateAtPath === 'function' && typeof value === 'number') {
    try {
      instance.setNumberStateAtPath(inputName, value, '');
      return 'path';
    } catch {}
  }

  return 'missing';
}

function setupRiveClickCycle(canvas) {
  if (canvas.dataset.riveDefer === 'true') return;
  if (!canvas.dataset.riveClickCycle || canvas.dataset.riveClickBound === 'true') return;

  canvas.dataset.riveClickBound = 'true';
  const clickTarget = canvas.dataset.riveClickCycle === 'next-trigger' || canvas.dataset.riveClickCycle === 'alternate-trigger'
    ? canvas.closest('.flowai-helper, .flowai-rive, .flowos-stack') || canvas
    : canvas;

  clickTarget.addEventListener('click', () => {
    const instance = riveInstances.get(canvas);
    if (!instance || canvas.dataset.riveLoaded !== 'true') return;

    if (canvas.dataset.riveClickCycle === 'alternate-trigger') {
      const isSecond = canvas.dataset.riveAlternateState === 'second';
      const triggerName = isSecond
        ? canvas.dataset.riveSecondTrigger || 'exit'
        : canvas.dataset.riveFirstTrigger || 'enter';
      resumeRiveKeepRendering(instance, canvas);
      if (fireRiveTrigger(instance, canvas, triggerName)) {
        canvas.dataset.riveAlternateState = isSecond ? 'first' : 'second';
      } else {
        canvas.dataset.riveError = `missing-trigger:${triggerName}`;
      }
      return;
    }

    if (canvas.dataset.riveClickCycle === 'next-trigger') {
      const triggerName = canvas.dataset.riveNextTrigger || 'next';
      if (!fireRiveTrigger(instance, canvas, triggerName)) {
        canvas.dataset.riveError = `missing-trigger:${triggerName}`;
      }
      return;
    }

    if (canvas.dataset.riveClickCycle === 'play-exit') {
      if (canvas.dataset.rivePlaying === 'true') {
        const triggerName = canvas.dataset.riveExitTrigger || 'exit';
        if (fireRiveTrigger(instance, canvas, triggerName)) {
          canvas.dataset.riveExited = 'true';
          const hideDelay = Number(canvas.dataset.riveExitHideDelay || 0);
          window.setTimeout(() => {
            if (canvas.dataset.riveExited === 'true') {
              canvas.dataset.rivePlaying = 'false';
            }
          }, Number.isNaN(hideDelay) ? 0 : hideDelay);
        } else {
          canvas.dataset.riveError = `missing-trigger:${triggerName}`;
        }
        return;
      }

      if (canvas.dataset.riveExited === 'true') {
        restartRiveInstance(canvas, true);
        canvas.dataset.rivePlaying = 'true';
        return;
      }

      playRiveInstance(instance, canvas);
      canvas.dataset.rivePlaying = 'true';
      return;
    }

    if (canvas.dataset.riveClickCycle !== 'exit-reload') return;

    if (canvas.dataset.riveExited === 'true') {
      reloadRiveInstance(canvas);
      return;
    }

    const triggerName = canvas.dataset.riveExitTrigger || 'exit';
    if (fireRiveTrigger(instance, canvas, triggerName)) {
      canvas.dataset.riveExited = 'true';
    } else {
      canvas.dataset.riveError = `missing-trigger:${triggerName}`;
    }
  }, true);
}

function setupDeferredRiveCanvas(canvas) {
  const card = canvas.closest('.flowai-helper, .flowai-rive, .flowos-stack') || canvas;
  if (card.dataset.riveDeferredBound === 'true') return;

  card.dataset.riveDeferredBound = 'true';
  card.addEventListener('click', () => {
    if (canvas.dataset.riveClickCycle === 'alternate-trigger') {
      handleDeferredAlternateRive(canvas);
      return;
    }

    const instance = riveInstances.get(canvas);

    if (!instance || canvas.dataset.riveLoaded !== 'true') {
      canvas.dataset.riveVisible = 'true';
      canvas.dataset.riveAutoplay = 'true';
      canvas.dataset.riveExited = 'false';
      createRiveInstance(canvas);
      return;
    }

    const triggerName = canvas.dataset.riveExitTrigger || 'exit';
    if (fireRiveTrigger(instance, canvas, triggerName)) {
      canvas.dataset.riveExited = 'true';
      const hideDelay = Number(canvas.dataset.riveExitHideDelay || 0);
      window.setTimeout(() => {
        if (canvas.dataset.riveExited === 'true') {
          cleanupDeferredRiveCanvas(canvas);
        }
      }, Number.isNaN(hideDelay) ? 0 : hideDelay);
    } else {
      canvas.dataset.riveError = `missing-trigger:${triggerName}`;
    }
  }, true);
}

function handleDeferredAlternateRive(canvas) {
  const instance = riveInstances.get(canvas);

  if (!instance || canvas.dataset.riveLoaded !== 'true') {
    canvas.dataset.riveVisible = 'true';
    canvas.dataset.riveAutoplay = 'true';
    canvas.dataset.riveAlternateState = 'second';
    canvas.dataset.rivePendingTrigger = canvas.dataset.riveFirstTrigger || 'enter';
    requestAnimationFrame(() => createRiveInstance(canvas));
    return;
  }

  const isSecond = canvas.dataset.riveAlternateState === 'second';
  const triggerName = isSecond
    ? canvas.dataset.riveSecondTrigger || 'exit'
    : canvas.dataset.riveFirstTrigger || 'enter';

  if (fireRiveTrigger(instance, canvas, triggerName)) {
    canvas.dataset.riveAlternateState = isSecond ? 'first' : 'second';
  } else {
    canvas.dataset.riveError = `missing-trigger:${triggerName}`;
  }
}

function firePendingRiveTrigger(instance, canvas) {
  const triggerName = canvas.dataset.rivePendingTrigger;
  if (!triggerName) return;

  if (!fireRiveTrigger(instance, canvas, triggerName)) {
    canvas.dataset.riveError = `missing-trigger:${triggerName}`;
  }

  delete canvas.dataset.rivePendingTrigger;
}

function scheduleInitialRiveTrigger(instance, canvas) {
  if ((!canvas.dataset.riveInitialTrigger && !canvas.dataset.riveInitialTriggerSequence) || canvas.dataset.riveInitialTriggered === 'true') return;

  canvas.dataset.riveInitialAttempts = '0';
  const delay = Number(canvas.dataset.riveInitialTriggerDelay || 0);
  const trigger = () => {
    if (canvas.dataset.riveInitialTriggerSequence) {
      fireInitialRiveTriggerSequence(instance, canvas);
      return;
    }

    fireInitialRiveTrigger(instance, canvas);
  };

  if (delay > 0) {
    window.setTimeout(trigger, delay);
  } else {
    requestAnimationFrame(trigger);
  }
}

function fireInitialRiveTriggerSequence(instance, canvas) {
  if (canvas.dataset.riveInitialTriggered === 'true') return;

  const triggers = canvas.dataset.riveInitialTriggerSequence
    .split(',')
    .map(name => name.trim())
    .filter(Boolean);
  if (!triggers.length) return;

  const gap = Number(canvas.dataset.riveInitialTriggerGap || 0);
  const delay = Number.isNaN(gap) ? 0 : gap;
  let index = 0;
  let failed = false;

  const fireNext = () => {
    const triggerName = triggers[index];
    if (!fireRiveTrigger(instance, canvas, triggerName)) {
      failed = true;
      canvas.dataset.riveError = `missing-trigger:${triggerName}`;
      return;
    }

    index += 1;
    if (index < triggers.length) {
      window.setTimeout(fireNext, delay);
      return;
    }

    if (!failed) {
      canvas.dataset.riveInitialTriggered = 'true';
      delete canvas.dataset.riveInitialAttempts;
      if (canvas.dataset.riveAlternateInitialState) {
        canvas.dataset.riveAlternateState = canvas.dataset.riveAlternateInitialState;
      }
      stopRiveAfterInitialTrigger(instance, canvas);
    }
  };

  fireNext();
}

function fireInitialRiveTrigger(instance, canvas) {
  const triggerName = canvas.dataset.riveInitialTrigger;
  if (!triggerName || canvas.dataset.riveInitialTriggered === 'true') return;

  if (fireRiveTrigger(instance, canvas, triggerName)) {
    canvas.dataset.riveInitialTriggered = 'true';
    delete canvas.dataset.riveInitialAttempts;
    if (canvas.dataset.riveAlternateInitialState) {
      canvas.dataset.riveAlternateState = canvas.dataset.riveAlternateInitialState;
    }
    stopRiveAfterInitialTrigger(instance, canvas);
  } else {
    const attempts = Number(canvas.dataset.riveInitialAttempts || 0) + 1;
    canvas.dataset.riveInitialAttempts = String(attempts);

    if (attempts < 8) {
      window.setTimeout(() => fireInitialRiveTrigger(instance, canvas), 50);
    } else {
      canvas.dataset.riveError = `missing-trigger:${triggerName}`;
      delete canvas.dataset.riveInitialAttempts;
    }
  }
}

function stopRiveAfterInitialTrigger(instance, canvas) {
  if (canvas.dataset.riveStopAfterInitialTrigger !== 'true') return;

  const delay = Number(canvas.dataset.riveStopAfterInitialDelay || 0);
  window.setTimeout(() => {
    stopRiveKeepRendering(canvas);
    if (typeof instance.stopRendering === 'function') {
      instance.stopRendering();
    }
  }, Number.isNaN(delay) ? 0 : delay);
}

function cleanupDeferredRiveCanvas(canvas) {
  const instance = riveInstances.get(canvas);
  stopRiveKeepRendering(canvas);
  if (instance && typeof instance.cleanup === 'function') {
    instance.cleanup();
  }

  riveInstances.delete(canvas);
  canvas.dataset.riveVisible = 'false';
  canvas.dataset.riveLoaded = 'false';
  canvas.dataset.riveExited = 'false';
  canvas.dataset.riveAutoplay = 'false';
}

function playRiveInstance(instance, canvas) {
  if (typeof instance.play !== 'function') return;

  const stateMachineName = canvas.dataset.riveStateMachine;
  if (stateMachineName) {
    instance.play(stateMachineName);
    return;
  }

  instance.play();
}

function reloadRiveInstance(canvas) {
  const instance = riveInstances.get(canvas);
  stopRiveKeepRendering(canvas);
  if (instance && typeof instance.cleanup === 'function') {
    instance.cleanup();
  }

  riveInstances.delete(canvas);
  createRiveInstance(canvas);
}

function restartRiveInstance(canvas, autoplay) {
  const instance = riveInstances.get(canvas);
  stopRiveKeepRendering(canvas);
  if (instance && typeof instance.cleanup === 'function') {
    instance.cleanup();
  }

  riveInstances.delete(canvas);
  canvas.dataset.riveAutoplay = autoplay ? 'true' : 'false';
  canvas.dataset.riveExited = 'false';
  delete canvas.dataset.riveError;
  createRiveInstance(canvas);
}

function fireRiveViewModelTrigger(instance, triggerName) {
  const viewModelInstance = instance.viewModelInstance;
  if (!viewModelInstance || typeof viewModelInstance.trigger !== 'function') return false;

  const propertyNames = Array.isArray(viewModelInstance.properties)
    ? viewModelInstance.properties.map(property => property.name)
    : [];
  const resolvedName = propertyNames.find(name => name.toLowerCase() === triggerName.toLowerCase()) || triggerName;
  const trigger = viewModelInstance.trigger(resolvedName);
  if (!trigger || typeof trigger.trigger !== 'function') return false;

  trigger.trigger();
  return true;
}

function fireRiveStateMachineTrigger(instance, canvas, triggerName) {
  const stateMachineName = canvas.dataset.riveStateMachine;
  const inputs = typeof instance.stateMachineInputs === 'function'
    ? instance.stateMachineInputs(stateMachineName)
    : [];
  const normalizedTriggerName = normalizeRiveInputName(triggerName);
  const directInput = Array.isArray(inputs)
    ? inputs.find(item => item.name && normalizeRiveInputName(item.name) === normalizedTriggerName)
    : null;

  canvas.dataset.riveInputList = Array.isArray(inputs)
    ? inputs.map(item => item.name || '').filter(Boolean).join(',')
    : 'missing-state-machine';

  if (directInput && typeof directInput.fire === 'function') {
    directInput.fire();
    canvas.dataset.riveLastTrigger = directInput.name;
    resumeRiveRendering(instance);
    return true;
  }

  if (typeof instance.fireStateAtPath === 'function') {
    try {
      instance.fireStateAtPath(triggerName, '');
      canvas.dataset.riveLastTrigger = triggerName;
      return true;
    } catch {}
  }

  return false;
}

function normalizeRiveInputName(name) {
  return String(name || '').normalize('NFKC').trim().toLowerCase();
}

function fireRiveTrigger(instance, canvas, triggerName) {
  return fireRiveStateMachineTrigger(instance, canvas, triggerName)
    || fireRiveViewModelTrigger(instance, triggerName);
}

function resumeRiveRendering(instance) {
  if (instance && typeof instance.startRendering === 'function') {
    instance.startRendering();
  }
}

function setupRiveKeepRendering(instance, canvas) {
  if (canvas.dataset.riveKeepRendering !== 'true' || riveRenderFrames.has(canvas)) return;

  const render = () => {
    const currentInstance = riveInstances.get(canvas);
    if (!currentInstance || canvas.dataset.riveLoaded !== 'true') {
      riveRenderFrames.delete(canvas);
      return;
    }

    resumeRiveRendering(currentInstance);
    riveRenderFrames.set(canvas, requestAnimationFrame(render));
  };

  riveRenderFrames.set(canvas, requestAnimationFrame(render));
}

function resumeRiveKeepRendering(instance, canvas) {
  resumeRiveRendering(instance);
  if (canvas.dataset.riveKeepRendering === 'true' && !riveRenderFrames.has(canvas)) {
    setupRiveKeepRendering(instance, canvas);
  }
}

function stopRiveKeepRendering(canvas) {
  const frameId = riveRenderFrames.get(canvas);
  if (!frameId) return;

  cancelAnimationFrame(frameId);
  riveRenderFrames.delete(canvas);
}

function resizeRiveCanvas(instance) {
  const renderScale = Math.min(window.devicePixelRatio || 1, 2);
  instance.resizeDrawingSurfaceToCanvas(renderScale);
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

    // media
    updateActiveMedia(target);
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
        initRecorderTimers();

        // 同步 tools
        const activeTab = document.querySelector('.tab.active');
        if (activeTab) {
          updateTools(activeTab.dataset.tab);
          initRiveCanvases(activeTab.dataset.tab);
          updateActiveMedia(activeTab.dataset.tab);
        }

      });
    });

  });

});

setImageLoadingHints();

function syncActiveTabEarly() {
  updateTabsHeight(window.scrollY);
  handleSidebar();
  initRecorderTimers();

  const activeTab = document.querySelector('.tab.active');
  if (!activeTab) return;

  updateTools(activeTab.dataset.tab);
  initRiveCanvases(activeTab.dataset.tab);
  updateActiveMedia(activeTab.dataset.tab);

  requestAnimationFrame(() => {
    requestAnimationFrame(updateIndicator);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncActiveTabEarly, { once:true });
} else {
  syncActiveTabEarly();
}
