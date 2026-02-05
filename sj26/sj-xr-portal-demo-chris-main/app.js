// ---------- Config ----------
const EVENT_DATE_LOCAL = "2026-03-28T18:00:00"; // local time; adjust if you want
// Phase thresholds:
// daysUntil > 14 => Phase 1
// daysUntil > 7  => Phase 2
// else           => Phase 3

const GRACE_MS = 800; // keep visible briefly after markerLost

// ---------- Utility ----------
const statusEl = document.getElementById("status");
const btns = Array.from(document.querySelectorAll("[data-mode]"));
const loadingScreen = document.getElementById("loading-screen");
const loadingBarFill = document.getElementById("loading-bar-fill");
const loadingProgress = document.getElementById("loading-progress");
const loadingContinue = document.getElementById("loading-continue");
const onboarding = document.getElementById("onboarding");
const onboardingClose = document.getElementById("onboarding-close");
const markerSjsu = document.getElementById("marker-sjsu");
const markerCourt = document.getElementById("marker-court");
const calibrateBtn = document.getElementById("calibrate-flat");

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function setMarkerStatus(el, active, label) {
  if (!el) return;
  el.classList.toggle("active", active);
  const span = el.querySelector("span");
  if (span) span.textContent = active ? "Detected" : label;
}

function initOnboarding() {
  if (!onboarding) return;
  const close = () => {
    onboarding.style.opacity = "0";
    onboarding.style.pointerEvents = "none";
  };
  if (onboardingClose) onboardingClose.addEventListener("click", close);
}

function updateMarkerGuide() {
  setMarkerStatus(markerSjsu, window.__markerSjsuFound, "Searching");
  setMarkerStatus(markerCourt, window.__markerCourtFound, "Searching");
}

function setObjectOpacity(obj, opacity) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.isMesh && child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (mat.opacity == null) return;
        if (mat.userData && mat.userData.baseOpacity == null) {
          mat.userData.baseOpacity = mat.opacity;
        }
        const base = (mat.userData && mat.userData.baseOpacity != null) ? mat.userData.baseOpacity : mat.opacity;
        mat.transparent = true;
        mat.opacity = clamp(base * opacity, 0, 1);
        mat.needsUpdate = true;
      });
    }
  });
}

function fadeObjectOpacity(el, target, duration = 250, onComplete) {
  if (!el || !el.object3D) return;
  if (el.__fadeRaf) cancelAnimationFrame(el.__fadeRaf);

  const start = performance.now();
  const from = (el.__fadeOpacity != null) ? el.__fadeOpacity : 0;
  const animate = (now) => {
    const t = clamp((now - start) / duration, 0, 1);
    const value = from + (target - from) * t;
    el.__fadeOpacity = value;
    setObjectOpacity(el.object3D, value);
    if (t < 1) {
      el.__fadeRaf = requestAnimationFrame(animate);
    } else {
      el.__fadeRaf = null;
      if (onComplete) onComplete();
    }
  };
  el.__fadeRaf = requestAnimationFrame(animate);
}

function setLoadingProgress(percent, message) {
  if (loadingBarFill) loadingBarFill.style.width = `${percent}%`;
  if (loadingProgress) loadingProgress.textContent = message || `${percent}%`;
}

function preloadResources() {
  const urls = [
    "assets/cracks.png",
    "assets/hole.png",
    "assets/half-court.png",
    "assets/basketball.glb",
    "assets/shark1.glb",
    "assets/shark2.glb",
    "assets/bounce.mp3",
    "markers/sjsu-logo.patt",
    "markers/pattern-court.patt",
    "markers/pattern-Shark-A.patt",
    "markers/pattern-Shark-B.patt",
    "markers/pattern-Shark-C.patt",
    "markers/pattern-Shark-D.patt"
  ];

  let completed = 0;
  const total = urls.length;
  if (total === 0) return Promise.resolve({ failed: 0, errors: [] });

  return Promise.allSettled(
    urls.map((url) =>
      fetch(url, { cache: "force-cache" })
        .then((response) => {
          if (!response.ok) {
            const error = new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
            error.url = url;
            error.status = response.status;
            error.is404 = response.status === 404;
            throw error;
          }
          return response;
        })
        .catch((error) => {
          // If error doesn't have status, it's a network error
          if (!error.status) {
            error.url = url;
            error.status = 0;
            error.is404 = false;
          }
          throw error;
        })
        .finally(() => {
          completed += 1;
          const percent = Math.round((completed / total) * 100);
          setLoadingProgress(percent, `Loading ${percent}%`);
        })
    )
  ).then((results) => {
    const errors = [];
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        const error = result.reason || { url: urls[index], status: 0, is404: false };
        errors.push({
          url: error.url || urls[index],
          status: error.status || 0,
          is404: error.is404 || false,
          message: error.message || `Failed to load ${urls[index]}`
        });
      }
    });
    return { failed: errors.length, errors };
  });
}

function waitForAframeAssets() {
  return new Promise((resolve) => {
    const assets = document.querySelector("a-assets");
    if (!assets) return resolve();
    if (assets.hasLoaded) return resolve();
    assets.addEventListener("loaded", () => resolve(), { once: true });
  });
}

function finalizeLoading() {
  document.body.classList.remove("loading");
  document.body.classList.add("ready");
  if (loadingScreen) loadingScreen.classList.remove("loading");
}

function initLoadingGate() {
  if (!loadingScreen) return;
  document.body.classList.add("loading");
  loadingScreen.classList.add("loading");
  setLoadingProgress(0, "Initializing...");

  const assetPromise = waitForAframeAssets();
  const prefetchPromise = preloadResources();

  Promise.all([assetPromise, prefetchPromise]).then(([, prefetchResult]) => {
    if (prefetchResult.failed > 0) {
      const errors = prefetchResult.errors || [];
      const error404s = errors.filter(e => e.is404);
      
      let errorMessage = "Some assets failed to load. ";
      if (error404s.length > 0) {
        const missingFiles = error404s.map(e => e.url.split('/').pop()).join(', ');
        errorMessage += `Missing files (404): ${missingFiles}. `;
      }
      if (errors.length > error404s.length) {
        errorMessage += `${errors.length - error404s.length} other error(s). `;
      }
      errorMessage += "Tap to continue anyway.";
      
      setLoadingProgress(100, errorMessage);
      if (loadingContinue) loadingContinue.style.display = "inline-flex";
      
      // Log errors to console for debugging
      console.error("Asset loading errors:", errors);
    } else {
      setLoadingProgress(100, "Ready");
      setTimeout(finalizeLoading, 350);
    }
  });

  if (loadingContinue) {
    loadingContinue.addEventListener("click", () => finalizeLoading(), { once: true });
  }
}

function setActiveButton(mode) {
  btns.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
}

async function getServerNow() {
  // Harder to spoof than device time. Falls back if it fails.
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000); // 1 second timeout
    const r = await fetch(location.href, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const d = r.headers.get("Date");
    if (d) return { now: new Date(d), source: "server" };
  } catch (_) {}
  return { now: new Date(), source: "device" };
}

function daysUntilEvent(now) {
  const event = new Date(EVENT_DATE_LOCAL);
  const ms = event.getTime() - now.getTime();
  return ms / (1000 * 60 * 60 * 24);
}

function getTimeUntilEvent(now) {
  const event = new Date(EVENT_DATE_LOCAL);
  const ms = event.getTime() - now.getTime();

  if (ms <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

function updateScoreboard(timeUntil) {
  const scoreboard = document.getElementById("scoreboard");
  if (!scoreboard) return;

  const timeStr = `${String(timeUntil.days).padStart(2, '0')}D ${String(timeUntil.hours).padStart(2, '0')}H ${String(timeUntil.minutes).padStart(2, '0')}M ${String(timeUntil.seconds).padStart(2, '0')}S`;
  scoreboard.textContent = timeStr;
}

function phaseFromDays(days) {
  if (days > 14) return 1;
  if (days > 7) return 2;
  return 3;
}

// ---------- Performance Detection ----------
let devicePerformance = null;

async function detectDevicePerformance() {
  if (devicePerformance !== null) return devicePerformance;

  const score = {
    hardware: 0,
    webgl: 0,
    frameRate: 0,
    total: 0,
    canRunPhysics: false
  };

  // 1. Hardware detection
  const hardware = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 4; // GB
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  score.hardware = Math.min(10, (hardware / 4) * 5 + (memory / 8) * 5);
  if (isMobile) score.hardware *= 0.7; // Penalize mobile devices

  // 2. WebGL performance test
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);

        // Check for high-end GPUs
        const highEndGPUs = ['nvidia', 'amd', 'radeon', 'geforce', 'rtx', 'gtx'];
        const isHighEnd = highEndGPUs.some(gpu => renderer.toLowerCase().includes(gpu));
        score.webgl = isHighEnd ? 8 : 5;
      } else {
        score.webgl = 5; // Default if can't detect
      }
    }
  } catch (e) {
    score.webgl = 3;
  }

  // 3. Frame rate benchmark
  try {
    const frameRate = await benchmarkFrameRate();
    score.frameRate = Math.min(10, (frameRate / 60) * 10);
  } catch (e) {
    score.frameRate = 5; // Default
  }

  // 4. Battery level (if available)
  try {
    const battery = await navigator.getBattery();
    if (battery) {
      const batteryLevel = battery.level;
      const isCharging = battery.charging;
      // Reduce score if battery is low and not charging
      if (!isCharging && batteryLevel < 0.2) {
        score.hardware *= 0.7;
      }
    }
  } catch (e) {
    // Battery API not available, ignore
  }

  // Calculate total score
  score.total = (score.hardware * 0.4 + score.webgl * 0.3 + score.frameRate * 0.3);

  // Enable physics if score is above threshold (4.0 out of 10)
  score.canRunPhysics = score.total >= 4.0;

  devicePerformance = score;
  console.log('[Performance] Device score:', score.total.toFixed(2), '| Physics:', score.canRunPhysics ? 'ENABLED' : 'DISABLED');
  return score;
}

