// Create tables if they don't exist'
export async function installSchema(db: object): void {
	console.log("Ensuring database schema...");

	if (!(await db.schema.hasTable('tag'))) {
		console.log("Creating tag table");
		await db.schema.createTable('tag', (table) => {
			table.increments('id').unsigned().primary();
			table.string('ruuvi_id', 32).nullable();
			table.string('name', 64).nullable();
		});
	}

	if (!(await db.schema.hasTable('history'))) {
		console.log("Creating history table");
		await db.schema.createTable('history', (table) => {
			table.increments('id').unsigned().primary();
			table.integer('tag_id').unsigned().nullable().index();
			table.dateTime('datetime').nullable();
			table.float('temperature').nullable();
			table.float('humidity').nullable();
			table.boolean('battery_low').nullable();

			table.foreign('tag_id').references('id').inTable('tag').onDelete('NO ACTION').onUpdate('NO ACTION');
		});
	}

	if (!(await db.schema.hasTable('history_longterm'))) {
		console.log("Creating history_longterm table");
		await db.schema.createTable('history_longterm', (table) => {
			table.increments('id').unsigned().primary();
			table.integer('tag_id').unsigned().nullable().index();
			table.date('date').nullable();
			table.float('temperature_min').nullable();
			table.float('temperature_max').nullable();
			table.float('temperature_day_average').nullable();
			table.float('temperature_night_average').nullable();
			table.float('humidity_min').nullable();
			table.float('humidity_max').nullable();
			table.float('humidity_day_average').nullable();
			table.float('humidity_night_average').nullable();

			table.foreign('tag_id').references('id').inTable('tag').onDelete('NO ACTION').onUpdate('NO ACTION');
		});
	}

	console.log("Database schema ensured.");
}