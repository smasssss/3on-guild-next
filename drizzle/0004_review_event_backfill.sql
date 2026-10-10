INSERT OR IGNORE INTO growth_review_events
(event_id,mutation,batch_id,row_id,action,before_json,after_json,status,draft_revision,actor,created_at)
SELECT
  'grev_import_' || r.row_id,
  'import-' || hex(r.row_id),
  r.batch_id,
  r.row_id,
  'imported_decision',
  json_object(
    'resolution_status',CASE WHEN r.candidate_member_id IS NULL THEN 'uncertain' ELSE 'resolved' END,
    'resolved_member_id',r.candidate_member_id,
    'proposed_member_id',NULL,
    'proposed_display_name',NULL,
    'confirm_alias',0,
    'power',r.power,
    'level',r.level,
    'rank',r.rank,
    'membership_state','observed',
    'uncertainty_reason','2차 Staging에서 사용자 확인 전 상태'
  ),
  json_object(
    'resolution_status',r.resolution_status,
    'resolved_member_id',r.resolved_member_id,
    'proposed_member_id',r.proposed_member_id,
    'proposed_display_name',r.proposed_display_name,
    'confirm_alias',r.confirm_alias,
    'power',r.power,
    'level',r.level,
    'rank',r.rank,
    'membership_state',r.membership_state,
    'uncertainty_reason',r.uncertainty_reason
  ),
  'active',
  b.draft_revision,
  'migration-v1.1-backfill',
  b.updated_at
FROM growth_batch_rows r
JOIN growth_batches b ON b.batch_id=r.batch_id
WHERE r.review_version>0
  AND b.state IN ('needs_review','ready')
  AND NOT EXISTS(SELECT 1 FROM growth_review_events e WHERE e.row_id=r.row_id);
