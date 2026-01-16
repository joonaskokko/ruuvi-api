import { test } from 'node:test';
import assert from 'node:assert';
import { subDays, addDays } from 'date-fns';
import db from '../../src/config/database.ts';
import * as aggregatedHistoryService from '../../src/services/aggregatedHistoryService.ts';
import * as historyService from '../../src/services/historyService.ts';
import * as tagService from '../../src/services/tagService.ts';

test('Aggregated History Service', async (t) => {
	t.beforeEach(async () => {
		await db('history_aggregated').del();
		await db('history').del();
		await db('tag').del();
	});

	t.afterEach(async () => {
		await db('history_aggregated').del();
		await db('history').del();
		await db('tag').del();
	});

	t.after(async () => {
		await db.destroy();
	});

	await t.test('aggregateHistory - throws error when date is not a Date object', async () => {
		try {
			await aggregatedHistoryService.aggregateHistory('2024-01-01' as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Invalid date provided.');
		}
	});

	await t.test('aggregateHistory - handles no tags gracefully', async () => {
		// getTags() returns an empty array, not null, so it doesn't throw an error
		// It will just create no aggregated entries
		await aggregatedHistoryService.aggregateHistory(new Date());

		const aggregated = await aggregatedHistoryService.getAggregatedHistory();
		assert.strictEqual(aggregated.length, 0);
	});

	await t.test('aggregateHistory - aggregates min/max values for all tags', async () => {
		const tag1 = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Tag 1' });
		const tag2 = await tagService.ensureTag({ ruuvi_id: '22:33:44:55:66:77', name: 'Tag 2' });
		const now = new Date();

		// Add history for tag 1
		await historyService.saveHistory({
			tag_id: tag1.id,
			datetime: subDays(now, 1),
			temperature: 15.0,
			humidity: 50.0
		});
		await historyService.saveHistory({
			tag_id: tag1.id,
			datetime: subDays(now, 1),
			temperature: 25.0,
			humidity: 60.0
		});

		// Add history for tag 2
		await historyService.saveHistory({
			tag_id: tag2.id,
			datetime: subDays(now, 1),
			temperature: 10.0,
			humidity: 40.0
		});

		await aggregatedHistoryService.aggregateHistory(subDays(now, 1));

		// Get raw aggregated data from database (not formatted)
		const rawAggregated = await db('history_aggregated').select('*');
		
		assert.ok(rawAggregated.length >= 2);
		assert.ok(rawAggregated.some(a => a.tag_id === tag1.id && a.temperature_min === 15 && a.temperature_max === 25));
		assert.ok(rawAggregated.some(a => a.tag_id === tag2.id && a.temperature_min === 10 && a.temperature_max === 10));
	});

	await t.test('saveAggregatedHistory - saves aggregated history', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		const id = await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag.id,
			date: subDays(now, 1),
			temperature_min: 15.0,
			temperature_max: 25.0,
			humidity_min: 50.0,
			humidity_max: 70.0
		});

		assert.ok(id > 0);

		const aggregated = await aggregatedHistoryService.getAggregatedHistory({ tag_id: tag.id });
		assert.strictEqual(aggregated.length, 1);
	});

	await t.test('saveAggregatedHistory - throws error when tag_id is missing', async () => {
		try {
			await aggregatedHistoryService.saveAggregatedHistory({
				date: new Date(),
				temperature_min: 15.0,
				temperature_max: 25.0
			} as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Missing tag ID.');
		}
	});

	await t.test('saveAggregatedHistory - throws error when date is invalid', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		try {
			await aggregatedHistoryService.saveAggregatedHistory({
				tag_id: tag.id,
				date: '2024-01-01' as any,
				temperature_min: 15.0,
				temperature_max: 25.0
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Invalid date provided.');
		}
	});

	await t.test('saveAggregatedHistory - throws error when date already aggregated', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const date = subDays(new Date(), 1);

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag.id,
			date,
			temperature_min: 15.0,
			temperature_max: 25.0
		});

		try {
			await aggregatedHistoryService.saveAggregatedHistory({
				tag_id: tag.id,
				date,
				temperature_min: 16.0,
				temperature_max: 26.0
			});
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Aggregated data already exists for this tag and date.');
		}
	});

	await t.test('getAggregatedHistory - returns all aggregated history', async () => {
		const tag1 = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const tag2 = await tagService.ensureTag({ ruuvi_id: '22:33:44:55:66:77' });

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag1.id,
			date: subDays(new Date(), 1),
			temperature_min: 15.0,
			temperature_max: 25.0
		});

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag2.id,
			date: subDays(new Date(), 1),
			temperature_min: 10.0,
			temperature_max: 20.0
		});

		const aggregated = await aggregatedHistoryService.getAggregatedHistory();
		assert.strictEqual(aggregated.length, 2);
	});

	await t.test('getAggregatedHistory - filters by tag_id', async () => {
		const tag1 = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const tag2 = await tagService.ensureTag({ ruuvi_id: '22:33:44:55:66:77' });

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag1.id,
			date: subDays(new Date(), 1),
			temperature_min: 15.0,
			temperature_max: 25.0
		});

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag2.id,
			date: subDays(new Date(), 1),
			temperature_min: 10.0,
			temperature_max: 20.0
		});

		const aggregated = await aggregatedHistoryService.getAggregatedHistory({ tag_id: tag1.id });
		assert.strictEqual(aggregated.length, 1);
		assert.strictEqual(aggregated[0].tag_id, tag1.id);
	});

	await t.test('getAggregatedHistory - filters by date', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const date1 = subDays(new Date(), 2);
		const date2 = subDays(new Date(), 1);

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag.id,
			date: date1,
			temperature_min: 15.0,
			temperature_max: 25.0
		});

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag.id,
			date: date2,
			temperature_min: 10.0,
			temperature_max: 20.0
		});

		const aggregated = await aggregatedHistoryService.getAggregatedHistory({ date: date1 });
		assert.ok(aggregated.length >= 1);
		assert.ok(aggregated.every(a => a.date.includes(date1.getFullYear().toString())));
	});

	await t.test('getAggregatedHistory - respects limit', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		for (let i = 0; i < 5; i++) {
			await aggregatedHistoryService.saveAggregatedHistory({
				tag_id: tag.id,
				date: subDays(new Date(), i),
				temperature_min: 15.0,
				temperature_max: 25.0
			});
		}

		const aggregated = await aggregatedHistoryService.getAggregatedHistory({ limit: 2 });
		assert.strictEqual(aggregated.length, 2);
	});

	await t.test('isDateAggregated - returns true when date is aggregated', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const date = subDays(new Date(), 1);

		await aggregatedHistoryService.saveAggregatedHistory({
			tag_id: tag.id,
			date,
			temperature_min: 15.0,
			temperature_max: 25.0
		});

		const isAggregated = await aggregatedHistoryService.isDateAggregated({ tag_id: tag.id, date });
		assert.strictEqual(isAggregated, true);
	});

	await t.test('isDateAggregated - returns false when date is not aggregated', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const date = subDays(new Date(), 1);

		const isAggregated = await aggregatedHistoryService.isDateAggregated({ tag_id: tag.id, date });
		assert.strictEqual(isAggregated, false);
	});

	await t.test('isDateAggregated - returns false when no tag_id specified', async () => {
		const date = subDays(new Date(), 1);

		const isAggregated = await aggregatedHistoryService.isDateAggregated({ date });
		assert.strictEqual(isAggregated, false);
	});
});
