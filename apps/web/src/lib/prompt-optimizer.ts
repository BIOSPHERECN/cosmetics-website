/**
 * 提示词优化器 —— 把客户的一句话变成专业出图提示词。
 *
 * 为什么需要:客户写的提示词质量参差,"黑金奢华风面霜罐" 这种描述直接喂给出图模型,
 * 出来的是四不像。AI 文本模型擅长把模糊需求翻译成精确画面语言,这一步就是把
 *   "黑金奢华风面霜罐"
 * 变成
 *   "luxury cosmetic jar, matte black surface with gold foil accents, premium retail
 *    product photography, soft studio lighting, minimal background, high-end packaging
 *    design, 8k product shot"。
 *
 * 链路:用户需求 → chat() 优化成英文提示词 + 负面提示词 → 调用方再喂给 image() 出图。
 *
 * 缓存:相同输入(category + input + style)的优化结果缓存到 D1 的 prompt_cache 表,
 * 避免重复调模型 —— 提示词优化是确定性任务,同一段输入十次有九次输出几乎一样,
 * 没理由让客户为重复需求多花一次模型额度。
 */
import { chat, loadFleet, type FleetEnv } from './fleet';

/** 五大化妆品品类 —— 每个品类对应一组专业出图术语,写在 system prompt 里 */
export type Category = 'skincare' | 'makeup' | 'oral' | 'body' | 'hair';

/** 优化结果:一段正面提示词 + 一段负面提示词 */
export interface OptimizedPrompt {
  prompt: string;
  negative: string;
}

/** optimizePrompt 的完整入参 */
export interface OptimizeInput {
  /** 用户的一句话描述,可以是中文,也可以是英文 */
  input: string;
  /** 风格偏好(可选):如 "luxury" / "minimal" / "natural" / "clinical" */
  style?: string;
}

/**
 * 品类 → 专业术语速查。模型在 prompt 里要按品类加这些词,
 * 而不是泛泛地写 "a cosmetic product"。
 */
const CATEGORY_VOCAB: Record<Category, string> = {
  skincare: 'serum dropper bottle, cream jar, sheet mask, ampoule, pump bottle, airless container, glass vial',
  makeup: 'lipstick tube, compact case, eyeshadow palette, foundation bottle, mascara wand, cushion compact',
  oral: 'toothpaste tube, mouthwash bottle, dental floss dispenser, toothbrush packaging, breath mint tin',
  body: 'body lotion pump bottle, body wash tube, soap bar, bath salt jar, body scrub container',
  hair: 'shampoo bottle, conditioner pump, hair serum dropper, hair mask jar, styling spray can',
};

/**
 * system prompt —— 把所有硬规则写死在这里,模型没有自由发挥的空间。
 *
 * 规则来源(每条都是出图踩过的坑):
 *   ① 产品摄影风格:出图模型默认偏插画/艺术风,不指定就会画出 3D 渲染或水彩,
 *      但客户要的是能当产品图用的照片感画面。
 *   ② 材质质感:不写材质,模型会画出塑料感的玻璃、假金的金属,完全不对。
 *   ③ 不出可读文字:AI 画文字不可靠(会画出乱码字母),文字由 Canvas 叠加更可控。
 *   ④ 不出真人脸:合规要求 —— 出图模型画的脸无肖像权,客户拿去商用有风险。
 *   ⑤ 按品类加专业术语:让画面里的容器形态对得上品类,而不是画个通用瓶子糊弄。
 *   ⑥ 输出一律英文:image 模型只认英文提示词,中文会被忽略或误解。
 */
function buildSystemPrompt(category: Category): string {
  return [
    'You are a professional prompt engineer for cosmetic product photography image generation models.',
    'Your job: take a brief product description (possibly in Chinese) and rewrite it into a precise English prompt for an image generation model.',
    '',
    'Hard rules (all mandatory):',
    '1. Output language is ALWAYS English. The input may be Chinese, but the prompt must be English only.',
    '2. Product photography style: use terms like studio lighting, white/neutral background, product shot, commercial photography, high-resolution.',
    '3. Specify material texture explicitly: matte / glossy / frosted / metallic / satin / ceramic. Never leave material ambiguous.',
    '4. NO readable text or letters in the image. AI-drawn text is unreliable (garbled characters). Text is overlaid later via Canvas.',
    '5. NO human faces. Compliance requirement: AI-generated faces have no portrait rights and cannot be used commercially.',
    '6. Add category-specific packaging vocabulary to match the product type.',
    `   Category "${category}" vocabulary: ${CATEGORY_VOCAB[category]}`,
    '7. Keep the positive prompt under 200 words. Be dense and specific — every word should contribute to the visual.',
    '',
    'Return ONLY a JSON object, no explanation, no markdown fences:',
    '{"prompt":"the optimized English prompt (string, no newlines)","negative":"English negative prompt listing what to avoid (string, no newlines)"}',
    '',
    'The negative prompt must always include: text, letters, watermark, logo, human face, person, blurry, low quality, distorted, extra objects, cluttered background.',
    'Add category-appropriate negatives as needed.',
  ].join('\n');
}

/**
 * D1 缓存键 —— 用 SHA-256 哈希(category + input + style)。
 * 直接用原始字符串当 key 太长,D1 索引性能下降;哈希后定长 64 字符。
 */
