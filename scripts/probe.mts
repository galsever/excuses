// Pulls one real snapshot from WebUntis and writes it plus the raw responses to ./probe (gitignored).
// The password is read from the terminal without echo, it is never written anywhere.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fetchSnapshot } from "../src/lib/untis/fetch";

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Reads a line in raw mode and echoes nothing, so no redraw can ever show typed characters. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const server = await ask("WebUntis Server (z.B. schule.webuntis.com): ");
const school = await ask("Schule (?school= in der Login-URL): ");
const user = await ask("WebUntis Benutzername: ");
const password = await askHidden("WebUntis Passwort: ");
const cfg = { server: server.trim(), school: school.trim(), dumpDir: "probe/raw" };
const snap = await fetchSnapshot(cfg, user, password);
writeFileSync("probe/snapshot.json", JSON.stringify(snap, null, 2));
console.log(
  `OK: ${snap.lessons.length} Stunden, ${snap.absences.length} Abwesenheiten, ` +
    `absenceTimes=${snap.absenceTimes?.length ?? "n/a"}, lateness=${snap.latenessTimes?.length ?? "n/a"}, ` +
    `Name=${snap.displayName ?? "n/a"}, Schuljahr=${snap.schoolyear.name}`,
);
