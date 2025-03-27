import db from '../config/database.ts';
import { ensureTag, getTags } from '../models/tagModel.ts';

export interface History {
	ruuvi_id?: string;
	tag_id?: number;
	datetime: Date;
	temperature?: number;
	humidity?: number;
	voltage?: number;
	battery_low?: boolean;
}

export async function saveHistory({ tag_id, ruuvi_id, datetime, temperature, humidity, voltage, battery_low = false }: History): Promise<boolean> {
	if (!tag_id && !ruuvi_id) throw new Error("Need either tag ID or Ruuvi ID.");
	if (!(datetime instanceof Date)) throw new Error("Datetime isn't a date object.");
	
	// Get tag ID for Ruuvi MAC if tag ID isn't passed.
	if (!tag_id && ruuvi_id) {
		tag_id = (await ensureTag({ ruuvi_id })).id;
	}
	
	// Set battery low based on voltage. Note: overrides battery_low.
	if (voltage) {
		battery_low = voltage < 2.5;
	}
	
	// Insert into history. Use tag ID here instead of Ruuvi ID.
	await db('history').insert({ tag_id, datetime, temperature, humidity, battery_low });
	
	return true;
}

export async function getHistory({ date_start = null, date_end = null, tag_id = null } = {}): Promise<History[]> {
	if ((date_start && !date_end) || (!date_start && date_end)) throw new Error("Data range must contain start and end date time or neither.");
	
	const history: object[] = await db('history')
		.leftJoin('tag', 'tag.id', 'tag_id')
		.select([ 'history.*', 'tag.name as tag_name' ])
		.modify(query => {
			if (date_start && date_end) {
				query.whereBetween('datetime', [date_start, date_end] );
			}
		
			if (tag_id) query.where('tag.id', tag_id);
		})
		.orderBy('history.datetime', 'DESC');
		
	return history;
}

export async function getCurrentHistory(): Promise<History[]> {
	const current: object[] = await db('history')
		.leftJoin('tag', 'history.tag_id', 'tag.id')
		.join(
			db('history')
				.select('tag_id')
				.max('datetime as max_datetime')
				.groupBy('tag_id')
			.as('latest'),
			function () {
				this.on('history.tag_id', '=', 'latest.tag_id')
						.andOn('history.datetime', '=', 'latest.max_datetime');
			}
		)
		.select('history.*', 'tag.name as tag_name')
		.orderBy('tag_name', 'ASC');
	
	return current;
}

// Utility function get maximum value of a metric.
export async function getMinOrMaxValueByTag({ type, tag_id, metric, date_start, date_end }): number {
	if (type !== 'min' && type !== 'max') throw new Error("Type needs to be min or max.");
	if (!date_start || !date_end) throw new Error("Data range must contain start and end date time.");
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!metric) throw new Error("Missing metric name.");
	
	const { value }: number = await db('history')
		.modify(query => {
			if (type === 'min') query.min({ value: metric });
			if (type === 'max') query.max({ value: metric });
		})
		.max({ value: metric }) // This resolves to .min or .max.
		.where('tag_id', tag_id)
		.whereBetween('datetime', [ date_start, date_end ])
		.first();
	
	return value;
}

export async function cleanOldHistory(days: number): number {
	if (!days || days < 0) throw new Error("Invalid amount of days.");
	
	let delete_older = new Date();
	delete_older.setDate(delete_older.getDate() - days);
	
	const rows_removed = await db('history')
		where('datetime', '<', delete_older)
		.del();
	
	return rows_removed;
}

export async function aggregateHistory(date: Date) {
	// Call getTags to get the list of all tags.
	const tags = await getTags();
	if (!(date instanceof Date)) throw new Error("Invalid date provided.");
	if (!tags) throw new Error("No tags in the database to aggregate.");

	// Set the start and end date for the range
	const date_start = new Date(date);
	date_start.setHours(0, 0, 0, 0);

	const date_end = new Date(date);
	date_end.setDate(date_end.getDate() + 1);	 // Add 1 day to set the end date at midnight
	date_end.setHours(0, 0, 0, 0);

	// Loop through tags and get min/max values for each tag
	let aggregated_histories = await Promise.all(
		tags.map(async (tag) => {
			// Fetch the min and max values for each tag
			const temperature_min = await getMinOrMaxValueByTag({ type: 'min', tag_id: tag.id, metric: 'temperature', date_start, date_end });
			const temperature_max = await getMinOrMaxValueByTag({ type: 'max', tag_id: tag.id, metric: 'temperature', date_start, date_end });
			const humidity_min = await getMinOrMaxValueByTag({ type: 'min', tag_id: tag.id, metric: 'humidity', date_start, date_end });
			const humidity_max = await getMinOrMaxValueByTag({ type: 'max', tag_id: tag.id, metric: 'humidity', date_start, date_end });
			
			return { tag_id: tag.id, date, temperature_min, temperature_max, humidity_min, humidity_max }
		}));
	
	// Filter out entries where all values are null
	aggregated_histories = aggregated_histories.filter(
		({ temperature_min, temperature_max, humidity_min, humidity_max }) =>
			temperature_min !== null || temperature_max !== null || humidity_min !== null || humidity_max !== null
	);

	// Save the aggregated results into the `history_longterm` table
	await db('history_longterm').insert(aggregated_histories);

	return aggregated_histories;
}