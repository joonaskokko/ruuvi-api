import * as historyCleaner from '../src/tasks/cleanHistoryTask.ts';
import * as historyAggregator from '../src/tasks/aggregateHistoryTask.ts';
import { scheduleJob, RecurrenceRule } from 'node-schedule';

const midnight = new RecurrenceRule();
midnight.hour = 0;
midnight.minute = 0;

scheduleJob(midnight, async () => {
	try {
		await historyAggregator.run();
	}
	catch (error) {
		console.error('Error in history aggregator: ' + error);
	}
});

scheduleJob(midnight, async () => {
	try {
		await historyCleaner.run();
	}
	catch (error) {
		console.error('Error in history cleaner: ' + error);
	}
});