function benchmarkFrameRate() {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

    if (!gl) {
      resolve(30); // Fallback
      return;
    }

    const startTime = performance.now();
    let frames = 0;
    const duration = 300; // Test for 300ms

    function render() {
      frames++;
      const elapsed = performance.now() - startTime;

      if (elapsed < duration) {
        // Simple rendering test
        gl.clear(gl.COLOR_BUFFER_BIT);
        requestAnimationFrame(render);
      } else {
        const fps = (frames / elapsed) * 1000;
        resolve(Math.min(60, fps));
      }
    }

    requestAnimationFrame(render);
  });
}

// ---------- Flat Lock Component ----------
// Keeps a plane flat/horizontal regardless of marker rotation
AFRAME.registerComponent("flat-lock", {
  schema: {
    lockY: { type: 'boolean', default: false } // If true, also locks Y rotation (yaw)
  },

  init: function() {
    this.marker = null;
    // Find parent marker
    let parent = this.el.parentEl;
    while (parent && parent.tagName !== 'A-MARKER') {
      parent = parent.parentEl;
    }
    this.marker = parent;
  },

  tick: function() {
    if (!this.marker || !this.marker.object3D.visible) return;

    // Get marker's world rotation
    const markerWorldRot = new THREE.Euler();
    markerWorldRot.setFromRotationMatrix(this.marker.object3D.matrixWorld);

    // Calculate inverse rotation to compensate for marker's tilt
    // We want the plane to always be flat (horizontal)
    // Target world rotation: X = -90°, Y = marker's Y (or 0 if locked), Z = 0
    const targetWorldX = -Math.PI / 2; // -90 degrees
    const targetWorldY = this.data.lockY ? 0 : markerWorldRot.y;
    const targetWorldZ = 0;

    // Get marker's local rotation
    const markerRot = this.marker.object3D.rotation;

    // Calculate what local rotation we need to achieve target world rotation
    // This compensates for the marker's tilt
    const localX = targetWorldX - markerRot.x;
    const localY = targetWorldY - markerRot.y;
    const localZ = targetWorldZ - markerRot.z;

    // Apply the compensated rotation
    this.el.object3D.rotation.set(localX, localY, localZ);
  }
});

// ---------- Physics Bounce Enhancement Component ----------
// Enhances bounce realism by applying physics-based corrections to animations
AFRAME.registerComponent("physics-bounce", {
  schema: {
    restitution: { type: 'number', default: 0.9 },
    groundY: { type: 'number', default: 0.16 },
    enabled: { type: 'boolean', default: false }
  },

  init: function() {
    this.velocity = 0;
    this.lastY = null;
    this.animationControlled = true; // Start with animations in control
  },

  update: function() {
    if (this.data.enabled && !this.animationControlled) {
      this.lastY = this.el.getAttribute("position").y;
    }
  },

  tick: function(time, timeDelta) {
    if (!this.data.enabled || this.animationControlled) return;

    const pos = this.el.getAttribute("position");
    const currentY = pos.y;
    const dt = timeDelta / 1000;

    if (this.lastY !== null && dt > 0) {
      // Calculate velocity from position change
      this.velocity = (currentY - this.lastY) / dt;

      // Apply gravity
      const gravity = -9.8;
      this.velocity += gravity * dt;

      // Check ground collision
      if (currentY <= this.data.groundY && this.velocity < 0) {
        // Bounce with restitution
        this.velocity = -this.velocity * this.data.restitution;
        this.el.setAttribute("position", `${pos.x} ${this.data.groundY} ${pos.z}`);
      } else {
        // Apply velocity
        const newY = Math.max(this.data.groundY, currentY + this.velocity * dt);
        this.el.setAttribute("position", `${pos.x} ${newY} ${pos.z}`);
      }
    }

    this.lastY = this.el.getAttribute("position").y;
  },

  enablePhysics: function(initialVelocity = 0) {
    this.data.enabled = true;
    this.animationControlled = false;
    this.velocity = initialVelocity;
    const pos = this.el.getAttribute("position");
    this.lastY = pos.y;
  },

  disablePhysics: function() {
    this.data.enabled = false;
    this.animationControlled = true;
    this.lastY = null;
    this.velocity = 0;
  }
});

