/**
 * Modify Design Parameters
 * List all parameters in the design and modify them based on input.
 * @param {boolean} useCurrentDocument Whether to use the currently open document.
 * @param {string} saveAsNewDocument Whether to save to a new document or a new version.
 * @param {string} hubId The id of the hub to load a file from.
 *                       Use data.property in Fusion to get Hub Id.
 * @param {string} fileURN The id (urn) of the file to load.
 *                         Use data.property in Fusion to get Lineage Urn.
 * @param {object} parameters The parameters to set.
 * @returns {object} The before and after parameters.
 */

import { adsk } from "@adsk/fas";

function run() {
  // Parse incoming parameters (expected JSON string in adsk.parameters)
  const scriptParameters = JSON.parse(adsk.parameters || "{}");

  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  adsk.log(new Date().toString());

  // Open the document (either current or by hubId/fileURN)
  const doc = getDocument(
    app,
    scriptParameters.useCurrentDocument,
    scriptParameters.hubId,
    scriptParameters.fileURN,
  );
  if (!doc) throw Error("Invalid document.");

  // Ensure this is a Fusion design
  const design = doc.products.itemByProductType(
    "DesignProductType",
  ) as adsk.fusion.Design;
  if (!design) throw Error("Document does not contain a Fusion design.");

  // Read current design parameters
  const pars: adsk.fusion.ParameterList = design.allParameters;
  const before = parametersToObject(pars);

  // Prepare modifications from incoming parameters
  const userParams = scriptParameters.parameters || {};
  const newPars: adsk.fusion.Parameter[] = [];
  const newValues: adsk.core.ValueInput[] = [];
  const newStrings: string[] = [];

  for (const name in userParams) {
    const par: adsk.fusion.Parameter | null = pars.itemByName(name);
    if (par == null) {
      adsk.log(`Parameter "${name}" not found, skipping`);
      continue;
    }
    const valueInput = adsk.core.ValueInput.createByString(userParams[name]);
    if (!valueInput) {
      adsk.log(`Parameter value "${userParams[name]}" not valid, skipping ${name}`);
      continue;
    }
    newPars.push(par);
    newValues.push(valueInput);
    newStrings.push(userParams[name]);
  }

  // Apply modifications (use design.modifyParameters when available)
  if (newPars.length > 0) {
    adsk.log(`Modifying ${newPars.length} parameters`);
    const modified = design.modifyParameters
      ? design.modifyParameters(newPars, newValues)
      : false;
    if (!modified) {
      // Fallback: set expressions directly
      for (let i = 0; i < newPars.length; i++) {
        try {
          // set expression directly from the original string value as a fallback
          newPars[i].expression = newStrings[i];
        } catch (e) {
          adsk.log(`Failed to set parameter ${newPars[i].name}: ${e}`);
        }
      }
    }
  } else {
    adsk.log("No matching parameters to modify.");
  }

  const after = parametersToObject(pars);

  // Save the document if requested
  let destinationFolder = doc.dataFile.parentFolder;
  if (doc.dataFile.isReadOnly) {
    adsk.log(
      "Document is read-only. Attempting to save in default folder in Fusion Automation API project.",
    );
    destinationFolder = defaultFolder(app, "Fusion Automation API");
  }

  saveDocument(
    doc,
    scriptParameters.saveAsNewDocument,
    destinationFolder,
    `Modified parameters: ${Object.keys(userParams).join(", ")}`,
    doc.name + " modify parameters",
  );

  // Wait for background jobs (toolpaths, saves) to complete
  while (app.hasActiveJobs) {
    wait(100);
  }

  // Return before/after as script result
  adsk.result = JSON.stringify({
    Before: before,
    After: after,
    Filename: doc.dataFile.name,
    urn: doc.dataFile.id,
    "Fusion Web URL": doc.dataFile.fusionWebURL,
  });
}

function parametersToObject(parameters: adsk.fusion.ParameterList) {
  const out: Record<string, string> = {};
  for (let i = 0; i < parameters.count; i++) {
    out[parameters.item(i)!.name] = parameters.item(i)!.expression;
  }
  return out;
}

function wait(ms: number) {
  const start = new Date().getTime();
  while (new Date().getTime() - start < ms) adsk.doEvents();
}

function getDocument(
  app: adsk.core.Application,
  useCurrentDocument: boolean,
  hubId: string,
  fileURN: string,
): adsk.core.Document {
  if (useCurrentDocument === true) {
    adsk.log(`Using currently open document: ${app.activeDocument.name}.`);
    return app.activeDocument;
  }

  if (hubId) {
    // Possible hubId formats: base64 encoded string, or business:<id>,
    // or personal:<id> (deprecated)
    const hub =
      app.data.dataHubs.itemById(hubId) ||
      app.data.dataHubs.itemById(`a.${adsk.btoa(`business:${hubId}`, true)}`) ||
      app.data.dataHubs.itemById(`a.${adsk.btoa(`personal:${hubId}`, true)}`);
    if (!hub) throw Error(`Hub with id ${hubId} not found.`);
    adsk.log(`Setting hub: ${hub.name}.`);
    app.data.activeHub = hub;
  }

  const file = app.data.findFileById(fileURN);
  if (!file) throw Error(`File not found ${fileURN}.`);
  adsk.log(`Opening ${file.name}`);
  const document = app.documents.open(file, true);
  if (!document) throw Error(`Cannot open file ${file.name}.`);
  return document;
}

function saveDocument(
  doc: adsk.core.Document,
  saveAsNewDocument: boolean,
  destinationFolder: adsk.core.DataFolder,
  description: string,
  name?: string,
): boolean {
  if (saveAsNewDocument) {
    if (doc.saveAs(name ?? doc.name, destinationFolder, description, "")) {
      adsk.log("Document saved successfully.");
      return true;
    } else {
      adsk.log("Failed to save document.");
      return false;
    }
  }
  if (!doc.isModified) {
    adsk.log("Document is not modified, not saving.");
    return true;
  }
  try {
    if (doc.save(description)) {
      adsk.log("Document saved successfully.");
      return true;
    } else {
      adsk.log("Failed to save document.");
      return false;
    }
  } catch (error) {
    adsk.log(`Error saving document: ${error}`);
    return false;
  }
}

function defaultFolder(app: adsk.core.Application, defaultProjectName: string) {
  const projects = app.data.activeHub.dataProjects;
  if (!projects) throw Error("Unable to get active hub's projects.");
  for (let i = 0; i < projects.count; ++i) {
    const project = projects.item(i)!;
    if (project.name === defaultProjectName) {
      return project.rootFolder;
    }
  }
  adsk.log(`Creating new project: ${defaultProjectName}`);
  const project = projects.add(defaultProjectName);
  if (!project) throw Error("Unable to create new project.");
  return project.rootFolder;
}

run();
