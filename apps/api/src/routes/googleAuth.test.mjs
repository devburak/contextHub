import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {User}=require('@contexthub/common');
const bcrypt=require('bcryptjs');
const google=require('../services/googleOAuth');
const register=require('./googleAuth');
afterEach(()=>vi.restoreAllMocks());
async function routes(){
 const handlers=new Map();
 vi.spyOn(User.db,'collection').mockReturnValue({createIndex:async()=>{}});
 vi.spyOn(User.collection,'createIndex').mockResolvedValue('index');
 const app={get:(path,...args)=>handlers.set(path,args.at(-1)),post:(path,...args)=>handlers.set(path,args.at(-1))};
 await register(app);return handlers;
}
function reply(){return {status:200,header(){return this},code(code){this.status=code;return this},send(value){this.body=value;return value},redirect(value){this.location=value;return value}};}
describe('Google account unlink',()=>{
 it('does not expose subject and requires the current password before changing a link',async()=>{
  const r=await routes();
  expect(await r.get('/auth/google/status')({user:{googleSubject:'private-subject'}},reply())).toEqual({linked:true});
  const password=await bcrypt.hash('correct-password',4);
  vi.spyOn(User,'findById').mockResolvedValue({_id:'user',googleSubject:'private-subject',password,tokenVersion:2});
  const update=vi.spyOn(User,'updateOne').mockResolvedValue({modifiedCount:1});
  const denied=reply();
  await r.get('/auth/google/unlink')({user:{_id:'user'},body:{currentPassword:'wrong'}},denied);
  expect(denied.status).toBe(400);expect(update).not.toHaveBeenCalled();
  expect(await r.get('/auth/google/unlink')({user:{_id:'user'},body:{currentPassword:'correct-password'}},reply())).toEqual({linked:false});
  expect(update).toHaveBeenCalledWith({_id:'user',status:'active',tokenVersion:2,googleSubject:'private-subject',password},{$unset:{googleSubject:1},$inc:{googleLinkVersion:1}});
 });
 it('rejects a link callback that was started before unlinking',async()=>{
  const r=await routes();
  vi.spyOn(google,'consume').mockResolvedValue({data:{mode:'link',userId:'user',tokenVersion:0,googleLinkVersion:0}});
  vi.spyOn(google,'tokens').mockResolvedValue({id_token:'token'});
  vi.spyOn(google,'identity').mockResolvedValue({sub:'subject',email:'user@example.com'});
  vi.spyOn(User,'findOne').mockResolvedValue(null);
  vi.spyOn(User,'findById').mockResolvedValue({_id:'user',status:'active',tokenVersion:0,googleLinkVersion:1,email:'user@example.com'});
  const update=vi.spyOn(User,'updateOne');const response=reply();
  await r.get('/auth/google/callback')({query:{code:'code'}},response);
  expect(response.location).toContain('googleError=GOOGLE_LINK_FAILED');expect(update).not.toHaveBeenCalled();
 });
});
