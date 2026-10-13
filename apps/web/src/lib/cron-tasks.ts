/**
 * cron 任务函数 —— 从 worker.ts scheduled 直接调用，不走 HTTP self-fetch（CF 拦 loopback）。
 * 每个函数封装对应 cron 端点的核心逻辑，端点本身保留给手动触发用。
 */
import { chat, loadFleet, paidFirst } from './fleet';
import { reviewOutreach } from './outreach-review';
import { uploadJSON, mkdir, listDir } from './pan123-client';

const bjDay = () => new Date(Date.now() + 8 * 36e5).toISOString().slice(0, 10);

/** 趋势收集（每日 04:00 UTC） */
export async function runTrendCollect(env: any, db: D1Database): Promise<void> {
  const fleet = paidFirst(await loadFleet(db, env));
  if (!fleet.length) return;

  const TREND_SOURCES = [
    { market: 'us', url: 'https://www.allure.com/beauty-trends', source: 'Allure' },
    { market: 'us', url: 'https://www.elle.com/beauty/', source: 'Elle' },
    { market: 'us', url: 'https://www.cosmopolitan.com/style-beauty/beauty/', source: 'Cosmo' },
    { market: 'gb', url: 'https://www.vogue.co.uk/beauty', source: 'Vogue UK' },
    { market: 'id', url: 'https://www.femaledaily.com/best-of-beauty', source: 'FemaleDaily' },
    { market: 'th', url: 'https://www.beautymatter.com/trends', source: 'BeautyMatter' },
    { market: 'au', url: 'https://www.beautyheaven.com.au/trends', source: 'BeautyHeaven' },
    { market: 'jp', url: 'https://www.vogue.jp/beauty/', source: 'Vogue JP' },
    { market: 'kr', url: 'https://www.allurekorea.com/beauty-trends', source: 'Allure KR' },
    { market: 'sa', url: 'https://www.vogueme.com/beauty/', source: 'Vogue ME' },
    { market: 'br', url: 'https://vogue.globo.com/moda-beleza/', source: 'Vogue BR' },
    { market: 'mx', url: 'https://www.elle.com/mx/beauty/', source: 'Elle MX' },
  ];
  const dayIdx = Math.floor(Date.now() / 86400000) % 3;
  const batch = TREND_SOURCES.slice(dayIdx * 4, dayIdx * 4 + 4);
  const today = bjDay();
  let collected = 0, skipped = 0;

  let panDirID = 0;
  if (env.PAN123_CLIENT_ID) {
    try { const root = await listDir(env, 0); panDirID = root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch {}
  }

  const PROMPT = `你是一位化妆品行业趋势分析师。下面是一篇美妆媒体网页正文。把里面提到的当前/即将流行的化妆品趋势逐个抽出来，只输出JSON数组：
[{"title_zh":"趋势中文标题(≤20字)","title_en":"英文原标题","category":"护肤/彩妆/洗护/香氛/工具","format":"成分/品类/包装/营销概念","claim_tag":"功效宣称","figure":"正文里的数字","source_name":"媒体名","source_url":"来源URL","source_date":"日期","so_what_zh":"一句话为什么重要(≤40字)","confidence":"high/medium/low"}]
没有趋势就输出 []。不要编造。`;

  for (const src of batch) {
    try {
      const res = await fetch(src.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiosphereBot/1.0; +https://biosphere-ai.com/)' },
        signal: AbortSignal.timeout(15000), redirect: 'follow',
      }).catch(() => null);
      if (!res || !res.ok) { skipped++; continue; }
      const html = await res.text().catch(() => '');
      if (html.length < 500) { skipped++; continue; }
      const text = html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim().slice(0,12000);
      if (text.length < 200) { skipped++; continue; }

      const reply = await chat(env, [{role:'system',content:PROMPT},{role:'user',content:text.slice(0,8000)}], {fleet, json:true, maxTokens:2000, timeoutMs:30000}).catch(()=>({text:'[]'}));
      let trends: any[] = [];
      try { const raw=String(reply.text||'[]'); trends=JSON.parse(raw.includes('[')?raw.slice(raw.indexOf('['),raw.lastIndexOf(']')+1):'[]'); if(!Array.isArray(trends))trends=[]; } catch { skipped++; continue; }
      collected += trends.length;

      const fileName = `trend-${today}-${src.market}-${src.source.replace(/\s/g,'')}.json`;
      const fullData = JSON.stringify({url:src.url,market:src.market,source:src.source,date:today,text_sample:text.slice(0,2000),trends});
      let coldRef = '';
      if (panDirID && env.PAN123_CLIENT_ID) { try { const fid=await uploadJSON(env,panDirID,fileName,fullData); coldRef=`pan123:${fid}`; } catch {} }

      for (const t of trends) {
        const tz = String(t.title_zh||'').trim();
        if (tz.length < 2) continue;
        await db.prepare(`INSERT INTO trends (title_zh,title_en,market,category,format,claim_tag,figure,source_name,source_url,source_date,so_what_zh,confidence,status,media_state,created_at,product_name,ref_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active','pending',datetime('now'),?,?)`)
        .bind(tz.slice(0,200), String(t.title_en||'').slice(0,200)||null, src.market, String(t.category||'').slice(0,40)||null, String(t.format||'').slice(0,40)||null, String(t.claim_tag||'').slice(0,100)||null, String(t.figure||'').slice(0,100)||null, src.source, src.url, String(t.source_date||today).slice(0,20), String(t.so_what_zh||'').slice(0,500)||null, String(t.confidence||'medium').slice(0,10), String(t.product_name||'').slice(0,160)||null, coldRef||src.url).run().catch(()=>{});
      }
    } catch { skipped++; }
  }
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('trend-collect',?,?,'ok',datetime('now'),datetime('now'))`).bind(`batch=${dayIdx} collected=${collected} skipped=${skipped}`,'ok').run().catch(()=>{});
}

/** D1 备份到 123 云盘（每日 02:00 UTC） */
export async function runD1Backup(env: any, db: D1Database): Promise<void> {
  const TABLES = ['prospects','prospect_contacts','prospect_seeds','trends','ecom_trends','trend_reports','outreach_log','outreach_suppress','outreach_outbox','jobs'];
  const today = bjDay();
  let panDirID = 0;
  if (env.PAN123_CLIENT_ID) {
    try { const root=await listDir(env,0); panDirID=root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch { return; }
  } else return;

  const backup: Record<string,any> = {_backup_date:today, _tables:TABLES};
  let totalRows = 0;
  for (const table of TABLES) {
    try { const {results}=await db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 5000`).all<any>(); backup[table]=results||[]; totalRows+=(results?.length||0); }
    catch { backup[table]={_error:'failed'}; }
  }
  const fileName=`backup-d1-${today}.json`;
  try { await uploadJSON(env,panDirID,fileName,JSON.stringify(backup)); } catch {}
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('d1-backup',?,?,'ok',datetime('now'),datetime('now'))`).bind(`backup=${today} tables=${TABLES.length} rows=${totalRows}`,'ok').run().catch(()=>{});
}

/** 开发信自动生成（每日 06:00 UTC） */
export async function runOutreachAuto(env: any, db: D1Database): Promise<void> {
  const fleet = paidFirst(await loadFleet(db, env));
  if (!fleet.length) return;

  const {results:prospects} = await db.prepare(
    `SELECT p.id,p.brand,p.website,p.country,p.market,p.icp_score,p.positioning,p.categories,p.contact_channels,p.hook
     FROM prospects p WHERE p.icp_score>=60 AND p.status='new'
       AND p.id NOT IN (SELECT prospect_id FROM outreach_log WHERE status IN ('draft','approved','sent','unknown'))
     ORDER BY p.icp_score DESC LIMIT 5`
  ).all<any>().catch(()=>({results:[] as any[]}));

  let generated=0, approved=0, skipped=0;
  let panDirID=0;
  if (env.PAN123_CLIENT_ID) { try { const root=await listDir(env,0); panDirID=root.find((f:any)=>f.filename==='cosmetic-data')?.fileID ?? (await mkdir(env,'cosmetic-data',0)); } catch {} }

  const PROMPT = `You are a cosmetics OEM/ODM factory sales assistant writing a cold outreach email. Write ONLY the email body (no subject), in English, ≤95 words. Open with a specific fact about the prospect's brand. One clear CTA. No MOQ/price/lead time. No "professional/high-quality/one-stop". End will be appended separately. Natural tone.`;
  const signOff = `BIOSPHERE · cosmetics OEM/ODM manufacturer · sales@biosphere-ai.com\nBusiness solicitation. Reply "unsubscribe" to opt out.`;

  for (const p of prospects) {
    try {
      let email='';
      try { const c=JSON.parse(p.contact_channels||'[]'); for(const ch of c){const m=String(ch).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);if(m&&!/no-?reply/i.test(m[0])){email=m[0].toLowerCase();break;}} } catch {}
      if (!email) { const c=await db.prepare('SELECT email FROM prospect_contacts WHERE prospect_id=? AND email IS NOT NULL LIMIT 1').bind(p.id).first<any>(); email=c?.email||''; }
      if (!email) { skipped++; continue; }

      const reply = await chat(env, [{role:'system',content:PROMPT},{role:'user',content:`Brand:${p.brand}\nWebsite:${p.website||'N/A'}\nCountry:${p.country||p.market}\nPositioning:${p.positioning||'N/A'}`}], {fleet, maxTokens:300, timeoutMs:20000}).catch(()=>({text:''}));
      const draftBody=String(reply.text||'').trim();
      if (draftBody.length<20) { skipped++; continue; }
      const fullBody=`${draftBody}\n\n${signOff}`;
      const subject=`Quick question about ${p.brand}'s product strategy`;

      const review=await reviewOutreach(env,db,fullBody,{brand:p.brand,website:p.website,country:p.country,market:p.market,positioning:p.positioning,hook:p.hook,categories:p.categories},undefined).catch(()=>({finalBody:fullBody,scores:[],consensus:''}));
      const topScore=review.scores?.length?Math.max(...review.scores.map(s=>s.score)):0;
      const status=topScore>=85?'approved':'draft';
      if (status==='approved') approved++;
      generated++;

      await db.prepare(`INSERT INTO outreach_log (prospect_id,contact_email,step,subject,body_text,status,created_at) VALUES (?,?,1,?,?,?,datetime('now'))`).bind(p.id,email,subject.slice(0,160),fullBody.slice(0,4000),status).run().catch(()=>{});
      await db.prepare(`UPDATE prospects SET status='outreached' WHERE id=?`).bind(p.id).run().catch(()=>{});

      if (panDirID && env.PAN123_CLIENT_ID) {
        try { await uploadJSON(env,panDirID,`outreach-${bjDay()}-${p.brand.replace(/\s/g,'')}.json`,JSON.stringify({prospect_id:p.id,brand:p.brand,email,subject,draft:draftBody,final_body:fullBody,scores:review.scores,top_score:topScore,status})); } catch {}
      }
    } catch { skipped++; }
  }
  await db.prepare(`INSERT INTO jobs (name,note,status,heartbeat_at,started_at) VALUES ('outreach-auto',?,?,'ok',datetime('now'),datetime('now'))`).bind(`generated=${generated} approved=${approved} skipped=${skipped}`,'ok').run().catch(()=>{});
}
