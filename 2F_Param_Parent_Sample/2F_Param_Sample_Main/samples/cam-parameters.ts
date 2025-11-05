/**
 * Modify CAM Parameters
 * List all parameters in all setups and modify them based on input.
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
  const scriptParameters = JSON.parse(adsk.parameters);
  if (!scriptParameters) throw Error("Invalid parameters provided.");

  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Switch to manufacturing space
  const camWS = app.userInterface.workspaces.itemById("CAMEnvironment");
  camWS?.activate();

  const doc = getDocument(
    app,
    scriptParameters.useCurrentDocument,
    scriptParameters.hubId,
    scriptParameters.fileURN,
  );
  if (!doc) throw Error("Invalid document.");

  // Get the setups of the opened document
  const cam = doc.products.itemByProductType("CAMProductType") as adsk.cam.CAM;
  const setups = cam.setups;

  // Read original values of all cam parameters
  const original = readParametersSetups(setups);

  // Update parameters in setups matching user provided paths
  for (const key in scriptParameters.parameters) {
    try {
      const setup = setups.itemByName(key);
      if (setup) writeParameters(setup, scriptParameters.parameters[key]);
    } catch (e) {
      adsk.log(`Setup ${key} not found.`);
    }
  }
  const genStatus = cam.generateAllToolpaths(true);
  adsk.log("Toolpath generation is in progress...");
  while (!genStatus.isGenerationCompleted) {
    wait(1000);
  }
  adsk.log("Toolpath generation is completed.");

  // Read new values of all cam parameters
  const after = readParametersSetups(setups);

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
    "Changed CAM parameters",
    doc.name + " modify parameters",
  );

  while (app.hasActiveJobs) {
    wait(2000);
  }

  adsk.result = JSON.stringify({
    Before: original,
    After: after,
    Filename: doc.dataFile.name,
    urn: doc.dataFile.id,
    "Fusion Web URL": doc.dataFile.fusionWebURL,
  });
}

function readParametersSetups(setups: adsk.cam.Setups) {
  const out: Record<string, any> = {};
  for (let i = 0; i < setups.count; i++) {
    const setup = setups.item(i)!;
    out[setup.name] = readParametersRecursive(setup);
  }
  return out;
}

function readParametersRecursive(
  input: adsk.cam.OperationBase | adsk.cam.CAMFolder,
) {
  const out: Record<string, any> = {};
  if (!("children" in input)) {
    out["parameters"] = readParameters(input);
  } else {
    for (let i = 0; i < input.children.count; i++) {
      const child = input.children.item(i) as
        | adsk.cam.OperationBase
        | adsk.cam.CAMFolder;
      if ("children" in child) {
        out[child.name] = readParametersRecursive(child);
      } else if ("parameters" in child) {
        out[child.name] = { parameters: readParameters(child) };
      }
    }
  }
  return out;
}

function readParameters(input: adsk.cam.OperationBase) {
  const out: Record<string, string> = {};
  for (let i = 0; i < input.parameters.count; i++) {
    const parameter = input.parameters.item(i)!;
    out[parameter.name] = parameter.expression;
  }
  return out;
}

function writeParameters(
  original: adsk.cam.OperationBase | adsk.cam.CAMFolder,
  userParams: any,
) {
  if ("parameters" in userParams && "parameters" in original) {
    for (const parName in userParams.parameters) {
      const parameter = original.parameters.itemByName(parName);
      if (!parameter) {
        adsk.log(`Parameter ${parName} not found.`);
        continue;
      }
      adsk.log(
        `Setting parameter ${parName} from ${parameter.expression} to ${userParams.parameters[parName]}.`,
      );
      parameter.expression = userParams.parameters[parName];
    }
  } else if ("children" in original) {
    for (let key in userParams) {
      // itemByName raises an exception if the child is not found
      try {
        writeParameters(
          original.children.itemByName(key) as
            | adsk.cam.OperationBase
            | adsk.cam.CAMFolder,
          userParams[key],
        );
      } catch (e) {
        adsk.log(`Child ${key} not found.`);
      }
    }
  }
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
