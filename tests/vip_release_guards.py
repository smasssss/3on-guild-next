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
    def test_api_only_log_privacy_is_preserved_without_invalid_config_rewrite(self):
        release=Fake();release.worker='3on-guild-production';release.database=module.DATABASES['production']
        cfg={'bindings':[],'compatibility_date':'2026-05-15','placement':{},'observability':{'enabled':True,'redact_query_string':True},'usage_model':'unbound','annotations':{'custom-label':'preserve'}}
        generated=release.upload_config(cfg,['0,10 * * * *'],{'enabled':True,'previews_enabled':False})
        self.assertNotIn('observability',generated)
        self.assertNotIn('placement',generated)
        self.assertTrue(cfg['observability']['redact_query_string'])
        self.assertEqual(generated['unsafe']['metadata']['usage_model'],'unbound')
        self.assertEqual(generated['unsafe']['metadata']['annotations']['custom-label'],'preserve')
    def test_cloudflare_readonly_audit_annotation_is_never_uploaded(self):
        release=Fake();release.worker='3on-guild-production';release.database=module.DATABASES['production']
        cfg={'bindings':[],'compatibility_date':'2026-05-15','annotations':{'workers/triggered_by':'cli','custom-label':'preserve'}}
        generated=release.upload_config(cfg,[],{'enabled':True,'previews_enabled':False})
        self.assertNotIn('workers/triggered_by',generated['unsafe']['metadata']['annotations'])
        after={**cfg,'annotations':{**cfg['annotations'],'workers/triggered_by':'version-upload'}}
        self.assertEqual(release.preserved_settings(cfg),release.preserved_settings(after))
    def test_version_upload_race_cannot_activate_traffic(self):
        release=Fake();release.worker_api=lambda _: {'annotations':{'workers/tag':release.sha[:32]}}
        with tempfile.TemporaryDirectory() as directory:
            release.root=Path(directory)
            def wrangler(args,label):
                release.calls.append((label,args))
                if label=='upload':
                    (release.root/'upload.log').write_text('Worker Version ID: 11111111-1111-4111-8111-111111111111')
                    release.live={'documents':'changed'}
                return 0
            release.wrangler=wrangler
            release.activate=lambda *_:self.fail('Must never activate changed data')
            with self.assertRaises(AssertionError):release.deploy()
        self.assertEqual([c[0] for c in release.calls if c[0]!='save'],['dry-run','upload'])
    def test_activation_only_changes_version_traffic(self):
        release=Fake();release.worker='3on-guild-production';calls=[]
        release.api=lambda method,path,body:calls.append((method,path,body))
        release.activate('reviewed-version','reviewed source')
        self.assertEqual(calls,[('POST','/workers/scripts/3on-guild-production/deployments',{'strategy':'percentage','versions':[{'version_id':'reviewed-version','percentage':100}],'annotations':{'workers/message':'reviewed source'}})])
    def test_unrelated_active_deployment_is_not_rolled_back(self):
        release=Fake()
        with tempfile.TemporaryDirectory() as directory:
            release.root=Path(directory)
            for name in ['before.json','deployment-started.json','deployed.json']:(release.root/name).touch()
            release.version='unrelated-version'
            with self.assertRaises(AssertionError):release.rollback()
        self.assertEqual(release.calls,[])

if __name__=='__main__':unittest.main()
