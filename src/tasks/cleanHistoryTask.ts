import { cleanOldHistory } from '../models/historyModel.ts';
import { subDays } from 'date-fns';

const DAYS_TO_CLEAN = 7;

export async function run(): Promise<boolean> {
	// Clean history older than 7 days.
	const rows_cleaned: number = await cleanOldHistory(subDays(new Date(), DAYS_TO_CLEAN));
	
	console.log("Cleaned " + rows_cleaned + " entries.");
	
	return true;
}