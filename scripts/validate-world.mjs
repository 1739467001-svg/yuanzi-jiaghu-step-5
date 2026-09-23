import assert from 'node:assert/strict';
import {PLACES, AGENTS, THEMES, MAP_VERSION, CONFIG_VERSION} from '../src/world/config.js';
import {findPath, walkable, hallWalkable} from '../src/world/engine.js';
import {findWork, allPublishedWorks} from '../src/content/catalog.js';
import {SHARED_EXHIBITION, exhibitionEntries, exhibitionZoneCount} from '../src/content/exhibition.js';

const placeKinds = new Set(['hall','tea','workshop','library','pavilion','placeholder']);
const ids = values => values.map(v => v.id);
const unique = values => new Set(values).size === values.length;

assert.match(MAP_VERSION, /^[a-z0-9-]+v\d+$/, 'MAP_VERSION 必须使用可比较的稳定格式');
assert.match(CONFIG_VERSION, /^[a-z0-9-]+v\d+$/, 'CONFIG_VERSION 必须使用可比较的稳定格式');

assert.ok(PLACES.length >= 1, '地图至少需要一个建筑');
assert.ok(unique(ids(PLACES)), '建筑 id 必须唯一');
assert.ok(unique(ids(AGENTS)), '角色 id 必须唯一');
for (const place of PLACES) {
  assert.ok(placeKinds.has(place.kind), `未知建筑类型: ${place.id}`);
  assert.ok(Number.isFinite(place.x) && Number.isFinite(place.z), `缺少坐标: ${place.id}`);
  assert.ok(place.w > 0 && place.d > 0, `建筑尺寸必须为正数: ${place.id}`);
  assert.ok(Array.isArray(place.entry) && place.entry.length === 2, `入口格式错误: ${place.id}`);
  assert.ok(findPath([-3, 1], place.entry).length, `入口不可达: ${place.id}`);
  if (place.kind === 'placeholder') assert.equal(place.status, 'placeholder', `${place.id} 必须明确标为占位建筑`);
  else assert.notEqual(place.status, 'placeholder', `${place.id} 不应误标为占位建筑`);
}
const placeIds = new Set(ids(PLACES));
for (const agent of AGENTS) {
  assert.ok(Array.isArray(agent.places) && agent.places.length > 0, `角色没有日程地点: ${agent.id}`);
  for (const id of agent.places) assert.ok(placeIds.has(id), `${agent.id} 前往了不存在的建筑 ${id}`);
}
assert.deepEqual(Object.keys(THEMES).sort(), ['campus','jianghu','mystery','startup']);

// 共享展陈：布局版本、展区规模与作品引用都必须可解析为已发布作品。
assert.ok(Number.isInteger(SHARED_EXHIBITION.layoutVersion) && SHARED_EXHIBITION.layoutVersion > 0, '展陈必须有正整数 layoutVersion');
assert.ok(SHARED_EXHIBITION.zoneSize >= 8 && SHARED_EXHIBITION.zoneSize <= 12, `单区展位建议 8—12 个，当前 ${SHARED_EXHIBITION.zoneSize}`);
assert.ok(typeof SHARED_EXHIBITION.id === 'string' && SHARED_EXHIBITION.id, '展陈缺少 exhibitionId');
const entries = exhibitionEntries();
assert.ok(entries.length > 0, '共享展陈没有已发布作品');
assert.ok(unique(entries.map(w => w.id)), '共享展陈存在重复作品');
assert.ok(entries.every(w => w.publicationStatus === '已发布' && findWork(w.id)), '共享展陈只能引用已发布作品');
assert.ok(exhibitionZoneCount() === Math.ceil(entries.length / SHARED_EXHIBITION.zoneSize), '展区数量与布局不一致');

console.log(`World config valid: ${PLACES.length} places (${PLACES.filter(p => p.kind === 'placeholder').length} placeholders), ${AGENTS.length} agents, ${Object.keys(THEMES).length} themes, map ${MAP_VERSION}, exhibition ${SHARED_EXHIBITION.id} v${SHARED_EXHIBITION.layoutVersion} (${entries.length} works / ${exhibitionZoneCount()} zones).`);
