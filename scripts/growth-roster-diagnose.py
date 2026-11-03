"""Read-only diagnosis and encrypted full backups. No external game API calls."""
import importlib.util,json,sqlite3,os
from pathlib import Path
spec=importlib.util.spec_from_file_location('weekly',Path('scripts/weekly-input-release.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for target in ['staging','production']:
 r=m.Release(target)
 r.export_backup()
 with sqlite3.connect(':memory:') as d:
  d.row_factory=sqlite3.Row;d.executescript((r.root/'database.sql').read_text())
  def q(sql,args=()):return [dict(x) for x in d.execute(sql,args)]
  latest=q('SELECT snapshot_id,source_as_of,received_at,accepted_at,member_count FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 1')
  snapshot=latest[0] if latest else None
  observations=q('SELECT game_id,member_id,status FROM growth_hourly_observations WHERE snapshot_id=?',(snapshot['snapshot_id'],)) if snapshot else []
  current=json.loads(r.public('/api/growth/current'));legacy=json.loads(r.public('/api/growth/legacy'))
  roster_ids={x['member_id'] for x in observations}
  info={'latest_snapshot':snapshot,'roster':observations,'current':current,'legacy':legacy,'runs':q('SELECT status,called_at,error FROM growth_auto_runs ORDER BY called_at DESC LIMIT 5'),'snapshots':q('SELECT snapshot_id,source_as_of,member_count FROM growth_auto_snapshots ORDER BY source_as_of DESC LIMIT 5'),'published_membership':q("SELECT membership_state,COUNT(*) n FROM growth_membership_snapshots WHERE batch_id=(SELECT batch_id FROM growth_batches WHERE state='published' ORDER BY observed_date DESC,published_revision DESC LIMIT 1) GROUP BY membership_state"),'settings':r.settings(),'schedules':r.crons(),'version':r.active(),'version_metadata':r.worker_api('/versions/'+r.active())}
  r.save('roster-diagnostics.json',info)
  print(json.dumps({'target':target,'current_members':len(current.get('members',[])),'legacy_members':len(legacy.get('data',{}).get('members',[])),'latest_complete_roster':snapshot['member_count'] if snapshot else None,'snapshot_rows':len(observations),'current_not_in_roster':sum(x['member_id'] not in roster_ids for x in current.get('members',[])),'published_membership':info['published_membership'],'backup_restore':'PASS'}))
 r.encrypt('diagnostics')
