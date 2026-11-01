"""Promote the narrow Sunday policy/picker change without rewriting stored data."""
import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('weekly',Path(__file__).with_name('weekly-input-release.py'))
weekly=importlib.util.module_from_spec(spec);spec.loader.exec_module(weekly)
base=weekly.base;base.BASE='7e673497f57dec063ad41fe824bd90b81ffc91c7'

class Release(weekly.Release):
    def verify(self):
        base.PHASE='Sunday activation, preserved data/settings, exact assets and authentication'
        before=self.load('before.json');assert self.invariant()==before['invariant']
        assert self.active()==self.load('deployed.json')['version']
        for asset in ['legacy.html','carriage-vip.js','carriage-rotation.js','carriage-date.js','growth-auto.js']:
            assert base.digest(self.public('/'+asset))==base.digest(Path('dist/client',asset).read_bytes())
        assert json.loads(self.public('/api/session'))=={'admin':False}
        self.public('/api/carriage/vip?backups=1',status=401)
        self.public('/api/carriage/vip',method='POST',body={},status=401)
        auto=json.loads(self.public('/api/growth/automation'))
        assert auto['mode']==('fixture' if self.target=='staging' else 'production') and auto['ai_calls']==0
        if self.target=='staging':assert auto['external_calls']==0
        view=json.loads(self.public('/api/carriage/vip'))
        assert view['schema']=='3on-vip-weekly-v1' and view['threshold']==21720000
        if self.target=='production':
            assert view['active'] and len(view['active']['rows'])==99 and not view['awaitingFirstSnapshot']
            assert view['effectiveOn']=='2026-11-01' and view['active']['appliesOn']=='2026-11-02'
            assert sum(r.get('participation')=='not_participated' for r in view['active']['rows'])==10
        else:assert view['awaitingFirstSnapshot'] and view['active'] is None
        documents=json.loads(self.public('/api/state'))
        assert documents['schema']=='3on-shared-v1' and len(documents['documents'])==3
        carriage=next(d['data'] for d in documents['documents'] if d['kind']=='carriage')
        for member in view['members']:
            if member['temporary'] and member['current'] and view['awaitingFirstSnapshot']:assert not member['eligibility']['eligible']
            if carriage.get('vipExcludedMembers',{}).get(member['memberId'])==1:assert member['eligibility']['reason']=='permanent'
        self.save('verification.json',{'source_sha':self.sha,'version':self.active(),'automation':auto,'vip':view,'invariant':self.invariant()})

    def fixture_cleanup(self):
        assert self.target=='staging'
        if not (self.root/'fixture.json').exists():return
        data=self.load('fixture.json');rows=self.query("SELECT revision,payload,last_mutation FROM documents WHERE kind='vip-weekly'")
        if rows:
            row=rows[0];payload=json.loads(row['payload']);slots=[v for v in [payload['current'],payload['pending']] if v is not None]
            assert row['revision']==1 and len(slots)==1
            saved=slots[0];expected={m['memberId'] for m in data['members']}|{data['historical']['memberId']}
            assert {r['memberId'] for r in saved['rows']}==expected
            fixture=self.load('weekly-fixture.json');assert saved['providedOn']==fixture['providedOn'] and saved['appliesOn']==fixture['appliesOn']
            backups=self.query("SELECT mutation,revision,payload FROM backups WHERE kind='vip-weekly'")
            assert len(backups)==1 and backups[0]['mutation']==row['last_mutation'] and backups[0]['revision']==0
            assert json.loads(backups[0]['payload'])=={'current':None,'pending':None}
            result=self.api('POST','/d1/database/'+self.database+'/query',{'batch':[
                {'sql':"DELETE FROM backups WHERE kind='vip-weekly' AND mutation=? AND EXISTS(SELECT 1 FROM documents WHERE kind='vip-weekly' AND revision=1 AND payload=? AND last_mutation=?)",'params':[row['last_mutation'],row['payload'],row['last_mutation']]},
                {'sql':"DELETE FROM documents WHERE kind='vip-weekly' AND revision=1 AND payload=? AND last_mutation=?",'params':[row['payload'],row['last_mutation']]}
            ]});assert all(r.get('success',True) and r['meta']['changes']==1 for r in result)
        super().fixture_cleanup()

if __name__=='__main__':
    try:
        action,target=sys.argv[1:3];base.PHASE=action;release=Release(target)
        if action=='encrypt':release.encrypt('after')
        elif action=='encrypt-before':release.encrypt('before')
        else:getattr(release,action.replace('-','_'))()
        print('Sunday VIP '+target+' '+action+': PASS')
    except Exception:
        print('Sunday VIP check '+base.PHASE+': FAIL; private details withheld');raise SystemExit(1)
