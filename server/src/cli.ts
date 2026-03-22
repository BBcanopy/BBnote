import { buildConfig } from "./service/configService.js";
import { createServices } from "./service/serviceFactory.js";

const [, , command, ...rest] = process.argv;

if (command === "consistency-check") {
  const args = parseArgs(rest);
  const services = await createServices(buildConfig());
  const report = await services.consistencyService.run({
    ownerId: args.user,
    folderId: args.folder,
    noteId: args.note,
    deep: args.deep,
    repair: args.repair
  });
  services.database.close();

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Checked ${report.checkedNotes} notes and ${report.checkedAttachments} attachments.`);
    for (const repaired of report.repaired) {
      console.log(`REPAIRED: ${repaired}`);
    }
    for (const issue of report.issues) {
      console.log(`ISSUE [${issue.type}]: ${issue.message}`);
      if (issue.path) {
        console.log(`PATH: ${issue.path}`);
      }
    }
  }

  const hasUnrepairedIssues =
    report.issues.length > 0 &&
    (!args.repair || report.issues.some((issue) => !issue.repairable || !report.repaired.some((entry) => entry.includes(issue.noteId ?? issue.attachmentId ?? ""))));
  process.exit(hasUnrepairedIssues ? 1 : 0);
}

console.error(`Unknown command: ${command ?? "<none>"}`);
process.exit(1);

function parseArgs(argumentsList: string[]) {
  const parsed = {
    json: false,
    repair: false,
    deep: false,
    user: undefined as string | undefined,
    folder: undefined as string | undefined,
    note: undefined as string | undefined
  };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const current = argumentsList[index];
    if (current === "--json") {
      parsed.json = true;
    } else if (current === "--repair") {
      parsed.repair = true;
    } else if (current === "--deep") {
      parsed.deep = true;
    } else if (current === "--user") {
      parsed.user = argumentsList[index + 1];
      index += 1;
    } else if (current === "--folder") {
      parsed.folder = argumentsList[index + 1];
      index += 1;
    } else if (current === "--note") {
      parsed.note = argumentsList[index + 1];
      index += 1;
    }
  }

  return parsed;
}
