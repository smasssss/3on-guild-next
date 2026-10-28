"""Guard the existing Workers, encrypted backups, and code-only VIP deployment."""
import hashlib,json,os,re,sqlite3,subprocess,sys,tarfile,tempfile,time,urllib.error,urllib.request
from pathlib import Path

BASE='8caefa5c8b0259f847ab72180016d045d8566f60'
DATABASES={'staging':'9c3667a6-e510-40a6-b4e6-4852515fdb3a','production':'31e3bbb6-2860-40cb-9390-d989d37f11c2'}
BASE_VERSIONS={'staging':'b33099d7-dd9f-4e79-910d-c6fc59da11e8','production':'266952ab-74bb-45a4-965f-25b03717a6d3'}
TEMPORARY=['언데드킬러','Fallwarrior','Natasha21','호야호야','백구김구','Bogui','MJ2012','레녹스','lina12bwina','수영민트','DrBillX','디디뽀','파츠','봉근대','반달gh','СкульпторДуш']
PHASE='initialization'

def digest(value):
    data=value if isinstance(value,bytes) else json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()
    return hashlib.sha256(data).hexdigest()

class Release:
    def __init__(self,target):
        assert target in DATABASES
        self.target=target;self.worker='3on-guild-'+target;self.database=DATABASES[target]
        self.account=os.environ['CLOUDFLARE_ACCOUNT_ID'];self.token=os.environ['CLOUDFLARE_API_TOKEN']
        self.sha=os.environ['GITHUB_SHA']
        self.root=Path(os.environ.get('RUNNER_TEMP','/tmp'))/('3on-vip-release-'+target)
        self.root.mkdir(mode=0o700,exist_ok=True)
        self.config=Path('wrangler.vip.generated.json')
        subdomain=self.api('GET','/workers/subdomain')['subdomain']
        assert isinstance(subdomain,str) and subdomain and all(c.isalnum() or c=='-' for c in subdomain)
        self.origin='https://'+self.worker+'.'+subdomain+'.workers.dev'

    def api(self,method,path,body=None):
        request=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+self.account+path,
            data=None if body is None else json.dumps(body).encode(),method=method,
            headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json','User-Agent':'3ON-release-verification'})
        with urllib.request.urlopen(request,timeout=120) as response:data=json.load(response)
        assert data.get('success'),'Cloudflare management request failed'
        return data['result']

    def worker_api(self,path):return self.api('GET','/workers/scripts/'+self.worker+path)

    def query(self,sql,params=None):
        assert sql.lstrip().upper().startswith('SELECT ')
        result=self.api('POST','/d1/database/'+self.database+'/query',{'sql':sql,'params':params or []})
        assert all(r.get('success',True) and r.get('meta',{}).get('rows_written',0)==0 for r in result)
        return result[-1].get('results',[])

    def fixture_batch(self,statements):
        assert self.target=='staging' and statements
        allowed=('INSERT INTO growth_members ','INSERT INTO growth_external_ids ','INSERT INTO growth_auto_snapshots ','INSERT INTO growth_hourly_observations ','DELETE FROM growth_members ','DELETE FROM growth_external_ids ','DELETE FROM growth_auto_snapshots ','DELETE FROM growth_hourly_observations ')
        assert all(s['sql'].startswith(allowed) for s in statements)
        result=self.api('POST','/d1/database/'+self.database+'/query',{'batch':statements})
        assert all(r.get('success',True) for r in result)

    def public(self,path,method='GET',body=None,token=None,status=200):
        headers={'User-Agent':'3ON-release-verification','Origin':self.origin}
        if body is not None:headers['Content-Type']='application/json'
        if token:headers['Authorization']='Bearer '+token
        request=urllib.request.Request(self.origin+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
        try:
            with urllib.request.urlopen(request,timeout=60) as response:content=response.read();actual=response.status
        except urllib.error.HTTPError as error:content=error.read();actual=error.code
        assert actual==status,'Unexpected application response status'
        return content

    def active(self):
        versions=self.worker_api('/deployments')['deployments'][0]['versions']
        assert len(versions)==1 and versions[0]['percentage']==100
        return versions[0]['version_id']

    def approved_active(self):
        global PHASE
        PHASE='approved active backend'
        version=self.active()
        if version==BASE_VERSIONS[self.target]:return version
        annotations=self.worker_api('/versions/'+version).get('annotations',{})
        tag=annotations.get('workers/tag','')
        assert re.fullmatch('[a-f0-9]{32}',tag),'Unknown backend version requires source review'
        resolved=subprocess.check_output(['git','rev-parse','--verify',tag+'^{commit}']).decode().strip()
        assert subprocess.run(['git','merge-base','--is-ancestor','841543397794132312f11970530be275052f51cc',resolved],capture_output=True).returncode==0
        assert subprocess.run(['git','merge-base','--is-ancestor',resolved,self.sha],capture_output=True).returncode==0
        assert subprocess.run(['git','diff','--quiet',resolved,self.sha,'--','app','lib','public','build','drizzle','package.json','package-lock.json','vite.config.ts'],capture_output=True).returncode==0,'Reviewed runtime differs from existing backend'
        return version

    def settings(self):
        global PHASE
        settings=self.worker_api('/settings');bindings=settings['bindings']
        assert all(b['type'] in ['d1','assets','plain_text','secret_text'] for b in bindings),'Unknown binding requires preservation review'
        db=[b for b in bindings if b['type']=='d1']
        assert len(db)==1 and db[0]['name']=='DB' and db[0]['id']==self.database
        assert 'ADMIN_PASSWORD_HASH' in [b['name'] for b in bindings if b['type']=='secret_text']
        variables={b['name']:b['text'] for b in bindings if b['type']=='plain_text'}
        assert variables.get('GROWTH_AUTO_MODE')==('fixture' if self.target=='staging' else 'production')
        supported={'bindings','compatibility_date','compatibility_flags','assets','observability','logpush','limits','placement','tail_consumers','streaming_tail_consumers','usage_model','annotations'}
        unsupported=[k for k,v in settings.items() if k not in supported and v not in [None,False,{},[],'',0]]
        if unsupported:PHASE='unsupported Worker fields '+','.join(k for k in unsupported if re.fullmatch('[A-Za-z0-9_]{1,60}',k))
        assert not unsupported,'Unsupported nondefault Worker setting requires review'
        assert settings.get('usage_model') is None or settings['usage_model'] in ['bundled','unbound','standard']
        assert settings.get('annotations') is None or isinstance(settings['annotations'],dict)
        if isinstance(settings.get('assets'),dict):
            unsupported=[k for k,v in settings['assets'].items() if k not in ['html_handling','not_found_handling','run_worker_first'] and v not in [None,False,{},[],'',0]]
            if unsupported:PHASE='unsupported asset fields '+','.join(k for k in unsupported if re.fullmatch('[A-Za-z0-9_]{1,60}',k))
            assert not unsupported
        return settings

    def preserved_settings(self,cfg):
        assets=cfg.get('assets') or {}
        return {'observability':cfg.get('observability') or {},'logpush':bool(cfg.get('logpush')),
            'usage_model':cfg.get('usage_model'),'annotations':{k:v for k,v in (cfg.get('annotations') or {}).items() if k not in ['workers/tag','workers/message']},
            'limits':cfg.get('limits') or {},'placement':cfg.get('placement') or {},
            'tail_consumers':cfg.get('tail_consumers') or [],'streaming_tail_consumers':cfg.get('streaming_tail_consumers') or [],
            'assets':{'html_handling':assets.get('html_handling','auto-trailing-slash'),'not_found_handling':assets.get('not_found_handling','none'),'run_worker_first':assets.get('run_worker_first',False)},
            'bindings':sorted([{'name':b['name'],'type':b['type'],'id':b.get('id')} for b in cfg['bindings']],key=lambda b:(b['type'],b['name']))}

    def crons(self):
        rows=self.worker_api('/schedules');rows=rows.get('schedules',[]) if isinstance(rows,dict) else rows
        result=sorted(row['cron'] for row in rows)
        assert result==([] if self.target=='staging' else ['0,10 * * * *'])
        return result

    def invariant(self):
        cfg=self.settings()
        return {'documents':digest(self.query('SELECT kind,revision,payload,updated_at FROM documents ORDER BY kind')),
            'backups':digest(self.query('SELECT mutation,kind,revision,saved_at FROM backups ORDER BY mutation')),
            'schema':digest(self.query("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name")),
            'migrations':self.query('SELECT name FROM d1_migrations ORDER BY id'),
            'collector_enabled':self.query('SELECT enabled FROM growth_auto_control WHERE id=1'),
            'identity':self.query('SELECT key,value,updated_at FROM growth_meta ORDER BY key'),
            'published_observations':self.query('SELECT COUNT(*) n FROM growth_observations'),
            'crons':self.crons(),'vars':digest([b for b in cfg['bindings'] if b['type']=='plain_text']),
            'secrets':sorted(b['name'] for b in cfg['bindings'] if b['type']=='secret_text'),
            'worker_settings':self.preserved_settings(cfg),'public_route':self.worker_api('/subdomain'),
            'compatibility_date':cfg['compatibility_date'],'compatibility_flags':cfg.get('compatibility_flags',[])}

    def save(self,name,value):
        p=self.root/name;p.write_text(json.dumps(value,ensure_ascii=False));p.chmod(0o600)

    def load(self,name):return json.loads((self.root/name).read_text())

    def export_backup(self):
        body={'output_format':'polling','dump_options':{'no_schema':False,'no_data':False,'tables':[]}}
        for _ in range(90):
            result=self.api('POST','/d1/database/'+self.database+'/export',body)
            assert result.get('success',True) and result.get('status')!='error'
            if result.get('status')=='complete':
                url=result['result']['signed_url'];assert url.startswith('https://')
                with urllib.request.urlopen(url,timeout=120) as response:sql=response.read()
                path=self.root/'database.sql';path.write_bytes(sql);path.chmod(0o600)
                with sqlite3.connect(':memory:') as restored:
                    restored.executescript(sql.decode())
                    assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
                    tables={r[0] for r in restored.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                    assert {'documents','backups','credentials','growth_members','growth_observations','growth_external_ids','growth_auto_control'}<=tables
                    counts={t:restored.execute('SELECT COUNT(*) FROM "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}
                    documents=[dict(zip(['kind','revision','payload','updated_at'],row)) for row in restored.execute('SELECT kind,revision,payload,updated_at FROM documents ORDER BY kind')]
                self.save('restore.json',{'integrity_check':'ok','table_counts':counts,'sql_sha256':digest(sql),'documents_digest':digest(documents)})
                return
            body['current_bookmark']=result['at_bookmark'];time.sleep(1)
        raise RuntimeError('Export timeout')

    def encrypt(self,label):
        archive=self.root/(label+'.tar.gz')
        with tarfile.open(archive,'w:gz') as bundle:
            for p in self.root.iterdir():
                if p.is_file() and p.suffix not in ['.gz','.cms']:bundle.add(p,arcname=p.name)
        output=Path('vip-encrypted-evidence');output.mkdir(exist_ok=True)
        result=subprocess.run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-in',str(archive),'-out',str(output/(self.target+'-'+label+'.cms')),'-outform','DER','scripts/vip-backup-recipient.crt'],capture_output=True)
        assert result.returncode==0,'Recovery evidence encryption failed'

    def before(self):
        global PHASE
        PHASE='existing source and settings'
        initial_version=self.approved_active()
        PHASE='current Worker settings';cfg=self.settings()
        PHASE='current Worker Cron';schedule=self.crons()
        PHASE='existing frontend artifact'
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'legacy.html';path.write_bytes(subprocess.check_output(['git','show',BASE+':public/legacy.html']))
            patch=Path(directory)/'patch.mjs';patch.write_bytes(subprocess.check_output(['git','show',BASE+':scripts/growth-auto-ui.mjs']))
            assert subprocess.run(['node',str(patch),str(path)],capture_output=True).returncode==0
            actual=digest(self.public('/legacy.html'))
            assert actual in [digest(path.read_bytes()),digest(Path('dist/client/legacy.html').read_bytes())],'Live source differs from reviewed baseline'
        for asset in ['growth-auto.js','carriage-date.js','carriage-rotation.js']:
            actual=digest(self.public('/'+asset))
            assert actual in [digest(subprocess.check_output(['git','show',BASE+':public/'+asset])),digest(Path('dist/client',asset).read_bytes())]
        PHASE='full backup and isolated restore';self.export_backup()
        self.save('settings-before.json',cfg)
        assert self.active()==initial_version,'Backend changed during backup'
        self.save('before.json',{'source_sha':self.sha,'version':initial_version,'invariant':self.invariant(),'origin':self.origin})
        assert self.load('restore.json')['documents_digest']==self.load('before.json')['invariant']['documents'],'Operations changed during backup; capture a fresh backup'
        assert digest(cfg)==digest(self.settings()) and schedule==self.crons(),'Worker settings changed during backup'
        assets={'directory':'dist/client'}
        asset_bindings=[b for b in cfg['bindings'] if b['type']=='assets']
        assert len(asset_bindings)<=1
        if asset_bindings:assets['binding']=asset_bindings[0]['name']
        if isinstance(cfg.get('assets'),dict):
            for key in ['html_handling','not_found_handling','run_worker_first']:
                if key in cfg['assets']:assets[key]=cfg['assets'][key]
        route=self.load('before.json')['invariant']['public_route']
        generated={'name':self.worker,'main':'dist/server/index.js','no_bundle':True,'compatibility_date':cfg['compatibility_date'],'compatibility_flags':cfg.get('compatibility_flags',[]),'rules':[{'type':'ESModule','globs':['**/*.js','**/*.mjs']}],'assets':assets,'d1_databases':[{'binding':'DB','database_id':self.database}],'vars':{b['name']:b['text'] for b in cfg['bindings'] if b['type']=='plain_text'},'triggers':{'crons':schedule},'workers_dev':route['enabled'],'preview_urls':route['previews_enabled']}
        for key in ['limits','placement','logpush','tail_consumers','streaming_tail_consumers','observability']:
            if cfg.get(key) is not None:generated[key]=cfg[key]
        # Wrangler4.92 intentionally no longer has a usage_model config field.
        # Its documented raw upload metadata preserves that legacy API value
        # and existing custom annotations; only this release's tag/message change.
        metadata={}
        if cfg.get('usage_model') is not None:metadata['usage_model']=cfg['usage_model']
        if cfg.get('annotations') is not None:metadata['annotations']={**cfg['annotations'],'workers/tag':self.sha[:32],'workers/message':'3ON VIP '+self.sha}
        if metadata:generated['unsafe']={'metadata':metadata}
        self.config.write_text(json.dumps(generated));self.config.chmod(0o600)
        self.encrypt('before')

    def wrangler(self,args,label):
        result=subprocess.run(['node','--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',*args],capture_output=True)
        (self.root/(label+'.log')).write_bytes(result.stdout+result.stderr)
        return result.returncode

    def deploy(self):
        global PHASE
        PHASE='pre-deploy state guard'
        before=self.load('before.json');assert before['source_sha']==self.sha
        assert self.invariant()==before['invariant'] and self.active()==before['version'],'State changed after backup'
        PHASE='Wrangler dry run'
        args=['deploy','--config',str(self.config),'--strict','--tag',self.sha[:32],'--message','3ON VIP '+self.sha]
        assert self.wrangler(args+['--dry-run'],'dry-run')==0
        assert self.invariant()==before['invariant'] and self.active()==before['version']
        PHASE='code deployment';self.save('deployment-started.json',{'source_sha':self.sha})
        code=self.wrangler(args,'deployment')
        active=self.active()
        if active!=before['version']:self.save('deployed.json',{'version':active,'source_sha':self.sha})
        assert code==0 and active!=before['version'],'Code deployment did not complete'

    def verify(self):
        global PHASE
        PHASE='data, auth settings, automation and exact assets'
        before=self.load('before.json');assert self.invariant()==before['invariant']
        assert self.active()==self.load('deployed.json')['version']
        for asset in ['legacy.html','carriage-vip.js','carriage-rotation.js','carriage-date.js','growth-auto.js']:
            assert digest(self.public('/'+asset))==digest(Path('dist/client',asset).read_bytes()),'Deployed asset differs'
        assert json.loads(self.public('/api/session'))=={'admin':False}
        self.public('/api/carriage/vip?backups=1',status=401)
        self.public('/api/carriage/vip',method='POST',body={},status=401)
        auto=json.loads(self.public('/api/growth/automation'))
        assert auto['mode']==('fixture' if self.target=='staging' else 'production') and auto['ai_calls']==0
        if self.target=='staging':assert auto['external_calls']==0
        view=json.loads(self.public('/api/carriage/vip'))
        assert view['schema']=='3on-vip-weekly-v1' and view['threshold']==21720000
        assert view['awaitingFirstSnapshot'] and view['active'] is None
        documents=json.loads(self.public('/api/state'))
        assert documents['schema']=='3on-shared-v1' and len(documents['documents'])==3
        carriage=next(d['data'] for d in documents['documents'] if d['kind']=='carriage')
        for member in view['members']:
            if member['temporary'] and member['current']:assert not member['eligibility']['eligible']
            if carriage.get('vipExcludedMembers',{}).get(member['memberId'])==1:assert member['eligibility']['reason']=='permanent'
        self.save('verification.json',{'source_sha':self.sha,'version':self.active(),'automation':auto,'vip':view,'invariant':self.invariant()})

    def fixture_setup(self):
        global PHASE
        PHASE='isolated Staging roster setup'
        assert self.target=='staging'
        assert self.invariant()==self.load('before.json')['invariant']
        prefix='vip_release_'+os.environ['GITHUB_RUN_ID'];stamp=int(time.time()*1000)
        snapshot=prefix+'_snapshot';members=[];statements=[]
        assert not self.query('SELECT snapshot_id FROM growth_auto_snapshots WHERE snapshot_id=?',[snapshot])
        for i,name in enumerate(TEMPORARY+['VIP 검증용 일반회원']):
            member=prefix+'_member_'+str(i);game=prefix+'_game_'+str(i);canonical=prefix+'_canonical_'+str(i)
            members.append({'memberId':member,'gameId':game,'canonical':canonical,'nickname':name})
            statements.extend([
                {'sql':'INSERT INTO growth_members VALUES(?,?,?,?,?)','params':[member,canonical,name,'vip-release-fixture',time.strftime('%Y-%m-%d')]},
                {'sql':'INSERT INTO growth_external_ids VALUES(?,?,?,?,?,?,?,?)','params':[game,member,name,'confirmed','Staging-only temporary VIP release fixture',None,stamp,stamp]},
                {'sql':'INSERT INTO growth_hourly_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','params':[snapshot,game,member,stamp,stamp,stamp,name,12345,30,'R4',None,None,None,'valid',None]}
            ])
        statements.append({'sql':'INSERT INTO growth_auto_snapshots VALUES(?,?,?,?,?,?,?,?)','params':[snapshot,stamp,prefix,prefix,stamp,stamp,len(members),12345*len(members)]})
        self.save('fixture.json',{'snapshot':snapshot,'members':members})
        self.fixture_batch(statements)
        view=json.loads(self.public('/api/carriage/vip'))
        assert view['roster']['snapshotId']==snapshot
        assert sum(m['eligibility']['reason']=='temporary' for m in view['members'])==16
        assert any(m['canonical']==members[-1]['canonical'] and m['eligibility']['eligible'] for m in view['members'])
        self.save('browser-input.json',{'origin':self.origin,'target':self.target,'fixture':members,'before':self.load('before.json')})

    def fixture_cleanup(self):
        assert self.target=='staging'
        path=self.root/'fixture.json'
        if not path.exists():return
        data=self.load('fixture.json');statements=[{'sql':'DELETE FROM growth_hourly_observations WHERE snapshot_id=?','params':[data['snapshot']]},{'sql':'DELETE FROM growth_auto_snapshots WHERE snapshot_id=?','params':[data['snapshot']]}]
        for m in data['members']:
            statements.extend([{'sql':'DELETE FROM growth_external_ids WHERE game_id=? AND member_id=? AND evidence=?','params':[m['gameId'],m['memberId'],'Staging-only temporary VIP release fixture']},{'sql':'DELETE FROM growth_members WHERE member_id=? AND source=?','params':[m['memberId'],'vip-release-fixture']}])
        self.fixture_batch(statements)
        assert self.invariant()==self.load('before.json')['invariant'],'Protected data changed during Staging checks'
        self.save('fixture-cleanup.json',{'completed':True})

    def rollback(self):
        before_file=self.root/'before.json'
        if not before_file.exists() or not (self.root/'deployment-started.json').exists():return
        before=self.load('before.json');active=self.active()
        if active==before['version']:return
        if (self.root/'deployed.json').exists():assert active==self.load('deployed.json')['version'],'Another deployment is active; refusing rollback'
        else:
            version=self.worker_api('/versions/'+active)
            assert version.get('annotations',{}).get('workers/tag')==self.sha[:32],'Unknown deployed version; refusing rollback'
        assert self.wrangler(['rollback',before['version'],'--name',self.worker,'--yes'],'rollback')==0
        assert self.active()==before['version'] and self.invariant()==before['invariant']

def main():
    global PHASE
    action,target=sys.argv[1:3];PHASE=action
    release=Release(target)
    if action=='encrypt':release.encrypt('after')
    elif action=='encrypt-before':release.encrypt('before')
    else:
        method={'before':release.before,'deploy':release.deploy,'verify':release.verify,'fixture-setup':release.fixture_setup,'fixture-cleanup':release.fixture_cleanup,'rollback':release.rollback}[action]
        method()
    print('VIP release '+target+' '+action+': PASS')

if __name__=='__main__':
    try:main()
    except Exception:
        print('VIP release check '+PHASE+': FAIL; private details withheld')
        raise SystemExit(1)
