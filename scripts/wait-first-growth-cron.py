"""Finite, read-only release verification; never an operational scheduler."""
import importlib.util,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('release',Path('scripts/growth-automation-release.py'))
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
assert r.TARGET=='production';db=r.Remote()
for minute in range(70):
 runs=db.query("SELECT status FROM growth_auto_runs WHERE trigger_kind='cron' ORDER BY called_at DESC LIMIT 1")
 if runs:
  print('Observed first real scheduled collection:',runs[0]['status'],flush=True)
  assert runs[0]['status'] in ('accepted','partial','duplicate'),'Scheduled collection failed; retain existing confirmed data and review the administrator error log'
  break
 if minute%5==0:print('Waiting for the permitted hourly Cloudflare tick; no external API call or D1 write is made by this verifier. Elapsed minutes:',minute,flush=True)
 time.sleep(60)
else:raise RuntimeError('No real scheduled collection observed within the finite verification window')
