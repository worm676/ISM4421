import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, ALL_BUILDINGS, BUILDINGS, COUNTERS, DISTRICTS } from "../public/ecosystem/data.js";
import { buildLayout, route, distToSegment, FOOTPRINT } from "../public/ecosystem/city.js";

const ids = new Set(ALL_BUILDINGS.map((b) => b.id));

test("building ids are unique and links resolve", () => {
  assert.equal(ids.size, ALL_BUILDINGS.length);
  for (const b of ALL_BUILDINGS) for (const l of b.links) assert.ok(ids.has(l), `${b.id} -> ${l}`);
});

test("each district slot holds at most one building", () => {
  const seen = new Set();
  for (const b of BUILDINGS) {
    assert.ok(DISTRICTS.some((d) => d.id === b.district), b.id);
    const key = `${b.district}:${b.slot}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});

test("agent steps point at real buildings and counters", () => {
  const counters = new Set(COUNTERS.map((c) => c.id));
  for (const a of AGENTS) for (const s of a.steps) {
    assert.ok(ids.has(s.at), `${a.id} -> ${s.at}`);
    if (s.count) assert.ok(counters.has(s.count), s.count);
  }
});

test("every building can be reached from every other by street", () => {
  const L = buildLayout();
  for (const from of ALL_BUILDINGS) for (const to of ALL_BUILDINGS) {
    const start = from.id === "hq" ? L.nodes["r:0"] : L.buildings[from.id].door;
    const path = route(L, start, from.id, to.id);
    assert.ok(path.length >= 1);
    if (L.buildings[to.id].door) assert.deepEqual(path.at(-1), L.buildings[to.id].door);
  }
});

test("buildings stay off the roads", () => {
  const L = buildLayout();
  for (const b of BUILDINGS) {
    const p = L.buildings[b.id];
    for (const r of L.roads) assert.ok(distToSegment(p, r.a, r.b) > FOOTPRINT / 2 + 1, `${b.id} overlaps a road`);
  }
});
