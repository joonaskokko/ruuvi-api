export interface History {
	ruuvi_id?: string;
	tag_id?: number;
	datetime: Date;
	temperature?: number;
	humidity?: number;
	voltage?: number;
	battery_low?: boolean;
}

export interface HistoryFilters {
	date_start?: Date | null;
	date_end?: Date | null;
	tag_id?: number | null;
	limit?: number | null;
}
export interface CurrentHistory {
	ruuvi_id?: string;
	tag_id?: number;
	datetime: Date;
	temperature?: Sensor;
	humidity?: Sensor;
	battery_low?: boolean;
	unreachable?: boolean;
}

// FIXME: I know this is wrong but this interface includes both flat DB row and formatted object (with child sensors).
// FIXME: Sometimes the date is an object and sometimes a formatted Y-m-d string due to displaying it in the API.
export interface AggregatedHistory {
	tag_id: number,
	date: Date|string,
	temperature?: Sensor,
	temperature_min?: number,
	temperature_max?: number,
	humidity?: Sensor,
	humidity_min?: number,
	humidity_max?: number
}

export interface Sensor {
	current?: number,
	min: number,
	max: number,
	trend?: number
}

export interface Tag {
	id?: number;
	ruuvi_id?: string;
	name?: string;
}