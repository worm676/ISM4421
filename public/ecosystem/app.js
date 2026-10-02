import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { AGENTS, COUNTERS, DISTRICTS, HQ } from "./data.js";
import { buildLayout, route, doorOf, distToSegment, PAD_RADIUS, HQ_RING, FOOTPRINT } from "./city.js";

const layout = buildLayout();
const colorOf = (districtId) => DISTRICTS.find((d) => d.id === districtId)?.color ?? "#ffffff";

// ---------- renderer / scene ----------
const canvas = document.getElementById("city");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
camera.position.set(0, 70, 95);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 15;
controls.maxDistance = 190;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;

const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a1f2e, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(40, 80, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 220 });
scene.add(sun);

// ---------- seeded randomness so the city looks the same every visit ----------
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// ---------- textures ----------
function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#1b2130"; g.fillRect(0, 0, 64, 64);
  for (let y = 4; y < 64; y += 12) for (let x = 4; x < 64; x += 12) {
    g.fillStyle = rand() < 0.62 ? "#ffe2a3" : "#2b3345";
    g.fillRect(x, y, 7, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const winTex = [windowTexture(), windowTexture(), windowTexture()];

function labelSprite(lines, { color = "#ffffff", bg = "rgba(12,16,26,0.82)", scale = 1 } = {}) {
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  const draw = (ls, col) => {
    const fonts = ["700 34px Inter, sans-serif", "500 26px Inter, sans-serif"];
    g.font = fonts[0];
    const w = Math.max(...ls.map((l, i) => { g.font = fonts[Math.min(i, 1)]; return g.measureText(l).width; })) + 36;
    const h = 20 + ls.length * 36;
    c.width = Math.ceil(w); c.height = h;
    g.fillStyle = bg;
    g.beginPath(); g.roundRect(0, 0, c.width, h, 14); g.fill();
    g.fillStyle = col; g.fillRect(0, 0, 6, h);
    ls.forEach((l, i) => {
      g.font = fonts[Math.min(i, 1)];
      g.fillStyle = i === 0 ? "#ffffff" : "#c9d3e6";
      g.textBaseline = "middle";
      g.fillText(l, 18, 28 + i * 36);
    });
  };
  draw(lines, color);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.renderOrder = 10;
  const setScale = () => s.scale.set((c.width / 64) * scale, (c.height / 64) * scale, 1);
  setScale();
  s.userData.update = (ls, col = color) => {
    draw(ls, col);
    tex.dispose();
    mat.map = new THREE.CanvasTexture(c);
    mat.map.colorSpace = THREE.SRGBColorSpace;
    setScale();
  };
  return s;
}

// ---------- ground, pads, roads ----------
const ground = new THREE.Mesh(new THREE.CircleGeometry(95, 64), new THREE.MeshStandardMaterial({ color: 0x27402f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.9 });
const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8d9a8 });
for (const r of layout.roads) {
  const len = Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z);
  const ang = Math.atan2(r.b.z - r.a.z, r.b.x - r.a.x);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), roadMat);
  road.rotation.set(-Math.PI / 2, 0, -ang);
  road.position.set((r.a.x + r.b.x) / 2, 0.03, (r.a.z + r.b.z) / 2);
  road.receiveShadow = true;
  scene.add(road);
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.12), lineMat);
  dash.rotation.copy(road.rotation);
  dash.position.set(road.position.x, 0.05, road.position.z);
  scene.add(dash);
}
const hqRing = new THREE.Mesh(new THREE.RingGeometry(HQ_RING - 1.4, HQ_RING + 1.2, 48), roadMat);
hqRing.rotation.x = -Math.PI / 2;
hqRing.position.y = 0.035;
scene.add(hqRing);

const pickables = []; // meshes that open the info panel
const buildingMeshes = {};

