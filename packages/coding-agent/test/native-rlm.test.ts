import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxAssistantMessage, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { KernelManager } from "../src/core/kernel/index.ts";
import { ModelRuntime } from "../src/core/model-runtime.ts";
import { createAgentSession } from "../src/core/sdk.ts";
import { SessionManager } from "../src/core/session-manager.ts";

const testPython = process.env.PI_RLM_TEST_PYTHON;

describe.skipIf(!testPython)("native IPython bridge", () => {
	it("persists kernel state and dispatches rlm calls through the Pi host", async () => {
		const manager = new KernelManager({
			python: testPython,
			rlmRunHandler: async ({ prompt }) => ({
				answer: `child: ${prompt}`,
				usage: { prompt_tokens: 3, completion_tokens: 2 },
				turns: 1,
				session_dir: null,
			}),
		});
		try {
			await manager.start();
			expect(await manager.execute("value = 41")).toMatchObject({ status: "ok" });
			expect((await manager.execute("value + 1")).result).toBe("42");
			const recursive = await manager.execute('from rlm import rlm\n(await rlm("hello")).answer');
			expect(recursive).toMatchObject({ status: "ok", result: "'child: hello'" });
		} finally {
			await manager.dispose();
		}
	});
});

describe("native RLM child sessions", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		while (cleanups.length > 0) cleanups.pop()?.();
	});

	it("runs a recursive child with the parent model and persists it beside the Pi session", async () => {
		const tempDir = join(tmpdir(), `pi-native-rlm-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const faux = registerFauxProvider();
		faux.setResponses([fauxAssistantMessage("child answer")]);
		cleanups.push(() => {
			faux.unregister();
			if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
		});

		const authStorage = AuthStorage.inMemory();
		await authStorage.modify(faux.getModel().provider, async () => ({ type: "api_key", key: "faux-key" }));
		const modelRuntime = await ModelRuntime.create({
			credentials: authStorage,
			modelsPath: join(tempDir, "models.json"),
		});
		const model = faux.getModel();
		modelRuntime.registerProvider(model.provider, {
			baseUrl: model.baseUrl,
			api: model.api,
			models: [model],
		});

		const rootManager = SessionManager.create(tempDir, join(tempDir, "sessions"));
		const { session } = await createAgentSession({
			cwd: tempDir,
			agentDir: tempDir,
			modelRuntime,
			model,
			sessionManager: rootManager,
			rlmMaxDepth: 1,
		});
		cleanups.push(() => session.dispose());

		const result = await session.runRlmChild("answer in a child");
		expect(result.answer).toBe("child answer");
		expect(result.turns).toBe(1);
		expect(result.usage.prompt_tokens).toBeGreaterThan(0);
		expect(result.usage.completion_tokens).toBeGreaterThan(0);
		expect(result.session_dir).toContain(".rlm/sub-");
		expect(result.session_dir && existsSync(result.session_dir)).toBe(true);
		await expect(session.runRlmChild("x", { model: "google/gemini-3.1-pro-preview" })).rejects.toThrow(
			"Unsupported RLM options: model",
		);
	});
});
