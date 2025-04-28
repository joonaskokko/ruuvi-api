import db from '../config/database.ts';
import { getMinOrMaxValueByTag } from '../models/historyModel.ts';
import { getTags } from '../models/tagModel.ts';
import { addDays, subDays, subHours, format } from 'date-fns';

export interface AggregatedHistory {
	tag_id: number,
	date: Date,
	temperature_min?: number,
	temperature_max?: number,
	humidity_min?: number,
	humidity_max?: number
}

/**
 * Aggregate history entries for given date.
 */

export async function aggregateHistory(date: Date): Promise<void> {
	// Call getTags to get the list of all tags.
	const tags = await getTags();
	if (!(date instanceof Date)) throw new Error("Invalid date provided.");
	if (!tags) throw new Error("No tags in the database to aggregate.");

	// Set the start and end date for the range
	// TODO: Use date-fns.
	const date_start: Date = new Date(date);
	date_start.setHours(0, 0, 0, 0);

	// TODO: Use date-fns.
	const date_end: Date = addDays(date, 1);	 // Add 1 day to set the end date at midnight
	date_end.setHours(0, 0, 0, 0);

	// Loop through tags and get min/max values for each tag
	let aggregated_histories: object[] = await Promise.all(
		tags.map(async (tag) => {
			const params = {
				tag_id: tag.id,
				date_start,
				date_end
			};
			
			const aggregated_history: object[] = {
				tag_id: tag.id,
				date
			};
			
			// Fetch the min and max values for each tag
			aggregated_history.temperature_min = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', metric: 'temperature' });
			aggregated_history.temperature_max = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', metric: 'temperature' });
			aggregated_history.humidity_min = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', metric: 'humidity' });
			aggregated_history.humidity_max = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', metric: 'humidity' });
			
			return aggregated_history;
		}));
	
	// Filter out entries where all values are null.
	// We might have tags that don't have any data. This will remove them.
	aggregated_histories = aggregated_histories.filter(
		({ temperature_min, temperature_max, humidity_min, humidity_max }) =>
			temperature_min !== null ||
			temperature_max !== null ||
			humidity_min !== null ||
			humidity_max !== null
	);

	// Save the aggregated results.
	await Promise.all(aggregated_histories.map(async (aggregated_history) => {
		await saveAggregatedHistory(aggregated_history);
	}));
}

/**
 * Save aggregated history to the database.
 */

export async function saveAggregatedHistory({ tag_id, date, temperature_min, temperature_max, humidity_min, humidity_max }: AggregatedHistory): Promise<number> {
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!(date instanceof Date)) throw new Error("Invalid date provided.");
	if (!await isDateAggregated({ tag_id, date })) throw new Error("Aggregated data already exists for this tag and date.");
	
	const [ id ]: number = await db('history_aggregated').insert({ tag_id, date, temperature_min, temperature_max, humidity_min, humidity_max });
	
	return id;
}

/**
 * Get aggregated history by tag ID and date.
 */

export async function getAggregatedHistory({ tag_id = null, date = null, limit = null } = {}): Promise<AggregatedHistory> {
	const aggregated_histories: object[] = await db('history_aggregated')
		.leftJoin('tag', 'tag.id', 'tag_id')
		.select([ 'history_aggregated.*', 'tag.name as tag_name' ])
		.modify(query => {
			if (date) {
				query.where('date', date );
			}
		
			if (tag_id) query.where('tag_id', tag_id);
			if (limit) query.limit(limit);
		})
		.orderBy('history_aggregated.date', 'DESC');
	
	// Format date into a more sensible one.
	aggregated_histories.forEach((aggregated_history) => {
		aggregated_history.date = format(aggregated_history.date, 'yyyy-MM-dd');
	});
		
	return aggregated_histories;
}

/**
 * Helper function to check if a given date and tag has been already aggregated.
 */

export async function isDateAggregated({ tag_id = null, date }): Promise<boolean> {
	const aggregated_history: AggregatedHistory = await getAggregatedHistory({ tag_id, date });
	
	return aggregated_history ? true : false;
}