// ---------- Basketball Shooting Component ----------
AFRAME.registerComponent("basketball-shooting", {
  schema: {
    hoopId: { type: 'string', default: 'basketballHoop' },
    ballId: { type: 'string', default: 'ballRig' },
    power: { type: 'number', default: 8.0 },
    enabled: { type: 'boolean', default: false }
  },

  init: function() {
    // Wait for entities to be created
    setTimeout(() => {
      this.hoop = document.getElementById(this.data.hoopId);
      this.ball = document.getElementById(this.data.ballId);
      this.hoopTrigger = document.getElementById('hoopTrigger');
    }, 100);

    this.isShooting = false;
    this.score = 0;
    this.shots = 0;
    this.streak = 0;
    this.lastShotResult = null;

    // UI elements
    this.gameUI = document.getElementById('basketball-game');
    this.gameScore = document.getElementById('game-score');
    this.gameStats = document.getElementById('game-stats');
    this.accuracyEl = document.getElementById('accuracy');
    this.streakEl = document.getElementById('streak');
    this.powerMeterFill = document.getElementById('power-meter-fill');
    this.shotFeedback = document.getElementById('shot-feedback');
    this.instructions = document.getElementById('game-instructions');

    // Touch/pointer handlers
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.updatePowerMeter = this.updatePowerMeter.bind(this);

    // Collision detection
    this.checkScore = this.checkScore.bind(this);
    this.scoreCheckInterval = null;

    // Listen for ball position updates
    this.lastBallY = null;
    this.ballPassedThrough = false;
    this.ballHitRim = false;
    this.powerMeterInterval = null;
    this.inputActive = false;
    this.inputSource = null;
  },

  update: function() {
    if (this.data.enabled) {
      this.enable();
    } else {
      this.disable();
    }
  },

  enable: function() {
    // Ensure entities are found
    if (!this.hoop) this.hoop = document.getElementById(this.data.hoopId);
    if (!this.ball) this.ball = document.getElementById(this.data.ballId);
    if (!this.hoopTrigger) this.hoopTrigger = document.getElementById('hoopTrigger');

    // Show game UI
    if (this.gameUI) this.gameUI.classList.add('visible');
    if (this.instructions) this.instructions.classList.add('visible');

    // Add event listeners
    this.el.sceneEl.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.el.sceneEl.addEventListener('touchend', this.onTouchEnd);
    this.el.sceneEl.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    // Start score checking
    this.scoreCheckInterval = setInterval(this.checkScore, 100);

    // Update UI
    this.updateGameUI();

    console.log('[Basketball] Shooting enabled - tap/click to shoot!');
  },

  disable: function() {
    // Remove event listeners
    this.el.sceneEl.removeEventListener('touchstart', this.onTouchStart);
    this.el.sceneEl.removeEventListener('touchend', this.onTouchEnd);
    this.el.sceneEl.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);

    // Stop score checking
    if (this.scoreCheckInterval) {
      clearInterval(this.scoreCheckInterval);
      this.scoreCheckInterval = null;
    }

    // Stop power meter
    if (this.powerMeterInterval) {
      clearInterval(this.powerMeterInterval);
      this.powerMeterInterval = null;
    }

    // Hide game UI
    if (this.gameUI) this.gameUI.classList.remove('visible');
    if (this.instructions) this.instructions.classList.remove('visible');
  },

  onTouchStart: function(e) {
    if (this.isShooting || this.inputActive) return;
    this.inputActive = true;
    this.inputSource = 'touch';
    this.touchStartTime = Date.now();
    this.touchStartPos = e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

    // Start power meter animation
    this.startPowerMeter();
  },

  onTouchEnd: function(e) {
    if (this.isShooting || !this.inputActive || this.inputSource !== 'touch') return;
    this.inputActive = false;
    this.inputSource = null;
    this.stopPowerMeter();
    const touchEndPos = e.changedTouches ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY } : { x: e.clientX, y: e.clientY };
    const holdTime = Date.now() - this.touchStartTime;
    this.shoot(touchEndPos, holdTime);
  },

  onPointerDown: function(e) {
    if (this.isShooting || this.inputActive) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.inputActive = true;
    this.inputSource = 'pointer';
    this.touchStartTime = Date.now();
    this.touchStartPos = { x: e.clientX, y: e.clientY };
    this.startPowerMeter();
  },

  onPointerUp: function(e) {
    if (this.isShooting || !this.inputActive || this.inputSource !== 'pointer') return;
    this.inputActive = false;
    this.inputSource = null;
    this.stopPowerMeter();
    const holdTime = Date.now() - this.touchStartTime;
    this.shoot({ x: e.clientX, y: e.clientY }, holdTime);
  },

  startPowerMeter: function() {
    if (this.powerMeterInterval) return;
    this.powerMeterStartTime = Date.now();
    this.powerMeterInterval = setInterval(this.updatePowerMeter, 33); // ~30fps
  },

  stopPowerMeter: function() {
    if (this.powerMeterInterval) {
      clearInterval(this.powerMeterInterval);
      this.powerMeterInterval = null;
    }
    if (this.powerMeterFill) {
      this.powerMeterFill.style.width = '0%';
    }
  },

  updatePowerMeter: function() {
    if (!this.powerMeterFill || !this.touchStartTime) return;
    const holdTime = Date.now() - this.touchStartTime;
    const maxHold = 1500; // Max 1.5 seconds
    const powerPercent = Math.min((holdTime / maxHold) * 100, 100);
    this.powerMeterFill.style.width = powerPercent + '%';
  },

  shoot: function(screenPos, holdTime) {
    if (!this.ball || this.isShooting) return;

    // If hoop doesn't exist, use a fixed target position (for court-only mode)
    let hoopPos;
    if (!this.hoop) {
      // Use a fixed target position relative to the ball (forward and up)
      const ballPos = this.ball.getAttribute('position');
      hoopPos = {
        x: ballPos.x,
        y: ballPos.y + 2.0,  // 2 units up
        z: ballPos.z + 2.5   // 2.5 units forward
      };
    } else {
      hoopPos = this.hoop.getAttribute('position');
    }

    this.isShooting = true;
    this.ballPassedThrough = false;

    // Get ball position
    const ballPos = this.ball.getAttribute('position');

    // Calculate direction to hoop (with some randomness for difficulty)
    const targetX = hoopPos.x + (Math.random() - 0.5) * 0.2;
    const targetY = hoopPos.y + 0.25; // Rim height
    const targetZ = hoopPos.z;

    const dx = targetX - ballPos.x;
    const dy = targetY - ballPos.y;
    const dz = targetZ - ballPos.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Calculate arc trajectory
    // Adjust power based on hold time (longer hold = more power)
    const powerMultiplier = Math.min(1.0 + (holdTime / 1000), 1.5);
    const basePower = this.data.power * powerMultiplier;

    // Calculate arc height (peak of trajectory)
    const arcHeight = Math.max(dy, 1.5) + 1.5; // At least 1.5 units above target
    const midX = (ballPos.x + targetX) / 2;
    const midY = Math.max(ballPos.y, targetY) + arcHeight;
    const midZ = (ballPos.z + targetZ) / 2;

    // Stop any existing animations
    this.ball.removeAttribute('animation__fly');
    this.ball.removeAttribute('animation__dribble');
    this.ball.removeAttribute('animation__shoot');

    // Disable physics bounce temporarily
    const bounceComp = this.ball.components['physics-bounce'];
    if (bounceComp) {
      bounceComp.disablePhysics();
    }

    // Reset ball position to start
    this.ball.setAttribute('position', ballPos);

    // Use animation for shooting (more reliable than physics for this use case)
    const duration = 800 + (basePower * 50);

    // Create keyframe animation for arc trajectory
    this.ball.setAttribute('animation__shoot', `
      property: position;
      from: ${ballPos.x} ${ballPos.y} ${ballPos.z};
      to: ${targetX} ${targetY} ${targetZ};
      dur: ${duration};
      easing: easeOutQuad;
    `);

    // Add spin animation
    this.ball.setAttribute('animation__spin', `
      property: rotation;
      to: 0 720 0;
      dur: ${duration};
      easing: linear;
    `);

    // Play shoot sound
    const flySound = document.getElementById('flySound');
    if (flySound) {
      flySound.currentTime = 0;
      flySound.play().catch(() => {});
    }

    this.shots++;
    this.lastShotResult = null;
    this.ballHitRim = false;
    this.updateGameUI();

    // Reset after shot completes
    setTimeout(() => {
      this.resetBall();
    }, duration + 2000);
  },

  showFeedback: function(type, text) {
    if (!this.shotFeedback) return;

    this.shotFeedback.textContent = text;
    this.shotFeedback.className = 'visible ' + type;

    setTimeout(() => {
      this.shotFeedback.classList.remove('visible');
    }, 1500);
  },

  createParticles: function(position, color) {
    // Create simple particle effect using spheres
    const particleCount = 8;
    // Find the evolution root entity
    const evoRoot = document.getElementById('evoRoot');
    if (!evoRoot) return;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('a-sphere');
      particle.setAttribute('geometry', 'primitive: sphere; radius: 0.1');
      particle.setAttribute('material', `color: ${color}; transparent: true; opacity: 0.8`);
      particle.setAttribute('position', `${position.x} ${position.y} ${position.z}`);

      const angle = (Math.PI * 2 * i) / particleCount;
      const distance = 0.5;
      const targetX = position.x + Math.cos(angle) * distance;
      const targetY = position.y + Math.sin(angle) * distance + 0.3;
      const targetZ = position.z + Math.sin(angle) * distance;

      particle.setAttribute('animation', `
        property: position;
        from: ${position.x} ${position.y} ${position.z};
        to: ${targetX} ${targetY} ${targetZ};
        dur: 800;
        easing: easeOutQuad;
      `);
      particle.setAttribute('animation__fade', `
        property: material.opacity;
        from: 0.8;
        to: 0;
        dur: 800;
      `);

      evoRoot.appendChild(particle);

      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 800);
    }
  },


  checkScore: function() {
    if (!this.ball || !this.hoopTrigger || !this.isShooting) return;

    const ballPos = this.ball.getAttribute('position');
    const hoopPos = this.hoopTrigger.getAttribute('position');
    const rimRadius = 0.75;

    // Check if ball is near hoop height
    const heightDiff = Math.abs(ballPos.y - hoopPos.y);
    if (heightDiff > 0.6) {
      this.lastBallY = ballPos.y;
      return;
    }

    // Calculate horizontal distance from rim center
    const horizontalDist = Math.sqrt(
      Math.pow(ballPos.x - hoopPos.x, 2) +
      Math.pow(ballPos.z - hoopPos.z, 2)
    );

    // Check for rim hit (ball is close to rim but not perfectly centered)
    if (horizontalDist > rimRadius * 0.7 && horizontalDist < rimRadius * 1.2 && !this.ballHitRim && !this.ballPassedThrough) {
      if (this.lastBallY !== null && Math.abs(ballPos.y - hoopPos.y) < 0.2) {
        this.ballHitRim = true;
        this.lastShotResult = 'rim';

        // Apply rim bounce physics - deflect ball slightly
        const currentPos = this.ball.getAttribute('position');
        const rimCenterX = hoopPos.x;
        const rimCenterZ = hoopPos.z;

        // Calculate bounce direction (away from rim center)
        const bounceDirX = (ballPos.x - rimCenterX) / horizontalDist;
        const bounceDirZ = (ballPos.z - rimCenterZ) / horizontalDist;
        const bounceStrength = 0.3;

        // Modify animation to add bounce
        const currentAnim = this.ball.getAttribute('animation__shoot');
        if (currentAnim) {
          // Get target from animation
          const animTo = currentAnim.split('to:')[1]?.split(';')[0]?.trim();
          if (animTo) {
            const [targetX, targetY, targetZ] = animTo.split(' ').map(parseFloat);
            const newTargetX = targetX + bounceDirX * bounceStrength;
            const newTargetZ = targetZ + bounceDirZ * bounceStrength;

            // Update animation with bounce
            this.ball.setAttribute('animation__shoot', `
              property: position;
              from: ${currentPos.x} ${currentPos.y} ${currentPos.z};
              to: ${newTargetX} ${targetY} ${newTargetZ};
              dur: ${currentAnim.match(/dur: (\d+)/)?.[1] || 800};
              easing: easeOutQuad;
            `);
          }
        }

        // Play rim sound
        const bounceSound = document.getElementById('bounceSound');
        if (bounceSound) {
          bounceSound.currentTime = 0;
          bounceSound.volume = 0.8;
          bounceSound.play().catch(() => {});
        }
      }
    }

    // Check if ball passed through hoop (swish - perfect center)
    if (horizontalDist < rimRadius * 0.6 && !this.ballPassedThrough) {
      // Check if ball was above and now is at or below rim
      if (this.lastBallY !== null && this.lastBallY > hoopPos.y + 0.1 && ballPos.y <= hoopPos.y + 0.1) {
        this.ballPassedThrough = true;
        this.score++;

        // Determine if it was a swish or rim shot
        if (!this.ballHitRim) {
          this.lastShotResult = 'swish';
          this.streak++;
          this.showFeedback('swish', 'SWISH! 🎯');
          this.createParticles(hoopPos, '#00ff88');
        } else {
          this.lastShotResult = 'rim';
          this.streak = 0;
          this.showFeedback('rim', 'RIM! 🏀');
        }

        this.updateGameUI();

        // Play score sound
        const bounceSound = document.getElementById('bounceSound');
        if (bounceSound) {
          bounceSound.currentTime = 0;
          bounceSound.volume = 0.6;
          bounceSound.play().catch(() => {});
        }

        console.log('Score!', this.lastShotResult, 'Total:', this.score, 'Streak:', this.streak);
      }
    }

    // Check for miss (ball passed below rim without scoring)
    if (this.lastBallY !== null && ballPos.y < hoopPos.y - 0.3 && !this.ballPassedThrough && !this.lastShotResult && this.lastBallY > hoopPos.y) {
      this.lastShotResult = 'miss';
      this.streak = 0;
      this.showFeedback('miss', 'MISS');
      this.updateGameUI();
    }

    this.lastBallY = ballPos.y;
  },

  resetBall: function() {
    this.isShooting = false;
    this.ballPassedThrough = false;
    this.ballHitRim = false;
    this.lastBallY = null;
    this.lastShotResult = null;

    // Reset ball to start position
    if (this.ball) {
      this.ball.setAttribute('position', '0 -0.54 0');
      this.ball.setAttribute('rotation', '0 0 0');

      // Stop any animations
      this.ball.removeAttribute('animation__shoot');
      this.ball.removeAttribute('animation__spin');

      // Disable physics
      const bounceComp = this.ball.components['physics-bounce'];
      if (bounceComp) {
        bounceComp.disablePhysics();
      }
    }
  },

  updateGameUI: function() {
    // Update game score display
    if (this.gameScore) {
      this.gameScore.textContent = `Score: ${this.score}/${this.shots}`;
    }

    // Update accuracy
    if (this.accuracyEl) {
      const accuracy = this.shots > 0 ? Math.round((this.score / this.shots) * 100) : 0;
      this.accuracyEl.textContent = `Accuracy: ${accuracy}%`;
    }

    // Update streak
    if (this.streakEl) {
      this.streakEl.textContent = `Streak: ${this.streak}`;
      // Highlight streak if high
      if (this.streak >= 3) {
        this.streakEl.style.color = '#ffaa00';
        this.streakEl.style.textShadow = '0 0 10px rgba(255,170,0,0.8)';
      } else {
        this.streakEl.style.color = 'rgba(255,255,255,0.8)';
        this.streakEl.style.textShadow = 'none';
      }
    }

    // Update HUD with score
    const statusElLocal = document.getElementById('status');
    if (statusElLocal) {
      const currentText = statusElLocal.textContent;
      const scoreText = ` | Score: ${this.score}/${this.shots}`;
      if (!currentText.includes('Score:')) {
        statusElLocal.textContent = currentText + scoreText;
      } else {
        statusElLocal.textContent = currentText.replace(/\| Score: \d+\/\d+/, scoreText);
      }
    }
  }
});

