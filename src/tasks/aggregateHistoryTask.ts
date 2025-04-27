import { aggregateHistory, isDateAggregated } from '../models/aggregatedHistoryModel.ts';
import type { History } from '../models/historyModel.ts';
import { getHistory } from '../models/historyModel.ts';
import { isEqual, format } from 'date-fns';

export async function run(): Promise<boolean> {
	const date_end: Date = new Date();
	date_end.setHours(0, 0, 0, 0); // Set to beginning of today.
	
	// Get complete days where we don't have aggregated data.
	const history: History[] = await getHistory({ date_end });
	
	const dates_with_data: Date[] = history.reduce((dates, { datetime }) => {
		const date: Date = new Date(datetime);
		// Normalise to midnight.
		date.setHours(0, 0, 0, 0);
		
		// Because Date objects don't support direct comparison, this needs to be done.
		if (!dates.some(existing_date => isEqual(existing_date, date))) {
			dates.push(date);
		}
		
		return dates;
	}, []);

	// Go through the dates and check if it has aggregation data or not.
	// If not, aggregate it.
	await Promise.all(dates_with_data.map(async date => {
		if (await isDateAggregated({ date })) {
			console.log("Aggregating day: " + format(date, 'yyyy-MM-dd'));
			return aggregateHistory(date);
		}
	}));
	
	return true;
}