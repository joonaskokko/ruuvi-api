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
	if ((date_start && !date_end) || (!date_start && date_end)) throw new Error("Data range must contain start and end date time.");
	
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

export async function getCurrentHistory(): Promise<object> {
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
export async function getMaximumValueByTag({ tag_id, metric, date_start, date_end }) {
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