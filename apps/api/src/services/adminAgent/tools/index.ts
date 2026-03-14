import { queryStats, type QueryStatsInput } from './queryStats.js';
import { getQueueStatus, type QueueStatusInput } from './queueStatus.js';
import { getSystemHealth } from './systemHealth.js';
import { searchReports, type SearchReportsInput } from './searchReports.js';
import { searchUsers, type SearchUsersInput } from './searchUsers.js';
import { getRecentErrors, type RecentErrorsInput } from './recentErrors.js';
import { updateReportStatus, type UpdateReportStatusInput } from './updateReportStatus.js';
import { updateMatchStatus, type UpdateMatchStatusInput } from './updateMatchStatus.js';
import { blockUser, type BlockUserInput } from './blockUser.js';
import { retryFailedJob, type RetryFailedJobInput } from './retryFailedJob.js';

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export const TOOL_HANDLERS: Record<string, ToolHandler> = {
  query_stats: (input) => queryStats(input as unknown as QueryStatsInput),
  get_queue_status: (input) => getQueueStatus(input as unknown as QueueStatusInput),
  get_system_health: (_input) => getSystemHealth(),
  search_reports: (input) => searchReports(input as unknown as SearchReportsInput),
  search_users: (input) => searchUsers(input as unknown as SearchUsersInput),
  get_recent_errors: (input) => getRecentErrors(input as unknown as RecentErrorsInput),
  update_report_status: (input) =>
    updateReportStatus(input as unknown as UpdateReportStatusInput),
  update_match_status: (input) =>
    updateMatchStatus(input as unknown as UpdateMatchStatusInput),
  block_user: (input) => blockUser(input as unknown as BlockUserInput),
  retry_failed_job: (input) => retryFailedJob(input as unknown as RetryFailedJobInput),
};

export const WRITE_TOOLS = new Set<string>([
  'update_report_status',
  'update_match_status',
  'block_user',
  'retry_failed_job',
]);
