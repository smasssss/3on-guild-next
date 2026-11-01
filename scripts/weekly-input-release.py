"""Narrow, source-pinned promotion using the established encrypted VIP release."""
import datetime,importlib.util,json,os,re,subprocess,sys
from pathlib import Path

spec=importlib.util.spec_from_file_location('vip_release',Path(__file__).with_name('vip-management-release.py'))
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
base.BASE='0cb547cacaafef009b91080cc8dcb3fd7f3b209b'
RUNTIME=['app','lib','public','build','drizzle','package.json','package-lock.json','vite.config.ts']

class Release(base.Release):
    def approved_active(self):
        base.PHASE='reviewed October 28 runtime'
        version=self.active();tag=self.worker_api('/versions/'+version).get('annotations',{}).get('workers/tag','')
        assert re.fullmatch('[a-f0-9]{32}',tag),'Unknown backend requires source review'
        resolved=subprocess.check_output(['git','rev-parse','--verify',tag+'^{commit}']).decode().strip()
        assert subprocess.run(['git','merge-base','--is-ancestor',resolved,base.BASE],capture_output=True).returncode==0
        assert subprocess.run(['git','merge-base','--is-ancestor',base.BASE,self.sha],capture_output=True).returncode==0
        assert subprocess.run(['git','diff','--quiet',resolved,base.BASE,'--',*RUNTIME],capture_output=True).returncode==0,'Live runtime differs from the reviewed baseline'
        assert base.digest(self.public('/carriage-vip.js'))==base.digest(subprocess.check_output(['git','show',base.BASE+':public/carriage-vip.js']))
        return version

    def fixture_setup(self):
        assert self.target=='staging'
        assert not self.query("SELECT kind FROM documents WHERE kind='vip-weekly'"),'Do not replace existing Staging weekly data'
        assert not self.query("SELECT mutation FROM backups WHERE kind='vip-weekly'")
        super().fixture_setup()
        data=self.load('fixture.json');prefix='vip_release_'+os.environ['GITHUB_RUN_ID'];stamp=self.query('SELECT source_as_of FROM growth_auto_snapshots WHERE snapshot_id=?',[data['snapshot']])[0]['source_as_of']-1
        member={'memberId':prefix+'_historical','gameId':prefix+'_historical_game','nickname':'주간 미참여 검증회원','canonical':prefix+'_historical_canonical'}
        snapshot=prefix+'_historical_snapshot'
        data.update(historical=member,historicalSnapshot=snapshot);self.save('fixture.json',data)
        self.fixture_batch([
            {'sql':'INSERT INTO growth_members VALUES(?,?,?,?,?)','params':[member['memberId'],member['canonical'],member['nickname'],'vip-release-fixture','2026-11-01']},
            {'sql':'INSERT INTO growth_external_ids VALUES(?,?,?,?,?,?,?,?)','params':[member['gameId'],member['memberId'],member['nickname'],'confirmed','Staging-only temporary VIP release fixture',None,stamp,stamp]},
            {'sql':'INSERT INTO growth_auto_snapshots VALUES(?,?,?,?,?,?,?,?)','params':[snapshot,stamp,prefix,prefix,stamp,stamp,1,12345]},
            {'sql':'INSERT INTO growth_hourly_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)','params':[snapshot,member['gameId'],member['memberId'],stamp,stamp,stamp,member['nickname'],12345,30,'R4',None,None,None,'valid',None]}
        ])
        view=json.loads(self.public('/api/carriage/vip'))
        # Explicitly pin the historical snapshot below the current fixture.
        assert view['roster']['snapshotId']==data['snapshot']
        assert not any(m['memberId']==member['memberId'] for m in view['members'])
        assert any(m['memberId']==member['memberId'] and not m['current'] for m in view['scoreMembers'])
        today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date()
        assert today.weekday() in [5,6],'Positive live test requires an actual weekend'
        applies=today+datetime.timedelta(days=7-today.weekday())
        rows=[{'memberId':m['memberId'],'nickname':m['nickname'],'points':10000000 if i==0 else 25000000,'participation':'participated','evidence':'user_screenshot'} for i,m in enumerate(data['members'])]
        rows.append({'memberId':member['memberId'],'nickname':member['nickname'],'points':0,'participation':'not_participated','evidence':'user_confirmation'})
        self.save('weekly-fixture.json',{'providedOn':str(today),'appliesOn':str(applies),'coverage':'full','rows':rows})
        browser=self.load('browser-input.json');browser.update(historical=member,weeklyFile=str(self.root/'weekly-fixture.json'));self.save('browser-input.json',browser)

    def fixture_cleanup(self):
        assert self.target=='staging'
        if not (self.root/'fixture.json').exists():return
        data=self.load('fixture.json');weekly=self.query("SELECT revision,payload,last_mutation FROM documents WHERE kind='vip-weekly'")
        if weekly:
            assert 'historical' in data
            row=weekly[0];payload=json.loads(row['payload']);pending=payload['pending']
            assert row['revision']==1 and payload['current'] is None and pending is not None
            expected={m['memberId'] for m in data['members']}|{data['historical']['memberId']}
            assert {r['memberId'] for r in pending['rows']}==expected
            backups=self.query("SELECT mutation,revision,payload FROM backups WHERE kind='vip-weekly'")
            assert len(backups)==1 and backups[0]['mutation']==row['last_mutation'] and backups[0]['revision']==0
            assert json.loads(backups[0]['payload'])=={'current':None,'pending':None}
            # One guarded batch removes only this run's exact test upload and its empty recovery revision.
            result=self.api('POST','/d1/database/'+self.database+'/query',{'batch':[
                {'sql':"DELETE FROM backups WHERE kind='vip-weekly' AND mutation=? AND EXISTS(SELECT 1 FROM documents WHERE kind='vip-weekly' AND revision=1 AND payload=? AND last_mutation=?)",'params':[row['last_mutation'],row['payload'],row['last_mutation']]},
                {'sql':"DELETE FROM documents WHERE kind='vip-weekly' AND revision=1 AND payload=? AND last_mutation=?",'params':[row['payload'],row['last_mutation']]}
            ]});assert all(r.get('success',True) and r['meta']['changes']==1 for r in result)
        if 'historical' in data:
            m=data['historical'];self.fixture_batch([
                {'sql':'DELETE FROM growth_hourly_observations WHERE snapshot_id=?','params':[data['historicalSnapshot']]},
                {'sql':'DELETE FROM growth_auto_snapshots WHERE snapshot_id=?','params':[data['historicalSnapshot']]},
                {'sql':'DELETE FROM growth_external_ids WHERE game_id=? AND member_id=? AND evidence=?','params':[m['gameId'],m['memberId'],'Staging-only temporary VIP release fixture']},
                {'sql':'DELETE FROM growth_members WHERE member_id=? AND source=?','params':[m['memberId'],'vip-release-fixture']}
            ])
        super().fixture_cleanup()

if __name__=='__main__':
    try:
        action,target=sys.argv[1:3];base.PHASE=action;release=Release(target)
        if action=='encrypt':release.encrypt('after')
        elif action=='encrypt-before':release.encrypt('before')
        else:getattr(release,action.replace('-','_'))()
        print('Weekly input '+target+' '+action+': PASS')
    except Exception:
        print('Weekly input check '+base.PHASE+': FAIL; private details withheld');raise SystemExit(1)
