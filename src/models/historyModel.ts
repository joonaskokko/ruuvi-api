import db from '../config/database.ts';
import { ensureTag, getTags } from '../models/tagModel.ts';

const METRICS = [ 'temperature', 'humidity' ];
const DEFAULT_TREND_VALUE_AMOUNT = 3;
const CURRENT_HISTORY_MIN_MAX_HOURS = 12;

export interface History {
	ruuvi_id?: string;
	tag_id?: number;
	datetime: Date;
	temperature?: number;
	humidity?: number;
	voltage?: number;
	battery_low?: boolean;
}

/**
 * Utility function to check given metric validity.
 */
function isValidMetric(metric) {
	return METRICS.includes(metric);
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
		battery_low = voltage < 2;
	}
	
	// Insert into history. Use tag ID here instead of Ruuvi ID.
	await db('history').insert({ tag_id, datetime, temperature, humidity, battery_low });
	
	return true;
}

export async function getHistory({ date_start = null, date_end = null, tag_id = null, limit = null } = {}): Promise<History[]> {
	if ((date_start && !date_end) || (!date_start && date_end)) throw new Error("Data range must contain start and end date time or neither.");
	
	const history: object[] = await db('history')
		.leftJoin('tag', 'tag.id', 'tag_id')
		.select([ 'history.*', 'tag.name as tag_name' ])
		.modify(query => {
			if (date_start && date_end) {
				query.whereBetween('datetime', [date_start, date_end] );
			}
		
			if (tag_id) query.where('tag.id', tag_id);
			if (limit) query.limit(limit);
		})
		.orderBy('history.datetime', 'DESC');
		
	return history;
}

export async function getCurrentHistory(): Promise<History[]> {
	let history: object[] = await db('history')
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
	
	// Get maximum and minimum last 12 hours and get direction of temperature and humidity.
	history = await Promise.all(history.map(async row => {
		const tag_id = row.tag_id;
		const date_end = new Date(row.datetime);
		const date_start = new Date(date_end.getTime() - (CURRENT_HISTORY_MIN_MAX_HOURS * 60 * 60 * 1000)); // Argh.
		
		row.temperature_min = await getMinOrMaxValueByTag({ tag_id, type: 'min', metric: 'temperature', date_start, date_end });
		row.temperature_max = await getMinOrMaxValueByTag({ tag_id, type: 'max', metric: 'temperature', date_start, date_end });
		row.temperature_trend = await getMetricTrendByTag({ tag_id, metric: 'temperature' });
		row.humidity_min = await getMinOrMaxValueByTag({ tag_id, type: 'min', metric: 'humidity', date_start, date_end });
		row.humidity_max = await getMinOrMaxValueByTag({ tag_id, type: 'max', metric: 'humidity', date_start, date_end });
		row.humidity_trend = await getMetricTrendByTag({ tag_id, metric: 'humidity' });
		
		return row;
	}));
	
	return history;
}

// Utility function get maximum value of a metric.
export async function getMinOrMaxValueByTag({ type, tag_id, metric, date_start, date_end }): number {
	if (!['min', 'max'].includes(type)) throw new Error("Type needs to be min or max.");
	if (!date_start || !date_end) throw new Error("Data range must contain start and end date time.");
	if (date_start > date_end) throw new Error("Start date cannot be before end date.");
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!metric) throw new Error("Missing metric name.");
	if (metric && !isValidMetric(metric)) throw new Error("Not a valid metric name: " + metric);
	
	// TODO: Maybe refactor this to use getHistory instead?
	const { value }: number = await db('history')
		.modify(query => {
			// For clarity, these are separate rows.
			if (type === 'min') query.min({ value: metric });
			if (type === 'max') query.max({ value: metric });
		})
		.where('tag_id', tag_id)
		.whereBetween('datetime', [ date_start, date_end ])
		.first();
	
	return value;
}

export async function getMetricTrendByTag({ tag_id, metric }): number {
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!metric) throw new Error("Missing metric name.");
	if (metric && !isValidMetric(metric)) throw new Error("Not a valid metric name: " + metric);
		
	// Get history and limit it to DEFAULT_TREND_VALUE_AMOUNT.
	const metric_values: History[] = await getHistory( { tag_id, limit: DEFAULT_TREND_VALUE_AMOUNT })
	const [ first, second, third ] = metric_values.map(row => row[metric]);

	// Very simple trend comparison.
	// TODO: Add some sort of tolerance here, eg. 0.05 or something.
	if (first > second && second > third) {
		return 1;
	}
	else if (first < second && second < third) {
		return -1;
	}
	else {
		return 0;
	}
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