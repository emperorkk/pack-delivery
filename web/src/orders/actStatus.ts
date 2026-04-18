/** SOACTION.ACTSTATUS enum values. Matches block F.2. */
export const ACT_STATUS = {
  IN_PROGRESS: 2,
  COMPLETED: 3,
  POSTPONED: 4,
  CANCELLED: 5,
  RETURN: 6
} as const;

export type ActStatus = (typeof ACT_STATUS)[keyof typeof ACT_STATUS];

export const ACT_STATUS_VALUES: ActStatus[] = [
  ACT_STATUS.IN_PROGRESS,
  ACT_STATUS.COMPLETED,
  ACT_STATUS.POSTPONED,
  ACT_STATUS.CANCELLED,
  ACT_STATUS.RETURN
];

export function requiresComment(status: ActStatus): boolean {
  return status === ACT_STATUS.POSTPONED || status === ACT_STATUS.CANCELLED || status === ACT_STATUS.RETURN;
}
