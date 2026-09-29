// App.jsx：门派流程状态 + 数据加载（服务端优先，静态兜底演示数据）
import fs from 'node:fs';
const p='src/App.jsx';
let s=fs.readFileSync(p,'utf8');
const edits=[
 // 状态
 ["const [sheet,setSheet]=useState(false);",
  "const [sheet,setSheet]=useState(false);\n // 原子门派：sects=大殿分页，sectDetail=当前内景，sectEditing=管理中的门派\n const [sectPageState,setSectPageState]=useState({sects:[],total:0,page:1,pages:1,pageSize:4});\n const [sectDetail,setSectDetail]=useState(null);\n const [sectEditing,setSectEditing]=useState(false);\n const [sectForm,setSectForm]=useState({name:'',slogan:'',intro:'',style:'jianghu'});\n const [sectBusy,setSectBusy]=useState(false);"],
];
for(const [from,to] of edits){
 if(!s.includes(from))throw new Error('anchor not found: '+from.slice(0,50));
 s=s.replace(from,to);
}
fs.writeFileSync(p,s);
console.log('App sect state added');