// ---------- Evolution Component (Court Marker) ----------
AFRAME.registerComponent("evolution-controller", {
  init: function () {
    this.marker = document.getElementById("courtMarker");
    this.root = this.el;

    // Build content once
    this.root.innerHTML = `
      <!-- Half Court Texture - Only visible in Phase 3 -->
      <a-plane id="halfCourtPlane"
        visible="false"
        position="0 0.01 0"
        rotation="-90 0 0"
        width="3.24" height="3.24"
        material="shader: flat; src: #texHalfCourt; transparent: false; repeat: 1 1">
      </a-plane>

      <!-- Phase 1 & 2: cracks (overlay) -->
      <a-plane id="cracksPlane"
        position="0 0.03 0"
        rotation="-90 0 0"
        width="5.4" height="5.4"
        material="shader: flat; src: #texCracks; transparent: true; opacity: 0.95; alphaTest: 0.02; depthWrite: false">
      </a-plane>

      <!-- Phase 2: hole (overlay) -->
      <a-plane id="holePlane"
        visible="false"
        position="0 0.02 0"
        rotation="-90 0 0"
        width="3.15" height="3.15"
        material="shader: flat; src: #texHole; transparent: true; opacity: 1.0; alphaTest: 0.02; depthWrite: false">
      </a-plane>

      <!-- Video Plane - displays video on marker plane (bottom right) -->
      <a-plane id="videoPlane"
        visible="false"
        position="1.2 0.04 -1.2"
        rotation="-90 0 0"
        width="1.5" height="1.5"
        material="shader: flat; src: #videoTexture; transparent: false">
      </a-plane>

      <!-- Ground plane for physics (invisible, at marker level) -->
      <a-entity id="groundPlane"
        geometry="primitive: plane; width: 30; height: 30"
        material="visible: false"
        position="0 0 0"
        rotation="-90 0 0"
        static-body="shape: box; halfExtents: 15 0.03 15; type: static;">
      </a-entity>

      <!-- Phase 3: Basketball for court-only shooting (when hoop marker not visible) -->
      <a-entity id="courtBallRig" visible="false" position="0 0.5 0" physics-bounce="restitution: 0.9; groundY: 0;">
        <a-entity id="courtBasketball"
          gltf-model="#basketballModel"
          scale="0.01 0.01 0.01">
        </a-entity>
      </a-entity>

      <!-- Phase 3: Basketball Hoop -->
      <a-entity id="basketballHoop" visible="false" position="0 1.75 0" rotation="0 0 0">
        <!-- Pole (support structure - extends from ground to backboard) -->
        <a-cylinder id="hoopPole"
          geometry="primitive: cylinder; radius: 0.08; height: 4.5; segmentsRadial: 16"
          material="color: #ff6600; metalness: 0.7; roughness: 0.3"
          position="0 -1.75 -0.35"
          rotation="0 0 0">
        </a-cylinder>
        <!-- Backboard -->
        <a-plane id="backboard"
          geometry="primitive: plane; width: 1.5; height: 1.0"
          material="color: #ffffff; transparent: true; opacity: 0.9; side: double"
          position="0 0.5 -0.35"
          rotation="0 0 0">
        </a-plane>
        <!-- Rim (torus) -->
        <a-torus id="rim"
          geometry="primitive: torus; radius: 0.75; radiusTubular: 0.05; segmentsTubular: 16"
          material="color: #ff6600; metalness: 0.8; roughness: 0.2"
          position="0 0.25 0"
          rotation="90 0 0">
        </a-torus>
        <!-- Net (simplified - just visual) -->
        <a-cylinder id="net"
          geometry="primitive: cylinder; radius: 0.9; height: 0.55; segmentsRadial: 16"
          material="color: #ffffff; transparent: true; opacity: 0.6; wireframe: true"
          position="0 0.0 0"
          rotation="0 0 0">
        </a-cylinder>
        <!-- Scoring trigger (invisible cylinder for collision detection) -->
        <a-cylinder id="hoopTrigger"
          geometry="primitive: cylinder; radius: 0.8; height: 0.1; segmentsRadial: 16"
          material="visible: false"
          position="0 0.25 0"
          rotation="90 0 0"
          class="hoop-trigger">
        </a-cylinder>
      </a-entity>

      <!-- 3D Scoreboard floating above marker -->
      <a-entity id="scoreboard3d" visible="false" position="0 2.5 0" rotation="0 0 0">
        <a-plane id="scoreboardBg"
          geometry="primitive: plane; width: 3; height: 1.2"
          material="color: #1a1a2e; transparent: true; opacity: 0.95; side: double"
          position="0 0 0">
        </a-plane>
        <a-text id="scoreboardLabel3d"
          value="TIME UNTIL EVENT"
          align="center"
          position="0 0.4 0.01"
          scale="0.8 0.8 0.8"
          color="#ffd700"
          font="roboto">
        </a-text>
        <a-text id="scoreboardTime3d"
          value="00D 00H 00M 00S"
          align="center"
          position="0 -0.1 0.01"
          scale="1.2 1.2 1.2"
          color="#00ff88"
          font="roboto"
          font-weight="bold">
        </a-text>
      </a-entity>

      <!-- Basketball Shooting Component -->
      <a-entity id="courtShootingEntity" basketball-shooting="hoopId: basketballHoop; ballId: courtBallRig; enabled: false;"></a-entity>
    `;

    // Cache nodes
    this.halfCourtPlane = this.root.querySelector("#halfCourtPlane");
    this.cracksPlane = this.root.querySelector("#cracksPlane");
    this.holePlane = this.root.querySelector("#holePlane");
    this.videoPlane = this.root.querySelector("#videoPlane");
    if (this.videoPlane) {
      this.videoPlane.setAttribute("video-fact-cycle", "intervalMs: 8000; visibleMs: 4000; animMs: 500; videoId: videoTexture");
    }
    this.groundPlane = this.root.querySelector("#groundPlane");
    
    // Setup video aspect ratio adjustment
    this.setupVideoAspectRatio();
    this.courtBallRig = this.root.querySelector("#courtBallRig");
    this.courtBasketball = this.root.querySelector("#courtBasketball");
    this.basketballHoop = this.root.querySelector("#basketballHoop");
    this.courtShootingEntity = this.root.querySelector("#courtShootingEntity");
    this.scoreboard3d = this.root.querySelector("#scoreboard3d");
    this.scoreboardTime3d = this.root.querySelector("#scoreboardTime3d");

    // Initialize sounds (verify files are loaded)
    this.initSounds();
    
    // Setup video aspect ratio
    this.setupVideoAspectRatio();

    this.ambient = document.getElementById("ambientLight");
    this.dir = document.getElementById("dirLight");

    this.visible = false;
    this.markerDetected = false;
    this.stickyVisible = false;
    this.hideTimer = null;
    this.scoreboardInterval = null; // Countdown update interval
    this.videoFactInterval = null;

    // Auto mode only
    this.mode = "auto";
    this.currentPhase = 1;
    this.timeSource = "device";
    this.days = null;
    this.physicsEnabled = false; // Will be set based on device performance
    this.performanceText = ""; // Performance info for HUD
    this.lastCourtBallY = null;
    this.lastCourtBounceTime = 0;
    this.phase2BallActive = false;
    this.phase2BounceStarted = false;
    this.phase2FlyTimer = null;
    this.lastSnappedYaw = null;
    this.calibration = { x: 0, y: 0, z: 0, active: false };

    // Marker events
    if (this.marker) {
      this.marker.addEventListener("markerFound", () => this.onFound());
      this.marker.addEventListener("markerLost", () => this.onLost());
    }

    // UI buttons
    btns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.setMode(btn.dataset.mode);
      });
    });
    if (calibrateBtn) {
      calibrateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        this.calibrateCourtOrientation();
      });
    }

    // Detect device performance and enable physics if capable (non-blocking)
    // Run after initial render to avoid blocking page load
    setTimeout(() => {
      this.initPerformance();
    }, 100);

    // Initial compute (non-blocking - use device time first, server time later)
    this.refreshPhase(true).catch(err => {
      console.warn('[Evolution] Initial phase refresh failed:', err);
    });

    // Periodic refresh (auto mode)
    setInterval(() => {
      if (this.mode === "auto") this.refreshPhase(false);
    }, 60 * 1000);
  },

  initSounds() {
    // Verify audio files are loaded
    const bounceAudio = document.getElementById("bounceSound");
    const flyAudio = document.getElementById("flySound");
    const flameAudio = document.getElementById("flameSound");

    if (bounceAudio) {
      bounceAudio.addEventListener('error', () => {
        console.warn("Failed to load bounce.wav - check assets folder");
      });
    }
    if (flyAudio) {
      flyAudio.addEventListener('error', () => {
        console.warn("Failed to load fly.wav - check assets folder");
      });
    }
    if (flameAudio) {
      flameAudio.addEventListener('error', () => {
        console.warn("Failed to load flame.wav - check assets folder");
      });
    }
  },
  
  setupVideoAspectRatio() {
    const videoEl = document.getElementById("videoTexture");
    if (!videoEl || !this.videoPlane) return;
    
    // Function to update aspect ratio
    const updateAspectRatio = () => {
      if (!videoEl.videoWidth || !videoEl.videoHeight) return;
      
      const baseHeight = 1.5; // Base height in units
      // Force 1:1 (square) aspect ratio for the plane
      const calculatedWidth = baseHeight;
      
      // Update both video planes with correct aspect ratio
      if (this.videoPlane) {
        this.videoPlane.setAttribute("width", calculatedWidth);
        this.videoPlane.setAttribute("height", baseHeight);
      }
      
      // Also update shark video plane if it exists
      const sharkVideoPlane = document.getElementById("sharkVideoPlane");
      if (sharkVideoPlane) {
        sharkVideoPlane.setAttribute("width", calculatedWidth);
        sharkVideoPlane.setAttribute("height", baseHeight);
      }
      
      console.log('[Video] Aspect ratio forced to 1:1:', calculatedWidth.toFixed(2), 'x', baseHeight);
    };
    
    // Try to update immediately if video is already loaded
    if (videoEl.readyState >= 2) { // HAVE_CURRENT_DATA
      updateAspectRatio();
    }
    
    // Update when video metadata is loaded
    videoEl.addEventListener('loadedmetadata', updateAspectRatio);
    
    // Fallback: update when video can play
    videoEl.addEventListener('canplay', updateAspectRatio);
  },

  playVideoFactOnce() {
    if (!this.videoPlane) return;
    const cycle = this.videoPlane.components["video-fact-cycle"];
    if (cycle) cycle.playOnce();
  },

  stopVideoFactCycle() {
    if (!this.videoPlane) return;
    const cycle = this.videoPlane.components["video-fact-cycle"];
    if (cycle) cycle.stop();
  },

  playSound(soundId, volume = 1.0) {
    const audio = document.getElementById(soundId);
    if (audio) {
      audio.volume = volume;
      audio.play().catch(e => console.warn("Sound play failed:", e));
    }
  },

  async initPerformance() {
    try {
      const perf = await detectDevicePerformance();
      this.physicsEnabled = perf.canRunPhysics;

      // Update HUD with performance info
      if (perf.total > 0) {
        const perfText = ` | Perf: ${perf.total.toFixed(1)}/10`;
        const physicsText = perf.canRunPhysics ? ' [Physics ON]' : ' [Physics OFF]';
        // Store for later use in updateHud
        this.performanceText = perfText + physicsText;
      }
    } catch (e) {
      console.warn('[Performance] Detection failed:', e);
      this.physicsEnabled = false; // Default to safe mode
    }
  },

  async refreshPhase(force) {
    if (this.mode !== "auto") {
      this.currentPhase = parseInt(this.mode, 10) || 1;
      this.days = null;
      this.timeSource = "manual";
      this.applyPhaseVisuals(force);
      this.updateHud();
      return;
    }

    // Use device time first for immediate response, then try server time
    let now = new Date();
    let source = "device";

    // Try to get server time, but don't block if it fails
    try {
      const serverTime = await Promise.race([
        getServerNow(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800))
      ]);
      now = serverTime.now;
      source = serverTime.source;
    } catch (e) {
      // Use device time if server fetch fails or times out
      now = new Date();
      source = "device";
    }

    this.timeSource = source;
    this.days = daysUntilEvent(now);
    const nextPhase = phaseFromDays(this.days);

    if (force || nextPhase !== this.currentPhase) {
      this.currentPhase = nextPhase;
      this.applyPhaseVisuals(true);
    }
    this.updateHud();
  },

  setMode(mode) {
    this.mode = mode;
    setActiveButton(mode);
    this.refreshPhase(true);
  },

  updateHud() {
    const d = this.days;
    const daysStr = (d == null) ? "—" : (d.toFixed(1) + " days");
    const perfText = this.performanceText || "";
    statusEl.textContent =
      `Mode: ${this.mode.toUpperCase()} | Phase: ${this.currentPhase} | Until Mar 28: ${daysStr} | Time: ${this.timeSource}${perfText}` +
      (this.markerDetected ? " | Marker: FOUND" : " | Marker: LOST");
  },

  async startScoreboard() {
    // Stop any existing interval
    this.stopScoreboard();

    // Update immediately
    await this.updateScoreboard();

    // Update every second
    this.scoreboardInterval = setInterval(() => {
      this.updateScoreboard();
    }, 1000);
  },

  stopScoreboard() {
    if (this.scoreboardInterval) {
      clearInterval(this.scoreboardInterval);
      this.scoreboardInterval = null;
    }
    const scoreboard = document.getElementById("scoreboard");
    if (scoreboard) {
      scoreboard.classList.remove("visible");
    }
  },

  async updateScoreboard() {
    if (this.mode !== "auto") {
      // Hide scoreboard in manual mode
      const scoreboard = document.getElementById("scoreboard");
      if (scoreboard) scoreboard.classList.remove("visible");
      if (this.scoreboard3d) this.scoreboard3d.setAttribute("visible", false);
      return;
    }

    const { now } = await getServerNow();
    const timeUntil = getTimeUntilEvent(now);
    updateScoreboard(timeUntil);

    // Update 3D scoreboard text
    if (this.scoreboardTime3d && this.stickyVisible) {
      const timeStr = `${String(timeUntil.days).padStart(2, '0')}D ${String(timeUntil.hours).padStart(2, '0')}H ${String(timeUntil.minutes).padStart(2, '0')}M ${String(timeUntil.seconds).padStart(2, '0')}S`;
      this.scoreboardTime3d.setAttribute("value", timeStr);
    }

    // Show 2D scoreboard if marker is visible
    const scoreboard = document.getElementById("scoreboard");
    if (scoreboard && this.markerDetected) {
      scoreboard.classList.add("visible");
    }
  },

  applyPhaseVisuals(force) {
    const p = this.currentPhase;

    const showContent = this.stickyVisible;

    // Video plane - can be shown in any phase (adjust as needed)
    if (this.videoPlane) {
      // Set to true to show video, false to hide
      // You can make this phase-specific or always visible when marker is found
      this.videoPlane.setAttribute("visible", showContent);
      
      // Auto-play video when shown
      if (showContent) {
        const videoEl = document.getElementById("videoTexture");
        if (videoEl) {
          videoEl.play().catch(e => console.warn("Video play failed:", e));
        }
      } else {
        this.stopVideoFactCycle();
      }
    }

    // Half court only visible in Phase 3 (final phase)
    if (this.halfCourtPlane) {
      this.halfCourtPlane.setAttribute("visible", p === 3 && showContent);
    }

    // Cracks visible in Phase 1 and Phase 2 (not in Phase 3)
    this.cracksPlane.setAttribute("visible", (p === 1 || p === 2) && showContent);

    // Hole visible only in Phase 2
    this.holePlane.setAttribute("visible", p === 2 && showContent);

    // Show court basketball in Phase 2 (fly-out + bounce) and Phase 3 (shooting)
    if (this.courtBallRig) {
      if (p === 2 && showContent) {
        this.courtBallRig.setAttribute("visible", true);
        if (this.markerDetected) {
          this.startPhase2BallAnimation();
        }
      } else {
        if (this.phase2BallActive) this.stopPhase2BallAnimation();
        this.courtBallRig.setAttribute("visible", p === 3 && showContent);
      }
    }

    // Show hoop in Phase 3
    if (this.basketballHoop) {
      this.basketballHoop.setAttribute("visible", p === 3 && showContent);
    }

    // Enable shooting HUD in Phase 3 even when markers are not visible
    if (this.courtShootingEntity) {
      const enabled = p === 3 && showContent;
      // Set on the attribute (for late init) and call update if component is ready
      this.courtShootingEntity.setAttribute('basketball-shooting', 'enabled', enabled);
      const shootingComp = this.courtShootingEntity.components['basketball-shooting'];
      if (shootingComp) {
        shootingComp.data.enabled = enabled;
        if (typeof shootingComp.update === 'function') {
          shootingComp.update();
        }
      }
    }

    // Force HUD visibility toggle for Phase 3 to avoid marker-gated UI
    const gameUI = document.getElementById('basketball-game');
    const instructions = document.getElementById('game-instructions');
    if (gameUI) {
      gameUI.classList.toggle('visible', p === 3);
      gameUI.style.visibility = p === 3 ? 'visible' : '';
    }
    if (instructions) {
      instructions.classList.toggle('visible', p === 3);
      instructions.style.visibility = p === 3 ? 'visible' : '';
    }

    // Ball rig exists but is shown only when marker is found (so it can animate out)
    // We still set per-phase settings now.
    // Phase-specific lighting
    if (p === 1) {
      this.setSceneLighting({ ambientI: 0.95, ambientC: "#ffffff", dirI: 1.1, dirC: "#ffffff" });
    } else if (p === 2) {
      this.setSceneLighting({ ambientI: 0.85, ambientC: "#f4fbff", dirI: 1.05, dirC: "#ffffff" });
    } else {
      // Phase 3: warmer, punchier
      this.setSceneLighting({ ambientI: 0.55, ambientC: "#2b2a40", dirI: 1.25, dirC: "#ffd2a3" });
    }

    // Hoop visuals are handled by this component (evolution-controller)
  },

  startPhase2BallAnimation() {
    if (!this.courtBallRig || this.phase2BallActive) return;

    this.phase2BallActive = true;
    this.phase2BounceStarted = false;
    this.lastCourtBallY = null;
    if (this.phase2FlyTimer) {
      clearTimeout(this.phase2FlyTimer);
      this.phase2FlyTimer = null;
    }

    // Reset ball rig and stop any prior animations/physics
    this.courtBallRig.removeAttribute('animation__fly');
    this.courtBallRig.removeAttribute('animation__dribble');
    const bounceComp = this.courtBallRig.components['physics-bounce'];
    if (bounceComp) bounceComp.disablePhysics();

    // Start near the hole and fly out to the right
    const startPos = '0 0.25 0';
    const endX = 2.0;
    const endY = 12.0;
    const endZ = 0;
    const flyDur = 600;

    this.courtBallRig.setAttribute('position', startPos);
    this.courtBallRig.setAttribute('animation__fly', `
      property: position;
      from: 0 0.25 0;
      to: ${endX} ${endY} ${endZ};
      dur: ${flyDur};
      easing: easeOutQuad;
    `);

    // When fly-out completes, start bouncing on the right side
    if (this.onPhase2FlyComplete) {
      this.courtBallRig.removeEventListener('animationcomplete__fly', this.onPhase2FlyComplete);
    }
    const startBounce = () => {
      if (!this.phase2BallActive || this.phase2BounceStarted) return;
      this.phase2BounceStarted = true;
      this.courtBallRig.setAttribute('position', `${endX} ${endY} ${endZ}`);
      if (this.physicsEnabled && bounceComp) {
        bounceComp.enablePhysics(35);
      } else {
        // Fallback bounce animation if physics is disabled
        this.courtBallRig.setAttribute('animation__dribble', `
          property: position;
          from: ${endX} ${endY} ${endZ};
          to: ${endX} 0 ${endZ};
          dir: alternate;
          loop: true;
          dur: 1200;
          easing: easeInQuad;
        `);
      }
    };

    this.onPhase2FlyComplete = () => {
      startBounce();
    };
    this.courtBallRig.addEventListener('animationcomplete__fly', this.onPhase2FlyComplete);

    // Fallback: start bounce even if animationcomplete doesn't fire
    this.phase2FlyTimer = setTimeout(() => {
      startBounce();
    }, flyDur + 50);
  },

  stopPhase2BallAnimation() {
    if (!this.courtBallRig || !this.phase2BallActive) return;
    this.phase2BallActive = false;
    this.phase2BounceStarted = false;
    this.lastCourtBallY = null;

    this.courtBallRig.removeAttribute('animation__fly');
    this.courtBallRig.removeAttribute('animation__dribble');
    const bounceComp = this.courtBallRig.components['physics-bounce'];
    if (bounceComp) bounceComp.disablePhysics();

    if (this.onPhase2FlyComplete) {
      this.courtBallRig.removeEventListener('animationcomplete__fly', this.onPhase2FlyComplete);
      this.onPhase2FlyComplete = null;
    }
    if (this.phase2FlyTimer) {
      clearTimeout(this.phase2FlyTimer);
      this.phase2FlyTimer = null;
    }
  },

  handleCourtBallBounce() {
    if (!this.courtBallRig || !this.courtBallRig.getAttribute('visible')) return;
    const pos = this.courtBallRig.getAttribute('position');
    const currentY = pos.y;
    const groundY = 0;
    const bounceThreshold = 0.08;

    if (this.lastCourtBallY !== null &&
        this.lastCourtBallY > groundY + bounceThreshold &&
        currentY <= groundY + bounceThreshold) {
      const now = Date.now();
      if (now - this.lastCourtBounceTime > 200) {
        this.playSound('bounceSound', 0.6);
        this.lastCourtBounceTime = now;
      }
    }
    this.lastCourtBallY = currentY;
  },

  tick() {
    if (this.phase2BallActive) {
      this.handleCourtBallBounce();
    }
    if (this.markerDetected) {
      this.updateCourtOrientation();
    }
    if (this.stickyVisible && this.marker && !this.markerDetected) {
      if (!this.marker.object3D.visible) {
        this.marker.object3D.visible = true;
      }
      if (this.root && !this.root.object3D.visible) {
        this.root.object3D.visible = true;
      }
    }
  },

  snapAngle90(rad) {
    const step = Math.PI / 2;
    return Math.round(rad / step) * step;
  },

  updateCourtOrientation() {
    if (!this.root || !this.marker) return;
    const markerRot = this.marker.object3D.rotation;
    const calib = this.calibration || { x: 0, y: 0, z: 0, active: false };
    const baseYaw = markerRot.y - (calib.active ? calib.y : 0);
    const targetYaw = this.snapAngle90(baseYaw);

    const pitch = markerRot.x - (calib.active ? calib.x : 0);
    const roll = markerRot.z - (calib.active ? calib.z : 0);
    if (this.lastSnappedYaw === targetYaw && pitch === 0 && roll === 0) {
      return;
    }

    // Cancel marker tilt so the court stays upright, and snap yaw to 90-degree steps.
    this.root.object3D.rotation.x = -pitch;
    this.root.object3D.rotation.z = -roll;
    this.root.object3D.rotation.y = targetYaw - baseYaw;
    this.lastSnappedYaw = targetYaw;
  },

  calibrateCourtOrientation() {
    if (!this.marker) return;
    if (!this.markerDetected) {
      if (statusEl) statusEl.textContent = "Calibration failed: find SJSU marker first.";
      return;
    }
    const markerRot = this.marker.object3D.rotation;
    this.calibration = { x: markerRot.x, y: markerRot.y, z: markerRot.z, active: true };
    if (statusEl) statusEl.textContent = "Calibrated: hold device flat to lock the court.";
    this.updateCourtOrientation();
  },

  setSceneLighting({ ambientI, ambientC, dirI, dirC }) {
    if (!this.ambient || !this.dir) return;
    this.ambient.setAttribute("light", "intensity", ambientI);
    this.ambient.setAttribute("light", "color", ambientC);
    this.dir.setAttribute("light", "intensity", dirI);
    this.dir.setAttribute("light", "color", dirC);
  },

  onFound() {
    this.visible = true;
    this.markerDetected = true;
    this.stickyVisible = true;
    this.updateHud();
    this.startScoreboard();
    window.__markerSjsuFound = true;
    updateMarkerGuide();

    if (this.root) {
      this.root.object3D.visible = true;
      fadeObjectOpacity(this.root, 1, 300);
    }
    this.updateCourtOrientation();
    
    // Start video playback when marker is found
    const videoEl = document.getElementById("videoTexture");
    if (videoEl && this.videoPlane && this.videoPlane.getAttribute("visible")) {
      videoEl.play().catch(e => console.warn("Video play failed:", e));
    }
    this.playVideoFactOnce();

    // Show 3D scoreboard
    if (this.scoreboard3d) {
      this.scoreboard3d.setAttribute("visible", true);
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    // Phase 1: no hole, just cracks
    if (this.currentPhase === 1) {
      this.holePlane.setAttribute("visible", false);
      return;
    }

    // Phase 2+: Show hole
    this.holePlane.setAttribute("visible", true);

    // Phase 2: re-trigger fly-out each time the marker is detected
    if (this.currentPhase === 2) {
      if (this.phase2BallActive) this.stopPhase2BallAnimation();
      this.startPhase2BallAnimation();
    }

  },

  onLost() {
    this.visible = false;
    this.markerDetected = false;
    this.updateHud();
    this.stopScoreboard();
    window.__markerSjsuFound = false;
    updateMarkerGuide();
    
    // Pause video when marker is lost
    const videoEl = document.getElementById("videoTexture");
    if (videoEl) {
      videoEl.pause();
    }
    this.stopVideoFactCycle();
    
    // Grace period then hide hole and hoop when not found (optional)
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      // Keep cracks visible, hide hole and hoop when not found (optional)
      this.holePlane.setAttribute("visible", false);
      if (this.basketballHoop) {
        this.basketballHoop.setAttribute("visible", false);
      }
    }, GRACE_MS);
  }
});

