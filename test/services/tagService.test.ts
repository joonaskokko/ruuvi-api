import { test } from 'node:test';
import assert from 'node:assert';
import db from '../../src/config/database.ts';
import * as tagService from '../../src/services/tagService.ts';

test('Tag Service', async (t) => {
	t.beforeEach(async () => {
		await db('tag').del();
	});

	t.afterEach(async () => {
		await db('tag').del();
	});

	t.after(async () => {
		await db.destroy();
	});

	await t.test('getTags - returns all tags', async () => {
		await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Tag 1' });
		await tagService.insertTag({ ruuvi_id: '22:33:44:55:66:77', name: 'Tag 2' });

		const tags = await tagService.getTags();

		assert.strictEqual(tags.length, 2);
		assert.ok(tags.some(t => t.ruuvi_id === '11:22:33:44:55:66'));
		assert.ok(tags.some(t => t.ruuvi_id === '22:33:44:55:66:77'));
	});

	await t.test('getTags - returns empty array when no tags', async () => {
		const tags = await tagService.getTags();

		assert.strictEqual(tags.length, 0);
		assert.ok(Array.isArray(tags));
	});

	await t.test('getTagById - returns tag by id', async () => {
		const insertedId = await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Test Tag' });

		const tag = await tagService.getTagById(insertedId);

		assert.strictEqual(tag.id, insertedId);
		assert.strictEqual(tag.ruuvi_id, '11:22:33:44:55:66');
		assert.strictEqual(tag.name, 'Test Tag');
	});

	await t.test('getTagById - throws error when id is not provided', async () => {
		try {
			await tagService.getTagById(null as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Illegal ID passed.');
		}
	});

	await t.test('getTagById - throws error when id is 0', async () => {
		try {
			await tagService.getTagById(0);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Illegal ID passed.');
		}
	});

	await t.test('getTagById - returns undefined when tag not found', async () => {
		const tag = await tagService.getTagById(9999);

		assert.strictEqual(tag, undefined);
	});

	await t.test('getTagByRuuviId - returns tag by ruuvi id', async () => {
		const insertedId = await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Test Tag' });

		const tag = await tagService.getTagByRuuviId('11:22:33:44:55:66');

		assert.strictEqual(tag.id, insertedId);
		assert.strictEqual(tag.ruuvi_id, '11:22:33:44:55:66');
	});

	await t.test('getTagByRuuviId - throws error when ruuvi_id is not provided', async () => {
		try {
			await tagService.getTagByRuuviId('' as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Illegal Ruuvi ID passed.');
		}
	});

	await t.test('getTagByRuuviId - throws error when ruuvi_id is null', async () => {
		try {
			await tagService.getTagByRuuviId(null as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Illegal Ruuvi ID passed.');
		}
	});

	await t.test('getTagByRuuviId - returns undefined when tag not found', async () => {
		const tag = await tagService.getTagByRuuviId('ff:ff:ff:ff:ff:ff');

		assert.strictEqual(tag, undefined);
	});

	await t.test('insertTag - creates a new tag', async () => {
		const id = await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66', name: 'New Tag' });

		assert.strictEqual(typeof id, 'number');
		assert.ok(id > 0);

		const tag = await tagService.getTagById(id);
		assert.strictEqual(tag.ruuvi_id, '11:22:33:44:55:66');
		assert.strictEqual(tag.name, 'New Tag');
	});

	await t.test('insertTag - throws error when ruuvi_id is missing', async () => {
		try {
			await tagService.insertTag({ name: 'Tag without ID' } as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Missing Ruuvi ID.');
		}
	});

	await t.test('insertTag - allows empty name', async () => {
		const id = await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66' });

		const tag = await tagService.getTagById(id);
		assert.strictEqual(tag.name, null);
	});

	await t.test('ensureTag - creates tag if not exists', async () => {
		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'New Tag' });

		assert.ok(tag.id);
		assert.strictEqual(tag.ruuvi_id, '11:22:33:44:55:66');
		assert.strictEqual(tag.name, 'New Tag');
	});

	await t.test('ensureTag - returns existing tag if already exists', async () => {
		const insertedId = await tagService.insertTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Existing Tag' });

		const tag = await tagService.ensureTag({ ruuvi_id: '11:22:33:44:55:66', name: 'Different Name' });

		assert.strictEqual(tag.id, insertedId);
		assert.strictEqual(tag.name, 'Existing Tag');
	});

	await t.test('ensureTag - throws error when ruuvi_id is missing', async () => {
		try {
			await tagService.ensureTag({ name: 'No ID' } as any);
			assert.fail('Should have thrown an error');
		} catch (error) {
			assert.strictEqual(error.message, 'Missing Ruuvi ID.');
		}
	});
});
