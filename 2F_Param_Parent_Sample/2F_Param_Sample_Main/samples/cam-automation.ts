/**
 * CAM Automation
 * Applies a template from a file to a list of target files.
 * @param {boolean} useCurrentDocument Whether to use the currently open document as the master file.
 * @param {string} saveTargetsAsNewDocuments Whether to save modified target files to a new document or a new version.
 * @param {string} hubId The id of the hub to load files from.
 *                       Use data.property in Fusion to get Hub Id.
 * @param {string} templateFileURN The id (urn) of the file to read the template from.
 *                                 Use data.property in Fusion to get Lineage Urn.
 * @param {string[]} targetFileURNs The ids (urns) of the files to apply the template to.
 *                                  Use data.property in Fusion to get Lineage Urn.
 */

import { adsk } from "@adsk/fas";

function run() {
  // Read the parameters passed with the script
  const scriptParameters = JSON.parse(adsk.parameters);
  if (!scriptParameters) throw Error("Invalid parameters provided.");

  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Log some information
  adsk.log(new Date().toString());
  adsk.log("UserName: " + app.userName);
  adsk.log("User: " + app.currentUser.displayName);
  adsk.log("UserID: " + app.userId);
  adsk.log("Version: " + app.version);

  const doc = getDocument(
    app,
    scriptParameters.useCurrentDocument,
    scriptParameters.hubId,
    scriptParameters.templateFileURN,
  );
  if (!doc) throw Error("Invalid document.");

  const camProduct = doc.products.itemByProductType("CAMProductType");
  if (!camProduct) throw Error("Template file has no CAM.");
  const cam = camProduct as adsk.cam.CAM;

  // Pick first setup for template
  const setup = cam.setups.item(0);
  if (!setup) throw Error("Template file does not contain any CAM operations.");
  const setupOperationType = setup.operationType;

  const setupParameters = setup.parameters;

  adsk.log("Extracting xml template from template file.");

  const operationsXML = cam.generateTemplateXML(setup.allOperations);

  adsk.log("Template Extraction Successful.");

  const docInfo: Record<string, any> = {};

  for (const targetUrn of scriptParameters.targetFileURNs) {
    const targetDoc = getDocument(app, false, "", targetUrn);
    if (!targetDoc) {
      adsk.log(`Target document not found: ${targetUrn}`);
      continue;
    }

    if (!targetDoc.products.itemByProductType("CAMProductType")) {
      const cam = app.userInterface.workspaces.itemById("CAMEnvironment");
      cam?.activate();
    }

    const design = targetDoc.products.itemByProductType(
      "DesignProductType",
    ) as adsk.fusion.Design;
    const targetCam = targetDoc.products.itemByProductType(
      "CAMProductType",
    ) as adsk.cam.CAM;

    const bodies = design.rootComponent.bRepBodies.item(0);
    if (!bodies) {
      adsk.log("Root component has no B-Rep bodies.");
      continue;
    }
    const objects = adsk.core.ObjectCollection.createWithArray([bodies]);
    if (!objects) {
      adsk.log("Could not create an object collection from bodies.");
      continue;
    }

    adsk.log("Applying template to the target document " + targetDoc.name);

    // Milling setup
    const setupInput = targetCam.setups.createInput(setupOperationType);
    const targetSetup = targetCam.setups.add(setupInput);

    adsk.log(
      "Applying WCS parameters to the target document " + targetDoc.name,
    );
    for (let i = 0; i < setupParameters.count; i++) {
      const parameter = setupParameters.item(i)!;
      if (!(parameter.name && parameter.name.startsWith("wcs"))) continue;
      const targetParameter = targetSetup.parameters.itemByName(parameter.name);
      if (targetParameter) {
        targetParameter.expression = parameter.expression;
      }
    }
    adsk.log("WCS Parameters applied successfully.");

    targetSetup.models = objects;

    const operationsCAMTemplate =
      adsk.cam.CAMTemplate.createFromXML(operationsXML);
    const operationsCAMTemplateInput =
      adsk.cam.CreateFromCAMTemplateInput.create();
    operationsCAMTemplateInput.camTemplate = operationsCAMTemplate;
    targetSetup.createFromCAMTemplate2(operationsCAMTemplateInput);
    adsk.log("Templates applied successfully.");

    const genStatus = targetCam.generateAllToolpaths(true);
    adsk.log("Toolpath generation is in progress...");
    while (!genStatus.isGenerationCompleted) {
      wait(1000);
    }
    adsk.log("Toolpath generation is completed.");

    // Switch to manufacturing space
    const camWS = app.userInterface.workspaces.itemById("CAMEnvironment");
    camWS?.activate();

    const description = "Saved by Fusion Automation API";

    let destinationFolder = doc.dataFile.parentFolder;
    if (doc.dataFile.isReadOnly) {
      adsk.log(
        "Document is read-only. Attempting to save in default folder in Fusion Automation API project.",
      );
      destinationFolder = defaultFolder(app, "Fusion Automation API");
    }

    saveDocument(
      targetDoc,
      scriptParameters.saveTargetsAsNewDocuments,
      destinationFolder,
      description,
      targetDoc.name + " CAM Automation",
    );
    while (app.hasActiveJobs) {
      wait(2000);
    }

    docInfo["File " + targetDoc.dataFile.name] = {
      urn: targetDoc.dataFile.id,
      "Fusion Web URL": targetDoc.dataFile.fusionWebURL,
    };
  }

  adsk.result = JSON.stringify(docInfo);
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
