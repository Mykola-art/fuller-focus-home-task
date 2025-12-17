import crypto from "node:crypto";
import { Prisma, CacheProvider } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export type CacheGetResult<T> = { hit: true; value: T } | { hit: false };

export function buildCacheKey(
  provider: CacheProvider,
  request: unknown,
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ provider, request }))
    .digest("hex");
}

export async function getCache<T>(
  _provider: CacheProvider,
  cacheKey: string,
): Promise<CacheGetResult<T>> {
  const row = await prisma.cacheResult.findUnique({ where: { cacheKey } });
  if (!row) return { hit: false };
  if (row.expiresAt && row.expiresAt <= new Date()) return { hit: false };
  return { hit: true, value: row.response as T };
}

export async function setCache(params: {
  provider: CacheProvider;
  cacheKey: string;
  request: unknown;
  response: unknown;
  statusCode?: number;
  costUsd?: number;
  ttlDays?: number;
}) {
  const expiresAt = params.ttlDays
    ? new Date(Date.now() + params.ttlDays * 86400000)
    : null;

  await prisma.cacheResult.upsert({
    where: { cacheKey: params.cacheKey },
    update: {
      provider: params.provider,
      request: params.request as Prisma.InputJsonValue,
      response: params.response as Prisma.InputJsonValue,
      statusCode: params.statusCode ?? null,
      costUsd: new Prisma.Decimal(params.costUsd ?? 0),
      fetchedAt: new Date(),
      expiresAt,
    },
    create: {
      provider: params.provider,
      cacheKey: params.cacheKey,
      request: params.request as Prisma.InputJsonValue,
      response: params.response as Prisma.InputJsonValue,
      statusCode: params.statusCode ?? null,
      costUsd: new Prisma.Decimal(params.costUsd ?? 0),
      expiresAt,
    },
  });
}
