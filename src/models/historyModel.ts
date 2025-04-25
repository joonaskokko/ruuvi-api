import db from '../config/database.ts';
import { ensureTag, getTags } from '../models/tagModel.ts';
import { addDays, subDays, subHours } from 'date-fns';

const METRICS: string[] = [ 'temperature', 'humidity' ];
const CURRENT_HISTORY_MIN_MAX_HOURS: number = 12;

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
 * Utility function for checking metric validity.
 */

function isValidMetric(metric) {
	return METRICS.includes(metric);
}

/**
 * Save history entry to the database.
 */

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
	
	// Remove decimals from metric values to something sensible other than 1.18626.
	// TODO: A loop perhaps from METRICS?
	temperature = Number(temperature.toFixed(2));
	humidity = Number(humidity.toFixed(2));
	
	// Insert into history. Use tag ID here instead of Ruuvi ID.
	await db('history').insert({ tag_id, datetime, temperature, humidity, battery_low });
	
	return true;
}

/**
 * Get history.
 */

export async function getHistory({ date_start = null, date_end = null, tag_id = null, limit = null } = {}): Promise<History[]> {
	const history: object[] = await db('history')
		.leftJoin('tag', 'tag.id', 'tag_id')
		.select([ 'history.*', 'tag.name as tag_name' ])
		.modify(query => {
			if (date_start) query.where('datetime', '>', date_start);
			if (date_end) query.where('datetime', '<', date_end);
			if (tag_id) query.where('tag.id', tag_id);
			if (limit) query.limit(limit);
		})
		.orderBy('history.datetime', 'DESC');
		
	return history;
}

/**
 * Get current history, eg. latest single value per tag.
 */

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
		const tag_id: number = row.tag_id;
		const date_end: Date = row.datetime;
		const date_start: Date = subHours(date_end, CURRENT_HISTORY_MIN_MAX_HOURS);
		
		// Same for all function calls.
		const params = {
			tag_id,
			date_start,
			date_end
		};
		
		const temperature = {};
		temperature.current = row.temperature;		
		temperature.min = await getMinOrMaxValueByTag(
			{ ...params, type: 'min', metric: 'temperature' });
		temperature.max = await getMinOrMaxValueByTag(
			{ ...params, type: 'max', metric: 'temperature' });
		temperature.trend = await getMetricTrendByTag(
			{ ...params, metric: 'temperature' });
		row.temperature = temperature;
				
		const humidity = {};
		humidity.current = row.humidity;
		humidity.min = await getMinOrMaxValueByTag(
			{ ...params, type: 'min', metric: 'humidity' });
		humidity.max = await getMinOrMaxValueByTag(
			{ ...params, type: 'max', metric: 'humidity' });
		humidity.trend = await getMetricTrendByTag(
			{ ...params, metric: 'humidity' });
		row.humidity = humidity;
		
		return row;
	}));
	
	return history;
}

/**
 * Get single min or max value from a metric by tag.
 */

export async function getMinOrMaxValueByTag({ type, tag_id, metric, date_start, date_end }): Promise<number> {
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

/**
 * Get metric trend by tag. Returns 1 for increasing, -1 for decreasing or 0 for staying the same.
 */

export async function getMetricTrendByTag({ tag_id, metric }): Promise<number> {
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!metric) throw new Error("Missing metric name.");
	if (metric && !isValidMetric(metric)) throw new Error("Not a valid metric name: " + metric);
		
	// Get history and limit it to 3.
	const metric_values: History[] = await getHistory({ tag_id, limit: 3 })
	
	// If there isn't enough history, return 0 eg. staying the same.
	if (metric_values.length < 3) {
		return 0;
	}
	
	// Flatten the array to only values without keys.
	const [ first, second, third ]: number[] = metric_values.map(row => row[metric]);

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

/**
 * Housekeeping function to clean old history entries away.
 */

export async function cleanOldHistory(delete_older_than_days: Date): Promise<number> {
	if (!(delete_older_than_days instanceof Date)) throw new Error("Clean older than date isn't a date object.");
	if (delete_older_than_days > new Date()) throw new Error("Date cannot be in the future.");
	
	const rows_removed: number = await db('history')
		.where('datetime', '<', delete_older_than_days)
		.del();
	
	return rows_removed;
}