const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {DatabaseSync}=require('node:sqlite');
module.exports=function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync('drizzle/'+f,'utf8').replaceAll('--> statement-breakpoint',''));
 const db={prepare(query){let args=[];const s={bind(...v){args=v;return s},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}},execute(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}};return s},async batch(statements){sql.exec('BEGIN');try{const r=statements.map(s=>s.execute());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const env={DB:db,ADMIN_PASSWORD_HASH:'fixture-password-config',GROWTH_AUTO_MODE:'fixture'},cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const mod={exports:{}};cache.set(file,mod);
  const requireLocal=name=>name==='cloudflare:workers'?{env}:name.startsWith('.')?load(path.resolve(path.dirname(file),name)+(path.extname(name)?'':'.ts')):require(name);
  const source=file.endsWith('.json')?'module.exports='+fs.readFileSync(file,'utf8'):ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',source)(requireLocal,mod,mod.exports);return mod.exports;
 }
 const seedMember=(id,name,canonical=name)=>{sql.prepare("INSERT INTO growth_members VALUES(?,?,?,'fixture','2026-10-28')").run(id,canonical,name);sql.prepare("INSERT INTO growth_external_ids VALUES(?,?,?,'confirmed','fixture',NULL,1,1)").run('game-'+id,id,name);};
 const observe=(snapshot,id,name='Eligible',pointsPower=12345)=>sql.prepare("INSERT INTO growth_hourly_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(snapshot,'game-'+id,id,Date.parse('2026-10-28T00:00:00Z'),1,1,name,pointsPower,30,'R4',null,null,null,'valid',null);
 const addSnapshot=id=>sql.prepare('INSERT INTO growth_auto_snapshots VALUES(?,?,?,?,?,?,?,?)').run(id,Date.parse('2026-10-28T00:00:00Z')+(id==='new'?1:0),id,'fixture',1,1,2,12345);
 return {sql,db,env,load,seedMember,observe,addSnapshot};
};
