import knex from 'knex';
import installSchema from './database.schema.ts';
import { config as loadEnv } from 'dotenv';

loadEnv();

const {
	DB_HOST,
	DB_USER,
	DB_PASSWORD,
	DB_NAME,
	NODE_ENV
} = process.env;

const config = {
	client: 'mysql2',
	connection: {
		host: DB_HOST,
		user: DB_USER,
		password: DB_PASSWORD,
		database: DB_NAME,
	},
};

if (NODE_ENV === 'test') {
	config.client = 'sqlite3';
	config.connection = { filename: ':memory:' };
	config.useNullAsDefault = true;
}

// Some fields need post processing. This will go through all rows that are coming from the database.
config.postProcessResponse = (result) => {
	const normalize = (row) => {
		if (typeof row !== 'object' || row === null) return row;

		// Modify datetime to be a date. This is because sqlite stores it as an integer timestamp.
		if ('datetime' in row && row.datetime !== null) {
			row.datetime = new Date(row.datetime);
		}
		
		if ('date' in row && row.date !== null) {
			row.date = new Date(row.date);
		}
		
		// Convert battery low from tinyint to boolean because MySQL ynnyms.
		if ('battery_low' in row && row.battery_low !== null) {
			row.battery_low = Boolean(row.battery_low);
		}
	
		return row;
	};

	return Array.isArray(result) ? result.map(normalize) : normalize(result);
};

const db = knex(config);


// Install schema.
await installSchema(db);

export default db;
