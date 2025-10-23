import db from '../config/database.ts';
import type { Tag } from '../types/types.ts';

/**
 * Get all tags.
 */

export async function getTags(): Promise<Tag[]> {
	const tags: object[] = await db('tag');
	
	return tags;
}

/**
 * Get single tag by tag ID.
 */

export async function getTagById(id: number): Promise<Tag> {
	if (!id) throw new Error("Illegal ID passed.");
	
	const tag: object = await db('tag').where('id', id).first();
	
	return tag;
}

/**
 * Get single tag by Ruuvi ID (MAC).
 */

export async function getTagByRuuviId(ruuvi_id: string): Promise<Tag> {
	if (!ruuvi_id) throw new Error("Illegal Ruuvi ID passed.");
	
	const tag: object = await db('tag').where('ruuvi_id', ruuvi_id).first();
	
	return tag;
}

/**
 * Insert new tag.
 */

export async function insertTag({ ruuvi_id, name }: Tag): Promise<number> {
	if (!ruuvi_id) throw new Error("Missing Ruuvi ID.");
	
	const [ id ]: number[] = await db('tag').insert({ ruuvi_id, name });
	
	return id;
}

/**
 * Check that we have given tag and create it if not. Returns the tag back.
 */

export async function ensureTag({ ruuvi_id, name }: Tag): Promise<Tag> {
	if (!ruuvi_id) throw new Error("Missing Ruuvi ID.");
	
	let tag: object = await getTagByRuuviId(ruuvi_id);
	
	// Check if the tag already exists. If not, create it.
	if (!tag) {
		// Create and load the tag.
		const tag_id: number = await insertTag({ ruuvi_id, name });
		tag = await getTagById(tag_id);
	}
	
	// Return existing tag or newly reated one.
	return tag;
}