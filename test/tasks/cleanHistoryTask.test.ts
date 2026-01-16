import { test } from 'node:test';
import assert from 'node:assert';
import { subDays } from 'date-fns';
import db from '../../src/config/database.ts';
import * as cleanHistoryTask from '../../src/tasks/cleanHistoryTask.ts';
import * as historyService from '../../src/services/historyService.ts';
import * as tagService from '../../src/services/tagService.ts';

test('Clean History Task', async (t) => {
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

	await t.test('run - returns true on success', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 15),
			temperature: 20.0,
			humidity: 55.0
		});

		const result = await cleanHistoryTask.run();

		assert.strictEqual(result, true);
	});

	await t.test('run - removes old entries (older than 7 days)', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Add old entry
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 15),
			temperature: 15.0,
			humidity: 50.0
		});

		// Add recent entry
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 1),
			temperature: 25.0,
			humidity: 60.0
		});

		const result = await cleanHistoryTask.run();

		assert.strictEqual(result, true);

		const history = await historyService.getHistory({ tag_id: tag.id });
		assert.strictEqual(history.length, 1);
		assert.ok(history[0].datetime > subDays(now, 7));
	});

	await t.test('run - keeps recent entries', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66' });
		const now = new Date();

		// Add recent entries
		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: now,
			temperature: 25.0,
			humidity: 60.0
		});

		await historyService.saveHistory({
			tag_id: tag.id,
			datetime: subDays(now, 3),
			temperature: 20.0,
			humidity: 55.0
		});

		await cleanHistoryTask.run();

		const history = await historyService.getHistory({ tag_id: tag.id });
		assert.strictEqual(history.length, 2);
	});

	await t.test('run - handles empty history gracefully', async () => {
		const result = await cleanHistoryTask.run();

		assert.strictEqual(result, true);
	});
});
