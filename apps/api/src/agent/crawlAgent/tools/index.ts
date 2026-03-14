import { fetchSafe182 } from './fetchSafe182.js';
import { fetchAmberAlerts } from './fetchAmberAlerts.js';
import { fetchAnimalApi } from './fetchAnimalApi.js';
import { searchReports } from './searchReports.js';
import { storeReport } from './storeReport.js';
import { enqueueImageAnalysis } from './enqueueImageAnalysis.js';

export const TOOL_HANDLERS: Record<string, (input: unknown) => Promise<unknown>> = {
  fetch_safe182: fetchSafe182,
  fetch_amber_alerts: fetchAmberAlerts,
  fetch_animal_api: fetchAnimalApi,
  search_reports: searchReports,
  store_report: storeReport,
  enqueue_image_analysis: enqueueImageAnalysis,
};
