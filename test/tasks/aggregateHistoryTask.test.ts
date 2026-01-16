import { test } from 'node:test';
import assert from 'node:assert';
import { subDays } from 'date-fns';
import db from '../../src/config/database.ts';
import * as aggregateHistoryTask from '../../src/tasks/aggregateHistoryTask.ts';
import * as aggregatedHistoryService from '../../src/services/aggregatedHistoryService.ts';
import * as historyService from '../../src/services/historyService.ts';
import * as tagService from '../../src/services/tagService.ts';

test('Aggregate History Task', async (t) => {
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

	await t.test('run - returns true on success', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(new Date(), 1),
			temperature: 20.0,
			humidity: 55.0
		});

		const result = await aggregateHistoryTask.run();

		assert.strictEqual(result, true);
	});

	await t.test('run - aggregates all complete days with history', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Add history for two different days
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 2),
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 20.0,
			humidity: 55.0
		});

		await aggregateHistoryTask.run();

		const aggregated = await aggregatedHistoryService.getAggregatedHistory();
		assert.ok(aggregated.length >= 2);
	});

	await t.test('run - skips dates that are already aggregated', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const date = subDays(new Date(), 1);

		// Add history
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: date,
			temperature: 20.0,
			humidity: 55.0
		});

		// Aggregate once
		await aggregateHistoryTask.run();

		// Get initial aggregated count
		const initialAggregated = await aggregatedHistoryService.getAggregatedHistory();
		const initialCount = initialAggregated.length;

		// Run aggregation again - should not create duplicates
		const result = await aggregateHistoryTask.run();

		assert.strictEqual(result, true);

		const finalAggregated = await aggregatedHistoryService.getAggregatedHistory();
		assert.strictEqual(finalAggregated.length, initialCount);
	});

	await t.test('run - handles multiple tags with history', async () => {
		const tag1 = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Tag 1' });
		const tag2 = await tagService.ensureTag({ ruuvi_id: '22:33:44:55:66:77', name: 'Tag 2' });
		const date = subDays(new Date(), 1);

		// Add history for both tags
		await historyService.saveHistory({
			tag_id: tag1.id,
			datetime: date,
			temperature: 15.0,
			humidity: 50.0
		});

		await historyService.saveHistory({
			tag_id: tag2.id,
			datetime: date,
			temperature: 25.0,
			humidity: 60.0
		});

		await aggregateHistoryTask.run();

		const aggregated = await aggregatedHistoryService.getAggregatedHistory();
		assert.ok(aggregated.length >= 2);
		assert.ok(aggregated.some(a => a.tag_id === tag1.id));
		assert.ok(aggregated.some(a => a.tag_id === tag2.id));
	});

	await t.test('run - handles empty history gracefully', async () => {
		const result = await aggregateHistoryTask.run();

		assert.strictEqual(result, true);
	});

	await t.test('run - only aggregates complete days (before today)', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Add history for today (should not be aggregated yet)
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 20.0,
			humidity: 55.0
		});

		await aggregateHistoryTask.run();

		// Today's date should not be aggregated (it's not a complete day)
		const aggregatedToday = await aggregatedHistoryService.isDateAggregated({
			date: now
		});

		assert.strictEqual(aggregatedToday, false);
	});
});
