// 修：成员加入后要写回"同一份数据"。原实现 findSect() 返回 demoSects() 新建的
// 临时数组（未持久化），push 后 saveSects(loadSects()) 又把旧数据读回来覆盖。
// 统一为：读一份 → 改一份 → 存一份。
import fs from 'node:fs');
