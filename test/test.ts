import db from '../src/config/database.ts';
import http from 'http';
import fs from 'fs/promises';
import { addDays, subDays, format } from 'date-fns';

import '../index.ts';

import * as tagModel from '../src/models/tagModel.ts';
import * as historyModel from '../src/models/historyModel.ts';
import * as aggregatedHistoryModel from '../src/models/aggregatedHistoryModel.ts';
import * as cleanHistoryTask from '../src/tasks/cleanHistoryTask.ts';
import * as aggregateHistoryTask from '../src/tasks/aggregateHistoryTask.ts';

const url = 'http://localhost:8080';

async function testCreateTags() {
	console.log("Creating tags:");
	await tagModel.ensureTag({ ruuvi_id: "10:00:00:00:00:00", name: "Vessa" });
	await tagModel.ensureTag({ ruuvi_id: "20:00:00:00:00:00", name: "Olohuone" });
	await tagModel.ensureTag({ ruuvi_id: "30:00:00:00:00:00" });

	await tagModel.ensureTag({ ruuvi_id: "C8:9B:06:CC:8C:20", name: "Parveke" });
	await tagModel.ensureTag({ ruuvi_id: "F7:89:9C:1C:39:A7", name: "Vintti" });
}

async function testGetTags() {
	console.log("Getting tags:");
	console.log(await tagModel.getTagById(1));
	console.log(await tagModel.getTagByRuuviId("20:00:00:00:00:00"));
	console.log(await tagModel.getTags());
}

async function testCreateHistory() {
	console.log("Creating history:");

	await historyModel.saveHistory(
		{
			tag_id: 1,
			datetime: subDays(new Date(), 1),
			temperature: 15.20,
			humidity: 73.11,
			battery_low: false
		}
	);

	await historyModel.saveHistory(
		{
			tag_id: 2,
			datetime: subDays(new Date(), 1),
			temperature: 1.52,
			humidity: 80.13,
			battery_low: false
		}
	);
	
	await historyModel.saveHistory(
		{
			tag_id: 2,
			datetime: new Date(),
			temperature: 1.0361112,
			humidity: 70.11,
			battery_low: false
		}
	);

	await historyModel.saveHistory(
		{
			tag_id: 2,
			datetime: subDays(new Date(), 1),
			temperature: 1.43,
			humidity: 100,
			battery_low: false
		}
	);
	
	await historyModel.saveHistory(
		{
			tag_id: 2,
			datetime: subDays(new Date(), 1),
			temperature: 0.00,
			humidity: 80,
			battery_low: false
		}
	);

	await historyModel.saveHistory(
		{
			tag_id: 2,
			datetime: new Date(),
			temperature: 1.571515,
			humidity: 100,
			battery_low: true
		}
	);

	await historyModel.saveHistory(
		{
			tag_id: 3,
			datetime: new Date(),
			temperature: 25.03,
			humidity: 1.15151,
			battery_low: false
		}
	);
}

async function testGetHistory() {
	console.log("Test getting history of tag 1:");
	console.log(await historyModel.getHistory({ tag_id: 1 }));
	console.log("Only get yesterday");
	console.log(await historyModel.getHistory(
		{ date_start: subDays(new Date(), 1), date_end: new Date() }
	));
}

async function testGetHistoryFromServer() {
	console.log("Get server history:");
	await fetch(url + '/history')
		.then(response => response.json())
		.then(data => console.log(data))
		.catch(error => console.error('Error:', error)
	);
}

async function testCurrentHistoryFromServer() {
	console.log("Get server current history:");
	await fetch(url + '/current')
		.then(response => response.json())
		.then(data => console.log(data))
		.catch(error => console.error('Error:', error)
	);
}

async function testRuuviGWPaylods() {
	console.log("Test saving GW payloads:");
	// Read GW data files.
	const ruuviGwPayload = await fs.readFile('./test/ruuvi-gateway.json', 'utf-8');
	const ruuviGwPayloadWizard = await fs.readFile('./test/ruuvi-gateway-wizard.json', 'utf-8');

	// Send a POST request
	const gwResponse = await fetch(url + "/history", {
	    method: 'POST',
	    headers: {
	        'Content-Type': 'application/json'
	    },
	    body: ruuviGwPayload
	});

	console.log(await gwResponse.json());

	// Send a POST request
	const gwResponseWizard = await fetch(url + "/history", {
	    method: 'POST',
	    headers: {
	        'Content-Type': 'application/json'
	    },
	    body: ruuviGwPayloadWizard
	});

	console.log(await gwResponseWizard.json());
}

async function testGetMinOrMax() {
	console.log('Test max value: ' + await historyModel.getMinOrMaxValueByTag({ type: 'max', tag_id: 2, metric: 'temperature', date_start: subDays(new Date(), 2), date_end: addDays(new Date(), 2) })); // 17.2
	console.log('Test min value: ' + await historyModel.getMinOrMaxValueByTag({ type: 'min', tag_id: 2, metric: 'temperature', date_start: subDays(new Date(), 2), date_end: addDays(new Date(), 2) })); // 1.43
}

async function testAggregateData() {
	console.log("Test aggregated data");
	const aggregateDate = new Date();

	await aggregatedHistoryModel.aggregateHistory(aggregateDate);
	console.log(await aggregatedHistoryModel.getAggregatedHistory({ tag_id: 2 }));
	console.log(await aggregatedHistoryModel.getAggregatedHistory({ date: aggregateDate }));
	console.log(await aggregatedHistoryModel.getAggregatedHistory());
}

async function testHistoryTrend() {
	console.log("Testing trend: ");
	console.log(await historyModel.getMetricTrendByTag({ tag_id: 2, metric: 'temperature' }))
}

async function testAggregateHistoryTask() {
	await aggregateHistoryTask.run();
}

async function testGetAggregatedDataFromServer() {
	console.log("Get server aggregated data:");
	await fetch(url + '/history_aggregated')
		.then(response => response.json())
		.then(data => console.log(data))
		.catch(error => console.error('Error:', error)
	);
	
	console.log("Get server aggregated data with tag ID 2:");
	await fetch(url + '/history_aggregated?tag=2')
		.then(response => response.json())
		.then(data => console.log(data))
		.catch(error => console.error('Error:', error)
	);
}

async function testCleanHistoryTask() {
	await cleanHistoryTask.run();
}

await testCreateTags();
await testGetTags();
await testCreateHistory();
await testGetHistory();
await testGetHistoryFromServer();
await testCurrentHistoryFromServer();
await testRuuviGWPaylods();
await testGetMinOrMax();
await testHistoryTrend();

await testAggregateData();
await testAggregateHistoryTask();
await testGetAggregatedDataFromServer();

await testCleanHistoryTask();

process.exit();