for (const d of layout.districts) {
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(PAD_RADIUS, PAD_RADIUS, 0.3, 48),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(d.color).multiplyScalar(0.35), roughness: 0.8 }),
  );
  pad.position.set(d.x, 0.15, d.z);
  pad.receiveShadow = true;
  scene.add(pad);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(PAD_RADIUS, 0.12, 8, 64), new THREE.MeshBasicMaterial({ color: d.color }));
  edge.rotation.x = Math.PI / 2;
  edge.position.set(d.x, 0.32, d.z);
  scene.add(edge);
  const label = labelSprite([d.name], { color: d.color, scale: 2.2 });
  label.position.set(d.x, 20, d.z);
  scene.add(label);
}

function makeBuilding(b, color, glow) {
  const tex = winTex[Math.floor(rand() * winTex.length)].clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, Math.max(1, Math.round(b.height / 3)));
  const side = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, color, roughness: 0.6, metalness: 0.2 });
  const roof = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.size, b.height, b.size), [side, side, roof, roof, side, side]);
  mesh.position.set(b.x, b.height / 2 + 0.3, b.z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  if (glow) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(b.size + 0.2, 0.35, b.size + 0.2), new THREE.MeshBasicMaterial({ color: glow }));
    cap.position.set(b.x, b.height + 0.45, b.z);
    scene.add(cap);
    mesh.userData.cap = cap;
  }
  return mesh;
}

for (const b of Object.values(layout.buildings)) {
  if (b.id === HQ.id) continue;
  const mesh = makeBuilding(b, 0xdfe6f2, colorOf(b.district));
  mesh.userData.kind = "building";
  mesh.userData.id = b.id;
  pickables.push(mesh);
  buildingMeshes[b.id] = mesh;
}

// HQ: glass tower with a spinning beacon.
const hqGroup = new THREE.Group();
const hqTower = new THREE.Mesh(
  new THREE.CylinderGeometry(2.6, 3.4, 22, 6),
  new THREE.MeshStandardMaterial({ color: 0x9fc4ff, emissive: 0x2b5cff, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.15 }),
);
hqTower.position.y = 11.3;
hqTower.castShadow = true;
hqGroup.add(hqTower);
const beacon = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.22, 8, 48), new THREE.MeshBasicMaterial({ color: 0x7fe9ff }));
beacon.position.y = 23.5;
beacon.rotation.x = Math.PI / 2;
hqGroup.add(beacon);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshBasicMaterial({ color: 0x7fe9ff, wireframe: true }));
core.position.y = 25.5;
hqGroup.add(core);
scene.add(hqGroup);
hqTower.userData = { kind: "building", id: HQ.id };
pickables.push(hqTower);
buildingMeshes[HQ.id] = hqTower;
const hqLabel = labelSprite([HQ.name], { color: "#7fe9ff", scale: 2.4 });
hqLabel.position.set(0, 31, 0);
scene.add(hqLabel);

// Filler buildings and trees so it reads as a city, kept off the streets.
const clearOfRoads = (p, gap) => layout.roads.every((r) => distToSegment(p, r.a, r.b) > gap);
const clearOfMain = (p) => Object.values(layout.buildings).every((b) => Math.hypot(b.x - p.x, b.z - p.z) > (b.size ?? 4) / 2 + 2.6);
const treeGeo = new THREE.ConeGeometry(0.9, 2.6, 7);
const treeMat = new THREE.MeshStandardMaterial({ color: 0x2f7a47, roughness: 1 });
for (let i = 0; i < 900; i++) {
  const r = 9 + rand() * 78, a = rand() * Math.PI * 2;
  const p = { x: r * Math.cos(a), z: r * Math.sin(a) };
  if (!clearOfRoads(p, 3.4) || !clearOfMain(p) || Math.hypot(p.x, p.z) < HQ_RING + 3) continue;
  const inDistrict = layout.districts.some((d) => Math.hypot(d.x - p.x, d.z - p.z) < PAD_RADIUS - 1);
  if (rand() < (inDistrict ? 0.25 : 0.12)) {
    const size = 1.6 + rand() * 1.6;
    const height = inDistrict ? 2 + rand() * 4 : 1.5 + rand() * 3.5;
    makeBuilding({ x: p.x, z: p.z, size, height }, 0x8f98a8, null);
  } else if (!inDistrict && rand() < 0.35) {
    const t = new THREE.Mesh(treeGeo, treeMat);
    t.position.set(p.x, 1.3, p.z);
    t.castShadow = true;
    scene.add(t);
  }
}

