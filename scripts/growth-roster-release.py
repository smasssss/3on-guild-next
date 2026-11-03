"""Code-only current-roster repair with complete backup and guarded Staging fixtures."""
import datetime,importlib.util,json,os,sys,time,urllib.error
from pathlib import Path
spec=importlib.util.spec_from_file_location('weekly',Path(__file__).with_name('weekly-input-release.py'));weekly=importlib.util.module_from_spec(spec);spec.loader.exec_module(weekly)
base=weekly.base;base.BASE='af25ab2b8b6ea09c942d4393defa8c479236d62e'

class Release(weekly.Release):
    def api(self,method,path,body=None):
        readonly=method=='GET' or (method=='POST' and path.endswith('/query') and isinstance(body,dict) and str(body.get('sql','')).lstrip().upper().startswith('SELECT '))
        operation='d1-query' if '/d1/' in path else path.rsplit('/',1)[-1]
        for attempt in range(3):
            try:return super().api(method,path,body)
            except urllib.error.HTTPError as error:
                self.last_api_failure={'operation':operation,'method':method,'status':error.code,'body':error.read(8192).decode(errors='replace')}
                if readonly and error.code in [500,502,503,504] and attempt<2:
                    print('Transient Cloudflare management read '+operation+': retry '+str(attempt+1)+'/2');time.sleep(attempt+1)
                else:raise

    def activate(self,version,message):
        failure=None
        try:super().activate(version,message)
        except urllib.error.HTTPError as error:
            if error.code not in [500,502,503,504]:raise
            failure=error
        # A failed response may follow a successful write. Reconcile by reads;
        # never repeat a traffic-changing POST on an ambiguous response.
        for attempt in range(4):
            if self.active()==version:return
            if attempt<3:time.sleep(1)
        if failure:raise failure
        raise AssertionError('Code traffic activation did not complete')
    def before(self):
        super().before()
        self.save('roster-before.json',{'current':json.loads(self.public('/api/growth/current')),'legacy':json.loads(self.public('/api/growth/legacy')),'vip':json.loads(self.public('/api/carriage/vip'))})

    def verify(self):
        base.PHASE='complete roster, history and unchanged operations/settings'
        before=self.load('before.json');assert self.invariant()==before['invariant']
        assert self.active()==self.load('deployed.json')['version']
        for asset in ['legacy.html','carriage-vip.js','carriage-rotation.js','carriage-date.js','growth-auto.js']:
            assert base.digest(self.public('/'+asset))==base.digest(Path('dist/client',asset).read_bytes())
        assert json.loads(self.public('/api/session'))=={'admin':False}
        self.public('/api/carriage/vip?backups=1',status=401);self.public('/api/carriage/vip',method='POST',body={},status=401)
        old=self.load('roster-before.json');current=json.loads(self.public('/api/growth/current'));legacy=json.loads(self.public('/api/growth/legacy'));vip=json.loads(self.public('/api/carriage/vip'));auto=json.loads(self.public('/api/growth/automation'))
        assert auto['mode']==('fixture' if self.target=='staging' else 'production') and auto['ai_calls']==0
        if self.target=='staging':assert auto['external_calls']==0
        assert vip['revision']==old['vip']['revision'] and vip['active']==old['vip']['active'] and vip['threshold']==old['vip']['threshold']
        data=legacy['data'];ids={m['member_id'] for m in current['members']};assert ids=={m['member_id'] for m in data['members']} and len(ids)==data['guildCount']
        if data.get('roster'):
            rows=self.query("SELECT e.member_id FROM growth_hourly_observations o JOIN growth_external_ids e ON e.game_id=o.game_id JOIN growth_members m ON m.member_id=e.member_id WHERE o.snapshot_id=? AND e.status='confirmed' AND e.departed_at IS NULL",[data['roster']['snapshot_id']])
            assert ids=={r['member_id'] for r in rows}
            assert len(auto['members'])==len(rows), 'Hourly current list must use the complete roster'
            removed=[m for m in old['legacy']['data']['members'] if m['member_id'] not in ids]
            archived={m['member_id']:m for m in data['archivedMembers']}
            for m in removed:assert m['member_id'] in archived and archived[m['member_id']]['history']==m['history']
        else:assert data['guildCount']==old['legacy']['data']['guildCount']
        self.save('verification.json',{'source_sha':self.sha,'version':self.active(),'automation':auto,'vip':vip,'current':current,'legacy':legacy,'invariant':self.invariant()})
        print('Current roster and complete archived histories: PASS')

    def fixture_batch(self,statements):
        assert self.target=='staging' and statements
        tables=['growth_members','growth_external_ids','growth_auto_snapshots','growth_hourly_observations','growth_batches','growth_membership_snapshots','growth_observations']
        allowed=tuple(v+t+end for t in tables for v,end in [('INSERT INTO ',' '),('INSERT INTO ','('),('DELETE FROM ',' ')])
        assert all(s['sql'].startswith(allowed) for s in statements)
        result=self.api('POST','/d1/database/'+self.database+'/query',{'batch':statements});assert all(r.get('success',True) for r in result)

    def fixture_setup(self):
        assert self.target=='staging' and self.invariant()==self.load('before.json')['invariant']
        prefix='roster_release_'+os.environ['GITHUB_RUN_ID'];stamp=int(time.time()*1000)
        prior=self.query("SELECT batch_id,observed_date FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1")[0]
        date=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat();assert date>prior['observed_date']
        revision=int(self.query("SELECT value FROM growth_meta WHERE key='growth_revision'")[0]['value'])
        data={'prefix':prefix,'batch':prefix+'_batch','snapshot':prefix+'_two','rejoinSnapshot':prefix+'_three','stamp':stamp,'date':date,'members':[{'memberId':prefix+'_member_'+str(i),'gameId':prefix+'_game_'+str(i),'canonical':prefix+'_canonical_'+str(i),'nickname':prefix+'_name_'+str(i),'power':100+i} for i in range(3)]}
        assert not self.query('SELECT batch_id FROM growth_batches WHERE batch_id=?',[data['batch']]);self.save('fixture.json',data)
        statements=[]
        for i,m in enumerate(data['members']):
            statements.extend([
                {'sql':'INSERT INTO growth_members VALUES(?,?,?,?,?)','params':[m['memberId'],m['canonical'],m['nickname'],'roster-release-fixture',date]},
                {'sql':'INSERT INTO growth_external_ids VALUES(?,?,?,?,?,?,?,?)','params':[m['gameId'],m['memberId'],m['nickname'],'confirmed',prefix,None,stamp,stamp]},
                {'sql':'INSERT INTO growth_membership_snapshots VALUES(?,?,?,?)','params':[data['batch'],m['memberId'],'observed',i]},
                {'sql':'INSERT INTO growth_observations(observation_id,member_id,batch_id,observed_date,slot,power,level,rank,label,source_type,original_order,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)','params':[prefix+'_obs_'+str(i),m['memberId'],data['batch'],date,'auto_close',m['power'],30,'R4',date,'automatic',i,'active',date]}
            ])
        statements.append({'sql':'INSERT INTO growth_batches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','params':[data['batch'],base.digest(prefix),base.digest(prefix),prefix,date,'auto_close',3,'[]','published',1,revision,1,'{}',prior['batch_id'],date,date,revision+1]})
        statements.extend(self.snapshot_statements(data['snapshot'],data['members'][:2],stamp))
        self.fixture_batch(statements);self.save('browser-input.json',{'origin':self.origin,'target':self.target,'expectedCount':2,'missing':data['members'][2]})

    def snapshot_statements(self,snapshot,members,stamp):
        statements=[{'sql':'INSERT INTO growth_auto_snapshots VALUES(?,?,?,?,?,?,?,?)','params':[snapshot,stamp,snapshot,snapshot,stamp,stamp,len(members),sum(m['power'] for m in members)]}]
        for m in members:statements.append({'sql':'INSERT INTO growth_hourly_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','params':[snapshot,m['gameId'],m['memberId'],stamp,stamp,stamp,m['nickname'],m['power'],30,'R4',None,None,None,'valid',None]})
        return statements

    def fixture_rejoin(self):
        assert self.target=='staging';data=self.load('fixture.json')
        self.fixture_batch(self.snapshot_statements(data['rejoinSnapshot'],data['members'],data['stamp']+1))
        browser=self.load('browser-input.json');browser['expectedCount']=3;self.save('browser-input.json',browser)

    def fixture_cleanup(self):
        assert self.target=='staging'
        if not (self.root/'fixture.json').exists():return
        data=self.load('fixture.json');statements=[]
        for snapshot in [data['snapshot'],data['rejoinSnapshot']]:
            statements.extend([{'sql':'DELETE FROM growth_hourly_observations WHERE snapshot_id=?','params':[snapshot]},{'sql':'DELETE FROM growth_auto_snapshots WHERE snapshot_id=?','params':[snapshot]}])
        statements.extend([{'sql':'DELETE FROM growth_observations WHERE batch_id=?','params':[data['batch']]},{'sql':'DELETE FROM growth_membership_snapshots WHERE batch_id=?','params':[data['batch']]},{'sql':'DELETE FROM growth_batches WHERE batch_id=? AND operation_id=?','params':[data['batch'],data['prefix']]}])
        for m in data['members']:
            statements.extend([{'sql':'DELETE FROM growth_external_ids WHERE game_id=? AND member_id=? AND evidence=?','params':[m['gameId'],m['memberId'],data['prefix']]},{'sql':'DELETE FROM growth_members WHERE member_id=? AND source=?','params':[m['memberId'],'roster-release-fixture']}])
        self.fixture_batch(statements);assert self.invariant()==self.load('before.json')['invariant']
        self.save('fixture-cleanup.json',{'completed':True})

if __name__=='__main__':
    try:
        action,target=sys.argv[1:3];base.PHASE=action;r=Release(target)
        if action=='encrypt':r.encrypt('after')
        elif action=='encrypt-before':r.encrypt('before')
        else:getattr(r,action.replace('-','_'))()
        print('Roster repair '+target+' '+action+': PASS')
    except Exception as error:
        if 'r' in locals():r.save('failure.json',{'phase':base.PHASE,'type':type(error).__name__,'message':str(error),'http_status':getattr(error,'code',None),'management_api':getattr(r,'last_api_failure',None)})
        print('Failure category: '+type(error).__name__+(' HTTP '+str(error.code) if hasattr(error,'code') else ''))
        if str(error)=='Code traffic activation did not complete':print('Traffic verification returned the previous version immediately after activation')
        print('Roster repair '+base.PHASE+': FAIL; private details withheld');raise SystemExit(1)
