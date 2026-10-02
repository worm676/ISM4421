// City layout and street routing. Pure math, no Three.js, so it can be unit tested.
import { DISTRICTS, BUILDINGS, HQ } from "./data.js";

export const CITY_RADIUS = 30; // distance from HQ to each district centre
export const HQ_RING = 7; // ring road around HQ
export const PAD_RADIUS = 11;
const SLOT_RADIUS = 6.5;
// Slot angles relative to the district's outward direction; the gaps are where roads leave.
const SLOT_ANGLES = [-45, 45, 150, 210].map((d) => (d * Math.PI) / 180);
export const FOOTPRINT = 3.6;

const angleOf = (i) => (i / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2;
const pt = (r, a) => ({ x: r * Math.cos(a), z: r * Math.sin(a) });

export function buildLayout() {
  const n = DISTRICTS.length;
  const nodes = {}; // road graph nodes: "c:<district>" centres and "r:<i>" HQ ring points
  const districts = DISTRICTS.map((d, i) => {
    const a = angleOf(i);
    const c = pt(CITY_RADIUS, a);
    nodes[`c:${d.id}`] = c;
    nodes[`r:${i}`] = pt(HQ_RING, a);
    return { ...d, angle: a, x: c.x, z: c.z };
  });

  const edges = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    edges.push([`c:${DISTRICTS[i].id}`, `c:${DISTRICTS[j].id}`]);
    edges.push([`r:${i}`, `c:${DISTRICTS[i].id}`]);
    edges.push([`r:${i}`, `r:${j}`]);
  }

  const buildings = {};
  buildings[HQ.id] = { ...HQ, x: 0, z: 0, size: 6, height: 22, node: null };
  for (const b of BUILDINGS) {
    const d = districts.find((x) => x.id === b.district);
    const a = d.angle + SLOT_ANGLES[b.slot];
    const p = pt(SLOT_RADIUS, a);
    const x = d.x + p.x, z = d.z + p.z;
    // Door faces the district centre, just off the footprint.
    const dist = Math.hypot(d.x - x, d.z - z);
    const k = (FOOTPRINT / 2 + 0.9) / dist;
    buildings[b.id] = { ...b, x, z, size: FOOTPRINT, door: { x: x + (d.x - x) * k, z: z + (d.z - z) * k }, node: `c:${d.id}` };
  }

  const roads = edges.map(([a, b]) => ({ a: nodes[a], b: nodes[b] }));
  return { districts, buildings, nodes, edges, roads };
}

function shortestPath(layout, from, to) {
  const { nodes, edges } = layout;
  const dist = { [from]: 0 }, prev = {}, open = new Set(Object.keys(nodes));
  while (open.size) {
    let u = null;
    for (const k of open) if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || u === to) break;
    open.delete(u);
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : null;
      if (!v || !open.has(v)) continue;
      const alt = dist[u] + Math.hypot(nodes[u].x - nodes[v].x, nodes[u].z - nodes[v].z);
      if (dist[v] === undefined || alt < dist[v]) { dist[v] = alt; prev[v] = u; }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

// Nearest HQ ring point to a spot on the map.
function nearestRing(layout, p) {
  let best = null;
  for (const [k, v] of Object.entries(layout.nodes)) {
    if (!k.startsWith("r:")) continue;
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (!best || d < best.d) best = { k, d };
  }
  return best.k;
}

// Street route (list of {x,z}) from where an agent stands to a building's door.
export function route(layout, fromPos, fromBuildingId, toBuildingId) {
  const A = layout.buildings[fromBuildingId];
  const B = layout.buildings[toBuildingId];
  const startNode = A.node ?? nearestRing(layout, fromPos);
  const endNode = B.node ?? nearestRing(layout, layout.nodes[startNode]);
  const nodePath = shortestPath(layout, startNode, endNode) ?? [startNode, endNode];
  const pts = [fromPos, ...nodePath.map((k) => layout.nodes[k])];
  if (B.door) pts.push(B.door);
  // Drop consecutive duplicates.
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 0.01);
}

export function doorOf(layout, buildingId, near) {
  const b = layout.buildings[buildingId];
  return b.door ?? layout.nodes[nearestRing(layout, near ?? { x: 0, z: -1 })];
}

// Distance from a point to a road segment, used to keep scenery off the streets.
export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}
