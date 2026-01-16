import { test } from 'node:test';
import assert from 'node:assert';
import { subDays, subHours, addDays } from 'date-fns';
import db from '../../src/config/database.ts';
import * as historyService from '../../src/services/historyService.ts';
import * as tagService from '../../src/services/tagService.ts';

test('History Service', async (t) => {
	t.beforeEach(async () => {
		await db('history').del();
		await db('tag').del();
	});

	t.afterEach(async () => {
		await db('history').del();
		await db('tag').del();
	});

	t.after(async () => {
		await db.destroy();
	});

	await t.test('saveHistory - saves history with tag_id', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Test Tag' });
		const now = new Date();

		const id = await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.5,
			humidity: 55.3,
			battery_low: false
		});

		assert.strictEqual(typeof id, 'number');
		assert.ok(id > 0);
	});

	await t.test('saveHistory - throws error when missing tag_id and ruuvi_id', async () => {
		try {
			await historyService.saveHistory({
				datetime: new Date(),
				temperature: 20.5,
				humidity: 55.3,
				battery_low: false
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Need either tag ID or Ruuvi ID.");
		}
	});

	await t.test('saveHistory - throws error when datetime is not a Date object', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		try {
			await historyService.saveHistory({
				tag_id: tag.id,
				datetime: '2024-01-01' as any,
				temperature: 20.5,
				humidity: 55.3,
				battery_low: false
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Datetime isn't a date object.");
		}
	});

	await t.test('saveHistory - rounds temperature and humidity to 2 decimals', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.123456,
			humidity: 55.987654,
			battery_low: false
		});

		const history = await historyService.getHistory({ tag_id: tag.id });
		assert.strictEqual(history[0].temperature, 20.12);
		assert.strictEqual(history[0].humidity, 55.99);
	});

	await t.test('saveHistory - sets battery_low based on voltage', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		const lowBatteryVoltage = Number(process.env.LOW_BATTERY_VOLTAGE) || 2.5;

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.0,
			humidity: 55.0,
			voltage: lowBatteryVoltage + 0.1,
			battery_low: true
		});

		let history = await historyService.getHistory({ tag_id: tag.id });
		assert.strictEqual(history[0].battery_low, false);

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 20.0,
			humidity: 55.0,
			voltage: lowBatteryVoltage - 0.1,
			battery_low: false
		});

		history = await historyService.getHistory({ tag_id: tag.id });
		const lowVoltageEntry = history.find(h => h.datetime < now);
		assert.strictEqual(lowVoltageEntry?.battery_low, true);
	});

	await t.test('getHistory - returns all history entries', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Test Tag' });

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(new Date(), 2),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(new Date(), 1),
			temperature: 20.0,
			humidity: 55.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: new Date(),
			temperature: 25.0,
			humidity: 60.0
		});

		const history = await historyService.getHistory();
		assert.ok(history.length >= 3);
	});

	await t.test('getHistory - filters by tag_id', async () => {
		const tag1 = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Tag 1' });
		const tag2 = await tagService.ensureTag({ ruuvi_id: '22:33:44:55:66:77', name: 'Tag 2' });

		await historyService.saveHistory({
			tag_id: tag1.id,
			datetime: new Date(),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag2.id,
			datetime: new Date(),
			temperature: 25.0,
			humidity: 60.0
		});

		const history = await historyService.getHistory({ tag_id: tag1.id });
		assert.ok(history.every(h => h.tag_id === tag1.id));
		assert.strictEqual(history.length, 1);
	});

	await t.test('getHistory - filters by date range', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 3),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 20.0,
			humidity: 55.0
		});

		const history = await historyService.getHistory({
			date_start: subDays(now, 2),
			date_end: now
		});

		assert.ok(history.every(h => h.datetime > subDays(now, 2) && h.datetime < now));
	});

	await t.test('getHistory - respects limit', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		for (let i = 0; i < 5; i++) {
			await historyService.saveHistory({
				tag_id: tag.id,
				datetime: subDays(now, i),
				temperature: 20.0,
				humidity: 55.0
			});
		}

		const history = await historyService.getHistory({ tag_id: tag.id, limit: 2 });
		assert.strictEqual(history.length, 2);
	});

	await t.test('getMinOrMaxValueByTag - throws error for invalid type', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		try {
			await historyService.getMinOrMaxValueByTag({
				type: 'invalid',
				tag_id: tag.id,
				sensor: 'temperature',
				date_start: subDays(now, 1),
				date_end: now
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Type needs to be min or max.");
		}
	});

	await t.test('getMinOrMaxValueByTag - throws error for missing date range', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		try {
			await historyService.getMinOrMaxValueByTag({
				type: 'min',
				tag_id: tag.id,
				sensor: 'temperature',
				date_start: null as any,
				date_end: null as any
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Data range must contain start and end date time.");
		}
	});

	await t.test('getMinOrMaxValueByTag - throws error when start date is after end date', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		try {
			await historyService.getMinOrMaxValueByTag({
				type: 'min',
				tag_id: tag.id,
				sensor: 'temperature',
				date_start: now,
				date_end: subDays(now, 1)
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Start date cannot be before end date.");
		}
	});

	await t.test('getMinOrMaxValueByTag - throws error for invalid sensor name', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		try {
			await historyService.getMinOrMaxValueByTag({
				type: 'min',
				tag_id: tag.id,
				sensor: 'invalid_sensor',
				date_start: subDays(now, 1),
				date_end: now
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.ok(error.message.includes('Not a valid sensor name'));
		}
	});

	await t.test('getMinOrMaxValueByTag - returns max temperature', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 2),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 25.0,
			humidity: 55.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.0,
			humidity: 60.0
		});

		const max = await historyService.getMinOrMaxValueByTag({
			type: 'max',
			tag_id: tag.id,
			sensor: 'temperature',
			date_start: subDays(now, 3),
			date_end: addDays(now, 1)
		});

		assert.strictEqual(max, 25);
	});

	await t.test('getMinOrMaxValueByTag - returns min humidity', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 2),
			temperature: 15.0,
			humidity: 60.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 25.0,
			humidity: 45.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.0,
			humidity: 50.0
		});

		const min = await historyService.getMinOrMaxValueByTag({
			type: 'min',
			tag_id: tag.id,
			sensor: 'humidity',
			date_start: subDays(now, 3),
			date_end: addDays(now, 1)
		});

		assert.strictEqual(min, 45);
	});

	await t.test('getSensorTrendByTag - throws error for missing tag_id', async () => {
		try {
			await historyService.getSensorTrendByTag({
				tag_id: null as any,
				sensor: 'temperature'
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Missing tag ID.");
		}
	});

	await t.test('getSensorTrendByTag - throws error for missing sensor name', async () => {
		try {
			await historyService.getSensorTrendByTag({
				tag_id: 1,
				sensor: '' as any
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Missing sensor name.");
		}
	});

	await t.test('getSensorTrendByTag - throws error for invalid sensor name', async () => {
		try {
			await historyService.getSensorTrendByTag({
				tag_id: 1,
				sensor: 'invalid'
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.ok(error.message.includes('Not a valid sensor name'));
		}
	});

	await t.test('getSensorTrendByTag - returns 0 when insufficient history', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: new Date(),
			temperature: 20.0,
			humidity: 55.0
		});

		const trend = await historyService.getSensorTrendByTag({
			tag_id: tag.id,
			sensor: 'temperature'
		});

		assert.strictEqual(trend, 0);
	});

	await t.test('getSensorTrendByTag - returns 1 for increasing trend', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Create 6 entries. History is DESC ordered (newest first).
		// Function takes positions [0, 2, 4] (first, second, third).
		// For increasing trend: first > second > third
		const temps = [25, 20, 20, 15, 15, 10]; // newest to oldest
		for (let i = 0; i < 6; i++) {
			await historyService.saveHistory({
				tag_id: tag.id,
				datetime: subDays(now, i),
				temperature: temps[i],
				humidity: 55.0
			});
		}

		const trend = await historyService.getSensorTrendByTag({
			tag_id: tag.id,
			sensor: 'temperature'
		});

		assert.strictEqual(trend, 1);
	});

	await t.test('getSensorTrendByTag - returns -1 for decreasing trend', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Create 6 entries for decreasing trend: first < second < third
		const temps = [10, 15, 15, 20, 20, 25]; // newest to oldest
		for (let i = 0; i < 6; i++) {
			await historyService.saveHistory({
				tag_id: tag.id,
				datetime: subDays(now, i),
				temperature: temps[i],
				humidity: 55.0
			});
		}

		const trend = await historyService.getSensorTrendByTag({
			tag_id: tag.id,
			sensor: 'temperature'
		});

		assert.strictEqual(trend, -1);
	});

	await t.test('cleanOldHistory - throws error when date is not a Date object', async () => {
		try {
			await historyService.cleanOldHistory('2024-01-01' as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Clean older than date isn't a date object.");
		}
	});

	await t.test('cleanOldHistory - throws error when date is in the future', async () => {
		const futureDate = addDays(new Date(), 1);

		try {
			await historyService.cleanOldHistory(futureDate);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, "Date cannot be in the future.");
		}
	});

	await t.test('cleanOldHistory - removes old entries', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 5),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 25.0,
			humidity: 60.0
		});

		const rowsRemoved = await historyService.cleanOldHistory(subDays(now, 2));

		assert.strictEqual(rowsRemoved, 1);

		const remainingHistory = await historyService.getHistory({ tag_id: tag.id });
		assert.strictEqual(remainingHistory.length, 1);
		assert.ok(remainingHistory[0].datetime > subDays(now, 2));
	});
});
