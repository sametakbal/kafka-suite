// Builds the Java sidecar and stages it for Tauri:
//   src-tauri/resources/kafka-sidecar.jar   shaded jar (Apache Kafka client + Jackson + slf4j-simple)
//   src-tauri/resources/runtime/            minimal JRE made with jlink
// Usage: node scripts/build-sidecar.mjs [--skip-runtime]
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sidecar = join(root, "sidecar");
const resources = join(root, "src-tauri", "resources");
const win = process.platform === "win32";

// Modules the Kafka client touches: JMX metrics, SASL/GSSAPI and JAAS login modules, TLS
// (jdk.crypto.ec only exists as a separate module before JDK 22), and Unsafe for the compression codecs.
const MODULES = [
  "java.base", "java.logging", "java.management", "java.naming", "java.xml", "java.sql",
  "java.security.jgss", "java.security.sasl", "jdk.security.auth", "jdk.crypto.ec", "jdk.crypto.cryptoki",
  "jdk.unsupported", "jdk.zipfs",
];

function run(cmd, args, cwd) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: win && cmd.endsWith(".cmd") });
}

function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  // `java -XshowSettings:properties` prints to stderr.
  const r = spawnSync("java", ["-XshowSettings:properties", "-version"], { encoding: "utf8" });
  const m = /java\.home = (.+)/.exec(r.stderr || "");
  if (!m) throw new Error("No JDK found: set JAVA_HOME or put java on PATH");
  return m[1].trim();
}

/** Modules of the JDK jlink runs from, so the list works across JDK versions. */
function availableModules(javaHome) {
  const r = spawnSync(join(javaHome, "bin", win ? "java.exe" : "java"), ["--list-modules"], { encoding: "utf8" });
  return new Set((r.stdout || "").split(/\r?\n/).map((l) => l.split("@")[0].trim()).filter(Boolean));
}

mkdirSync(resources, { recursive: true });

run(win ? join(sidecar, "mvnw.cmd") : "./mvnw", ["-q", "-B", "package", "-DskipTests"], sidecar);
cpSync(join(sidecar, "target", "kafka-sidecar.jar"), join(resources, "kafka-sidecar.jar"));

const runtime = join(resources, "runtime");
if (process.argv.includes("--skip-runtime")) {
  // Tauri needs the resource folder to exist; the app then falls back to the system JDK.
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, ".keep"), "");
} else {
  rmSync(runtime, { recursive: true, force: true });
  const javaHome = findJavaHome();
  const have = availableModules(javaHome);
  const modules = have.size ? MODULES.filter((m) => have.has(m)) : MODULES;
  const jlink = join(javaHome, "bin", win ? "jlink.exe" : "jlink");
  run(jlink, [
    "--add-modules", modules.join(","),
    "--strip-debug", "--no-header-files", "--no-man-pages",
    "--compress", "zip-6",
    "--output", runtime,
  ], root);
}
console.log("sidecar staged in", resources);
