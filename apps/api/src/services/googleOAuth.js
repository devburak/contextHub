const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { User } = require('@contexthub/common');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const cookieName = '__Host-ctx_google_flow';
function cookies(request) {
  return Object.fromEntries(String(request.headers.cookie || '').split(';').map(s => s.trim().split('=')));
}
function flowCookie(value, maxAge = 600) {
  return `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function config(prefix) {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const redirectUri = process.env[`${prefix}_REDIRECT_URI`];
  if (!clientId || !clientSecret || !redirectUri) throw new Error('GOOGLE_NOT_CONFIGURED');
  return { clientId, clientSecret, redirectUri };
}
async function begin({ reply, prefix, scope, data = {}, offline = false }) {
  const cfg = config(prefix);
  const state = crypto.randomBytes(32).toString('base64url');
  const browser = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('base64url');
  await User.db.collection('google_oauth_flows').insertOne({
    _id: hash(state), browser: hash(browser), verifier, nonce, prefix, data,
    expiresAt: new Date(Date.now() + 600000),
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri,
    response_type: 'code', scope, state, nonce,
    code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: offline ? 'consent select_account' : 'select_account',
    ...(offline ? { access_type: 'offline' } : {}),
  }).forEach(([k,v]) => url.searchParams.set(k,v));
  reply.header('Set-Cookie', flowCookie(browser)).header('Cache-Control','no-store');
  return url.toString();
}
async function consume(request, prefix) {
  const state = String(request.query?.state || '');
  const browser = cookies(request)[cookieName];
  if (!state || !browser) throw new Error('GOOGLE_INVALID_STATE');
  const result = await User.db.collection('google_oauth_flows').findOneAndDelete({
    _id: hash(state), browser: hash(browser), prefix, expiresAt: { $gt: new Date() },
  });
  const flow = result?.value ?? result;
  if (!flow?.verifier) throw new Error('GOOGLE_INVALID_STATE');
  if (request.query.error || !request.query.code) throw new Error('GOOGLE_CONSENT_DENIED');
  return flow;
}
async function tokens(prefix, code, verifier) {
  const cfg = config(prefix);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', body:new URLSearchParams({client_id:cfg.clientId, client_secret:cfg.clientSecret,
      redirect_uri:cfg.redirectUri, code, code_verifier:verifier, grant_type:'authorization_code'}),
    signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('GOOGLE_TOKEN_EXCHANGE_FAILED');
  return response.json();
}
let keysCache;
async function identity(idToken, prefix, nonce) {
  const header = jwt.decode(idToken,{complete:true})?.header;
  if (!header || header.alg !== 'RS256' || !header.kid) throw new Error('GOOGLE_INVALID_ID_TOKEN');
  if (!keysCache || keysCache.expires < Date.now() || !keysCache.keys.some(k => k.kid === header.kid)) {
    const response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error('GOOGLE_KEYS_UNAVAILABLE');
    keysCache={keys:(await response.json()).keys,expires:Date.now()+3600000};
  }
  const key=keysCache.keys.find(k=>k.kid===header.kid);
  if(!key) throw new Error('GOOGLE_INVALID_ID_TOKEN');
  const claims=jwt.verify(idToken,crypto.createPublicKey({key,format:'jwk'}),{
    algorithms:['RS256'],audience:config(prefix).clientId,issuer:['https://accounts.google.com','accounts.google.com'],
  });
  if(claims.nonce!==nonce || claims.email_verified!==true || !claims.sub || !claims.email) throw new Error('GOOGLE_INVALID_IDENTITY');
  return claims;
}
module.exports={begin,consume,tokens,identity,config,flowCookie};
async function validateBackupInitiator(flow) {
  const { Membership, Tenant, Role } = require('@contexthub/common');
  const tokenBlacklist = require('./tokenBlacklist');
  if (flow.data.jti && await tokenBlacklist.isJtiRevoked(flow.data.jti)) throw new Error('GOOGLE_INITIATOR_REVOKED');
  const tenant = await Tenant.findById(flow.data.tenantId).select('status');
  if (!tenant || tenant.status !== 'active') throw new Error('GOOGLE_INITIATOR_REVOKED');
  const user = await User.findById(flow.data.userId);
  if (!user || user.status !== 'active' || user.mustChangePassword || user.tokenVersion !== flow.data.tokenVersion) throw new Error('GOOGLE_INITIATOR_REVOKED');
  const member=await Membership.findOne({userId:user._id,tenantId:flow.data.tenantId,status:'active'});
  if(!member)throw new Error('GOOGLE_INITIATOR_REVOKED');
  const role=member.roleId ? await Role.findOne({_id:member.roleId,$or:[{tenantId:flow.data.tenantId},{tenantId:null}]}) : null;
  const permissions=member.getEffectivePermissions(role);
  // Apply the same current membership authorization as the connect endpoint.
  // Resolving the role here is read-only; a callback must not migrate memberships.
  const { requirePermission } = require('../middleware/auth');
  const rejected={code(){return this;},send(){throw new Error('GOOGLE_INITIATOR_REVOKED');}};
  await requirePermission('tenantBackup.configure')({userRole:role?.key||member.role,userPermissions:permissions},rejected);
  return flow.data;
}
module.exports.validateBackupInitiator=validateBackupInitiator;

// Database initialization belongs to connected server startup, not route registration.
async function initializeIndexes() {
  await User.db.collection('google_oauth_flows').createIndex(
    { expiresAt: 1 }, { expireAfterSeconds: 0 }
  );
  await User.collection.createIndex(
    { googleSubject: 1 },
    { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } } }
  );
}
module.exports.initializeIndexes = initializeIndexes;
