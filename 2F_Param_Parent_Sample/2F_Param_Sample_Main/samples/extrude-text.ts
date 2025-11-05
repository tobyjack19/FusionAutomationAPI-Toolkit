/**
 * Extrude Text
 * Create a sketch of some text and extrude it and save the file.
 *
 *  @param {string} text The text sketch.
 *  @param {string} fileName The name of the file.
 *  @param {number} timeoutSeconds Maximum time to wait for the file to save.
 */

import { adsk } from "@adsk/fas";

let exit = false;

function run() {
  // Read the parameters passed with the script
  const parameters = JSON.parse(adsk.parameters);
  if (!parameters.text) throw Error("No text parameter");
  if (!parameters.fileName) throw Error("No fileName parameter");
  if (!parameters.timeoutSeconds) {
    parameters.timeoutSeconds = 20;
  }

  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Create a new document and get the Design.
  const doc = app.documents.add(
    adsk.core.DocumentTypes.FusionDesignDocumentType,
  );
  const design = app.activeProduct as adsk.fusion.Design;

  // Get the root component of the active design.
  const rootComp = design.rootComponent;

  // Get extrude features.
  const extrudes = rootComp.features.extrudeFeatures;
  const sketches = rootComp.sketches;

  // Create sketch.
  const sketch = sketches.add(rootComp.xYConstructionPlane);
  if (!sketch) throw Error("Unable to create sketch.");

  const text = parameters.text;

  // Add multi-line text.
  const input = sketch.sketchTexts.createInput2(text, 3);
  const cornerPoint = adsk.core.Point3D.create(10, 5, 0);
  const diagonalPoint = adsk.core.Point3D.create(0, 0, 0);
  if (!cornerPoint || !diagonalPoint) {
    throw Error("Unable to create points.");
  }
  input.setAsMultiLine(
    cornerPoint,
    diagonalPoint,
    adsk.core.HorizontalAlignments.LeftHorizontalAlignment,
    adsk.core.VerticalAlignments.TopVerticalAlignment,
    0.0,
  );
  let texts = sketch.sketchTexts.add(input);
  if (!texts) throw Error("Unable to create sketch texts.");

  if (texts.asCurves().length == 0) {
    adsk.log("Fallback to DejaVu Sans");
    input.fontName = "DejaVu Sans";
    texts = sketch.sketchTexts.add(input);
    if (!texts) throw Error("Unable to create sketch texts.");
  }

  const distance = adsk.core.ValueInput.createByReal(0.05);
  if (!distance) throw Error("Unable to create extrude distance.");

  const extrude = extrudes.addSimple(
    texts,
    distance,
    adsk.fusion.FeatureOperations.NewBodyFeatureOperation,
  );
  if (!extrude) throw Error("Extrusion failed.");

  // Get the extrusion body
  const body = extrude.bodies.item(0);
  if (!body) throw Error("Extrude has no body.");

  body.name = "simple";

  adsk.log("Saving file " + parameters.fileName);

  const dataFileComplete = {
    notify: (args: adsk.core.DataEventArgs) => {
      adsk.log("Document uploaded");
      adsk.log(args.objectType);
      adsk.log(new Date(args.file.dateCreated * 1000).toDateString());
      adsk.log(new Date(args.file.dateCreated * 1000).toTimeString());
      exit = true;
    },
  };

  app.dataFileComplete.add(dataFileComplete);

  const documentSaved = {
    notify: (args: adsk.core.DocumentEventArgs) => {
      adsk.log("Document saved locally");
      adsk.log(args.objectType);
      adsk.log(args.document.name);
    },
  };

  app.documentSaved.add(documentSaved);

  doc.saveAs(
    parameters.fileName,
    defaultFolder(app, "Fusion Automation API"),
    "",
    "",
  );

  adsk.log("Done");

  wait(() => exit, parameters.timeoutSeconds * 1000);
  adsk.result = JSON.stringify({
    Filename: doc.dataFile.name,
    urn: doc.dataFile.id,
    "Fusion Web URL": doc.dataFile.fusionWebURL,
  });
}

function wait(predicate: Function, ms: number) {
  const start = new Date().getTime();
  while (new Date().getTime() - start < ms) {
    adsk.doEvents();
    if (predicate()) return;
  }
  throw Error("Timeout");
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
