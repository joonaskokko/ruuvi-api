import db from '../config/database.ts';
import { ensureTag, getTags } from '../models/tagModel.ts';
import { addDays, subDays, subHours } from 'date-fns';
import type { History, HistoryFilters, CurrentHistory, Sensor } from '../types/types.ts';

const SENSORS: string[] = [ 'temperature', 'humidity' ] as const;
const CURRENT_HISTORY_MIN_MAX_HOURS: number = Number(process.env.CURRENT_HISTORY_MIN_MAX_HOURS);
const UNREACHABLE_HOURS: number = Number(process.env.UNREACHABLE_HOURS);

/**
 * Utility function for checking sensor name validity.
 */

function isValidSensorName(sensor_name) {
	return SENSORS.includes(sensor_name);
}

/**
 * Utility function to check if tag is unreachable by last seen date time.
*/

function isUnreachable(tag) {
	return (subHours(new Date(), UNREACHABLE_HOURS) > tag.datetime);
}

/**
 * Save history entry to the database.
 */

export async function saveHistory({ tag_id, ruuvi_id, datetime, temperature, humidity, voltage, battery_low = false }: History): Promise<number> {
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
	
	// Remove decimals from sensor values to something sensible other than 1.18626.
	// TODO: A loop perhaps from SENSORS?
	temperature = Number(temperature.toFixed(2));
	humidity = Number(humidity.toFixed(2));
	
	// Insert into history. Use tag ID here instead of Ruuvi ID.
	const [ id ]: number[] = await db('history').insert({ tag_id, datetime, temperature, humidity, battery_low });

	return id;
}

/**
 * Get history.
 */

export async function getHistory({ date_start = null, date_end = null, tag_id = null, limit = null }: HistoryFilters = {}): Promise<History[]> {
	const history: History[] = await db('history')
		.select([ 'history.*', 'tag.name as tag_name' ])
		.leftJoin('tag', 'tag.id', 'tag_id')
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

export async function getCurrentHistory(): Promise<CurrentHistory[]> {
	let history: CurrentHistory[] = await db('history')
		.select(
			'history.tag_id',
			'tag.name as tag_name',
			'history.datetime',
			'history.temperature',
			'history.humidity',
			'history.battery_low'
		)
		.leftJoin('tag', 'history.tag_id', 'tag.id')
		.join(
			db('history')
				.select('tag_id')
				.max('datetime as max_datetime')
				.groupBy('tag_id')
			.as('latest'),
			function() {
				this.on('history.tag_id', '=', 'latest.tag_id')
						.andOn('history.datetime', '=', 'latest.max_datetime');
			}
		)
		.orderBy('tag_name', 'ASC');
	
	// Get maximum and minimum last 12 hours.
	// Also get trend of temperature and humidity.
	// Also tag unreachability.
	history = await Promise.all(history.map(async tag => {
		const tag_id: number = tag.tag_id;
		const date_end: Date = tag.datetime;
		const date_start: Date = subHours(date_end, CURRENT_HISTORY_MIN_MAX_HOURS);
		
		// Same for all function calls.
		const params = {
			tag_id,
			date_start,
			date_end
		};
		
		// Loop SENSORS.
		for (const sensor_type of SENSORS) {
			// Trust me bro, this will be a sensor.
			const sensor = {} as Sensor;

			sensor.current = tag[sensor_type];
			sensor.min = await getMinOrMaxValueByTag(
				{ ...params, type: 'min', sensor: sensor_type });
			sensor.max = await getMinOrMaxValueByTag(
				{ ...params, type: 'max', sensor: sensor_type });
			sensor.trend = await getSensorTrendByTag(
				{ ...params, sensor: sensor_type });

			// Assign sensor to the tag.
			tag[sensor_type] = sensor;
		}

		// Reachability.
		tag.unreachable = isUnreachable(tag);
		
		return tag;
	}));
	
	return history;
}

/**
 * Get single min or max value from a sensor by tag.
 */

export async function getMinOrMaxValueByTag({ type, tag_id, sensor, date_start, date_end }: {type: string; tag_id: number; sensor: string; date_start: Date; date_end: Date}): Promise<number> {
	if (!['min', 'max'].includes(type)) throw new Error("Type needs to be min or max.");
	if (!date_start || !date_end) throw new Error("Data range must contain start and end date time.");
	if (date_start > date_end) throw new Error("Start date cannot be before end date.");
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!sensor) throw new Error("Missing sensor name.");
	if (sensor && !isValidSensorName(sensor)) throw new Error("Not a valid sensor name: " + sensor);
	
	// TODO: Maybe refactor this to use getHistory instead?
	const { value }: { value: number } = await db('history')
		.modify(query => {
			// For clarity, these are separate rows.
			if (type === 'min') query.min({ value: sensor });
			if (type === 'max') query.max({ value: sensor });
		})
		.where('tag_id', tag_id)
		.whereBetween('datetime', [ date_start, date_end ])
		.first();
	
	return value;
}

/**
 * Get sensor value trend by tag. Returns 1 for increasing, -1 for decreasing or 0 for staying the same.
 */

export async function getSensorTrendByTag({ tag_id, sensor }: { tag_id: number; sensor: string }): Promise<number> {
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!sensor) throw new Error("Missing sensor name.");
	if (sensor && !isValidSensorName(sensor)) throw new Error("Not a valid sensor name: " + sensor);
		
	// Get history and limit it to 3.
	const sensor_values: History[] = await getHistory({ tag_id, limit: 3 })
	
	// If there isn't enough history, return 0 eg. staying the same.
	if (sensor_values.length < 3) {
		return 0;
	}
	
	// Flatten the array to only values without keys.
	// Round the values to avoid unnecessary fluctuation when using shorter time intervals.
	const [ first, second, third ]: number[] = sensor_values.map(row => Number(row[sensor].toFixed(1)));

	// Very simple trend comparison.
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