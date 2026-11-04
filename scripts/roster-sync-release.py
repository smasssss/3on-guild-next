"""Roster sync (count tolerance, 3-collection membership, VIP sync): Staging verification.
Reuses the guarded current-roster release; only the reviewed base, the roster expectation
and the 3-collection fixtures differ. Fixture writes remain impossible on Production."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('roster',Path(__file__).with_name('growth-roster-release.py'));roster=importlib.util.module_from_spec(spec);spec.loader.exec_module(roster)
REVIEWED='8276206ec1a7061a1e12cc30a68c5c65f1cd9328'
base=roster.base;base.BASE=REVIEWED

import re,subprocess
RUNTIME=['app','lib','public','build','drizzle','package.json','package-lock.json','vite.config.ts']
class Release(roster.Release):
    def live_source(self):
        tag=self.worker_api('/versions/'+self.active()).get('annotations',{}).get('workers/tag','')
        assert re.fullmatch('[a-f0-9]{32}',tag),'Unknown backend requires source review'
        return subprocess.check_output(['git','rev-parse','--verify',tag+'^{commit}']).decode().strip()
    def before(self):
        # The existing artifact checks compare live files with the exact commit that is live.
        live=self.live_source();base.BASE=live
        try:super().before()
        finally:base.BASE=REVIEWED
    def approved_active(self):
        # Live Staging may run the reviewed base or an earlier commit of this same branch
        # (a previous Staging run); anything else stops the release.
        base.PHASE='reviewed roster-sync runtime'
        version=self.active();resolved=self.live_source()
        ok=lambda a,b:subprocess.run(['git','merge-base','--is-ancestor',a,b],capture_output=True).returncode==0
        assert ok(REVIEWED,resolved) and ok(resolved,self.sha),'Live runtime is not the reviewed base or this branch'
        assert self.target=='staging' or subprocess.run(['git','diff','--quiet',resolved,REVIEWED,'--',*RUNTIME],capture_output=True).returncode==0,'Production must run the reviewed base'
        assert base.digest(self.public('/carriage-vip.js'))==base.digest(subprocess.check_output(['git','show',resolved+':public/carriage-vip.js']))
        return version

    def verify(self):
        base.PHASE='3-collection roster, VIP sync and unchanged operations/settings'
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
            # VIP roster follows the same confirmed roster (plus Sunday snapshot participants).
            vip_current={m['memberId'] for m in vip['members'] if m['current']}
            assert ids<={m['memberId'] for m in vip['members']} and vip_current-ids<=set(vip.get('snapshotAdded',[]))
            removed=[m for m in old['legacy']['data']['members'] if m['member_id'] not in ids]
            archived={m['member_id']:m for m in data['archivedMembers']}
            for m in removed:assert m['member_id'] in archived and archived[m['member_id']]['history']==m['history']
        else:assert data['guildCount']==old['legacy']['data']['guildCount']
        self.save('verification.json',{'source_sha':self.sha,'version':self.active(),'automation':auto,'vip':vip,'current':current,'legacy':legacy,'invariant':self.invariant()})
        print('3-collection roster, VIP sync and archived histories: PASS')

    def snapshots(self,name,members,stamp,count=3):
        statements=[]
        for i in range(count):statements.extend(self.snapshot_statements(name+'_'+str(i),members,stamp+i))
        return statements

    def fixture_setup(self):
        super().fixture_setup()
        data=self.load('fixture.json')
        # Parent inserted one 2-member roster; two more collections confirm it.
        self.fixture_batch(self.snapshot_statements(data['snapshot']+'_1',data['members'][:2],data['stamp']+1)+self.snapshot_statements(data['snapshot']+'_2',data['members'][:2],data['stamp']+2))
        data['extraSnapshots']=[data['snapshot']+'_1',data['snapshot']+'_2'];self.save('fixture.json',data)

    def fixture_rejoin(self):
        assert self.target=='staging';data=self.load('fixture.json');stamp=data['stamp']+10
        self.fixture_batch(self.snapshot_statements(data['rejoinSnapshot'],data['members'],stamp))
        vip=json.loads(self.public('/api/carriage/vip'));current=json.loads(self.public('/api/growth/current'))
        missing=data['members'][2]
        assert len(current['members'])==2,'One reappearance must not change the roster'
        found=[{k:p[k] for k in ['game_id','member_id','name','change','confirmations','required']} for p in vip['rosterPending'] if p['game_id']==missing['gameId']]
        assert found==[{'game_id':missing['gameId'],'member_id':missing['memberId'],'name':missing['nickname'],'change':'join','confirmations':1,'required':3}]
        extra=[data['rejoinSnapshot']+'_1',data['rejoinSnapshot']+'_2']
        data['extraSnapshots']=data.get('extraSnapshots',[])+extra;self.save('fixture.json',data)
        self.fixture_batch(self.snapshot_statements(extra[0],data['members'],stamp+1)+self.snapshot_statements(extra[1],data['members'],stamp+2))
        vip=json.loads(self.public('/api/carriage/vip'));current=json.loads(self.public('/api/growth/current'))
        assert len(current['members'])==3 and vip['rosterPending']==[]
        assert {m['memberId'] for m in vip['members'] if m['current']}=={m['memberId'] for m in data['members']},'VIP roster equals growth roster'
        browser=self.load('browser-input.json');browser['expectedCount']=3;self.save('browser-input.json',browser)

    def fixture_cleanup(self):
        assert self.target=='staging'
        if (self.root/'fixture.json').exists():
            data=self.load('fixture.json');statements=[]
            for snapshot in data.get('extraSnapshots',[]):
                statements.extend([{'sql':'DELETE FROM growth_hourly_observations WHERE snapshot_id=?','params':[snapshot]},{'sql':'DELETE FROM growth_auto_snapshots WHERE snapshot_id=?','params':[snapshot]}])
            if statements:self.fixture_batch(statements)
        super().fixture_cleanup()

# User-approved permanent VIP exclusions (sub-accounts), added only after the code is verified.
# Each entry: member ID, game ID, nickname. 야생야옹찌 is not registered yet; its member ID is the
# deterministic automatic ID for its game ID, so the exclusion applies from its first registration.
NEW_EXCLUSIONS=[('game_50373046_481129718055','481129718055','꧁두리꧂'),('game_50373046_480502743335','480502743335','꿀보맘'),('game_50373046_443174928679','443174928679','야생야옹찌')]
def add_exclusions(self):
    import datetime,uuid
    base.PHASE='permanent exclusion update'
    assert self.target=='production'
    for member_id,game_id,name in NEW_EXCLUSIONS:
        mapped=self.query('SELECT member_id FROM growth_external_ids WHERE game_id=?',[game_id])
        assert not mapped or mapped[0]['member_id']==member_id,'Exclusion target identity changed: '+game_id
    row=self.query("SELECT revision,payload FROM documents WHERE kind='carriage'")[0]
    data=json.loads(row['payload']);before=dict(data.get('vipExcludedMembers') or {})
    added=[m for m,_,_ in NEW_EXCLUSIONS if before.get(m)!=1]
    self.save('exclusions-before.json',{'revision':row['revision'],'excluded':before})
    if added:
        data['vipExcludedMembers']={**before,**{m:1 for m in added}}
        payload=json.dumps(data,ensure_ascii=False,separators=(',',':'));stamp=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z');mutation=uuid.uuid4().hex
        result=self.api('POST','/d1/database/'+self.database+'/query',{'batch':[
            {'sql':"INSERT INTO backups(mutation,kind,revision,payload,saved_at,actor) SELECT ?,kind,revision,payload,?,? FROM documents WHERE kind='carriage' AND revision=?",'params':[mutation,stamp,'roster-sync-release',row['revision']]},
            {'sql':"UPDATE documents SET payload=?,revision=revision+1,updated_at=?,actor=?,last_mutation=? WHERE kind='carriage' AND revision=? AND payload=?",'params':[payload,stamp,'roster-sync-release',mutation,row['revision'],row['payload']]}]})
        assert all(r.get('success',True) for r in result)
    after=self.query("SELECT revision,payload FROM documents WHERE kind='carriage'")[0];saved=json.loads(after['payload'])
    assert after['revision']==row['revision']+(1 if added else 0),'Carriage changed concurrently; nothing else was written'
    assert all(saved['vipExcludedMembers'].get(k)==v for k,v in before.items()),'Existing exclusions preserved'
    assert all(saved['vipExcludedMembers'].get(m)==1 for m,_,_ in NEW_EXCLUSIONS)
    assert {k:v for k,v in saved.items() if k!='vipExcludedMembers'}=={k:v for k,v in data.items() if k!='vipExcludedMembers'},'Only exclusions changed'
    vip=json.loads(self.public('/api/carriage/vip'))
    for m in vip['members']:
        if m['memberId'] in saved['vipExcludedMembers']:assert m['eligibility']['reason']=='permanent',m['memberId']
    self.save('exclusions-after.json',{'revision':after['revision'],'added':added,'excluded':saved['vipExcludedMembers']})
    print('Permanent exclusions: '+str(len(before))+' kept, '+str(len(added))+' added')
Release.add_exclusions=add_exclusions

if __name__=='__main__':
    try:
        action,target=sys.argv[1:3];base.PHASE=action;r=Release(target)
        if action=='encrypt':r.encrypt('after')
        elif action=='encrypt-before':r.encrypt('before')
        else:getattr(r,action.replace('-','_'))()
        print('Roster sync '+target+' '+action+': PASS')
    except Exception as error:
        if 'r' in locals():r.save('failure.json',{'phase':base.PHASE,'type':type(error).__name__,'message':str(error),'http_status':getattr(error,'code',None),'management_api':getattr(r,'last_api_failure',None)})
        print('Failure category: '+type(error).__name__+(' HTTP '+str(error.code) if hasattr(error,'code') else ''))
        print('Roster sync '+base.PHASE+': FAIL; private details withheld');raise SystemExit(1)
