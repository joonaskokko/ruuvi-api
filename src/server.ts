import express from 'express';
import { saveHistory, getHistory, getCurrentHistory } from './models/historyModel.ts';

import * as dotenv from 'dotenv';
dotenv.config();

const app: object = express();
const PORT: number = process.env.SERVER_PORT || 8080;

app.use(express.json());

// POST /history - Save history data
app.post('/history', async (req, res, next) => {
	try {
		const { format } = req.query;
		
		let historyEntries = [];

		switch (format) {
			// Own, custom format that matches the tag model.
			case 'ruuvi-api': {
				const { ruuvi_id, datetime, temperature, humidity, battery_low } = req.body;

				if (!ruuvi_id || !datetime || !temperature || !humidity || !battery_low) {
					return res.status(400).json({ error: 'Missing required fields' });
				}
				historyEntries = [{ ruuvi_id, datetime, temperature, humidity, battery_low }];
			}

			default: {
				const tags = req.body?.data?.tags;
				
				// This is Ruuvi GW's test call in the wizard.
				if (typeof tags === 'object' && Object.keys(tags).length === 0) {
					return res.status(200).json({ message: 'Connection working without tag data.'});
				}
				else if (!tags || typeof tags !== 'object') {
					return res.status(400).json({ error: 'Invalid ruuvi-gateway payload' });
				}
				
				historyEntries = Object.values(tags).map(({ id, timestamp, temperature, humidity, voltage }) => ({
					ruuvi_id: id,
					datetime: new Date(timestamp * 1000), // TODO: datetime must be a JS Date. This needs better handling.
					temperature: temperature,
					humidity: humidity,
					voltage: voltage
				}));
				break;
			}
		}

		if (!historyEntries.length) {
			return res.status(400).json({ error: 'No valid history entries' });
		}

		// Save each history entry
		await Promise.all(historyEntries.map(entry => saveHistory(entry)));

		res.status(201).json({ message: 'Data inserted successfully' });
	}
	catch (error) {
		next(error);
	}
});

// GET /history - Fetch history data
app.get('/history', async (req, res, next) => {
	try {
		const records = await getHistory();
		res.json(records);
	}
	catch (error) {
		next(error);
	}
});

// GET /current - Fetch latest history data
app.get('/current', async (req, res, next) => {
	try {
		const records = await getCurrentHistory();
		res.json(records);
	}
	catch (error) {
		next(error);
	}
});

app.use((err, req, res, next) => {
	console.error(err);
	res.status(500);
	res.json({ error: "Something went wrong." });
});

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});