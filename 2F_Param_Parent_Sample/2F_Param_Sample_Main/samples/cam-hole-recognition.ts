/**
 * CAM Hole Recognition
 * @param {boolean} useCurrentDocument Whether to use the currently open document.
 * @param {string} hubId The id of the hub to load a file from.
 *                       Use data.property in Fusion to get Hub Id.
 * @param {string} fileURN The id (urn) of the file to load.
 *                         Use data.property in Fusion to get Lineage Urn.
 * @returns {string} Hole information JSON.
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
  adsk.log("UserId: " + app.userId);
  adsk.log("Version: " + app.version);

  const doc = getDocument(
    app,
    scriptParameters.useCurrentDocument,
    scriptParameters.hubId,
    scriptParameters.fileURN,
  );
  if (!doc) throw Error("Invalid document.");

  const design = doc.products.itemByProductType(
    "DesignProductType",
  ) as adsk.fusion.Design;

  const bodies = allBodies(design.rootComponent);
  if (bodies.length == 0) throw Error("There are no bodies in the design.");

  createSetup("My setup", bodies[0]);

  const recHoleGroups =
    adsk.cam.RecognizedHoleGroup.recognizeHoleGroups(bodies);
  const result: HoleDetails[] = [];
  for (let i = 0; i < recHoleGroups.count; i++) {
    const holeGroup = recHoleGroups.item(i);
    const hole = holeGroup.item(0);
    const holeInfo = defaultUnits(getHoleDetails(hole), design.unitsManager);
    holeInfo.holeCount = holeGroup.count;
    result.push(holeInfo);
  }

  adsk.result = JSON.stringify({ holes: result });
}

interface HoleDetails {
  holeType: string;
  drill: {
    diameter?: number;
    tipAngle?: number;
    depth?: number;
  };
  counterBore: {
    diameter?: number;
    length?: number;
  };
  holeCount?: number;
}

function defaultUnits(h: HoleDetails, um: adsk.core.UnitsManager): HoleDetails {
  function convertLength(l?: number) {
    if (l !== undefined) {
      return um.convert(l, um.internalUnits, um.defaultLengthUnits);
    }
  }
  function convertAngle(a?: number) {
    if (a != undefined) {
      return a * (180 / Math.PI);
    }
  }
  h.drill.diameter = convertLength(h.drill.diameter);
  h.drill.depth = convertLength(h.drill.depth);
  h.drill.tipAngle = convertAngle(h.drill.tipAngle);
  h.counterBore.diameter = convertLength(h.counterBore.diameter);
  h.counterBore.length = convertLength(h.counterBore.length);
  return h;
}

function isSegmentType(
  hole: adsk.cam.RecognizedHole,
  index: number,
  type: "Cone" | "Cylinder" | "Flat",
): boolean {
  const st = hole.segment(index).holeSegmentType;
  switch (type) {
    case "Cone":
      return st == adsk.cam.HoleSegmentType.HoleSegmentTypeCone;
    case "Cylinder":
      return st == adsk.cam.HoleSegmentType.HoleSegmentTypeCylinder;
    case "Flat":
      return st == adsk.cam.HoleSegmentType.HoleSegmentTypeFlat;
    default:
      return false;
  }
}

function getHoleDetails(hole: adsk.cam.RecognizedHole): HoleDetails {
  const result: HoleDetails = {
    holeType: "Unknown",
    drill: {},
    counterBore: {},
  };

  if (hole.segmentCount > 4) {
    return result;
  }

  if (hole.segmentCount == 1) {
    result.drill.diameter = hole.segment(0).topDiameter;
    result.drill.depth = hole.totalLength;
    result.drill.tipAngle = hole.segment(0).halfAngle * 2;

    if (isSegmentType(hole, 0, "Cone")) {
      result.holeType = "Spot Drill";
    } else if (isSegmentType(hole, 0, "Cylinder")) {
      if (hole.isThrough && !hole.isThreaded) {
        result.holeType = "Through Hole";
      } else if (!hole.isThrough || hole.isThreaded) {
        result.holeType = "Blind Hole";
      }
    }
  } else if (hole.segmentCount == 2) {
    result.drill.diameter = hole.segment(1).topDiameter;
    result.drill.depth = hole.totalLength;
    result.drill.tipAngle = hole.segment(1).halfAngle * 2;

    if (isSegmentType(hole, 0, "Cone") && isSegmentType(hole, 1, "Cylinder")) {
      if (hole.isThrough && hole.isThreaded) {
        result.holeType = "CounterSink Through Hole with threaded";
      } else if (hole.isThrough) {
        result.holeType = "CounterSink Through Hole";
      }
    } else if (
      isSegmentType(hole, 0, "Cylinder") &&
      isSegmentType(hole, 1, "Cylinder")
    ) {
      result.counterBore.diameter = hole.segment(0).topDiameter;
      result.counterBore.length = hole.segment(0).height;

      if (hole.isThrough && hole.isThreaded) {
        result.holeType = "CounterBore Through Hole with threaded";
      } else if (hole.isThrough) {
        result.holeType = "CounterBore Through Hole";
      }
    } else if (
      isSegmentType(hole, 0, "Cylinder") &&
      isSegmentType(hole, 1, "Cone")
    ) {
      if (hole.isThreaded) {
        result.holeType = "Non Flat Bottom Blind Hole with threaded";
      } else {
        result.holeType = "Non Flat Bottom Blind Hole";
      }
    }
  } else if (hole.segmentCount == 3) {
    result.drill.diameter = hole.segment(1).topDiameter;
    result.drill.depth = hole.totalLength;

    if (
      isSegmentType(hole, 0, "Cone") &&
      isSegmentType(hole, 1, "Cylinder") &&
      isSegmentType(hole, 2, "Flat")
    ) {
      if (hole.isThreaded) {
        result.holeType = "CounterSink Blind Hole with threaded";
      } else {
        result.holeType = "CounterSink Blind Hole";
      }
    } else if (
      isSegmentType(hole, 0, "Cone") &&
      isSegmentType(hole, 1, "Cylinder") &&
      isSegmentType(hole, 2, "Cone")
    ) {
      result.drill.tipAngle = hole.segment(2).halfAngle * 2;
      if (hole.isThreaded) {
        result.holeType =
          "Non Flat Bottom CounterSink Blind Hole with threaded";
      } else {
        result.holeType = "Non Flat Bottom CounterSink Blind Hole";
      }
    } else if (
      isSegmentType(hole, 0, "Cylinder") &&
      isSegmentType(hole, 1, "Flat") &&
      isSegmentType(hole, 2, "Cylinder")
    ) {
      result.counterBore.diameter = hole.segment(0).topDiameter;
      result.counterBore.length = hole.segment(0).height;
      result.drill.diameter = hole.segment(2).topDiameter;
      if (hole.isThreaded) {
        result.holeType = "CounterBore through Hole with threaded";
      } else {
        result.holeType = "CounterBore through Hole";
      }
    }
  } else if (hole.segmentCount === 4) {
    result.drill.depth = hole.totalLength;

    if (
      isSegmentType(hole, 0, "Cylinder") &&
      isSegmentType(hole, 1, "Flat") &&
      isSegmentType(hole, 2, "Cylinder") &&
      isSegmentType(hole, 3, "Flat")
    ) {
      result.counterBore.diameter = hole.segment(0).topDiameter;
      result.counterBore.length = hole.segment(0).height;
      result.drill.diameter = hole.segment(2).topDiameter;

      if (hole.isThreaded) {
        result.holeType = "CounterBore Blind Hole with threaded";
      } else {
        result.holeType = "CounterBore Blind Hole";
      }
    } else if (
      isSegmentType(hole, 0, "Cylinder") &&
      isSegmentType(hole, 1, "Flat") &&
      isSegmentType(hole, 2, "Cylinder") &&
      isSegmentType(hole, 3, "Cone")
    ) {
      result.counterBore.diameter = hole.segment(0).topDiameter;
      result.counterBore.length = hole.segment(0).height;
      result.drill.diameter = hole.segment(2).topDiameter;
      result.drill.tipAngle = hole.segment(3).halfAngle * 2;

      if (hole.isThreaded) {
        result.holeType =
          "Non Flat Bottom CounterBore Blind Hole with threaded";
      } else {
        result.holeType = "Non Flat Bottom CounterBore Blind Hole";
      }
    }
  }

  return result;
}

function createSetup(name: string, body: adsk.fusion.BRepBody) {
  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Switch to manufacturing space
  const camWS = app.userInterface.workspaces.itemById("CAMEnvironment");
  camWS?.activate();

  // Get the CAM product
  const doc = app.activeDocument;
  const cam = doc.products.itemByProductType("CAMProductType") as adsk.cam.CAM;
  if (!cam) throw Error("No CAM product.");

  // Create setup input and set parameters
  const input = cam.setups.createInput(
    adsk.cam.OperationTypes.MillingOperation,
  );
  input.models = [body];
  input.name = name;
  input.stockMode = adsk.cam.SetupStockModes.RelativeBoxStock;
  const stockParameter = input.parameters.itemByName("job_stockOffsetMode");
  if (stockParameter) {
    stockParameter.expression = "'keep'";
  }

  // Create the setup
  const setup = cam.setups.add(input);
  return setup;
}

function allBodies(component: adsk.fusion.Component) {
  let bodies: adsk.fusion.BRepBody[] = [];
  for (let b = 0; b < component.bRepBodies.count; ++b) {
    const body = component.bRepBodies.item(b);
    if (!body) throw Error("Could not find body at index " + b + ".");
    bodies.push(body);
  }
  const occurences = component.occurrences.asArray();
  for (const occurrence of occurences) {
    bodies = bodies.concat(allBodies(occurrence.component));
  }
  return bodies;
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

run();
