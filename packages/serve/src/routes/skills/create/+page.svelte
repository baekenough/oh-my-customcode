<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';

	export let data: PageData;
	export let form: ActionData;

	// Natural language input
	let nlInput = '';
	let analyzing = false;
	let saving = false;

	// Editable form fields (populated after analysis)
	let skillName = '';
	let skillDescription = '';
	let skillScope = 'core';
	let skillContextFork = false;
	let skillBody = '';
	let analyzed = false;
	let analysisMode: 'claude' | 'keyword' | 'keyword-fallback' | null = null;

	const SCOPES = ['core', 'harness', 'package'] as const;

	// Populate fields when server returns analysis
	$: if (form?.success) {
		skillName = form.name ?? '';
		skillDescription = form.description ?? '';
		skillScope = form.scope ?? 'core';
		skillContextFork = form.contextFork ?? false;
		skillBody = form.body ?? '';
		analysisMode = form.mode as typeof analysisMode ?? null;
		analyzed = true;
	}

	// Live markdown preview
	$: frontmatter = buildFrontmatter(skillName, skillDescription, skillScope, skillContextFork);
	$: preview = frontmatter + '\n\n' + skillBody;

	function buildFrontmatter(
		name: string,
		desc: string,
		scope: string,
		contextFork: boolean
	): string {
		const contextLine = contextFork ? '\ncontext: fork' : '';
		return `---\nname: ${name}\ndescription: ${desc}\nscope: ${scope}${contextLine}\n---`;
	}

	const scopeColor: Record<string, string> = {
		core: 'text-emerald-400',
		harness: 'text-violet-400',
		package: 'text-amber-400'
	};

	const scopeDescription: Record<string, string> = {
		core: 'Universal development tools — deployed by default',
		harness: 'Agent/skill/rule maintenance tools',
		package: 'Package-specific tools (npm publish, etc.)'
	};
</script>

