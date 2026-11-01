"""Safety checks for the narrowly scoped weekly-input promotion."""
import importlib.util,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('weekly_release',Path(__file__).resolve().parents[1]/'scripts/weekly-input-release.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Guards(unittest.TestCase):
    def release(self):
        r=object.__new__(module.Release);r.target='production';r.sha=module.base.BASE;r.active=lambda:'live-version';return r
    def test_old_unknown_version_cannot_use_original_fallback(self):
        r=self.release();r.worker_api=lambda _: {'annotations':{}}
        with self.assertRaises(AssertionError):r.approved_active()
    def test_new_or_unreviewed_runtime_is_rejected(self):
        r=self.release();r.worker_api=lambda _: {'annotations':{'workers/tag':'a'*32}}
        with patch.object(module.subprocess,'check_output',return_value=b'a'*40),patch.object(module.subprocess,'run') as run:
            run.return_value.returncode=1
            with self.assertRaises(AssertionError):r.approved_active()
    def test_production_cannot_setup_or_cleanup_score_fixtures(self):
        r=self.release()
        for method in [r.fixture_setup,r.fixture_cleanup]:
            with self.assertRaises(AssertionError):method()
    def test_existing_staging_weekly_data_is_never_replaced(self):
        r=self.release();r.target='staging';r.query=lambda *_:[{'kind':'vip-weekly'}]
        with self.assertRaises(AssertionError):r.fixture_setup()
    def test_unrelated_weekly_document_is_not_removed(self):
        r=self.release();r.target='staging'
        with tempfile.TemporaryDirectory() as directory:
            r.root=Path(directory);(r.root/'fixture.json').touch()
            r.load=lambda _: {'members':[{'memberId':'fixture'}],'historical':{'memberId':'historic'}}
            r.query=lambda *_:[{'revision':2,'payload':'{"current":null,"pending":null}','last_mutation':'someone-else'}]
            r.api=lambda *_:self.fail('Must not write unrelated document')
            with self.assertRaises(AssertionError):r.fixture_cleanup()
if __name__=='__main__':unittest.main()
