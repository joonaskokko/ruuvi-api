import { cleanOldHistory } from '../services/historyService.ts';
import { subDays, format } from 'date-fns';

const DAYS_TO_CLEAN = 7;

export async function run(): Promise<boolean> {
	// Clean history older than 7 days.
	const clean_date: Date = subDays(new Date(), DAYS_TO_CLEAN);
	console.log("Cleaning entries older than " + format(clean_date, 'yyyy-MM-dd'));
	const rows_cleaned: number = await cleanOldHistory(clean_date);
	console.log("Deleted " + rows_cleaned + " entries.");

	return true;
}