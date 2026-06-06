#!/usr/bin/env node
/**
 * secret-guard — beforeShellExecution hook.
 *
 * Asks for confirmation before any shell command that would stage/commit a real
 * secrets file (.env or *.key), while always allowing .env.example. Fails open
 * so it never blocks normal work if something unexpected happens.
 */

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw || "{}");
    const cmd = String(input.command || "");

    const touchesGit = /\bgit\s+(add|commit)\b/.test(cmd);
    // Match .env / .env.local / something.key but NOT .env.example
    const touchesSecret =
      /(^|[\s"'/\\])\.env(\.local|\.production)?\b(?!\.example)/.test(cmd) ||
      /\.key\b/.test(cmd);

    if (touchesGit && touchesSecret) {
      console.log(
        JSON.stringify({
          permission: "ask",
          user_message:
            "This command may stage or commit a secrets file (.env / *.key). Confirm before continuing.",
          agent_message:
            "secret-guard flagged a possible secret being committed. Use .env.example for shareable config; keep real keys out of git.",
        }),
      );
      process.exit(0);
    }

    console.log(JSON.stringify({ permission: "allow" }));
    process.exit(0);
  } catch {
    // Fail open.
    console.log(JSON.stringify({ permission: "allow" }));
    process.exit(0);
  }
});
