// 存储后端标志（叶子模块：不导入任何业务模块，供全链路取用）。
//
// 为什么需要它：server/store.mjs 用顶层 await 做后端调度，任何被它的依赖链引用、
// 又反过来 import store.mjs 的模块都会和这个 await 形成环——整个模块图死锁
// （表现为测试里「unsettled top-level await」）。embeddings.mjs 就是这种模块
// （memories.mjs → embeddings.mjs → store.mjs → memories.mjs）。
// 因此标志放这里，store.mjs 再转出去，别的模块一律从这里 import。
const backend=String(process.env.ATOM_STORE||'json').trim().toLowerCase();
export const usingSqlite=backend==='sqlite';
