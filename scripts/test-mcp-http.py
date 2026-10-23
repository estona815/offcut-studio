import urllib.request,urllib.error,json
from pathlib import Path
BASE='http://127.0.0.1:4178/mcp'
headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
proof=[]
def call(method,params=None,rid=1,extra=None):
 body={'jsonrpc':'2.0','method':method,'params':params or {}}
 if rid is not None:body['id']=rid
 req=urllib.request.Request(BASE,data=json.dumps(body).encode(),headers={**headers,**(extra or {})})
 try:
  with urllib.request.urlopen(req) as r:return r.status,dict(r.headers),json.loads(r.read() or b'null')
 except urllib.error.HTTPError as e:return e.code,dict(e.headers),e.read().decode()
status,h,b=call('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'integration-test','version':'1'}})
assert status==200,(status,b)
headers['MCP-Session-Id']=h['MCP-Session-Id'];headers['MCP-Protocol-Version']='2025-11-25'
assert call('tools/list',rid=2)[2]['error']
assert call('notifications/initialized',rid=None)[0]==202
assert len(call('tools/list',rid=3)[2]['result']['tools'])==2
before=call('tools/call',{'name':'inspect_workspace'},4)[2]['result']['structuredContent'];assert before['revision']==0 and not before['cuts']
p={'name':'apply_command','arguments':{'command':'mark front cut','expectedRevision':0}}
a=call('tools/call',p,5)[2]['result']['structuredContent'];assert a['revision']==1 and len(a['cuts'])==1
assert a['scraps']!=before['scraps'],'Geometry must actually change'
assert call('tools/call',p,5)[2]['result']['structuredContent']==a,'Exact replay must return same result'
assert call('tools/call',{'name':'apply_command','arguments':{'command':'mark back cut','expectedRevision':0}},6)[2]['result']['isError']
repeat=call('tools/call',{'name':'apply_command','arguments':{'command':'mark front cut','expectedRevision':1}},7)[2]['result']['structuredContent']
assert repeat['revision']==1 and repeat['scraps']==a['scraps'] and len(repeat['cuts'])==1
assert call('tools/call',{'name':'apply_command','arguments':{'command':'mark back cut','expectedRevision':1}},5)[2]['error'],'Reused id must not execute changed command'
amb=call('tools/call',{'name':'apply_command','arguments':{'command':'cut it','expectedRevision':1}},8)[2]['result']['structuredContent'];assert amb['revision']==1 and len(amb['cuts'])==1
assert call('ping',rid=9,extra={'Origin':'https://untrusted.example'})[0]==403
assert call('ping',rid=10,extra={'MCP-Protocol-Version':'invalid'})[0]==400
assert call('ping',rid=11,extra={'MCP-Session-Id':'unknown'})[0]==404
for cmd,rid in [('the ochre scrap is only six centimeters tall',12),('replan pocket',13)]:
 current=call('tools/call',{'name':'inspect_workspace'},rid+100)[2]['result']['structuredContent']
 out=call('tools/call',{'name':'apply_command','arguments':{'command':cmd,'expectedRevision':current['revision']}},rid)[2]['result']['structuredContent']
 assert out['cuts']==a['cuts'],'Recovery must preserve cut footprint'
 proof.append({'command':cmd,'revision':out['revision'],'message':out['message'],'cut_count':len(out['cuts'])})
report={'status':'PASS','transport':'actual HTTP POST','protocol':'2025-11-25','checks':['initialization sequence','tools/list','actual polygon subtraction','identical request replay','stale revision rejection','duplicate cut idempotency','changed args same request id rejection','ambiguous cut no mutation','foreign Origin 403','wrong version 400','unknown session 404','trim and recovery preserve cuts'],'scenario':proof,'limits':'This is a bounded protocol/application integration suite, not full MCP conformance certification.'}
print(json.dumps(report, indent=2))
