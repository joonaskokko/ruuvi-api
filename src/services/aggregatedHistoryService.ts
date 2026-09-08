import db from '../config/database.ts';
import { getMinOrMaxValueByTag } from '../services/historyService.ts';
import { getTags } from '../services/tagService.ts';
import { addDays, subDays, subHours } from 'date-fns';
import type { AggregatedHistory, AggregatedHistoryRow, AggregatedSensor, History, Sensor } from '../types/types.ts';
import { SENSORS } from '../config/config.ts';

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
	let aggregated_histories: AggregatedHistoryRow[] = await Promise.all(
		tags.map(async (tag) => {
			const params = {
				tag_id: tag.id,
				date_start,
				date_end
			};

			const aggregated_history = {
				tag_id: tag.id,
				date
			} as AggregatedHistoryRow;

			// Fetch the min and max values for each sensor.
			// It's a bit ugly to use variables in key names but oh well.'
			for (const sensor_name of SENSORS) {
				aggregated_history[`${sensor_name}_min`] = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', sensor: sensor_name });
				aggregated_history[`${sensor_name}_max`] = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', sensor: sensor_name });
			}

			return aggregated_history;
		}));

	// Filter out entries where all values are null.
	// We might have tags that don't have any data. This will remove them.
	aggregated_histories = aggregated_histories.filter(
		({ temperature_min, temperature_max, humidity_min, humidity_max, rssi_min, rssi_max }) =>
			temperature_min !== null ||
			temperature_max !== null ||
			humidity_min !== null ||
			humidity_max !== null ||
			rssi_min !== null ||
			rssi_max !== null
	);

	// Save the aggregated results.
	await Promise.all(aggregated_histories.map(async (aggregated_history) => {
		await saveAggregatedHistory(aggregated_history);
	}));
}

/**
 * Save aggregated history to the database.
 */

export async function saveAggregatedHistory({ tag_id, date, temperature_min, temperature_max, humidity_min, humidity_max, rssi_min, rssi_max }: AggregatedHistoryRow): Promise<number> {
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!(date instanceof Date)) throw new Error("Invalid date provided.");
	if (await isDateAggregated({ tag_id, date })) throw new Error("Aggregated data already exists for this tag and date.");

	const [ id ]: number[] = await db('history_aggregated').insert({ tag_id, date, temperature_min, temperature_max, humidity_min, humidity_max, rssi_min, rssi_max });

	return id;
}

/**
 * Get aggregated history by tag ID and date.
 */

export async function getAggregatedHistory({ tag_id = null, date_start = null, date_end = null, limit = null } = {}): Promise<AggregatedHistory[]> {
	if (!date_start && !date_end) throw new Error("Data range must contain start and end date time.");
	if (date_start > date_end) throw new Error("Start date cannot be before end date.");
	const aggregated_histories_rows: AggregatedHistoryRow[] = await db('history_aggregated')
		.select([ 'history_aggregated.*', 'tag.name as tag_name' ])
		.leftJoin('tag', 'tag.id', 'tag_id')
		.modify(query => {
			if (date_start && date_end) {
				query.whereBetween('date', [ date_start, date_end ])
			}

			if (tag_id) query.where('tag_id', tag_id);
			if (limit) query.limit(limit);
		})
		.where('tag.active', true)
		.orderBy('history_aggregated.date', 'DESC');

	// Convert from row format to formatted response with Sensor objects.
	const aggregated_histories: AggregatedHistory[] = aggregated_histories_rows.map((row) => {
		return {
			tag_id: row.tag_id,
			date: row.date,
			temperature: {
				min: row.temperature_min,
				max: row.temperature_max
			},
			humidity: {
				min: row.humidity_min,
				max: row.humidity_max
			},
			rssi: {
				min: row.rssi_min,
				max: row.rssi_max
			}
		} satisfies AggregatedHistory;
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