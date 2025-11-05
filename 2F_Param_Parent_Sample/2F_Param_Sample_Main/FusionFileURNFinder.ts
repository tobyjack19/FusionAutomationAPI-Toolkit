// This file will find and return the URN of the active Fusion document.

import { adsk } from "@adsk/fas";

function run() {
	try {
		const app = adsk.core.Application.get();
		if (!app) {
			const msg = "No adsk.core.Application available.";
			console.log(msg);
			adsk.log(msg);
			adsk.result = JSON.stringify({ error: msg });
			return;
		}

		const doc = app.activeDocument;
		if (!doc) {
			const msg = "No active document open in Fusion.";
			console.log(msg);
			adsk.log(msg);
			adsk.result = JSON.stringify({ error: msg });
			return;
		}

		const dataFile = doc.dataFile;
		const urn = dataFile ? dataFile.id : "";
		const filename = dataFile ? dataFile.name : doc.name;
		const message = `Active document URN: ${urn}`;

		// Log to Fusion log and the console (terminal)
		adsk.log(message);
		// console.log prints to the environment running the script (useful in terminal)
		console.log(message);

		// Return structured result
		adsk.result = JSON.stringify({ urn, filename });
	} catch (err) {
		const e = String(err);
		adsk.log(`Error retrieving active document URN: ${e}`);
		console.log(`Error retrieving active document URN: ${e}`);
		adsk.result = JSON.stringify({ error: e });
	}
}

run();