<div class="p-8 max-w-5xl">
	<div class="mb-6">
		<a href="/skills" class="text-zinc-500 hover:text-zinc-300 text-sm mb-3 inline-block">← Skills</a>
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-bold text-zinc-50">New Skill</h1>
			<!-- Claude availability badge -->
			{#if data.claudeAvailable}
				<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
					Claude Code ✓
				</span>
			{:else}
				<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-500 border border-zinc-700">
					Keyword mode
				</span>
			{/if}
		</div>
		<p class="text-zinc-500 text-sm mt-1">Describe your skill in natural language, then refine the generated spec.</p>
	</div>

	<!-- Natural language input section -->
	<div class="border border-zinc-800 rounded-lg p-5 mb-6 bg-zinc-900/30">
		<label for="nl-input" class="block text-sm font-medium text-zinc-300 mb-2">Describe your skill</label>
		<textarea
			id="nl-input"
			bind:value={nlInput}
			rows="4"
			placeholder="예: React 컴포넌트 코드 리뷰 스킬. 접근성, 성능, 베스트 프랙티스 체크.&#10;&#10;Or: A skill for reviewing Go code for idiomatic patterns and error handling best practices."
			class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono"
		></textarea>

		{#if form?.error && !analyzed}
			<p class="text-red-400 text-xs mt-2">{form.error}</p>
		{/if}

		<form
			method="POST"
			action="?/analyze"
			use:enhance={() => {
				analyzing = true;
				return async ({ update }) => {
					analyzing = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="input" value={nlInput} />
			<div class="mt-3 flex items-center gap-3">
				<button
					type="submit"
					disabled={analyzing || !nlInput.trim()}
					class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 text-sm rounded transition-colors font-medium"
				>
					{#if analyzing}
						<span class="flex items-center gap-2">
							<span class="inline-block animate-spin">⟳</span>
							{data.claudeAvailable ? 'Claude Code로 분석 중...' : 'Analyzing...'}
						</span>
					{:else}
						Analyze
					{/if}
				</button>

				<!-- Mode badge shown after analysis -->
				{#if analysisMode === 'claude'}
					<span class="text-xs text-emerald-400">🤖 Claude Code로 생성</span>
				{:else if analysisMode === 'keyword-fallback'}
					<span class="text-xs text-amber-400">⚠ Claude Code를 사용할 수 없습니다. 키워드 기반으로 전환합니다.</span>
				{:else if analysisMode === 'keyword'}
					<span class="text-xs text-zinc-500">📝 키워드 기반 생성</span>
				{/if}
			</div>
		</form>
	</div>

	{#if analyzed}
		<div class="grid grid-cols-2 gap-6">
			<!-- Left: editable form -->
			<div class="space-y-4">
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Skill Spec</h2>

				<!-- Name -->
				<div>
					<label for="skill-name" class="block text-xs text-zinc-500 mb-1">Name <span class="text-zinc-700">(kebab-case)</span></label>
					<input
						id="skill-name"
						type="text"
						bind:value={skillName}
						placeholder="react-best-practices"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
					/>
				</div>

				<!-- Description -->
				<div>
					<label for="skill-description" class="block text-xs text-zinc-500 mb-1">Description</label>
					<input
						id="skill-description"
						type="text"
						bind:value={skillDescription}
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
					/>
				</div>

				<!-- Scope -->
				<div>
					<p class="text-xs text-zinc-500 mb-2">Scope</p>
					<div class="flex gap-2">
						{#each SCOPES as s}
							<button
								onclick={() => (skillScope = s)}
								class="px-3 py-1 rounded text-xs font-semibold border transition-colors {skillScope === s
									? s === 'harness' ? 'bg-violet-800 text-violet-200 border-violet-500'
									: s === 'package' ? 'bg-amber-800 text-amber-200 border-amber-500'
									: 'bg-emerald-800 text-emerald-200 border-emerald-500'
									: 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
							>
								{s}
							</button>
						{/each}
					</div>
					<p class="text-xs text-zinc-600 mt-1.5">{scopeDescription[skillScope]}</p>
				</div>

				<!-- Context Fork toggle -->
				<div>
					<p class="text-xs text-zinc-500 mb-2">Context Fork</p>
					<label class="flex items-center gap-3 cursor-pointer">
						<div
							role="checkbox"
							aria-checked={skillContextFork}
							tabindex="0"
							onclick={() => (skillContextFork = !skillContextFork)}
							onkeydown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); skillContextFork = !skillContextFork; } }}
							class="relative w-10 h-5 rounded-full transition-colors {skillContextFork ? 'bg-emerald-600' : 'bg-zinc-700'}"
						>
							<span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform {skillContextFork ? 'translate-x-5' : 'translate-x-0'}"></span>
						</div>
						<span class="text-xs {skillContextFork ? 'text-emerald-400' : 'text-zinc-500'}">
							{skillContextFork ? 'Enabled — for routing / orchestration skills' : 'Disabled — standard skill'}
						</span>
					</label>
					<p class="text-xs text-zinc-700 mt-1">Enable only for skills that spawn multiple agents (cap: 12)</p>
				</div>

				<!-- Body -->
				<div>
					<label for="skill-body" class="block text-xs text-zinc-500 mb-1">Body <span class="text-zinc-700">(markdown)</span></label>
					<textarea
						id="skill-body"
						bind:value={skillBody}
						rows="14"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y font-mono"
					></textarea>
				</div>
			</div>

			<!-- Right: live preview -->
			<div>
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Preview</h2>
				<pre class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-300 font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">{preview}</pre>

				<!-- Scope info panel -->
				<div class="mt-4 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
					<p class="text-xs text-zinc-500 font-medium mb-1">Save location</p>
					<code class="text-xs text-zinc-400 font-mono">
						.claude/skills/{skillName || '{name}'}/SKILL.md
					</code>
				</div>
			</div>
		</div>

		<!-- Save form -->
		<div class="mt-6 pt-5 border-t border-zinc-800">
			{#if form?.error}
				<p class="text-red-400 text-sm mb-3">{form.error}</p>
			{/if}

			<form
				method="POST"
				action="?/save"
				use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						saving = false;
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="name" value={skillName} />
				<input type="hidden" name="content" value={preview} />

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving || !skillName.trim()}
						class="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
					>
						{saving ? 'Saving...' : 'Save Skill'}
					</button>
					<a
						href="/skills"
						class="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm rounded transition-colors"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	{/if}
</div>
