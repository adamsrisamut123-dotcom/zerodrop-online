'use strict';
const http = require('node:http');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { makeQrSvg } = require('./qr');

const MiB = 1024 * 1024;
function envInt(key, def, low, high) {
  const n = Number(process.env[key]);
  return Number.isSafeInteger(n) && n >= low && n <= high ? n : def;
}
const LIMIT = Object.freeze({
  file: envInt('MAX_FILE_MB', 25, 1, 100) * MiB,
  room: envInt('MAX_ROOM_MB', 100, 1, 400) * MiB,
  global: envInt('MAX_TOTAL_MB', 250, 25, 1024) * MiB,
  files: 30,
  rooms: 60,
  ttl: envInt('ROOM_TTL_MINUTES', 60, 5, 360) * 60_000,
});
const PUBLIC = path.resolve(__dirname, '../public');
const BASE_STORAGE = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'zerodrop-online');
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_JSON = 4096;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
function roomCode() { let out = ''; for (let i = 0; i < 8; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)]; return out; }
function pinCode() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0'); }
function token() { return crypto.randomBytes(32).toString('hex'); }
function safeName(input) {
  if (typeof input !== 'string') return 'file';
  const s = input.replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/^\.+/, '_').trim().slice(0, 140);
  return s || 'file';
}
function json(res, status, obj, additional={}) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, { ...SECURITY_HEADERS, ...additional,
    'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
  res.end(body);
}
function error(res, code, msg) { json(res, code, { error: msg }); }
async function parseJSON(req) {
  const chunks = []; let total = 0;
  for await (const part of req) { total += part.length; if (total > MAX_JSON) throw new Error('JSON request too large'); chunks.push(part); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON'); }
}
function ipOf(req) {
  if (process.env.TRUST_PROXY === '1' && typeof req.headers['x-forwarded-for'] === 'string') {
    return req.headers['x-forwarded-for'].split(',')[0].trim().slice(0, 80);
  }
  return req.socket.remoteAddress || 'unknown';
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser API clients still need authorization.
  try { const u = new URL(origin); return u.host === req.headers.host && (u.protocol === 'http:' || u.protocol === 'https:'); }
  catch { return false; }
}
function selfOrigin(req) {
  const host = String(req.headers.host || '');
  if (!/^[a-zA-Z0-9._:-]{1,255}$/.test(host)) throw new Error('Invalid Host');
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' :
    (process.env.PUBLIC_BASE_URL?.startsWith('https://') ? 'https' : 'http');
  const configured = process.env.PUBLIC_BASE_URL;
  return configured ? new URL(configured).origin : `${proto}://${host}`;
}
function encodeRoom(room) {
  return { code: room.code, createdAt: room.createdAt, expiresAt: room.expiresAt,
    totalBytes: room.totalBytes, maxRoomBytes: LIMIT.room, maxFileBytes: LIMIT.file,
    files: [...room.files.values()].map(f=>({ id:f.id, name:f.name, bytes:f.bytes, addedAt:f.addedAt })) };
}
function useRate(map, ip, key, ceiling, ms=600_000) {
  const k=`${key}:${ip}`; const now=Date.now(); let item=map.get(k);
  if (!item || item.until < now) item={until:now+ms, count:0};
  item.count++; map.set(k,item);
  return item.count <= ceiling;
}
function randomStorage() {
  const dir = path.join(BASE_STORAGE, `run-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.mkdirSync(dir, { recursive:true, mode:0o700 });
  return dir;
}
function createApp() {
  const rooms = new Map(); const sessions = new Map(); const rates = new Map();
  const storage = randomStorage();
  let committed = 0; let reserved = 0;
  function authorize(req, code) {
    const match = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '');
    if (!match) return null;
    const s = sessions.get(match[1]); const room=rooms.get(code);
    if (!s || s.code!==code || !room || room.expiresAt < Date.now()) return null;
    return { role:s.role, room };
  }
  function invalidate(code) { for(const [key,s] of sessions) if(s.code===code) sessions.delete(key); }
  function destroyRoom(code) {
    const room=rooms.get(code); if(!room) return;
    rooms.delete(code); invalidate(code);
    committed -= room.totalBytes;
    // In-flight uploads may still be running; they fail before publishing.
    fsp.rm(room.dir, { recursive:true, force:true }).catch(()=>{});
  }
  function prune() {
    const now=Date.now(); for(const r of [...rooms.values()]) if(r.expiresAt<=now) destroyRoom(r.code);
    for(const [k,v] of rates) if(v.until<=now) rates.delete(k);
  }
  const timer=setInterval(prune, 30_000); timer.unref();
  async function handle(req,res) {
    try {
      const url=new URL(req.url || '/', 'http://app.local');
      const pathname=url.pathname;
      const method=req.method;
      if (!['GET','HEAD','POST','PUT','DELETE'].includes(method)) { error(res,405,'Method not allowed'); return; }
      if (!sameOrigin(req)) { error(res,403,'Cross-origin requests are forbidden'); return; }
      if (pathname === '/healthz' && method === 'GET') { json(res,200,{status:'ok'}); return; }
      if (pathname === '/api/config' && method === 'GET') {
        json(res,200,{maxFileBytes:LIMIT.file,maxRoomBytes:LIMIT.room,ttlMinutes:LIMIT.ttl/60_000,creationLocked:Boolean(process.env.CREATE_KEY)}); return;
      }
      if(pathname === '/api/rooms' && method === 'POST') {
        if (!useRate(rates, ipOf(req), 'create', 5)) { error(res,429,'Too many new rooms. Try again later'); return; }
        prune(); if(rooms.size >= LIMIT.rooms) { error(res,503,'Server is busy; try later'); return; }
        const body=await parseJSON(req);
        const createKey=process.env.CREATE_KEY || '';
        if (createKey) {
          const supplied=typeof body?.createKey==='string'?body.createKey:'';
          const a=Buffer.from(createKey); const b=Buffer.from(supplied);
          if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) {error(res,403,'Incorrect room creation key');return;}
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) { error(res,400,'Invalid request');return; }
        let code; do { code=roomCode(); } while(rooms.has(code));
        const room={ code, pin:pinCode(), createdAt:Date.now(), expiresAt:Date.now()+LIMIT.ttl,
          files:new Map(), totalBytes:0, reservedBytes:0,
          dir:path.join(storage,code) };
        await fsp.mkdir(room.dir, { mode:0o700 }); rooms.set(code,room);
        const auth=token(); sessions.set(auth,{code,role:'owner'});
        json(res,201,{ room:encodeRoom(room), token:auth, pin:room.pin, link:`${selfOrigin(req)}/?room=${code}` }); return;
      }
      if(pathname === '/api/join' && method === 'POST') {
        if (!useRate(rates, ipOf(req), 'join', 15)) { error(res,429,'Too many pairing attempts. Try again later'); return; }
        const body=await parseJSON(req);
        const code=String(body?.code || '').trim().toUpperCase();
        const pin=String(body?.pin || '').trim(); const room=rooms.get(code);
        const safe= /^\d{6}$/.test(pin);
        const equal=room && safe && crypto.timingSafeEqual(Buffer.from(room.pin),Buffer.from(pin));
        if (!equal || room.expiresAt<=Date.now()) { error(res,403,'Room code or PIN is incorrect or expired'); return; }
        const auth=token(); sessions.set(auth,{code,role:'guest'});
        json(res,200,{room:encodeRoom(room),token:auth}); return;
      }
      const match=/^\/api\/rooms\/([A-Z2-9]{8})(?:\/(qr|rotate|files)(?:\/([a-f0-9]{24}))?)?$/.exec(pathname);
      if (match) {
        const [, code, endpoint, fileId]=match;
        const auth=authorize(req,code);
        if (!auth) { error(res,401,'Session invalid or room expired. Rejoin the room');return; }
        const {room,role}=auth;
        if (!endpoint && method==='GET') { json(res,200,{room:encodeRoom(room),role});return; }
        if (!endpoint && method==='DELETE') {
          if(role!=='owner'){error(res,403,'Only the room owner can close it');return;}
          destroyRoom(code);json(res,200,{ok:true});return;
        }
        if(endpoint==='rotate' && method==='POST'){
          if(role!=='owner'){error(res,403,'Only the room owner can change PIN');return;}
          room.pin=pinCode();
          for(const [t,s] of sessions) if(s.code===code && s.role!=='owner')sessions.delete(t);
          json(res,200,{pin:room.pin});return;
        }
        if(endpoint==='qr' && method==='GET') {
          const link=`${selfOrigin(req)}/?room=${code}`;
          const svg=makeQrSvg(link); const buf=Buffer.from(svg);
          res.writeHead(200,{...SECURITY_HEADERS,'Content-Type':'image/svg+xml','Content-Length':buf.length,
            'Content-Security-Policy':"default-src 'none'; style-src 'none'; sandbox"});res.end(buf);return;
        }
        if(endpoint==='files' && !fileId && method==='PUT') {
          if (!useRate(rates, ipOf(req), 'upload', 60)) { error(res,429,'Too many uploads');return; }
          if (room.files.size>=LIMIT.files){error(res,413,'Room file limit reached');return;}
          const name=safeName(url.searchParams.get('name'));
          const rawLength=req.headers['content-length'];
          const length=rawLength===undefined?null:Number(rawLength);
          if (length!==null && (!Number.isSafeInteger(length) || length<0)) {error(res,400,'Invalid content length');return;}
          if (length>LIMIT.file){error(res,413,'File is too large');return;}
          const hold=length===null?LIMIT.file:length;
          if (room.totalBytes+room.reservedBytes+hold>LIMIT.room || committed+reserved+hold>LIMIT.global){
            error(res,413,'Storage quota reached');return;
          }
          room.reservedBytes+=hold; reserved+=hold;
          const id=crypto.randomBytes(12).toString('hex');
          const filename=path.join(room.dir,id+'.dat'); let actual=0;
          try{
            const guard=new Transform({transform(chunk,_,cb){ actual+=chunk.length;
              cb(actual>LIMIT.file ? new Error('File size limit exceeded') : null,chunk); }});
            await pipeline(req,guard,fs.createWriteStream(filename,{flags:'wx',mode:0o600}));
            if(!rooms.has(code))throw new Error('Room expired during upload');
            if (room.totalBytes+actual>LIMIT.room || committed+actual>LIMIT.global) throw new Error('Room storage quota exceeded');
            const item={id,name,bytes:actual,addedAt:Date.now(),path:filename};
            room.files.set(id,item);room.totalBytes+=actual;committed+=actual;
            json(res,201,{file:{id,name,bytes:actual,addedAt:item.addedAt}});
          }catch(e){await fsp.rm(filename,{force:true}).catch(()=>{});
            if(!res.writableEnded && !res.destroyed)error(res,400,e.message||'Upload failed');
          } finally {reserved-=hold;room.reservedBytes-=hold;}
          return;
        }
        if(endpoint==='files' && fileId && method==='GET') {
          const item=room.files.get(fileId);if(!item){error(res,404,'File not found');return;}
          // Name is generated from validated file basename; downloadable only.
          const encoded=encodeURIComponent(item.name);
          const stream=fs.createReadStream(item.path);stream.on('error',()=>{if(!res.headersSent)error(res,404,'File no longer available');else res.destroy();});
          res.writeHead(200,{...SECURITY_HEADERS,'Content-Type':'application/octet-stream',
            'Content-Length':item.bytes,'Content-Disposition':`attachment; filename="download"; filename*=UTF-8''${encoded}`});
          stream.pipe(res);return;
        }
        if(endpoint==='files' && fileId && method==='DELETE'){
          if(role!=='owner'){error(res,403,'Only room owner may remove files');return;}
          const item=room.files.get(fileId); if(!item){error(res,404,'File not found');return;}
          room.files.delete(fileId); room.totalBytes-=item.bytes;committed-=item.bytes;
          await fsp.rm(item.path,{force:true});json(res,200,{ok:true});return;
        }
        error(res,405,'Method not allowed');return;
      }
      if(method==='GET' || method==='HEAD') {
        const table={'/':['index.html','text/html; charset=utf-8'],
          '/style.css':['style.css','text/css; charset=utf-8'],
          '/app.js':['app.js','application/javascript; charset=utf-8'],
          '/favicon.svg':['favicon.svg','image/svg+xml']};
        const found=table[pathname]; if(!found){error(res,404,'Not found');return;}
        const buf=await fsp.readFile(path.join(PUBLIC,found[0]));
        const headers={...SECURITY_HEADERS,'Content-Type':found[1],'Content-Length':buf.length};
        if(pathname==='/')headers['Content-Security-Policy']="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
        res.writeHead(200,headers);res.end(method==='HEAD' ? undefined : buf);return;
      }
      error(res,404,'Not found');
    }catch(e){
      if(!res.headersSent&&!res.destroyed)error(res, e.message==='Invalid JSON'||e.message==='JSON request too large'?400:500,
        e.message==='Invalid JSON'||e.message==='JSON request too large'?e.message:'Internal server error');
      else if(!res.writableEnded)res.destroy();
    }
  }
  const server=http.createServer((req,res)=>{req.setTimeout(180_000);void handle(req,res);});
  server.on('close',()=>{clearInterval(timer);});
  return {server,close:async()=>{await new Promise(resolve=>server.close(resolve)); await fsp.rm(storage,{recursive:true,force:true}).catch(()=>{});},limits:LIMIT};
}
if(require.main===module){
  const port=envInt('PORT',3000,1,65535);
  const app=createApp();app.server.listen(port,'0.0.0.0',()=>console.log(`ZeroDrop Online listening on ${port}`));
  process.on('SIGTERM',()=>{app.close().finally(()=>process.exit(0));});
  process.on('SIGINT',()=>{app.close().finally(()=>process.exit(0));});
}
module.exports={createApp, safeName, LIMIT};