AFRAME.registerComponent("video-fact-cycle", {
  schema: {
    intervalMs: { type: "number", default: 8000 },
    visibleMs: { type: "number", default: 4000 },
    animMs: { type: "number", default: 500 },
    videoId: { type: "string", default: "videoTexture" }
  },
  init() {
    this._timer = null;
    this._cycle = this._cycle.bind(this);
  },
  playOnce() {
    this._cycle();
  },
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.el.removeAttribute("animation__factIn");
    this.el.removeAttribute("animation__factOut");
    this.el.setAttribute("scale", "0.001 0.001 0.001");
    const videoEl = document.getElementById(this.data.videoId);
    if (videoEl) videoEl.pause();
  },
  _cycle() {
    const videoEl = document.getElementById(this.data.videoId);
    if (videoEl) {
      const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
      if (duration > 4) {
        const maxStart = Math.max(duration - 4, 0.1);
        const startTime = Math.random() * maxStart;
        videoEl.currentTime = startTime;
      }
      videoEl.play().catch(() => {});
    }
    this.el.setAttribute("scale", "0.001 0.001 0.001");
    this.el.setAttribute("animation__factIn", {
      property: "scale",
      from: "0.001 0.001 0.001",
      to: "1 1 1",
      dur: this.data.animMs,
      easing: "easeOutBack"
    });
    setTimeout(() => {
      this.el.setAttribute("animation__factOut", {
        property: "scale",
        from: "1 1 1",
        to: "0.001 0.001 0.001",
        dur: this.data.animMs,
        easing: "easeInCubic"
      });
      if (videoEl) videoEl.pause();
    }, this.data.visibleMs);
  }
});

