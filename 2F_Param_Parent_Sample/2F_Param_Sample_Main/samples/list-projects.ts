/**
 * List Projects
 * List your Fusion Team hubs and the projects within them.
 * @returns {string} Hub and project information JSON.
 */

import { adsk } from "@adsk/fas";

function run() {
  // Get the Fusion API's application object
  const app = adsk.core.Application.get();
  if (!app) throw Error("No asdk.core.Application.");

  // Log some information
  adsk.log(new Date().toString());
  adsk.log("UserName: " + app.userName);
  adsk.log("User: " + app.currentUser.displayName);
  adsk.log("UserID: " + app.userId);
  adsk.log("Version: " + app.version);

  adsk.log("Number of Hubs: " + app.data.dataHubs.count);

  const resultHubs: IResultHub[] = [];
  for (let index = 0; index < app.data.dataHubs.count; index++) {
    const hub = app.data.dataHubs.item(index);
    if (!hub) throw Error("Invalid hub index.");

    const resultHub: IResultHub = {
      name: hub.name,
      id: hub.id,
      projects: [],
    };

    adsk.log("  Number of projects in hub: " + hub.dataProjects.count);

    for (let id = 0; id < hub.dataProjects.count; id++) {
      const project = hub.dataProjects.item(id);
      if (!project) throw Error("Invalid project id.");

      const line = "name:" + project.name + "  id:" + project.id;
      adsk.log("  " + line);
      resultHub.projects.push({ name: project.name, id: project.id });
    }
    resultHubs.push(resultHub);
  }
  const result = { hubs: resultHubs };
  adsk.result = JSON.stringify(result);
}

interface IResultEntity {
  name: string;
  id: string;
}

interface IResultHub extends IResultEntity {
  projects: IResultEntity[];
}

run();
