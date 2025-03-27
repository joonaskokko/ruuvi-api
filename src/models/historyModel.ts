import db from '../config/database.ts';
import { ensureTag } from '../models/tagModel.ts';

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
export async function getMaximumValueByTag({ tag_id, metric, date_start, date_end }): number {
	if (!date_start || !date_end) throw new Error("Data range must contain start and end date time.");
	if (!tag_id) throw new Error("Missing tag ID.");
	if (!metric) throw new Error("Missing metric name.");
	
	const { value }: number = await db('history')
		.max({ value: metric })
		.where('tag_id', tag_id)
		.whereBetween('datetime', [ date_start, date_end ])
		.first();
	
	return value;
}

export async function cleanOldHistory(days: number): number {
	if (!days || days < 0) throw new Error("Invalid amount of days.");
	
	let deleteOlder = new Date();
	deleteOlder.setDate(deleteOlder.getDate() - days);
	
	const rowsRemoved = await db('history')
		where('datetime', '<', deleteOlder)
		.del();
	
	return rowsRemoved;
}

export async function aggregateHistory(date: Date) {
	if (!(date instanceof Date)) throw new Error("Invalid date.");
	
	const date_start = new Date(date);
	date_start.setHours(0, 0, 0, 0);
	
	const date_end = new Date(date);
	date_end.setDate(date_end.getDate() + 1);
	date_end.setHours(0, 0, 0, 0);
	
	console.log(date_start); console.log(date_end);
	
	// Fetch the history data for the specific date
	const history = await getHistory({ date_start, date_end });

	// Initialize an object to store the aggregated results for each tag
	const aggregatedResults = {};

	// Group data by tag_id
	history.forEach(row => {
		const { tag_id, temperature, humidity, date: rowDate } = row;
		
		// Initialize tag_id entry if not exists
		if (!aggregatedResults[tag_id]) {
			aggregatedResults[tag_id] = {
				tag_id,
				date: date,
				temperatures: [],
				humidities: []
			};
		}

		// Add temperature and humidity values to arrays
		aggregatedResults[tag_id].temperatures.push(temperature);
		aggregatedResults[tag_id].humidities.push(humidity);
	});

	// Calculate min/max values using Math.min() and Math.max()
	const resultsArray = Object.values(aggregatedResults).map(tag => {
		const temperature_min = Math.min(...tag.temperatures);
		const temperature_max = Math.max(...tag.temperatures);
		const humidity_min = Math.min(...tag.humidities);
		const humidity_max = Math.max(...tag.humidities);

		// Return the aggregated result for this tag
		return {
			tag_id: tag.tag_id,
			date: tag.date,
			temperature_min,
			temperature_max,
			humidity_min,
			humidity_max
		};
	});

	// Save the aggregated results into the `history_longterm` table
	await db('history_longterm').insert(resultsArray);

	return resultsArray;
}