// ---------- agents ----------
const counters = Object.fromEntries(COUNTERS.map((c) => [c.id, 0]));
const WALK_SPEED = 7;
const bodyGeo = new THREE.CapsuleGeometry(0.55, 1.1, 4, 10);
const headGeo = new THREE.SphereGeometry(0.45, 16, 12);
const packetGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
const workRingGeo = new THREE.TorusGeometry(1.3, 0.08, 6, 32);

const agents = AGENTS.map((def, i) => {
  const color = colorOf(def.district);
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 }));
  body.position.y = 1.15;
  body.castShadow = true;
  const head = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  head.position.y = 2.4;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.2), new THREE.MeshBasicMaterial({ color }));
  visor.position.set(0, 2.45, 0.38);
  const packet = new THREE.Mesh(packetGeo, new THREE.MeshBasicMaterial({ color }));
  packet.position.y = 3.6;
  const ring = new THREE.Mesh(workRingGeo, new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.2;
  group.add(body, head, visor, packet, ring);
  const label = labelSprite([def.name, "Starting up"], { color, scale: 0.9 });
  label.position.y = 5.4;
  group.add(label);
  for (const m of [body, head, visor]) { m.userData = { kind: "agent", id: def.id }; pickables.push(m); }

  const first = def.steps[0].at;
  const start = doorOf(layout, first, { x: layout.districts[i % DISTRICTS.length].x, z: layout.districts[i % DISTRICTS.length].z });
  group.position.set(start.x, 0.3, start.z);
  scene.add(group);
  return {
    def, group, label, packet, ring, body, color,
    at: first, step: 0, state: "work", timer: def.steps[0].secs * (0.3 + rand()), path: [], task: def.steps[0].task,
  };
});

function setLabel(a) {
  a.label.userData.update([a.def.name, a.state === "walk" ? `→ ${layout.buildings[a.def.steps[a.step].at].name}` : a.task], a.color);
}
agents.forEach(setLabel);

function startWalk(a) {
  const next = a.def.steps[a.step];
  a.path = route(layout, { x: a.group.position.x, z: a.group.position.z }, a.at, next.at).slice(1);
  a.state = "walk";
  setLabel(a);
}

function finishStep(a) {
  const s = a.def.steps[a.step];
  if (s.count) counters[s.count] += 1;
  const nextStep = (a.step + 1) % a.def.steps.length;
  logEvent(a, `${s.task.replace(/^\w/, (c) => c.toUpperCase())} at ${layout.buildings[s.at].name}`, a.def.steps[nextStep]);
  a.step = nextStep;
  startWalk(a);
  renderCounters();
  if (selected?.kind === "agent" && selected.id === a.def.id) showAgent(a);
}

function updateAgent(a, dt, t) {
  if (a.state === "work") {
    a.timer -= dt;
    a.ring.visible = true;
    a.ring.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    a.body.position.y = 1.15 + Math.abs(Math.sin(t * 5)) * 0.15;
    a.packet.visible = false;
    if (a.timer <= 0) finishStep(a);
    return;
  }
  a.ring.visible = false;
  a.packet.visible = true;
  a.packet.rotation.y += dt * 3;
  a.body.position.y = 1.15 + Math.abs(Math.sin(t * 12)) * 0.12;
  let move = WALK_SPEED * dt;
  while (move > 0 && a.path.length) {
    const target = a.path[0];
    const dx = target.x - a.group.position.x, dz = target.z - a.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) a.group.rotation.y = Math.atan2(dx, dz);
    if (d <= move) { a.group.position.x = target.x; a.group.position.z = target.z; a.path.shift(); move -= d; }
    else { a.group.position.x += (dx / d) * move; a.group.position.z += (dz / d) * move; move = 0; }
  }
  if (!a.path.length) {
    const s = a.def.steps[a.step];
    a.at = s.at;
    a.state = "work";
    a.task = s.task;
    a.timer = s.secs;
    setLabel(a);
    pulseBuilding(s.at);
  }
}

