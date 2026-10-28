"""Exercise code-deployment safety barriers without network access or credentials."""
import importlib.util,tempfile,unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[1]/'scripts/vip-management-release.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class Fake(module.Release):
    def __init__(self):
        self.target='production';self.sha='new-source';self.config=Path('unused.json');self.calls=[]
        self.old={'source_sha':self.sha,'version':'old-version','invariant':{'documents':'protected'}}
        self.live=self.old['invariant'];self.version='old-version';self.dry_failure=False;self.race=False
    def load(self,name):return self.old
    def invariant(self):return self.live
    def active(self):return self.version
    def save(self,*args):self.calls.append(('save',args))
    def wrangler(self,args,label):
        self.calls.append((label,args))
        if '--dry-run' in args:
            if self.race:self.live={'documents':'changed'}
            return 1 if self.dry_failure else 0
        self.version='new-version';return 0

class Guards(unittest.TestCase):
    def test_changed_document_never_deploys(self):
        release=Fake();release.live={'documents':'changed'}
        with self.assertRaises(AssertionError):release.deploy()
        self.assertEqual(release.calls,[])
    def test_changed_active_version_never_deploys(self):
        release=Fake();release.version='someone-elses-version'
        with self.assertRaises(AssertionError):release.deploy()
        self.assertEqual(release.calls,[])
    def test_failed_dry_run_never_deploys(self):
        release=Fake();release.dry_failure=True
        with self.assertRaises(AssertionError):release.deploy()
        self.assertEqual([x[0] for x in release.calls],['dry-run'])
    def test_dry_run_race_never_deploys(self):
        release=Fake();release.race=True
        with self.assertRaises(AssertionError):release.deploy()
        self.assertEqual([x[0] for x in release.calls],['dry-run'])
    def test_fixture_writes_are_impossible_on_production(self):
        release=Fake()
        with self.assertRaises(AssertionError):release.fixture_batch([{'sql':'INSERT INTO growth_members VALUES(?)','params':['test']}])
        self.assertEqual(release.calls,[])
    def test_unknown_bindings_stop_release(self):
        release=Fake();release.worker_api=lambda _: {'bindings':[{'type':'r2_bucket','name':'UNEXPECTED'}]}
        with self.assertRaises(AssertionError):release.settings()
    def test_unknown_backend_with_identical_frontend_is_not_accepted(self):
        release=Fake();release.worker_api=lambda _: {'annotations':{}}
        with self.assertRaises(AssertionError):release.approved_active()
        self.assertEqual(release.calls,[])
    def test_unsupported_nondefault_setting_stops_release(self):
        release=Fake();release.database=module.DATABASES['production']
        cfg={'bindings':[{'type':'d1','name':'DB','id':release.database},{'type':'secret_text','name':'ADMIN_PASSWORD_HASH'},{'type':'plain_text','name':'GROWTH_AUTO_MODE','text':'production'}],'unreviewed_setting':{'enabled':True}}
        release.worker_api=lambda _:cfg
        with self.assertRaises(AssertionError):release.settings()
    def test_release_metadata_does_not_hide_custom_setting_changes(self):
        release=Fake()
        before={'bindings':[],'usage_model':'unbound','annotations':{'workers/tag':'old','workers/message':'old','custom-label':'preserve'}}
        after={**before,'annotations':{**before['annotations'],'workers/tag':'new','workers/message':'new'}}
        self.assertEqual(release.preserved_settings(before),release.preserved_settings(after))
        after['annotations']['custom-label']='changed'
        self.assertNotEqual(release.preserved_settings(before),release.preserved_settings(after))
    def test_unrelated_active_deployment_is_not_rolled_back(self):
        release=Fake()
        with tempfile.TemporaryDirectory() as directory:
            release.root=Path(directory)
            for name in ['before.json','deployment-started.json','deployed.json']:(release.root/name).touch()
            release.version='unrelated-version'
            with self.assertRaises(AssertionError):release.rollback()
        self.assertEqual(release.calls,[])

if __name__=='__main__':unittest.main()
