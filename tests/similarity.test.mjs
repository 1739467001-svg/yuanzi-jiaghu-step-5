import test from 'node:test';
import assert from 'node:assert/strict';
import {similarity,bigrams,cosineSim} from '../src/content/similarity.js';

test('similarity is reflexive and near-zero for unrelated text', () => {
 assert.equal(similarity('我喜欢内容创作','我喜欢内容创作'),1);
 assert.equal(similarity('效率工具','效率工具'),1);
 assert.ok(similarity('今天天气不错想去散步','量子引力波与黑洞蒸发')<0.05,'无关文本接近 0');
 assert.equal(similarity('',''),0);
 assert.equal(similarity('有内容',''),0,'空文本不报错');
});

test('similarity rewards partial overlap and ignores case and punctuation', () => {
 const partial=similarity('想做电商选品工具','选品工具有推荐吗');
 assert.ok(partial>0.1&&partial<1,'部分重叠居中');
 assert.equal(similarity('Hello, World!','hello world'),1,'大小写与标点不敏感');
 assert.equal(similarity('效率工具','工具效率')>0.3,true,'词序不影响核心二元组匹配');
});

test('bigrams are cached and cover Chinese without segmentation', () => {
 const first=bigrams('原子江湖');
 assert.equal(first.get('原子'),1);
 assert.equal(first.get('子江'),1);
 assert.equal(first.get('江湖'),1);
 assert.equal(bigrams('原子江湖'),first,'缓存返回同一引用');
});
