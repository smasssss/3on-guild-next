import os,json,urllib.request,urllib.error,hashlib
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN']
def api(method,path,body=None):
 req=urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+account+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
 with urllib.request.urlopen(req,timeout=60) as response: value=json.load(response)
 assert value.get('success');return value['result']
try:
 for target in ['staging','production']:
  prefix='/workers/scripts/3on-guild-'+target
  settings=api('GET',prefix+'/settings')
  versions=api('GET',prefix+'/deployments')['deployments'][0]['versions']
  assert len(versions)==1 and versions[0]['percentage']==100
  version=api('GET',prefix+'/versions/'+versions[0]['version_id'])
  schedules=api('GET',prefix+'/schedules')
  database=next(b['id'] for b in settings['bindings'] if b['type']=='d1' and b['name']=='DB')
  query=api('POST','/d1/database/'+database+'/query',{'sql':"SELECT kind,revision FROM documents ORDER BY kind",'params':[]})
  assert all(r.get('success',True) and r.get('meta',{}).get('rows_written',0)==0 for r in query)
  print(json.dumps({'target':target,'auth':'PASS','version':versions[0]['version_id'],'source_tag':version.get('annotations',{}).get('workers/tag'),'documents':query[-1]['results'],'schedules':schedules,'settings_sha256':hashlib.sha256(json.dumps(settings,sort_keys=True).encode()).hexdigest()}))
except urllib.error.HTTPError as error:
 print('Cloudflare preflight HTTP '+str(error.code)+'; no changes made');raise SystemExit(1)
