import db from '../config/database.ts';

export interface Tag {
	id?: number;
	ruuvi_id?: string;
	name?: string;
}

export async function getTags(): Promise<Tag[]> {
	const tags: object[] = await db('tag');
	
	return tags;
}

export async function getTagById(id: number): Promise<Tag> {
	if (!id) throw new Error("Illegal ID passed.");
	const tag: object = await db('tag').where('id', id).first();
	
	return tag;
}

export async function getTagByRuuviId(ruuvi_id: string): Promise<Tag> {
	if (!ruuvi_id) throw new Error("Illegal Ruuvi ID passed.");
	const tag: object = await db('tag').where('ruuvi_id', ruuvi_id).first();
	
	return tag;
}

export async function insertTag({ ruuvi_id, name }): Promise<number> {
	const [ id ]: number = await db('tag').insert({ ruuvi_id, name });
	
	return id;
}

export async function ensureTag({ ruuvi_id, name }): Promise<Tag> {
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