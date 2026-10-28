"""Read existing Workers and export D1; publish only encrypted recovery evidence."""
import hashlib,json,os,sqlite3,subprocess,tarfile,tempfile,time,urllib.request,urllib.error,socket,ssl
from datetime import datetime,timezone
from pathlib import Path

ACCOUNT=os.environ['CLOUDFLARE_ACCOUNT_ID']
TOKEN=os.environ['CLOUDFLARE_API_TOKEN']
EXPECTED={'production':'31e3bbb6-2860-40cb-9390-d989d37f11c2','staging':'9c3667a6-e510-40a6-b4e6-4852515fdb3a'}
PHASE='authorization'

def api(path,body=None):
    request=urllib.request.Request('https://api.cloudflare.com/client/v4'+path,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=90) as response:
        data=json.load(response)
    assert data.get('success'), 'Cloudflare request failed'
    return data['result']

def export_d1(dbid,path):
    body={'output_format':'polling','dump_options':{'no_schema':False,'no_data':False,'tables':[]}}
    for attempt in range(90):
        result=api('/accounts/'+ACCOUNT+'/d1/database/'+dbid+'/export',body)
        assert result.get('success',True), 'D1 export failed'
        if result.get('status')=='complete':
            url=result['result']['signed_url']
            assert url.startswith('https://')
            with urllib.request.urlopen(url,timeout=120) as response:
                path.write_bytes(response.read())
            return
        assert result.get('status')!='error', 'D1 export failed'
        body['current_bookmark']=result['at_bookmark']
        time.sleep(1)
    raise RuntimeError('D1 export timeout')

def restore_check(path):
    connection=sqlite3.connect(':memory:')
    connection.executescript(path.read_text())
    assert connection.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    tables=[row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    assert all(t in tables for t in ['documents','backups','credentials','growth_members','growth_observations','growth_external_ids','growth_auto_control'])
    counts={table:connection.execute('SELECT COUNT(*) FROM "'+table.replace('"','""')+'"').fetchone()[0] for table in tables}
    documents=[dict(zip(['kind','revision','payload','updated_at'],row)) for row in connection.execute('SELECT kind,revision,payload,updated_at FROM documents ORDER BY kind')]
    result={'integrity_check':'ok','table_counts':counts,'documents':documents,'sql_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sql_bytes':path.stat().st_size}
    connection.close()
    return result

def main():
    global PHASE
    assert ACCOUNT and TOKEN
    assert api('/user/tokens/verify').get('status')=='active'
    metadata={'created_at':datetime.now(timezone.utc).isoformat(),'source_sha':os.environ.get('GITHUB_SHA'),'environments':{}}
    PHASE='current official Workers hostname'
    subdomain=api('/accounts/'+ACCOUNT+'/workers/subdomain')['subdomain']
    assert isinstance(subdomain,str) and subdomain and all(c.isalnum() or c=='-' for c in subdomain)
    with tempfile.TemporaryDirectory(prefix='3on-vip-private-') as directory:
        root=Path(directory)
        for target,dbid in EXPECTED.items():
            worker='3on-guild-'+target
            origin='https://'+worker+'.'+subdomain+'.workers.dev'
            base='/accounts/'+ACCOUNT+'/workers/scripts/'+worker
            PHASE=target+' settings'
            settings=api(base+'/settings')
            PHASE=target+' binding'
            databases=[b for b in settings.get('bindings',[]) if b.get('type')=='d1']
            assert len(databases)==1 and databases[0].get('name')=='DB' and databases[0].get('id')==dbid
            PHASE=target+' active deployment'
            versions=api(base+'/deployments')['deployments'][0]['versions']
            assert len(versions)==1 and versions[0].get('percentage')==100
            PHASE=target+' schedule'
            schedule=api(base+'/schedules')
            if isinstance(schedule,dict):
                schedule=schedule.get('schedules',[])
            crons=sorted(row['cron'] for row in schedule)
            assert crons==(['0,10 * * * *'] if target=='production' else [])
            PHASE=target+' collector mode'
            variables={b['name']:b['text'] for b in settings.get('bindings',[]) if b.get('type')=='plain_text'}
            assert variables.get('GROWTH_AUTO_MODE')==('production' if target=='production' else 'fixture')
            path=root/(target+'.sql')
            PHASE=target+' backup export'
            export_d1(dbid,path)
            PHASE=target+' isolated restore'
            restored=restore_check(path)
            public={}
            for route in ['/legacy','/legacy.html','/carriage-rotation.js','/carriage-date.js','/growth-auto.js','/api/state','/api/growth/automation','/api/session']:
                PHASE=target+' public verification '+route
                try:
                    with urllib.request.urlopen(origin+route,timeout=60) as response:
                        content=response.read()
                    public[route]={'status':200,'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)}
                    if route.startswith('/api/'):
                        public[route]['json']=json.loads(content)
                except urllib.error.HTTPError as error:
                    public[route]={'status':error.code}
                except urllib.error.URLError as error:
                    category='TLS' if isinstance(error.reason,ssl.SSLError) else 'DNS' if isinstance(error.reason,socket.gaierror) else 'TIMEOUT' if isinstance(error.reason,TimeoutError) else 'NETWORK'
                    public[route]={'status':None,'request_failed':True,'category':category}
                except Exception:
                    public[route]={'status':None,'request_failed':True,'category':'RESPONSE'}
                check=public[route]
                category=('HTTP_'+str(check['status'])) if check.get('status') else check.get('category','NETWORK')
                print('Public '+target+' '+route+' '+category+': '+('PASS' if check.get('status')==200 else 'FAIL'))
            metadata['environments'][target]={'origin':origin,'settings':settings,'active_versions':versions,'crons':crons,'database_id':dbid,'restored_backup':restored,'public':public}
        PHASE='evidence encryption'
        (root/'metadata.json').write_text(json.dumps(metadata,ensure_ascii=False))
        archive=root/'recovery.tar.gz'
        with tarfile.open(archive,'w:gz') as bundle:
            for name in ['metadata.json','production.sql','staging.sql']:
                bundle.add(root/name,arcname=name)
        output=Path('encrypted-evidence');output.mkdir(exist_ok=True)
        subprocess.run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-in',str(archive),'-out',str(output/'recovery.cms'),'-outform','DER','scripts/vip-backup-recipient.pem'],check=True,capture_output=True)
    print('Cloudflare configuration and full D1 backup/isolated restore checks: PASS')
    print('Public deployment baseline read checks: '+('PASS' if all(row.get('status')==200 for environment in metadata['environments'].values() for row in environment['public'].values()) else 'FAIL; deployment remains blocked pending baseline verification'))

if __name__=='__main__':
    try:
        main()
    except Exception:
        print('Cloudflare preflight check '+PHASE+': FAIL; remote details withheld')
        raise SystemExit(1)
