#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
	chmodSync,
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(repoRoot, "overlay", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const defaultStore = join(homedir(), ".local", "share", "pi-rlm-overlay");

function fail(message) {
	throw new Error(message);
}

function run(command, args, options = {}) {
	console.log(`+ ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		encoding: options.capture ? "utf8" : undefined,
		stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) fail(`${command} failed with exit code ${result.status}`);
	return options.capture ? result.stdout.trim() : "";
}

function sha256(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
	const args = argv[0] === "update" ? argv.slice(1) : argv;
	const parsed = { ref: "release", check: false, rollback: false, simulateConflict: false, store: defaultStore };
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (arg === "--check") parsed.check = true;
		else if (arg === "--rollback") parsed.rollback = true;
		else if (arg === "--simulate-conflict") parsed.simulateConflict = true;
		else if (arg === "--ref") parsed.ref = args[++index] ?? fail("--ref requires a value");
		else if (arg === "--store") parsed.store = resolve(args[++index] ?? fail("--store requires a value"));
		else fail(`Unknown overlay update option: ${arg}`);
	}
	return parsed;
}

function atomicSymlink(target, linkPath) {
	mkdirSync(dirname(linkPath), { recursive: true });
	const temporary = `${linkPath}.tmp-${process.pid}`;
	rmSync(temporary, { force: true });
	symlinkSync(target, temporary);
	renameSync(temporary, linkPath);
}

function linkTarget(path) {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

function rollback(store) {
	const current = join(store, "current");
	const previous = join(store, "previous");
	const currentTarget = linkTarget(current);
	const previousTarget = linkTarget(previous);
	if (!previousTarget) fail(`No previous release is available under ${previous}`);
	const previousPi = join(previousTarget, "bin", "pi");
	if (!existsSync(previousPi)) fail(`Previous release is invalid: ${previousPi} is missing`);
	run(previousPi, ["--version"]);
	atomicSymlink(previousTarget, current);
	if (currentTarget) atomicSymlink(currentTarget, previous);
	console.log(`Rolled back pi RLM overlay to ${previousTarget}`);
}

function latestReleaseRef() {
	const raw = run("npm", ["view", manifest.officialPackage, "version", "--json"], { capture: true });
	const parsed = JSON.parse(raw);
	const version = Array.isArray(parsed) ? parsed.at(-1) : parsed;
	if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
		fail(`Invalid version returned for ${manifest.officialPackage}: ${raw}`);
	}
	return `v${version}`;
}

function verifyOverlayPatch(patchPath) {
	const actual = sha256(patchPath);
	if (actual !== manifest.patchSha256) {
		fail(`RLM overlay patch checksum mismatch: expected ${manifest.patchSha256}, got ${actual}`);
	}
	const patchText = readFileSync(patchPath, "utf8").toLowerCase();
	for (const marker of manifest.compatibility.forbiddenOverlayMarkers) {
		if (patchText.includes(marker.toLowerCase())) fail(`Forbidden runtime marker in RLM overlay: ${marker}`);
	}
}

function packageMetadata(sourceDir) {
	return JSON.parse(readFileSync(join(sourceDir, "packages", "coding-agent", "package.json"), "utf8"));
}

function verifyOfficialIdentity(sourceDir) {
	const pkg = packageMetadata(sourceDir);
	if (pkg.name !== manifest.officialPackage) fail(`Unexpected package identity: ${pkg.name}`);
	if (pkg.bin?.pi !== "dist/cli.js") fail(`Unexpected pi entrypoint: ${JSON.stringify(pkg.bin)}`);
	if (pkg.piConfig?.configDir !== ".pi") fail(`Unexpected pi config directory: ${JSON.stringify(pkg.piConfig)}`);
	return pkg;
}

function installOverlayBundle(store) {
	const relativeFiles = [
		"overlay/manifest.json",
		"overlay/rlm.patch",
		"overlay/README.md",
		"scripts/pi-rlm-update.mjs",
		"scripts/pi-rlm-wrapper.sh",
	];
	const fingerprint = createHash("sha256");
	for (const relative of relativeFiles) fingerprint.update(readFileSync(join(repoRoot, relative)));
	const bundleId = `${manifest.overlayCommit.slice(0, 12)}-${fingerprint.digest("hex").slice(0, 12)}`;
	const bundle = join(store, "overlay-bundles", bundleId);
	if (existsSync(bundle)) return bundle;

	const temporary = `${bundle}.tmp-${process.pid}`;
	rmSync(temporary, { recursive: true, force: true });
	for (const relative of relativeFiles) {
		const destination = join(temporary, relative);
		mkdirSync(dirname(destination), { recursive: true });
		copyFileSync(join(repoRoot, relative), destination);
	}
	chmodSync(join(temporary, "scripts", "pi-rlm-update.mjs"), 0o755);
	chmodSync(join(temporary, "scripts", "pi-rlm-wrapper.sh"), 0o755);
	mkdirSync(dirname(bundle), { recursive: true });
	renameSync(temporary, bundle);
	return bundle;
}

function installWrapper(store) {
	const overlayRepo = installOverlayBundle(store);
	const template = readFileSync(join(overlayRepo, "scripts", "pi-rlm-wrapper.sh"), "utf8");
	const rendered = template.replaceAll("__OVERLAY_REPO__", overlayRepo);
	const wrapper = join(store, "bin", "pi-wrapper");
	mkdirSync(dirname(wrapper), { recursive: true });
	const temporary = `${wrapper}.tmp-${process.pid}`;
	writeFileSync(temporary, rendered, { mode: 0o755 });
	chmodSync(temporary, 0o755);
	renameSync(temporary, wrapper);

	const localPi = join(homedir(), ".local", "bin", "pi");
	let currentIsWrapper = false;
	try {
		currentIsWrapper = lstatSync(localPi).isSymbolicLink() && realpathSync(localPi) === realpathSync(wrapper);
	} catch {
		currentIsWrapper = false;
	}
	if (!currentIsWrapper) {
		try {
			lstatSync(localPi);
			const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
			const backupDir = join(store, "backups", stamp);
			mkdirSync(backupDir, { recursive: true });
			const backup = join(backupDir, "pi");
			renameSync(localPi, backup);
			writeFileSync(join(backupDir, "restore.txt"), `mv ${backup} ${localPi}\n`, "utf8");
			console.log(`Backed up previous pi launcher to ${backup}`);
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		atomicSymlink(wrapper, localPi);
	}
	return { wrapper, localPi, overlayRepo };
}

function activateRelease(store, releaseDir, metadata) {
	const current = join(store, "current");
	const previous = join(store, "previous");
	const oldCurrent = linkTarget(current);
	if (oldCurrent && oldCurrent !== releaseDir) atomicSymlink(oldCurrent, previous);
	atomicSymlink(releaseDir, current);
	const launcher = installWrapper(store);
	writeFileSync(join(store, "active.json"), `${JSON.stringify({ ...metadata, releaseDir, ...launcher }, null, 2)}\n`);
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.rollback) {
		rollback(options.store);
		return;
	}

	const patchPath = join(repoRoot, manifest.patch);
	verifyOverlayPatch(patchPath);
	if (options.simulateConflict) fail("Simulated overlay conflict; active release was not changed");

	const targetRef = options.ref === "release" ? latestReleaseRef() : options.ref;
	const stageRoot = mkdtempSync(join(tmpdir(), "pi-rlm-update-"));
	const sourceDir = join(stageRoot, "source");
	try {
		run("git", ["clone", "--filter=blob:none", "--no-checkout", manifest.officialRepository, sourceDir]);
		run("git", ["-C", sourceDir, "fetch", "--force", "--tags", "origin"]);
		run("git", ["-C", sourceDir, "checkout", "--detach", targetRef]);
		const officialCommit = run("git", ["-C", sourceDir, "rev-parse", "HEAD"], { capture: true });
		const officialRemote = run("git", ["-C", sourceDir, "remote", "get-url", "origin"], { capture: true });
		if (officialRemote !== manifest.officialRepository) fail(`Unexpected official remote: ${officialRemote}`);
		verifyOfficialIdentity(sourceDir);

		run("git", ["-C", sourceDir, "apply", "--3way", "--whitespace=nowarn", patchPath]);
		const pkg = verifyOfficialIdentity(sourceDir);
		run("npm", ["ci", "--ignore-scripts"], { cwd: sourceDir });
		run("npm", ["-w", "packages/ai", "run", "hydrate-model-data"], { cwd: sourceDir });
		run("npm", ["run", "check"], { cwd: sourceDir });
		run("npm", ["run", "build"], { cwd: sourceDir });

		const testVenv = join(stageRoot, "kernel-venv");
		run("node", ["packages/coding-agent/dist/core/kernel/bootstrap-cli.js"], {
			cwd: sourceDir,
			env: { PI_RLM_KERNEL_VENV: testVenv },
		});
		run(
			"node",
			[
				join(sourceDir, "node_modules", "vitest", "dist", "cli.js"),
				"--run",
				"test/rlm-kernel.test.ts",
				"test/suite/regressions/3592-no-builtin-tools-keeps-extension-tools.test.ts",
			],
			{ cwd: sourceDir, env: { PI_RLM_TEST_PYTHON: join(testVenv, "bin", "python") } },
		);

		const artifacts = join(stageRoot, "artifacts");
		mkdirSync(artifacts, { recursive: true });
		run("npm", ["pack", "--workspace", "packages/coding-agent", "--pack-destination", artifacts], {
			cwd: sourceDir,
		});
		const packed = readdirSync(artifacts)
			.filter((name) => name.endsWith(".tgz"))
			.map((name) => join(artifacts, name));
		if (packed.length !== 1) fail(`Expected one package tarball, found ${packed.length}`);
		const packedFiles = run("tar", ["-tzf", packed[0]], { capture: true }).split("\n").filter(Boolean);
		if (!packedFiles.includes("package/dist/cli.js")) fail("Packed package is missing the official pi entrypoint");
		if (!packedFiles.includes("package/dist/runtime/src/rlm/__init__.py")) {
			fail("Packed package is missing the bundled pi RLM runtime");
		}
		if (packedFiles.some((name) => name.includes("/dist/runtime/build/") || name.includes(".egg-info/"))) {
			fail("Packed package contains Python build artifacts");
		}

		const metadata = {
			installedAt: new Date().toISOString(),
			officialRef: targetRef,
			officialCommit,
			officialVersion: pkg.version,
			overlayCommit: manifest.overlayCommit,
			patchSha256: manifest.patchSha256,
		};
		if (options.check) {
			console.log(`Compatibility check passed: ${JSON.stringify(metadata)}`);
			rmSync(stageRoot, { recursive: true, force: true });
			return;
		}

		const releaseId = `${pkg.version}-${officialCommit.slice(0, 10)}-${manifest.overlayCommit.slice(0, 10)}`;
		const releasesDir = join(options.store, "releases");
		const releaseDir = join(releasesDir, releaseId);
		const installDir = `${releaseDir}.tmp-${process.pid}`;
		mkdirSync(releasesDir, { recursive: true });
		rmSync(installDir, { recursive: true, force: true });
		run("npm", ["install", "--global", "--prefix", installDir, "--ignore-scripts", packed[0]]);
		const installedPi = join(installDir, "bin", "pi");
		if (!existsSync(installedPi)) fail(`Installed pi entrypoint is missing: ${installedPi}`);
		run(installedPi, ["--version"]);
		writeFileSync(join(installDir, "pi-rlm-overlay.json"), `${JSON.stringify(metadata, null, 2)}\n`);
		if (existsSync(releaseDir)) {
			rmSync(installDir, { recursive: true, force: true });
		} else {
			renameSync(installDir, releaseDir);
		}
		activateRelease(options.store, releaseDir, metadata);
		console.log(`Activated official pi ${pkg.version} + RLM overlay at ${releaseDir}`);
		rmSync(stageRoot, { recursive: true, force: true });
	} catch (error) {
		console.error(`Update failed safely; active pi was not changed. Staging preserved at ${stageRoot}`);
		throw error;
	}
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
