/**
 * Prisma unique constraint violation (P2002) 체크.
 * instanceof 대신 err.code 기반으로 검사하여 테스트 환경에서도 안전하게 동작.
 */
export function isPrismaUniqueError(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2002';
}

/**
 * Prisma record not found (P2025) 체크.
 * instanceof 대신 err.code 기반으로 검사하여 테스트 환경에서도 안전하게 동작.
 */
export function isPrismaNotFoundError(err: unknown): boolean {
  return err instanceof Error && 'code' in err && (err as { code: string }).code === 'P2025';
}