async function cacheKey(category: Category, input: string, style: string): Promise<string> {
  const raw = `${category}|${input.trim().toLowerCase()}|${style.trim().toLowerCase()}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 确保 prompt_cache 表存在 —— 幂等,多次调用安全 */
async function ensureCacheTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS prompt_cache (
        cache_key TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        input_text TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
    )
    .run()
    .catch(() => {});
}

/**
 * 从 D1 读缓存。命中直接返回,省一次模型调用。
 * 表不存在时自动建表(幂等),建表失败不影响后续 —— 顶多不缓存。
 */
async function readCache(db: D1Database | undefined, key: string): Promise<OptimizedPrompt | null> {
  if (!db) return null;
  await ensureCacheTable(db);
  const row = await db
    .prepare('SELECT prompt, negative FROM prompt_cache WHERE cache_key = ?')
    .bind(key)
    .first<{ prompt: string; negative: string }>()
    .catch(() => null);
  if (!row || !row.prompt) return null;
  return { prompt: row.prompt, negative: row.negative };
}

/** 写缓存。失败吞掉 —— 缓存是优化项,不是必须项 */
async function writeCache(db: D1Database | undefined, key: string, category: Category, input: string, result: OptimizedPrompt): Promise<void> {
  if (!db) return;
  await db
    .prepare(
      `INSERT OR REPLACE INTO prompt_cache (cache_key, category, input_text, prompt, negative, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(key, category, input.slice(0, 500), result.prompt, result.negative)
    .run()
    .catch(() => {});
}

/**
 * 解析模型返回的 JSON —— 容错:模型偶尔会在 JSON 前后加文字或 markdown 代码块。
 * 与 pack.ts 同样的做法:先正则提取第一个 {...},再 JSON.parse。
 */
function parseResult(text: string): OptimizedPrompt | null {
  const raw = text.trim();
  // 去掉可能的 markdown 代码块包裹
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const prompt = String(j.prompt ?? '').replace(/\n+/g, ' ').trim();
    const negative = String(j.negative ?? '').replace(/\n+/g, ' ').trim();
    if (!prompt) return null;
    return {
      prompt: prompt.slice(0, 600),
      negative: (negative || 'text, letters, watermark, logo, human face, person, blurry, low quality, distorted, extra objects, cluttered background').slice(0, 400),
    };
  } catch {
    return null;
  }
}

/** 兜底:模型全挂或解析失败时,用固定模板拼一段过得去的提示词,保证调用方不空手 */
function fallback(input: string, category: Category, style?: string): OptimizedPrompt {
  const styleHint = style ? `, ${style} style` : '';
  return {
    prompt: `Cosmetic product photography: ${input}${styleHint}, ${CATEGORY_VOCAB[category].split(',')[0].trim()}, premium product shot, studio lighting, clean neutral background, high-resolution, sharp focus, professional commercial photography`,
    negative: 'text, letters, watermark, logo, human face, person, blurry, low quality, distorted, extra objects, cluttered background',
  };
}

/**
 * 把用户的一句话需求优化成专业的英文图片生成提示词。
 *
 * @param env   Worker 环境(FleetEnv),传给 chat() 读模型 key
 * @param db    D1 数据库,用于缓存(可选 —— 没有就不缓存)
 * @param input 用户的需求描述(中文或英文均可) + 可选风格偏好
 * @param category 品类:skincare / makeup / oral / body / hair
 * @returns { prompt: string, negative: string } —— 优化的英文提示词 + 负面提示词
 *
 * 失败不抛错:模型全挂时返回兜底模板,保证调用方拿到的永远是可用的提示词。
 */
export async function optimizePrompt(
  env: FleetEnv,
  db: D1Database | undefined,
  input: OptimizeInput,
  category: Category,
): Promise<OptimizedPrompt> {
  const desc = input.input.trim().slice(0, 500);
  const style = (input.style ?? '').trim().slice(0, 100);

  if (!desc) return fallback('', category, style);

  // ── 1. 查缓存:相同输入直接返回,省一次模型调用
  const key = await cacheKey(category, desc, style);
  const cached = await readCache(db, key);
  if (cached) return cached;

  // ── 2. 调模型优化 —— 免费池优先(loadFleet 按 tier 排序,免费档在前)
  try {
    const fleet = await loadFleet(db, env);
    const r = await chat(
      env,
      [
        { role: 'system', content: buildSystemPrompt(category) },
        {
          role: 'user',
          content: `Product description: ${desc}${style ? `\nStyle preference: ${style}` : ''}\n\nReturn the JSON now.`,
        },
      ],
      {
        json: true,
        maxTokens: 600,
        temperature: 0.4, // 提示词优化是半创造性任务:太低千篇一律,太高跑偏
        fleet,
        timeoutMs: 30_000,
        promptKey: 'prompt-optimizer',
        promptVersion: 1,
        db,
      },
    );

    const parsed = parseResult(r.text);
    if (parsed) {
      // 命中即写缓存;写失败不影响返回
      await writeCache(db, key, category, desc, parsed);
      return parsed;
    }
    // 模型返回了但解析不了 —— 用兜底,不缓存(下次同输入会再试一次模型)
  } catch {
    // 模型全挂:走兜底,不抛错 —— 调用方拿到的永远是可用的提示词
  }

  return fallback(desc, category, style);
}
