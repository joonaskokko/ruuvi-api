import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import type { HistoryFilters } from './types/types.ts';
import { saveHistory, getHistory, getCurrentHistory } from './services/historyService.ts';
import { getAggregatedHistory } from './services/aggregatedHistoryService.ts';

const { SERVER_PORT, SERVER_SOCKET } = process.env;

const app: Express = express();

app.use(express.json());

// POST /history - Save history data
app.post('/history', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { tags } = req.body?.data;

		// This is Ruuvi GW's test call in the wizard.
		if (typeof tags === 'object' && Object.keys(tags).length === 0) {
			res.status(200).json({ message: 'Connection working without tag data.'});
			return;
		}
		else if (!tags || typeof tags !== 'object') {
			res.status(400).json({ error: 'Invalid ruuvi-gateway payload' });
			return;
		}

		// Tag data is a single object with Ruuvi ID as key.
		// Need to loop them with Object.values().
		const historyEntries = Object.values(tags)
			.map(({ id, timestamp, temperature, humidity, voltage }) => ({
				ruuvi_id: id,
				datetime: new Date(timestamp * 1000),
				temperature: temperature,
				humidity: humidity,
				voltage: voltage
		}));

		if (!historyEntries.length) {
			res.status(400).json({ error: 'No valid history entries' });
			return;
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
app.get('/history', async (req: Request, res: Response, next: NextFunction) => {
	const filters: HistoryFilters = {
		tag_id: req.query.tag_id ? Number(req.query.tag_id) : null,
		date_start: req.query.date_start ? new Date(req.query.date_start as string) : null,
		date_end: req.query.date_end ? new Date(req.query.date_end as string) : null,
		limit: req.query.limit ? Number(req.query.limit) : null
	};

	try {
		const records = await getHistory(filters);
		res.json(records);
	}
	catch (error) {
		next(error);
	}
});

// GET /current - Fetch latest history data
app.get('/current', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const records = await getCurrentHistory();
		res.json(records);
	}
	catch (error) {
		next(error);
	}
});

// GET /history_aggregated - Fetch all aggregated history.
app.get('/history_aggregated', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { tag, date } = req.query;
		const records = await getAggregatedHistory(
		{
			tag_id: tag ?? null,
			date: date ?? null
		});

		res.json(records);
	}
	catch (error) {
		next(error);
	}
});

app.use((err, req: Request, res: Response, next: NextFunction) => {
	console.error(err);
	res.status(500);
	res.json({ error: "Something went wrong." });
});

// TCP/IP port listening.
if (SERVER_PORT) {
  app.listen(SERVER_PORT, () => {
		console.log(`Server running on port ${SERVER_PORT}`);
  });
}

// Socket listening.
if (SERVER_SOCKET) {
  app.listen(SERVER_SOCKET, () => {
		console.log(`Server running in socket ${SERVER_SOCKET}`);
  });
}

if (!SERVER_PORT && !SERVER_SOCKET) {
	console.log("No server TCP/IP port or socket set. Exiting.");
	process.exit(0);
}