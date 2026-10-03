import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), {User}=require('@contexthub/common'), google=require('./googleOAuth');
const crypto=require('node:crypto'), jwt=require('jsonwebtoken'), prefix='CTXHUB_AUTH_GOOGLE';
describe('Google OAuth security',()=>{
 afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
 function configure(){for(const [key,value] of Object.entries({CLIENT_ID:'client',CLIENT_SECRET:'secret',REDIRECT_URI:'https://api.ctxhub.net/api/auth/google/callback'}))vi.stubEnv(prefix+'_'+key,value);}
 it('initializes OAuth expiry and unique identity indexes explicitly and propagates failures',async()=>{
  const flowIndex=vi.fn().mockResolvedValue('expiresAt_1');
  const identityIndex=vi.spyOn(User.collection,'createIndex').mockResolvedValue('googleSubject_1');
  vi.spyOn(User.db,'collection').mockReturnValue({createIndex:flowIndex});
  await google.initializeIndexes();
  expect(flowIndex).toHaveBeenCalledWith({expiresAt:1},{expireAfterSeconds:0});
  expect(identityIndex).toHaveBeenCalledWith({googleSubject:1},{unique:true,partialFilterExpression:{googleSubject:{$type:'string'}}});
  flowIndex.mockRejectedValue(new Error('database unavailable'));
  await expect(google.initializeIndexes()).rejects.toThrow('database unavailable');
 });
 it('uses current connect permissions for owners and rejects removed access',async()=>{
  const {Tenant,Membership,Role}=require('@contexthub/common');
  const blacklist=require('./tokenBlacklist');
  vi.spyOn(blacklist,'isJtiRevoked').mockResolvedValue(false);
  vi.spyOn(Tenant,'findById').mockReturnValue({select:async()=>({status:'active'})});
  vi.spyOn(User,'findById').mockResolvedValue({_id:'user',status:'active',tokenVersion:0});
  let role='owner',permissions=[];
  vi.spyOn(Membership,'findOne').mockImplementation(async()=>({roleId:'role',role,getEffectivePermissions:()=>permissions}));
  vi.spyOn(Role,'findOne').mockImplementation(async()=>({key:role}));
  const flow={data:{tenantId:'tenant',userId:'user',tokenVersion:0,jti:'session'}};
  expect(await google.validateBackupInitiator(flow)).toBe(flow.data);
  role='viewer';
  await expect(google.validateBackupInitiator(flow)).rejects.toThrow('GOOGLE_INITIATOR_REVOKED');
  permissions=['tenantBackup.configure'];
  expect(await google.validateBackupInitiator(flow)).toBe(flow.data);
  await expect(google.validateBackupInitiator({data:{...flow.data,tokenVersion:1}})).rejects.toThrow('GOOGLE_INITIATOR_REVOKED');
  vi.mocked(blacklist.isJtiRevoked).mockResolvedValue(true);
  await expect(google.validateBackupInitiator(flow)).rejects.toThrow('GOOGLE_INITIATOR_REVOKED');
 });
 it('requires browser binding and consumes purpose-bound state once',async()=>{
  configure();let record;const records=new Map();
  vi.spyOn(User.db,'collection').mockReturnValue({insertOne:async r=>{record=r;records.set(r._id,r)},findOneAndDelete:async q=>{
   const r=records.get(q._id);if(!r||r.browser!==q.browser||r.prefix!==q.prefix||r.expiresAt<=q.expiresAt.$gt)return null;
   records.delete(q._id);return {value:r};
  }});
  const headers={},reply={header:(k,v)=>{headers[k]=v;return reply}};
  const url=new URL(await google.begin({request:{},reply,prefix,scope:'openid email profile'}));
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  const request={headers:{cookie:headers['Set-Cookie'].split(';')[0]},query:{state:url.searchParams.get('state'),code:'code'}};
  await expect(google.consume({...request,headers:{cookie:'__Host-ctx_google_flow=attacker'}},prefix)).rejects.toThrow('GOOGLE_INVALID_STATE');
  await expect(google.consume(request,'OTHER')).rejects.toThrow('GOOGLE_INVALID_STATE');
  expect((await google.consume(request,prefix)).verifier).toBe(record.verifier);
  await expect(google.consume(request,prefix)).rejects.toThrow('GOOGLE_INVALID_STATE');
 });
 it('checks signed ID token audience, issuer, expiry, nonce and verified email',async()=>{
  configure();const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const key={...publicKey.export({format:'jwk'}),kid:'test-key'};
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({keys:[key]})})));
  const sign=(claims,options={})=>jwt.sign({sub:'sub',email:'test@gmail.com',email_verified:true,nonce:'expected',...claims},privateKey,{algorithm:'RS256',keyid:key.kid,audience:'client',issuer:'https://accounts.google.com',expiresIn:60,...options});
  expect((await google.identity(sign({}),prefix,'expected')).sub).toBe('sub');
  for(const token of [sign({nonce:'wrong'}),sign({email_verified:false}),sign({},{audience:'wrong'}),sign({},{issuer:'evil'}),sign({},{expiresIn:-10})])await expect(google.identity(token,prefix,'expected')).rejects.toThrow();
 });
});
