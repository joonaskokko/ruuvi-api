import { cleanOldHistory } from '../services/historyService.ts';
import { subDays, format } from 'date-fns';
import { HISTORY_DAYS_TO_KEEP } from '../config/config.ts';


export async function run(): Promise<boolean> {
	// Clean history older than 7 days.
	const clean_date: Date = subDays(new Date(), HISTORY_DAYS_TO_KEEP);
	console.log("Cleaning entries older than " + format(clean_date, 'yyyy-MM-dd'));
	const rows_cleaned: number = await cleanOldHistory(clean_date);
	console.log("Deleted " + rows_cleaned + " entries.");

	return true;
}