// ---------- Shark Controller Component (Pattern Court Marker) ----------
AFRAME.registerComponent("shark-controller", {
  init: function () {
    this.marker = this.el.closest("a-marker") || document.getElementById("sharkMarker");
    this.root = this.el;
    this.visible = false;
    this.cyclingActive = false; // Track if cycling animation is active
    this.currentSharkIndex = 0; // Track which shark is currently active (0 or 1)
    this.sharkTimers = []; // Store timers for each shark
    this.groundY = 0.0; // Ground plane height (local space)

    // Build shark content (use classes so multiple markers can host sharks)
    this.root.innerHTML = `
      <!-- Video Plane - displays video on marker plane (bottom right) -->
      <a-plane class="shark-video-plane"
        visible="false"
        position="1.2 0.04 -1.2"
        rotation="-90 0 0"
        width="1.5" height="1.5"
        material="shader: flat; src: #videoTexture; transparent: false">
      </a-plane>
      
      <!-- Shark 1 (rig controls motion/rotation; child plays GLB animation) -->
      <a-entity class="shark-rig-1"
        visible="false"
        position="0 0 0"
        rotation="0 0 0"
        scale="0.33 0.33 0.33">
        <a-circle class="shark-shadow"
          radius="0.75"
          position="0 0.01 0"
          rotation="-90 0 0"
          material="color: #000000; opacity: 0.25; transparent: true; side: double">
        </a-circle>
        <a-entity class="shark-model-1"
          gltf-model="#sharkModel1"
          rotation="0 -90 0"
          animation-mixer="loop: repeat; timeScale: 1.0">
        </a-entity>
      </a-entity>
      
      <!-- Shark 2 (rig controls motion/rotation; child plays GLB animation) -->
      <a-entity class="shark-rig-2"
        visible="false"
        position="0 0 0"
        rotation="0 0 0"
        scale="0.33 0.33 0.33">
        <a-circle class="shark-shadow"
          radius="0.75"
          position="0 0.01 3"
          rotation="-90 0 0"
          material="color: #000000; opacity: 0.25; transparent: true; side: double">
        </a-circle>
        <a-entity class="shark-model-2"
          gltf-model="#sharkModel2"
          rotation="0 180 0"
          animation-mixer="loop: repeat; timeScale: 1.0">
        </a-entity>
      </a-entity>
    `;

    // Cache nodes
    this.sharkVideoPlane = this.root.querySelector(".shark-video-plane");
    if (this.sharkVideoPlane) {
      this.sharkVideoPlane.setAttribute("video-fact-cycle", "intervalMs: 8000; visibleMs: 4000; animMs: 500; videoId: videoTexture");
    }
    // Rigs: we animate these (position/rotation)
    this.sharkRigs = [
      this.root.querySelector(".shark-rig-1"),
      this.root.querySelector(".shark-rig-2")
    ];
    // Models: these play GLB animation; render/clipping settings applied here
    this.sharkModels = [
      this.root.querySelector(".shark-model-1"),
      this.root.querySelector(".shark-model-2")
    ];

    // Per-shark base rotations come from the rigs (so GLB animation can't override them)
    this.sharkBaseRotations = this.sharkRigs.map((el) => {
      const r = el ? el.getAttribute("rotation") : null;
      if (!r) return { x: 0, y: 0, z: 0 };
      return { x: r.x || 0, y: r.y || 0, z: r.z || 0 };
    });
    
    // Setup first animation clip on the MODEL entities
    this.sharkModels.forEach((modelEl) => {
      if (!modelEl) return;
      modelEl.addEventListener('model-loaded', () => {
        const mesh = modelEl.getObject3D('mesh');
        if (!mesh) return;

        // Force first animation clip from the GLB (if present)
        try {
          const clips = mesh.animations || [];
          if (clips.length > 0) {
            const firstClipName = clips[0].name || '*';
            modelEl.setAttribute('animation-mixer', `clip: ${firstClipName}; loop: repeat; timeScale: 1.0`);
          }
        } catch (_) {}
      });
    });
    
    // Setup video aspect ratio (will be handled by evolution-controller, but ensure it's set)
    this.setupSharkVideoAspectRatio();

    // Marker events
    if (this.marker) {
      this.marker.addEventListener("markerFound", () => this.onFound());
      this.marker.addEventListener("markerLost", () => this.onLost());
    }

    // Debug mode: Keyboard shortcut to test shark animation (press 'S' key)
    this.debugMode = false;
    this.onKeyDown = this.onKeyDown.bind(this);
    window.addEventListener("keydown", this.onKeyDown);
  },

  onKeyDown: function(e) {
    // Press 'S' key to trigger shark animation (debug mode)
    if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Only trigger if not already in an input field
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        console.log('[Shark Debug] Manual trigger - starting shark animation');
        this.enableDebugMode();
      }
    }
    // Press 'X' key to stop shark animation (debug mode)
    if (e.key.toLowerCase() === 'x' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        console.log('[Shark Debug] Stopping shark animation');
        this.disableDebugMode();
      }
    }
  },

  enableDebugMode: function() {
    this.debugMode = true;
    
    // Make the marker visible for debug mode (simulate marker detection)
    if (this.marker) {
      this.marker.object3D.visible = true;
      // Position marker at origin for testing
      this.marker.object3D.position.set(0, 0, -2);
      this.marker.object3D.rotation.set(0, 0, 0);
    }
    
    // Make the root visible even without marker detection
    if (this.root) {
      this.root.object3D.visible = true;
    }
    
    
    // Show video plane in debug mode
    if (this.sharkVideoPlane) {
      this.sharkVideoPlane.setAttribute("visible", true);
      const videoEl = document.getElementById("videoTexture");
      if (videoEl) {
        videoEl.play().catch(e => console.warn("Video play failed:", e));
      }
    }
    
    // Start cycling animation if not already active
    if (!this.cyclingActive) {
      this.startCyclingAnimation();
    }
    
    console.log('[Shark Debug] Debug mode enabled - sharks should be visible');
  },

  disableDebugMode: function() {
    this.debugMode = false;
    this.stopCyclingAnimation();
    
    // Hide video plane
    if (this.sharkVideoPlane) {
      this.sharkVideoPlane.setAttribute("visible", false);
    }
    const videoEl = document.getElementById("videoTexture");
    if (videoEl) {
      videoEl.pause();
    }
    
    // Hide marker if not actually detected
    if (this.marker && !this.visible) {
      this.marker.object3D.visible = false;
    }
    
    // Hide root if marker is not detected
    if (this.root && !this.visible) {
      this.root.object3D.visible = false;
    }
    
    console.log('[Shark Debug] Debug mode disabled');
  },
  
  setupSharkVideoAspectRatio() {
    const videoEl = document.getElementById("videoTexture");
    if (!videoEl || !this.sharkVideoPlane) return;
    
    const updateAspectRatio = () => {
      if (!videoEl.videoWidth || !videoEl.videoHeight) return;
      
      const baseHeight = 1.5;
      // Force 1:1 (square) aspect ratio for the plane
      const calculatedWidth = baseHeight;
      
      if (this.sharkVideoPlane) {
        this.sharkVideoPlane.setAttribute("width", calculatedWidth);
        this.sharkVideoPlane.setAttribute("height", baseHeight);
      }
    };
    
    if (videoEl.readyState >= 2) {
      updateAspectRatio();
    }
    
    videoEl.addEventListener('loadedmetadata', updateAspectRatio);
    videoEl.addEventListener('canplay', updateAspectRatio);
  },

  setModelOpacity(modelEl, opacity) {
    const mesh = modelEl ? modelEl.getObject3D('mesh') : null;
    if (!mesh) return;
    mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          mat.transparent = true;
          mat.opacity = opacity;
          mat.needsUpdate = true;
        });
      }
    });
  },

  fadeModel(modelEl, from, to, duration = 600) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const value = from + (to - from) * t;
      this.setModelOpacity(modelEl, value);
      if (t < 1) {
        requestAnimationFrame(step);
      }
    };
    this.setModelOpacity(modelEl, from);
    requestAnimationFrame(step);
  },

  onFound: function() {
    this.visible = true;
    if (this.marker && this.marker.id === "courtMarker") {
      window.__markerSjsuFound = true;
    } else {
      window.__markerCourtFound = true;
    }
    updateMarkerGuide();
    
    // Show and play video when marker is found
    if (this.sharkVideoPlane) {
      this.sharkVideoPlane.setAttribute("visible", true);
      const videoEl = document.getElementById("videoTexture");
      if (videoEl) {
        videoEl.play().catch(e => console.warn("Video play failed:", e));
      }
      const cycle = this.sharkVideoPlane.components["video-fact-cycle"];
      if (cycle) cycle.playOnce();
    }
    
    // Start cycling animation if not already active
    if (!this.cyclingActive) {
      this.startCyclingAnimation();
    }
  },

  startCyclingAnimation: function() {
    if (this.cyclingActive) return;
    this.cyclingActive = true;
    this.currentSharkIndex = 0;
    
    // Start the first shark immediately
    this.animateShark(0);
  },

  stopCyclingAnimation: function() {
    this.cyclingActive = false;
    
    // Clear all timers
    this.sharkTimers.forEach(timer => {
      if (timer) clearTimeout(timer);
    });
    this.sharkTimers = [];
    
    // Hide all shark rigs (and remove motion animations)
    (this.sharkRigs || []).forEach(rig => {
      if (!rig) return;
      rig.setAttribute("visible", false);
      rig.removeAttribute("animation__swimOut");
      rig.removeAttribute("animation__swimRotate");
      rig.removeAttribute("animation__swimForward");
    });
  },

  animateShark: function(sharkIndex) {
    if (!this.cyclingActive) return;
    
    const rig = (this.sharkRigs || [])[sharkIndex];
    const modelEl = (this.sharkModels || [])[sharkIndex];
    if (!rig) return;

    // Reset shark to starting position (behind the marker, under ground)
    // Ground plane is y = 0 in local space.
    // Start at the marker's origin (x=0, z=0), under ground.
    const start = { x: 0, y: 0.0, z: 0.0 };
    // Arch upward while beginning to move forward.
    const mid   = { x: 0, y:  0.9, z: -1.0 };  // arch apex (smooth emerge)
    // Dive back into the ground further forward.
    const end   = { x: 0, y: 0.0, z: -4.0 };   // return to ground level (further forward)

    rig.setAttribute("position", `${start.x} ${start.y} ${start.z}`);
    const baseRot = this.sharkBaseRotations?.[sharkIndex] || { x: 0, y: 0, z: 0 };
    rig.setAttribute("rotation", `${baseRot.x} ${baseRot.y} ${baseRot.z}`);
    rig.setAttribute("visible", true);
    // Subsurface fade-in: start transparent and fade to solid as it rises
    if (modelEl) {
      this.fadeModel(modelEl, 0, 1, 700);
    }

    // Segment 1: emerge in a smooth arch (start -> mid)
    rig.setAttribute("animation__swimOut", {
      property: "position",
      from: `${start.x} ${start.y} ${start.z}`,
      to: `${mid.x} ${mid.y} ${mid.z}`,
      dur: 1400,
      easing: "easeOutCubic"
    });


    // Segment 2: swim forward and dive back into the ground (mid -> end)
    const continueTimer = setTimeout(() => {
      this.continueSwimming(sharkIndex, mid, end);
    }, 1400);
    
    this.sharkTimers[sharkIndex] = continueTimer;
  },

  continueSwimming: function(sharkIndex, mid, end) {
    if (!this.cyclingActive) return;
    
    const rig = (this.sharkRigs || [])[sharkIndex];
    const modelEl = (this.sharkModels || [])[sharkIndex];
    if (!rig) return;

    const swimDuration = 2000;
    rig.setAttribute("animation__swimForward", {
      property: "position",
      from: `${mid.x} ${mid.y} ${mid.z}`,
      to: `${end.x} ${end.y} ${end.z}`,
      dur: swimDuration,
      easing: "easeInOutSine"
    });

    // Add a gentle bob on the MODEL (so it doesn't fight forward motion)
    if (modelEl) {
      modelEl.setAttribute("animation__bob", {
        property: "position",
        dir: "alternate",
        loop: true,
        dur: 600,
        easing: "easeInOutSine",
        from: `0 -0.06 0`,
        to: `0 0.06 0`
      });
    }

    // Fade out near the end of the exit
    if (modelEl) {
      setTimeout(() => {
        this.fadeModel(modelEl, 1, 0, 450);
      }, Math.max(swimDuration - 450, 0));
    }

    // After the dive completes, hide shark and start the other one
    const hideTimer = setTimeout(() => {
      rig.setAttribute("visible", false);
      rig.removeAttribute("animation__swimOut");
      rig.removeAttribute("animation__swimRotate");
      rig.removeAttribute("animation__swimForward");
      if (modelEl) {
        modelEl.removeAttribute("animation__bob");
      }
      
      // Alternate sharks (0 <-> 1)
      this.currentSharkIndex = (this.currentSharkIndex + 1) % 2;
      
      // Start next shark after a short delay
      const nextTimer = setTimeout(() => {
        if (this.cyclingActive) {
          this.animateShark(this.currentSharkIndex);
        }
      }, 250);
      
      // Store timer for the next shark
      const nextSharkIndex = this.currentSharkIndex;
      this.sharkTimers[nextSharkIndex] = nextTimer;
    }, swimDuration);
    
    this.sharkTimers[sharkIndex] = hideTimer;
  },

  onLost: function() {
    this.visible = false;
    if (this.marker && this.marker.id === "courtMarker") {
      window.__markerSjsuFound = false;
    } else {
      window.__markerCourtFound = false;
    }
    updateMarkerGuide();
    
    // Stop cycling animation (unless in debug mode)
    if (!this.debugMode) {
      this.stopCyclingAnimation();
    }
    
    // Hide and pause video when marker is lost
    if (this.sharkVideoPlane) {
      this.sharkVideoPlane.setAttribute("visible", false);
      const cycle = this.sharkVideoPlane.components["video-fact-cycle"];
      if (cycle) cycle.stop();
    }
    const videoEl = document.getElementById("videoTexture");
    if (videoEl) {
      videoEl.pause();
    }
  },

  tick() {
    if (this.stickyVisible && this.marker && !this.markerDetected) {
      if (!this.marker.object3D.visible) {
        this.marker.object3D.visible = true;
      }
      if (this.root && !this.root.object3D.visible) {
        this.root.object3D.visible = true;
      }
    }
  }
});

// Minimal diagnostics to surface camera/compositing state without touching playback.
window.addEventListener('DOMContentLoaded', () => {
  initOnboarding();
  initLoadingGate();
  const scene = document.querySelector('a-scene');
  if (!scene) return;

  scene.addEventListener('arjs-video-loaded', () => {
    console.log('[arjs] video loaded');
    if (!scene.isPlaying) scene.play();
  });

  scene.addEventListener('camera-init', () => {
    console.log('[arjs] camera initialized');
  });

  scene.addEventListener('camera-error', (e) => {
    console.error('[arjs] camera error', e && e.detail && e.detail.error ? e.detail.error : e);
  });

  scene.addEventListener('pause', () => {
    setTimeout(() => {
      if (!scene.isPlaying) scene.play();
    }, 100);
  });
});
