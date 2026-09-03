/**
 * 落库时间值 helper（统一入口，便于审计与将来调整）。
 *
 * 说明：曾因 Next 16 Turbopack 分 chunk 导致数据库包内 instanceof Date 失效，
 * 现已通过 next.config 的 serverExternalPackages 将 postgres / drizzle-orm /
 * pglite 保持为原生外部包解决，因此这里直接返回原生 Date 即可（PGlite 与
 * postgres-js 均正常）。纯内存时间运算同样使用原生 Date。
 */

/** 当前时间 */
export function nowTs(): Date {
  return new Date();
}

/** from 起经过 ms 后的时间 */
export function afterTs(ms: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + ms);
}

/** 透传一个已算好的 Date（保持调用点语义对称） */
export function isoTs(d: Date): Date {
  return d;
}
