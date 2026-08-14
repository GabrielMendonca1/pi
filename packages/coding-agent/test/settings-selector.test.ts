import { setKeybindings } from "@earendil-works/pi-tui";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { KeybindingsManager } from "../src/core/keybindings.ts";
import {
	type SettingsCallbacks,
	type SettingsConfig,
	SettingsSelectorComponent,
} from "../src/modes/interactive/components/settings-selector.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";

describe("SettingsSelectorComponent", () => {
	const originalPiExperimental = process.env.PI_EXPERIMENTAL;

	beforeAll(() => {
		initTheme("dark");
		setKeybindings(new KeybindingsManager());
	});

	beforeEach(() => {
		delete process.env.PI_EXPERIMENTAL;
	});

	afterEach(() => {
		if (originalPiExperimental === undefined) {
			delete process.env.PI_EXPERIMENTAL;
		} else {
			process.env.PI_EXPERIMENTAL = originalPiExperimental;
		}
	});

	it("cycles through fullscreen settings", () => {
		const onExitOutputChange = vi.fn();
		const onScrollbarChange = vi.fn();
		const config = {
			fullscreenExitOutput: "transcript",
			fullscreenScrollbar: "auto",
			warnings: {},
			availableThinkingLevels: [],
			availableThemes: [],
		} as unknown as SettingsConfig;
		const callbacks = {
			onFullscreenExitOutputChange: onExitOutputChange,
			onFullscreenScrollbarChange: onScrollbarChange,
		} as unknown as SettingsCallbacks;

		const cycle = (label: string, count: number) => {
			const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();
			for (const character of label) list.handleInput(character);
			for (let i = 0; i < count; i++) list.handleInput("\r");
		};

		cycle("Fullscreen exit output", 2);
		expect(onExitOutputChange.mock.calls.flat()).toEqual(["resume-hint", "transcript"]);
		cycle("Fullscreen scrollbar", 3);
		expect(onScrollbarChange.mock.calls.flat()).toEqual(["always", "hidden", "auto"]);
	});

	it("only shows the compaction strategy when experimental features are enabled", () => {
		const config = {
			compactionStrategy: "standalone",
			warnings: {},
			availableThinkingLevels: [],
			availableThemes: [],
		} as unknown as SettingsConfig;
		const callbacks = {} as SettingsCallbacks;

		const normalList = new SettingsSelectorComponent(config, callbacks).getSettingsList();
		expect(normalList.render(120).join("\n")).not.toContain("Compaction strategy");

		process.env.PI_EXPERIMENTAL = "1";
		const experimentalList = new SettingsSelectorComponent(config, callbacks).getSettingsList();
		expect(experimentalList.render(120).join("\n")).toContain("Compaction strategy");
	});

	it("changes the experimental compaction strategy", () => {
		process.env.PI_EXPERIMENTAL = "1";
		const onCompactionStrategyChange = vi.fn();
		const config = {
			compactionStrategy: "standalone",
			warnings: {},
			availableThinkingLevels: [],
			availableThemes: [],
		} as unknown as SettingsConfig;
		const callbacks = { onCompactionStrategyChange } as unknown as SettingsCallbacks;
		const list = new SettingsSelectorComponent(config, callbacks).getSettingsList();

		for (const character of "Compaction strategy") list.handleInput(character);
		list.handleInput("\r");

		expect(onCompactionStrategyChange).toHaveBeenCalledWith("append");
	});
});