const pulses = [];
function pulseBuilding(id) {
  const b = layout.buildings[id];
  const m = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.6, 32), new THREE.MeshBasicMaterial({ color: colorOf(b.district) === "#ffffff" ? "#7fe9ff" : colorOf(b.district), transparent: true, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(b.x, 0.4, b.z);
  scene.add(m);
  pulses.push({ m, life: 1 });
}

// ---------- links shown when a building is selected ----------
const linkGroup = new THREE.Group();
scene.add(linkGroup);
function showLinks(id) {
  linkGroup.clear();
  const from = layout.buildings[id];
  for (const toId of from.links ?? []) {
    const to = layout.buildings[toId];
    if (!to) continue;
    const h1 = (from.height ?? 22) + 0.6, h2 = (to.height ?? 22) + 0.6;
    const mid = new THREE.Vector3((from.x + to.x) / 2, Math.max(h1, h2) + 8, (from.z + to.z) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(from.x, h1, from.z), mid, new THREE.Vector3(to.x, h2, to.z));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.15, 6), new THREE.MeshBasicMaterial({ color: from.district === "hq" ? 0x7fe9ff : colorOf(from.district) }));
    linkGroup.add(tube);
  }
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id);
const panel = $("panel");
let selected = null;
let follow = null;

function renderCounters() {
  $("counters").innerHTML = COUNTERS.map((c) => `<div class="stat"><b>${counters[c.id]}</b><span>${c.label}</span></div>`).join("");
}
renderCounters();

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function logEvent(a, text, next) {
  const li = document.createElement("li");
  li.innerHTML = `<i style="background:${a.color}"></i><div><b>${esc(a.def.name)}</b> ${esc(text)}<small>Next: ${esc(next.task.toLowerCase())}</small></div>`;
  li.onclick = () => selectAgent(a.def.id, true);
  const feed = $("feed");
  feed.prepend(li);
  while (feed.children.length > 30) feed.lastChild.remove();
}

$("legend").innerHTML =
  `<button data-d="hq"><i style="background:#7fe9ff"></i>HQ</button>` +
  DISTRICTS.map((d) => `<button data-d="${d.id}"><i style="background:${d.color}"></i>${esc(d.name)}</button>`).join("");
$("legend").onclick = (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const d = layout.districts.find((x) => x.id === btn.dataset.d) ?? { x: 0, z: 0 };
  follow = null;
  flyTo(new THREE.Vector3(d.x, 3, d.z), btn.dataset.d === "hq" ? 55 : 40);
};

$("agents").innerHTML = agents.map((a) => `<button data-a="${a.def.id}"><i style="background:${a.color}"></i>${esc(a.def.name)}</button>`).join("");
$("agents").onclick = (e) => {
  const btn = e.target.closest("button");
  if (btn) selectAgent(btn.dataset.a, true);
};

function showBuilding(id) {
  const b = layout.buildings[id];
  const d = DISTRICTS.find((x) => x.id === b.district);
  const here = agents.filter((a) => a.at === id && a.state === "work");
  const users = agents.filter((a) => a.def.steps.some((s) => s.at === id));
  const links = (b.links ?? []).map((l) => layout.buildings[l]?.name).filter(Boolean);
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="kicker" style="color:${d?.color ?? "#7fe9ff"}">${esc(d?.name ?? "Headquarters")}</div>
    <h2>${esc(b.name)}</h2>
    <p>${esc(b.role)}</p>
    <dl>
      <dt>Runs on</dt><dd>${b.tools.map(esc).join(" · ")}</dd>
      <dt>Hands work to</dt><dd>${links.map(esc).join(", ") || "None"}</dd>
      <dt>Agents working here now</dt><dd>${here.map((a) => esc(`${a.def.name}: ${a.task}`)).join("<br>") || "None right now"}</dd>
      <dt>Visited by</dt><dd>${users.map((a) => esc(a.def.name)).join(", ") || "None"}</dd>
    </dl>`;
  panel.hidden = false;
}

function showAgent(a) {
  panel.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="kicker" style="color:${a.color}">${esc(a.def.role)}</div>
    <h2>${esc(a.def.name)}</h2>
    <p class="status"><span class="dot" style="background:${a.color}"></span>${a.state === "work" ? `Working: ${esc(a.task)}` : `Walking to ${esc(layout.buildings[a.def.steps[a.step].at].name)}`}</p>
    <ol class="steps">${a.def.steps.map((s, i) => `<li class="${i === a.step ? "on" : ""}"><b>${esc(s.task)}</b><span>${esc(layout.buildings[s.at].name)}</span></li>`).join("")}</ol>
    <label class="follow"><input type="checkbox" ${follow === a ? "checked" : ""}> Follow with camera</label>`;
  panel.querySelector(".follow input").onchange = (e) => { follow = e.target.checked ? a : null; };
  panel.hidden = false;
}

