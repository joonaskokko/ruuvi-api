export interface History {
	tag_id?: number;
	datetime: Date;
	temperature?: number;
	humidity?: number;
	ruuvi_id?: string;
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
	tag_id: number;
	datetime: Date;
	tag_name?: string;
	temperature?: Sensor;
	humidity?: Sensor;
	battery_low?: boolean;
	unreachable: boolean;
}

// DB row format with raw min/max values
export interface AggregatedHistoryRow {
	tag_id: number;
	date: Date;
	temperature_min?: number;
	temperature_max?: number;
	humidity_min?: number;
	humidity_max?: number;
}

// Formatted response with Sensor objects (date can be string after API formatting)
export interface AggregatedHistory {
	tag_id: number;
	date: Date | string;
	temperature_min?: number;
	temperature_max?: number;
	temperature?: AggregatedSensor;
	humidity_min?: number;
	humidity_max?: number;
	humidity?: AggregatedSensor;
}

export interface Sensor {
	current: number;
	min: number;
	max: number;
	trend?: number;
}

export interface AggregatedSensor {
	min: number;
	max: number;
}

export interface Tag {
	id?: number;
	ruuvi_id?: string;
	name?: string;
}