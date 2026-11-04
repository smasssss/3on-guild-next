"""Roster sync (count tolerance, 3-collection membership, VIP sync): Staging verification.
Reuses the guarded current-roster release; only the reviewed base, the roster expectation
and the 3-collection fixtures differ. Fixture writes remain impossible on Production."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('roster',Path(__file__).with_name('growth-roster-release.py'));roster=importlib.util.module_from_spec(spec);spec.loader.exec_module(roster)
base=roster.base;base.BASE='8276206ec1a7061a1e12cc30a68c5c65f1cd9328'

class Release(roster.Release):
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