function selectAgent(id, fly) {
  const a = agents.find((x) => x.def.id === id);
  selected = { kind: "agent", id };
  linkGroup.clear();
  if (fly) { follow = a; flyTo(a.group.position.clone(), 26); }
  showAgent(a);
}

function selectBuilding(id) {
  selected = { kind: "building", id };
  follow = null;
  showLinks(id);
  showBuilding(id);
}

panel.addEventListener("click", (e) => {
  if (e.target.closest(".close")) { panel.hidden = true; selected = null; follow = null; linkGroup.clear(); }
});

// ---------- camera fly ----------
let fly = null;
function flyTo(target, dist) {
  controls.autoRotate = false;
  const dir = camera.position.clone().sub(controls.target).normalize();
  fly = { t: 0, fromT: controls.target.clone(), toT: target, fromP: camera.position.clone(), toP: target.clone().add(dir.multiplyScalar(dist)) };
}

// ---------- picking ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; controls.autoRotate = false; });
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (!hit) return;
  const { kind, id } = hit.object.userData;
  if (kind === "agent") selectAgent(id, false);
  else selectBuilding(id);
});
canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  canvas.style.cursor = ray.intersectObjects(pickables, false).length ? "pointer" : "grab";
});

// ---------- day / night ----------
let night = true;
function applyTime() {
  scene.background = new THREE.Color(night ? 0x0b1020 : 0xbcd7f0);
  scene.fog = new THREE.Fog(night ? 0x0b1020 : 0xbcd7f0, 120, 260);
  hemi.intensity = night ? 0.45 : 1.1;
  sun.intensity = night ? 0.35 : 1.8;
  sun.color.set(night ? 0x8fa8ff : 0xffffff);
  ground.material.color.set(night ? 0x16261c : 0x4f7d57);
  scene.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m?.emissiveMap) m.emissiveIntensity = night ? 0.9 : 0.12;
  });
  $("time").textContent = night ? "Switch to day" : "Switch to night";
  document.documentElement.dataset.scene = night ? "night" : "day";
}
$("time").onclick = () => { night = !night; applyTime(); };
applyTime();

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let panelRefresh = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  for (const a of agents) updateAgent(a, dt, t);
  beacon.rotation.z += dt * 0.8;
  beacon.position.y = 23.5 + Math.sin(t * 2) * 0.4;
  core.rotation.y += dt;
  core.rotation.x += dt * 0.5;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    p.life -= dt * 0.8;
    p.m.scale.setScalar(1 + (1 - p.life) * 9);
    p.m.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pulses.splice(i, 1); }
  }
  if (fly) {
    fly.t = Math.min(1, fly.t + dt * 1.2);
    const k = 1 - Math.pow(1 - fly.t, 3);
    controls.target.lerpVectors(fly.fromT, fly.toT, k);
    camera.position.lerpVectors(fly.fromP, fly.toP, k);
    if (fly.t >= 1) fly = null;
  } else if (follow) {
    const delta = follow.group.position.clone().setY(3).sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
  }
  // Keep the open building panel's "working here now" list live.
  panelRefresh += dt;
  if (panelRefresh > 0.5 && selected?.kind === "building" && !panel.hidden) { panelRefresh = 0; showBuilding(selected.id); }
  controls.update();
  renderer.render(scene, camera);
});
