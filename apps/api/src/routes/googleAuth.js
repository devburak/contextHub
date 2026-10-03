const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { User } = require('@contexthub/common');
const AuthService = require('../services/authService');
const { authenticateWithoutTenant } = require('../middleware/auth');
const { setSessionCookie } = require('../services/sessionSecurity');
const google = require('../services/googleOAuth');
const PREFIX = 'CTXHUB_AUTH_GOOGLE';
module.exports = async function googleAuth(app) {
  await User.db.collection('google_oauth_flows').createIndex({expiresAt:1},{expireAfterSeconds:0});
  await User.collection.createIndex({googleSubject:1},{unique:true,partialFilterExpression:{googleSubject:{$type:'string'}}});
  const service = new AuthService(app);
  const admin = new URL(process.env.ADMIN_URL || 'https://ctxhub.net').origin;
  app.get('/auth/google/config', async () => {
    try { google.config(PREFIX); return {enabled:true}; } catch { return {enabled:false}; }
  });
  app.get('/auth/google/status', { preHandler: authenticateWithoutTenant }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { linked: Boolean(request.user.googleSubject) };
  });
  app.post('/auth/google/unlink', {
    preHandler: authenticateWithoutTenant,
    config: { rateLimit: { max: 5, timeWindow: 60000 } },
    schema: { body: { type: 'object', required: ['currentPassword'], additionalProperties: false,
      properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 1024 } } } },
  }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const user = await User.findById(request.user._id);
    if (!user || !await bcrypt.compare(request.body.currentPassword, user.password)) {
      return reply.code(400).send({ error: 'GoogleUnlinkPasswordRequired' });
    }
    if (user.googleSubject) {
      const changed = await User.updateOne({ _id: user._id, status: 'active', tokenVersion: user.tokenVersion,
        googleSubject: user.googleSubject, password: user.password },
      { $unset: { googleSubject: 1 }, $inc: { googleLinkVersion: 1 } });
      if (!changed.modifiedCount) return reply.code(409).send({ error: 'GoogleUnlinkConflict' });
    }
    return { linked: false };
  });
  app.get('/auth/google/start', { config:{rateLimit:{max:10,timeWindow:60000}} }, async (request,reply) => {
    try {
      const mode=request.query.mode==='link'?'link':'signin';
      if(mode==='link') { await authenticateWithoutTenant(request,reply); if(reply.sent)return; }
      const url=await google.begin({request,reply,prefix:PREFIX,scope:'openid email profile',
        data:{mode,userId:mode==='link'?String(request.user._id):null,tokenVersion:request.user?.tokenVersion,
          googleLinkVersion:request.user?.googleLinkVersion ?? 0,jti:request.authPayload?.jti}});
      return reply.redirect(url);
    } catch { return reply.code(503).send({error:'GoogleLoginUnavailable'}); }
  });
  app.get('/auth/google/callback', {logLevel:'silent'}, async (request,reply) => {
    reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer');
    let mode='signin';
    try {
      const flow=await google.consume(request,PREFIX); mode=flow.data.mode;
      const token=await google.tokens(PREFIX,request.query.code,flow.verifier);
      const claims=await google.identity(token.id_token,PREFIX,flow.nonce);
      let user=await User.findOne({googleSubject:claims.sub});
      if(mode==='link') {
        if(flow.data.jti && await require('../services/tokenBlacklist').isJtiRevoked(flow.data.jti)) throw new Error('GOOGLE_LINK_FAILED');
        const target=await User.findById(flow.data.userId);
        if(!target || target.status!=='active' || target.tokenVersion!==flow.data.tokenVersion
          || (target.googleLinkVersion ?? 0)!==(flow.data.googleLinkVersion ?? 0)
          || target.mustChangePassword || target.email!==claims.email.toLowerCase()
          || (user && String(user._id)!==String(target._id))) throw new Error('GOOGLE_LINK_FAILED');
        const changed=await User.updateOne({_id:target._id,tokenVersion:flow.data.tokenVersion,status:'active',
          $or:[{googleLinkVersion:flow.data.googleLinkVersion ?? 0},...((flow.data.googleLinkVersion ?? 0)===0?[{googleLinkVersion:{$exists:false}}]:[])]},{$set:{googleSubject:claims.sub}});
        if (!changed.matchedCount) throw new Error('GOOGLE_LINK_FAILED');
        return reply.redirect(`${admin}/profile?google=linked`);
      }
      if(!user) {
        if(await User.exists({email:claims.email.toLowerCase()})) throw new Error('GOOGLE_LINK_REQUIRED');
        user=await User.create({email:claims.email,password:crypto.randomBytes(48).toString('base64url'),
          googleSubject:claims.sub,firstName:claims.given_name||'',lastName:claims.family_name||'',
          isEmailVerified:true,emailVerifiedAt:new Date()});
      }
      if(user.status!=='active' || user.mustChangePassword)throw new Error('ACCOUNT_DISABLED');
      const result=await service.completeLogin(user,null,request);
      setSessionCookie(reply,result.token);
      return reply.redirect(`${admin}/`);
    } catch(error) {
      const code=['GOOGLE_LINK_REQUIRED','GOOGLE_CONSENT_DENIED','GOOGLE_LINK_FAILED','ACCOUNT_DISABLED'].includes(error.message)
        ?error.message:'GOOGLE_LOGIN_FAILED';
      return reply.redirect(`${admin}/${mode==='link'?'profile':'auth/login'}?googleError=${code}`);
    }
  });
};
