# Native RLM

Pi includes an `ipython` tool alongside its standard coding tools. The kernel keeps Python state between calls and exposes a callable `rlm` object for recursive child sessions.

```python
value = 40
value += 2
result = await rlm("Inspect the current project and summarize its architecture")
print(result.answer, result.usage.total, result.session_dir)
```

Children inherit the parent model and thinking level. The default recursion limit is one level; set `PI_RLM_MAX_DEPTH` before starting Pi to change it. Kernel bootstrap data lives at `~/.pi/agent/kernel-venv` and can be overridden with `PI_RLM_KERNEL_VENV` or `PI_RLM_KERNEL_PYTHON`. Child sessions are stored beside the parent Pi session in a `.rlm` directory.

The RLM runtime does not add a daemon, workflow engine, alternate model roster, or separate product config. Model selection remains Pi's normal selector, including configured Google Gemini models.
