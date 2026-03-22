const [, , command] = process.argv;

if (command === "consistency-check") {
  console.log("Consistency check is not wired yet.");
  process.exit(0);
}

console.error(`Unknown command: ${command ?? "<none>"}`);
process.exit(1);

