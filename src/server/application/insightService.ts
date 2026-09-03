/**
 * 会员专属 AI 洞察服务（Premium-only）。
 *
 * - 仅对持有有效 premium 权益的会话开放，非会员调用抛 402 PAYMENT_REQUIRED；
 * - 优先调用用户本机的 Ollama（deepseek-r1）生成自然语言个性化建议；
 * - 本地模型不可达（如线上环境、未启动 Ollama）时回退到确定性规则建议，
 *   并以 source 字段标明来源，前端如实展示——功能永不硬失败；
 * - 健康数值一律来自已持久化的领域计算结果，模型只负责表达，不产出数值。
 */
import { and, eq } from 'drizzle-orm';
import type { Db } from '@/server/infrastructure/db/client';
import { assessmentResult, entitlement } from '@/server/infrastructure/db/schema';
import { ProblemError } from '@/server/api/errors';
import type { HealthResult } from '@/server/domain/health/assessment';
import type { FullProfile } from '@/server/validation/schemas';
import { buildRecommendations } from './resultService';
import { askLocalOllama, toTipList } from '@/server/infrastructure/ai/ollama';

export type InsightSource = 'local-llm' | 'rule-fallback';

export interface AiInsightView {
  access: 'full';
  source: InsightSource;
  model?: string;
  tips: string[];
  generatedAt: string;
}

function buildPrompt(profile: FullProfile, result: HealthResult): string {
  const tl = result.targetDateRangeWeeks
    ? `${result.targetDateRangeWeeks.fastestWeeks}-${result.targetDateRangeWeeks.steadyWeeks} weeks`
    : 'not applicable';
  return [
    'You are a pragmatic, evidence-based health coach. A user completed an assessment.',
    'These are their ALREADY-COMPUTED, authoritative numbers — never recompute or invent different ones:',
    `- Profile: ${profile.sex}, age ${profile.ageYears}, height ${profile.heightCm} cm, current ${profile.weightKg} kg, target ${profile.targetWeightKg} kg.`,
    `- Goal: ${result.goal ?? profile.goal ?? 'lose'}, pace ${result.pace ?? profile.pace ?? 'moderate'}, direction ${result.energyDirection}.`,
    `- BMI ${result.bmi} (${result.bmiCategory}); BMR ${Math.round(result.bmr)}; TDEE ${result.tdee}; recommended intake ${result.recommendedIntake} kcal/day; activity factor ${result.activityFactor}; timeline ${tl}.`,
    `- Focus areas: ${(profile.focusAreas ?? []).join(', ') || 'none stated'}; workout preference: ${(profile.workoutPreferences ?? []).join(', ') || 'none'}; daily movement: ${profile.dailyMovement ?? 'unknown'}; stair tolerance: ${profile.stairTolerance ?? 'unknown'}; weight tendency: ${profile.weightTendency ?? 'unknown'}.`,
    'Write 4 to 5 short, specific, encouraging lines of personalised advice covering nutrition, activity and one habit. Ground every line in the numbers above. No medical diagnosis, no disclaimers, no headings, no intro/outro, do not introduce numbers other than those given, one line each.',
  ].join('\n');
}

export async function getAiInsights(db: Db, sessionId: string): Promise<AiInsightView> {
  const [row] = await db.select().from(assessmentResult).where(eq(assessmentResult.sessionId, sessionId));
  if (!row) throw new ProblemError('INVALID_REQUEST', 'assessment not submitted yet');
  const payload = row.payload as Record<string, unknown>;
  if (payload.kind !== 'complete') {
    throw new ProblemError('INVALID_REQUEST', 'no completed result to generate insights from');
  }

  const [ent] = await db
    .select()
    .from(entitlement)
    .where(and(eq(entitlement.sessionId, sessionId)));
  const active = !!ent && ent.tier === 'premium' && ent.expiresAt && ent.expiresAt.getTime() > Date.now();
  if (!active) {
    throw new ProblemError('PAYMENT_REQUIRED', 'AI coach insights are a Premium feature — complete checkout to unlock them.');
  }

  const profile = payload.profile as FullProfile;
  const result = payload.result as HealthResult;

  try {
    const { text, model } = await askLocalOllama(buildPrompt(profile, result));
    const tips = toTipList(text);
    if (!tips.length) throw new Error('no tips parsed');
    return { access: 'full', source: 'local-llm', model, tips, generatedAt: new Date().toISOString() };
  } catch {
    // 本地模型不可用（线上/未启动）：确定性规则建议兜底，保证可用。
    return {
      access: 'full',
      source: 'rule-fallback',
      tips: buildRecommendations(profile, result),
      generatedAt: new Date().toISOString(),
    };
  }
}
