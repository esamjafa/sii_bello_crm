import { NextResponse } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { setSession } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { securityRateLimit } from '@/lib/security';
const MAX_ATTEMPTS=5;
const LOCK_MINUTES=10;
function businessDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    const { username, password } = body;
    const noStore = { 'Cache-Control':'no-store, max-age=0', Pragma:'no-cache' };
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 254 || password.length > 200) return NextResponse.json({ error: 'Invalid credentials' }, { status: 400, headers:noStore });
    const identity=username.trim();
    const limit=await securityRateLimit({request,action:'LOGIN_ATTEMPT',identity:'login',windowMs:15*60*1000,maximum:30});
    if(!limit.allowed)return NextResponse.json({error:'Too many login attempts. Try again later.'},{status:429,headers:{...noStore,'Retry-After':String(limit.retryAfter)}});
    const user = await prisma.user.findFirst({ where: { OR: [{ username: identity }, { email: identity.toLowerCase() }] } });
    if (!user?.active) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401, headers:noStore });
    if (user.requiresGodUnlock) {
      await audit(user,'LOGIN_BLOCKED','session',user.id,{reason:'GOD_UNLOCK_REQUIRED'});
      return NextResponse.json({ error: 'Account locked. God Mode must unlock it.', code:'GOD_UNLOCK_REQUIRED' }, { status: 423, headers:noStore });
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter=Math.max(1,Math.ceil((user.lockedUntil.getTime()-Date.now())/1000));
      await audit(user,'LOGIN_BLOCKED','session',user.id,{reason:'TEMPORARY_LOCK',retryAfter});
      return NextResponse.json({ error: `Account locked. Try again in ${Math.ceil(retryAfter/60)} minute(s).`, code:'TEMPORARY_LOCK', retryAfter }, { status: 423, headers:{...noStore,'Retry-After':String(retryAfter)} });
    }
    const passwordMatches=await compare(password,user.passwordHash);
    if (!passwordMatches) {
      const attempts=user.failedLoginAttempts+1;
      if (attempts>=MAX_ATTEMPTS) {
        const today=businessDate();
        const locksToday=user.lockCountDate===today?user.dailyLockCount+1:1;
        const requiresGodUnlock=locksToday>=3;
        const lockedUntil=requiresGodUnlock?null:new Date(Date.now()+LOCK_MINUTES*60*1000);
        await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:0,dailyLockCount:locksToday,lockCountDate:today,requiresGodUnlock,lockedUntil}});
        await audit(user,'ACCOUNT_LOCKED','users',user.id,{locksToday,requiresGodUnlock,lockedUntil});
        return NextResponse.json({error:requiresGodUnlock?'Account locked. God Mode must unlock it.':`Account locked for ${LOCK_MINUTES} minutes.`,code:requiresGodUnlock?'GOD_UNLOCK_REQUIRED':'TEMPORARY_LOCK',retryAfter:requiresGodUnlock?undefined:LOCK_MINUTES*60},{status:423,headers:{...noStore,...(!requiresGodUnlock?{'Retry-After':String(LOCK_MINUTES*60)}:{})}});
      }
      await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:attempts,lockedUntil:null}});
      await audit(user,'LOGIN_FAILED','session',user.id,{attempts,remaining:MAX_ATTEMPTS-attempts});
      return NextResponse.json({ error: `Invalid credentials. ${MAX_ATTEMPTS-attempts} attempt(s) remaining.`, code:'INVALID_CREDENTIALS', remaining:MAX_ATTEMPTS-attempts }, { status: 401, headers:noStore });
    }
    await prisma.user.update({where:{id:user.id},data:{failedLoginAttempts:0,lockedUntil:null}});
    await setSession(user.id);
    await audit(user,'LOGIN','session',user.id);
    return NextResponse.json({ ok: true },{headers:noStore});
  } catch { return NextResponse.json({ error: 'Login failed' }, { status: 500, headers:{'Cache-Control':'no-store, max-age=0'} }); }
}
