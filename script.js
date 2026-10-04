(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const garden = document.getElementById('garden');
  const flowerButton = document.getElementById('flower-button');
  const control = document.getElementById('bloom-control');
  const prompt = document.getElementById('prompt');
  const announcement = document.getElementById('announcement');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = x => Math.max(0, Math.min(1, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const fmt = x => x.toFixed(2);
  const el = (tag, attributes = {}, parent) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (parent) parent.appendChild(node);
    return node;
  };
  // A seeded texture keeps every freckle fixed to its own petal surface.
  let seed = 8724;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const defs = document.querySelector('#lily defs');
  const petalLayer = document.getElementById('petals');
  // Alternating whorls of three; irregular proportions avoid a rigid six-point star.
  const specifications = [
    { angle: -8, length: 262, width: 47, bend: -18, curl: .18, delay: .10, closedAngle: 0, shade: .91 },
    { angle: 112, length: 253, width: 46, bend: 21, curl: .20, delay: .15, closedAngle: 0, shade: .88 },
    { angle: -125, length: 258, width: 48, bend: -22, curl: .21, delay: .20, closedAngle: 0, shade: .90 },
    { angle: 52, length: 267, width: 64, bend: 15, curl: .24, delay: .25, closedAngle: 0, shade: 1 },
    { angle: 177, length: 256, width: 65, bend: -16, curl: .25, delay: .31, closedAngle: 0, shade: 1 },
    { angle: -61, length: 269, width: 61, bend: 13, curl: .23, delay: .36, closedAngle: 0, shade: 1 }
  ];
  const petals = specifications.map((spec, index) => {
    const base = el('g', { id: `petal-${index + 1}`, class: 'petal', 'data-delay': spec.delay }, petalLayer);
    base.style.setProperty('--petal-delay', `${spec.delay * 5500}ms`);
    base.style.setProperty('--petal-duration', `${(1 - spec.delay) * 5500}ms`);
    base.style.setProperty('--petal-close-duration', `${(1 - spec.delay) * 4600}ms`);
    const group = el('g', { class: 'petal-unfurl' }, base);
    const clip = el('clipPath', { id: `petal-clip-${index}` }, defs);
    const clipPath = el('path', {}, clip);
    const surface = el('g', { class: 'petal-surface' }, group);
    const edge = el('path', { fill: 'url(#petal-edge)' }, surface);
    const pink = el('path', { fill: 'url(#petal-pink)' }, surface);
    const light = el('path', { fill: 'url(#petal-light)' }, surface);
    const details = el('g', { 'clip-path': `url(#petal-clip-${index})` }, group);
    const grain = el('path', { class: 'petal-grain', fill: '#d798a3' }, details);
    const veins = Array.from({ length: 7 }, (_, i) => el('path', { class: i === 3 ? 'petal-rib' : 'petal-vein' }, details));
    const spots = Array.from({ length: 47 }, () => {
      const s = .20 + random() * .54;
      const u = (random() * 2 - 1) * .78;
      const radius = .7 + random() * 1.5;
      const dot = el('ellipse', { fill: random() > .25 ? '#7a163c' : '#9f2049', opacity: .48 + random() * .4 }, details);
      return { s, u, radius, tilt: random() * 50 - 25, dot };
    });
    const midrib = el('path', { fill: 'none', stroke: '#eed2b1', 'stroke-width': 1.3, opacity: .27 }, details);
    const fold = el('path', { fill: 'url(#petal-fold)', opacity: 0 }, group);
    const foldRim = el('path', { fill: 'none', stroke: '#fff6e6', 'stroke-width': .8, opacity: 0 }, group);
    return { ...spec, base, group, edge, pink, light, grain, clipPath, veins, spots, midrib, fold, foldRim };
  });
  // Parametric ribbon: its centerline bends, while the last third reflexes toward
  // the base. Width, twist and curvature change independently of the base angle.
  function surfacePoint(petal, s, u, opening) {
    const length = mix(185, petal.length, opening);
    const curl = petal.curl * Math.pow(opening, 1.65);
    const width = mix(12, petal.width, opening) * Math.pow(Math.max(0, Math.sin(Math.PI * s)), mix(.84, 1.14, opening)) * (.68 + .42 * s);
    const twist = opening * Math.sin(Math.PI * s) * (s - .45);
    return [
      opening * (petal.bend * Math.sin(Math.PI * s) + 35 * Math.pow(s, 7)) + u * width * (1 + .09 * u * Math.sin(s * 5)),
      -length * (s - curl * Math.pow(s, 5)) + u * width * .24 * twist
    ];
  }
  // Catmull-Rom samples converted to cubic Béziers, preserving a smooth outline.
  function curve(points, close = false) {
    let d = `M${fmt(points[0][0])},${fmt(points[0][1])}`;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], n = points[Math.min(points.length - 1, i + 2)];
      d += `C${fmt(b[0] + (c[0] - a[0]) / 6)},${fmt(b[1] + (c[1] - a[1]) / 6)} ${fmt(c[0] - (n[0] - b[0]) / 6)},${fmt(c[1] - (n[1] - b[1]) / 6)} ${fmt(c[0])},${fmt(c[1])}`;
    }
    return d + (close ? 'Z' : '');
  }
  function outline(petal, opening, core = false) {
    const points = [];
    const tip = core ? .973 : 1;
    for (let i = 0; i <= 18; i++) points.push(surfacePoint(petal, (i / 18) * tip, core ? -.87 : -1, opening));
    for (let i = 18; i >= 0; i--) points.push(surfacePoint(petal, (i / 18) * tip, core ? .85 : 1, opening));
    return curve(points, true);
  }
  function renderPetal(petal, master) {
    const opening = smooth((master - petal.delay) / (1 - petal.delay));
    // Rotation starts only after the enclosure loosens. Every base stays at 0,0.
    const spread = smooth((opening - .03) / .97);
    const angle = mix(petal.closedAngle, petal.angle, spread);
    petal.base.setAttribute('transform', `rotate(${fmt(angle)})`);
    const d = outline(petal, opening);
    petal.edge.setAttribute('d', d);
    petal.clipPath.setAttribute('d', d);
    petal.light.setAttribute('d', d);
    petal.grain.setAttribute('d', d);
    petal.pink.setAttribute('d', outline(petal, opening, true));
    petal.light.setAttribute('opacity', petal.shade);
    petal.veins.forEach((vein, i) => {
      const u = (i - 3) / 4;
      const points = Array.from({ length: 13 }, (_, k) => surfacePoint(petal, .025 + k / 12 * .935, u * Math.sin(Math.PI * (.08 + k / 12 * .85)), opening));
      vein.setAttribute('d', curve(points));
    });
    petal.midrib.setAttribute('d', curve(Array.from({ length: 13 }, (_, k) => surfacePoint(petal, k / 12 * .93, 0, opening))));
    petal.spots.forEach(spot => {
      const [x, y] = surfacePoint(petal, spot.s, spot.u, opening);
      spot.dot.setAttribute('transform', `translate(${fmt(x)} ${fmt(y)}) rotate(${spot.tilt})`);
      spot.dot.setAttribute('rx', fmt(spot.radius * mix(.18, 1, opening)));
      spot.dot.setAttribute('ry', fmt(spot.radius * 1.55));
    });
    // The turned-back tip reveals a softly lit underside, not a scaled duplicate.
    const curlStart = .87;
    const tipPoints = [];
    for (let i = 0; i <= 8; i++) tipPoints.push(surfacePoint(petal, mix(curlStart, 1, i / 8), -1, opening));
    for (let i = 8; i >= 0; i--) tipPoints.push(surfacePoint(petal, mix(curlStart, 1, i / 8), 1, opening));
    petal.fold.setAttribute('d', curve(tipPoints, true));
    const foldOpacity = smooth((opening - .6) / .4) * .73;
    petal.fold.setAttribute('opacity', foldOpacity);
    petal.foldRim.setAttribute('d', curve(Array.from({ length: 9 }, (_, k) => surfacePoint(petal, curlStart + .045 * Math.sin(k / 8 * Math.PI), mix(-1, 1, k / 8), opening))));
    petal.foldRim.setAttribute('opacity', foldOpacity * .55);
  }
  const sepalSpecs = [
    { angle: -93, closed: 0, width: 26, length: 197, delay: 0, front: false },
    { angle: 92, closed: 0, width: 29, length: 199, delay: .015, front: false },
    { angle: -148, closed: 0, width: 27, length: 198, delay: .035, front: true },
    { angle: 151, closed: 0, width: 28, length: 199, delay: .055, front: true }
  ];
  const sepals = sepalSpecs.map((spec, index) => {
    const group = el('g', { class: 'sepal', id: `sepal-${index + 1}` }, document.getElementById(spec.front ? 'front-sepals' : 'rear-sepals'));
    const path = el('path', { fill: index % 2 ? 'url(#bud-light)' : 'url(#bud-gradient)' }, group);
    const seam = el('path', { fill: 'none', stroke: '#c1ca84', 'stroke-width': .9, opacity: .24 }, group);
    const darkSeam = el('path', { fill: 'none', stroke: '#28482c', 'stroke-width': 1.2, opacity: .4 }, group);
    return { ...spec, group, path, seam, darkSeam };
  });
  function renderSepals(master) {
    sepals.forEach(sepal => {
      const t = smooth((master - sepal.delay) / .49);
      const length = mix(sepal.length, 49, t);
      const width = mix(sepal.width, 10, t);
      sepal.group.setAttribute('transform', `rotate(${fmt(mix(sepal.closed, sepal.angle, t))})`);
      sepal.path.setAttribute('d', `M0,5C${-width * .8},${-length * .15} ${-width * 1.1},${-length * .65} 0,${-length}C${width * 1.13},${-length * .72} ${width},${-length * .27} 0,5Z`);
      sepal.seam.setAttribute('d', `M-1,0Q${width * .2},${-length * .49} 0,${-length + 3}`);
      sepal.darkSeam.setAttribute('d', `M${width * .4},${-length * .14}Q${width * .78},${-length * .6} 0,${-length + 1}`);
    });
  }
  const reproductive = document.getElementById('reproductive-parts');
  const stamenSpecs = [ { x: -67, y: -80, angle: -42 }, { x: 61, y: -98, angle: 39 }, { x: -46, y: -126, angle: -23 }, { x: 35, y: -142, angle: 27 }, { x: -89, y: -29, angle: -65 }, { x: 83, y: -41, angle: 58 } ];
  const stamens = stamenSpecs.map(spec => {
    const group = el('g', {}, reproductive);
    const shade = el('path', { fill: 'none', stroke: '#314427', 'stroke-width': 4.5, opacity: .4 }, group);
    const filament = el('path', { fill: 'none', stroke: 'url(#filament-gradient)', 'stroke-width': 2.7, 'stroke-linecap': 'round' }, group);
    const anther = el('g', {}, group);
    el('path', { d: 'M-3,-14C-8,-10 -7,7 -3,13C0,17 5,11 5,2C5,-8 3,-16 -3,-14Z', fill: 'url(#anther-gradient)' }, anther);
    el('path', { d: 'M0,-11Q-2,0 1,11', stroke: '#e6b667', 'stroke-width': .8, fill: 'none', opacity: .5 }, anther);
    for (let i = 0; i < 13; i++) el('circle', { cx: -3 + random() * 6, cy: -10 + random() * 21, r: .35 + random() * .35, fill: '#dfab57', opacity: .65 }, anther);
    return { ...spec, shade, filament, anther, group };
  });
  const pistil = el('g', {}, reproductive);
  const styleShadow = el('path', { fill: 'none', stroke: '#233c27', 'stroke-width': 5, opacity: .45 }, pistil);
  const flowerStyle = el('path', { fill: 'none', stroke: 'url(#filament-gradient)', 'stroke-width': 3.7, 'stroke-linecap': 'round' }, pistil);
  const stigma = el('g', {}, pistil);
  el('path', { d: 'M0,0C-9,3 -11,-5 -6,-8C-9,-15 0,-16 3,-11C10,-15 15,-8 10,-3C12,4 3,7 0,0Z', fill: '#b0b477', stroke: '#d2cc9c', 'stroke-width': .65 }, stigma);
  el('path', { d: 'M2,-8L2,0M2,-5L-4,-7M2,-5L8,-6', fill: 'none', stroke: '#687742', 'stroke-width': .8, opacity: .6 }, stigma);
  function renderCenter(master) {
    const emergence = smooth((master - .39) / .5);
    reproductive.setAttribute('opacity', smooth((master - .35) / .15));
    stamens.forEach((stamen, i) => {
      const t = smooth((master - .35 - i * .024) / .46);
      const x = stamen.x * t, y = mix(-5, stamen.y, t);
      const d = `M0,4C${fmt(x * .15)},${fmt(y * .28)} ${fmt(x * .63)},${fmt(y * .91)} ${fmt(x)},${fmt(y)}`;
      stamen.filament.setAttribute('d', d);
      stamen.shade.setAttribute('d', d);
      stamen.anther.setAttribute('transform', `translate(${fmt(x)} ${fmt(y)}) rotate(${mix(0, stamen.angle, t)})`);
    });
    const d = `M0,5C1,${fmt(-40 * emergence)} 14,${fmt(-115 * emergence)} 16,${fmt(-159 * emergence)}`;
    flowerStyle.setAttribute('d', d);
    styleShadow.setAttribute('d', d);
    stigma.setAttribute('transform', `translate(${fmt(16 * emergence)} ${fmt(-159 * emergence)})`);
    document.getElementById('throat').setAttribute('opacity', emergence);
  }
  let master = 0;
  let state = 'closed';
  let animationFrame = 0;
  function render(value) {
    petals.forEach(petal => renderPetal(petal, value));
    renderCenter(value);
    renderSepals(value);
  }
  function setState(next) {
    state = next;
    garden.dataset.state = next;
    const busy = next === 'opening' || next === 'closing';
    control.setAttribute('aria-disabled', String(busy));
    flowerButton.setAttribute('aria-disabled', String(busy));
    flowerButton.setAttribute('aria-pressed', String(next === 'open'));
    flowerButton.setAttribute('aria-label', next === 'open' ? 'Close the Stargazer lily' : 'Bloom the Stargazer lily');
    prompt.textContent = { closed: 'Tap to bloom 🌸', opening: 'Unfolding…', open: 'Tap to close', closing: 'Resting…' }[next];
    if (!busy) {
      announcement.textContent = next === 'open' ? 'The lily is fully open. Tap or press Enter to close and replay.' : 'The lily is closed. Tap or press Enter to bloom.';
      document.getElementById('flower-description').textContent = next === 'open' ? 'A fully opened pink Stargazer lily with six curled cream-edged, magenta-spotted petals, six brown-orange anthers and a central pistil.' : 'A closed green lily bud on a leafy stem. Activate to watch its six pink petals unfold.';
    }
  }
  function toggleBloom() {
    if (state === 'opening' || state === 'closing') return;
    const target = state === 'closed' ? 1 : 0;
    const start = master;
    // On request, reduce the travel time and remove the perpetual breeze.
    const duration = reducedMotion.matches ? 1100 : target ? 5500 : 4600;
    const started = performance.now();
    setState(target ? 'opening' : 'closing');
    cancelAnimationFrame(animationFrame);
    function step(now) {
      const elapsed = clamp((now - started) / duration);
      master = mix(start, target, elapsed);
      render(master);
      if (elapsed < 1) animationFrame = requestAnimationFrame(step);
      else { master = target; setState(target ? 'open' : 'closed'); }
    }
    animationFrame = requestAnimationFrame(step);
  }
  flowerButton.addEventListener('click', toggleBloom);
  control.addEventListener('click', toggleBloom);
  // Native buttons also supply Enter and Space activation on desktop and iPhone.
  render(0);
  setState('closed');

  // Tiny wandering lights share the garden without catching taps on the flower.
  function startFireflies() {
    const canvas = document.getElementById('fireflies');
    const context = canvas.getContext('2d');
    if (!context) return;
    const glow = document.createElement('canvas');
    glow.width = glow.height = 64;
    const glowContext = glow.getContext('2d');
    if (!glowContext) return;
    const light = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
    light.addColorStop(0, 'rgba(255, 251, 202, 1)');
    light.addColorStop(.09, 'rgba(243, 255, 174, .9)');
    light.addColorStop(.24, 'rgba(211, 238, 117, .3)');
    light.addColorStop(.55, 'rgba(176, 210, 98, .07)');
    light.addColorStop(1, 'rgba(176, 210, 98, 0)');
    glowContext.fillStyle = light;
    glowContext.fillRect(0, 0, 64, 64);
    let width = 0, height = 0, previousTime = 0, elapsed = 0, frame = 0;
    const lights = [];
    const between = (min, max) => min + Math.random() * (max - min);
    const destination = () => ({ x: between(width * .07, width * .93), y: between(Math.max(180, height * .23), height - 48) });
    function paint() {
      context.clearRect(0, 0, width, height);
      lights.forEach(firefly => {
        // Individual slow pulses stay faintly luminous between brighter glows.
        const pulse = reducedMotion.matches ? .55 : Math.pow(.5 + .5 * Math.sin(elapsed * firefly.pulseSpeed + firefly.phase), 2);
        context.globalAlpha = .2 + pulse * .75;
        const halo = firefly.size * 10;
        context.drawImage(glow, firefly.x - halo, firefly.y - halo, halo * 2, halo * 2);
        context.fillStyle = '#f4f4b7';
        context.beginPath();
        context.ellipse(firefly.x, firefly.y, firefly.size * .65, firefly.size, Math.atan2(firefly.vy, firefly.vx) - Math.PI / 2, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
    }
    function resize() {
      const bounds = garden.getBoundingClientRect();
      const oldWidth = width, oldHeight = height;
      width = bounds.width;
      height = bounds.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      if (oldWidth && oldHeight) lights.forEach(firefly => {
        firefly.x *= width / oldWidth;
        firefly.y *= height / oldHeight;
        firefly.target.x *= width / oldWidth;
        firefly.target.y *= height / oldHeight;
      });
      const count = width <= 600 ? 14 : 24;
      lights.length = Math.min(lights.length, count);
      while (lights.length < count) {
        const position = destination();
        const direction = between(0, Math.PI * 2);
        const speed = between(9, 20);
        lights.push({ ...position, target: destination(), size: between(1.2, 2.2), speed, vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed, phase: between(0, Math.PI * 2), pulseSpeed: between(.8, 1.35) });
      }
      paint();
    }
    function wander(now) {
      frame = 0;
      if (document.hidden || reducedMotion.matches) return;
      const delta = previousTime ? Math.min((now - previousTime) / 1000, .06) : 0;
      previousTime = now;
      elapsed += delta;
      const steering = 1 - Math.exp(-delta * .7);
      lights.forEach(firefly => {
        let dx = firefly.target.x - firefly.x, dy = firefly.target.y - firefly.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 28) {
          firefly.target = destination();
          dx = firefly.target.x - firefly.x;
          dy = firefly.target.y - firefly.y;
          distance = Math.hypot(dx, dy);
        }
        const speed = firefly.speed * (.88 + .12 * Math.sin(elapsed * .5 + firefly.phase));
        firefly.vx = mix(firefly.vx, dx / Math.max(distance, 1) * speed, steering);
        firefly.vy = mix(firefly.vy, dy / Math.max(distance, 1) * speed, steering);
        firefly.x += firefly.vx * delta;
        firefly.y += firefly.vy * delta;
        if (firefly.x < 12) { firefly.x = 12; firefly.vx = Math.abs(firefly.vx); }
        if (firefly.x > width - 12) { firefly.x = width - 12; firefly.vx = -Math.abs(firefly.vx); }
        if (firefly.y < 180) { firefly.y = 180; firefly.vy = Math.abs(firefly.vy); }
        if (firefly.y > height - 24) { firefly.y = height - 24; firefly.vy = -Math.abs(firefly.vy); }
      });
      paint();
      frame = requestAnimationFrame(wander);
    }
    function updateMotion() {
      cancelAnimationFrame(frame);
      previousTime = 0;
      paint();
      if (!document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(wander);
    }
    resize();
    new ResizeObserver(resize).observe(garden);
    document.addEventListener('visibilitychange', updateMotion);
    reducedMotion.addEventListener('change', updateMotion);
    updateMotion();
  }
  startFireflies();
})();
