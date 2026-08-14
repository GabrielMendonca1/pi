import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.ts";
import type { KernelManager } from "../src/core/kernel/index.ts";
import { createIpythonToolDefinition } from "../src/core/tools/ipython.ts";

const python = process.env.PI_RLM_TEST_PYTHON;
const run = python && existsSync(python) ? it : it.skip;

describe("pi RLM kernel overlay", () => {
	run(
		"keeps Python state and dispatches rlm calls through the host",
		async () => {
			const kernelManagerRef: { current?: KernelManager } = {};
			const context = {} as ExtensionContext;
			const tool = createIpythonToolDefinition(process.cwd(), {
				python,
				env: {
					PYTHONPATH: resolve("packages/coding-agent/runtime/src"),
					RLM_DEPTH: "0",
					RLM_MAX_DEPTH: "1",
				},
				kernelManagerRef,
				rlmRunHandler: async ({ prompt, kwargs }) => ({
					answer: `${prompt}:${String(kwargs.model)}`,
					usage: { prompt_tokens: 2, completion_tokens: 3 },
					turns: 1,
					session_dir: null,
				}),
			});

			try {
				const first = await tool.execute(
					"state",
					{ code: "value = 41" },
					new AbortController().signal,
					undefined,
					context,
				);
				expect(first.details?.status).toBe("ok");

				const second = await tool.execute(
					"state-read",
					{ code: "value + 1" },
					new AbortController().signal,
					undefined,
					context,
				);
				expect(second.content).toEqual([{ type: "text", text: "42" }]);

				const recursive = await tool.execute(
					"rlm",
					{ code: 'result = await rlm("child", model="google/gemini-test")\nresult.answer' },
					new AbortController().signal,
					undefined,
					context,
				);
				expect(recursive.details?.status).toBe("ok");
				expect(recursive.content).toEqual([{ type: "text", text: "'child:google/gemini-test'" }]);
			} finally {
				await kernelManagerRef.current?.shutdown();
			}
		},
		20_000,
	);
});
