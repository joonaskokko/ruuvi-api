import db from '../config/database.ts';
import { getMinOrMaxValueByTag } from '../services/historyService.ts';
import { getTags } from '../services/tagService.ts';
import { addDays, subDays, subHours, format } from 'date-fns';
import type { AggregatedHistory, History } from '../types/types.ts';

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
	let aggregated_histories: AggregatedHistory[] = await Promise.all(
		tags.map(async (tag) => {
			const params = {
				tag_id: tag.id,
				date_start,
				date_end
			};
			
			const aggregated_history = {
				tag_id: tag.id,
				date
			} as AggregatedHistory;
			
			// Fetch the min and max values for each tag.
			// TODO: Loop sensors.
			aggregated_history.temperature_min = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', sensor: 'temperature' });
			aggregated_history.temperature_max = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', sensor: 'temperature' });
			aggregated_history.humidity_min = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', sensor: 'humidity' });
			aggregated_history.humidity_max = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', sensor: 'humidity' });
			
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
	if (await isDateAggregated({ tag_id, date })) throw new Error("Aggregated data already exists for this tag and date.");
	
	const [ id ]: number[] = await db('history_aggregated').insert({ tag_id, date, temperature_min, temperature_max, humidity_min, humidity_max });
	
	return id;
}

/**
 * Get aggregated history by tag ID and date.
 */

export async function getAggregatedHistory({ tag_id = null, date = null, limit = null } = {}): Promise<any[]> {
	const aggregated_histories: AggregatedHistory[] = await db('history_aggregated')
		.select([ 'history_aggregated.*', 'tag.name as tag_name' ])
		.leftJoin('tag', 'tag.id', 'tag_id')
		.modify(query => {
			if (date) {
				query.where('date', date );
			}
		
			if (tag_id) query.where('tag_id', tag_id);
			if (limit) query.limit(limit);
		})
		.orderBy('history_aggregated.date', 'DESC');
	
	// Additional formatting.
	aggregated_histories.forEach((aggregated_history) => {
		// Format date to Y-m-d.
		aggregated_history.date = format(aggregated_history.date, 'yyyy-MM-dd');
		
		// Format sensors.
		aggregated_history.temperature = {
			min: aggregated_history.temperature_min,
			max: aggregated_history.temperature_min
		};
		
		delete aggregated_history.temperature_min;
		delete aggregated_history.temperature_max;
		
		aggregated_history.humidity = {
			min: aggregated_history.humidity_min,
			max: aggregated_history.humidity_min
		};
		
		delete aggregated_history.humidity_min;
		delete aggregated_history.humidity_max;
	});
	
	return aggregated_histories;
}

/**
 * Helper function to check if a given date and tag has been already aggregated.
 */

export async function isDateAggregated({ tag_id = null, date }): Promise<boolean> {
	const aggregated_history: AggregatedHistory[] = await getAggregatedHistory({ tag_id, date });
  
	return aggregated_history.length ? true : false;
}