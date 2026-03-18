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
	let agentName = '';
	let agentDescription = '';
	let agentModel = 'sonnet';
	let agentDomain = 'universal';
	let agentTools: string[] = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'];
	let agentSkills: string[] = [];
	let agentBody = '';
	let analyzed = false;
	let newSkill = '';
	let analysisMode: 'claude' | 'keyword' | 'keyword-fallback' | null = null;

	const ALL_TOOLS = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'WebFetch', 'WebSearch'];
	const DOMAINS = [
		'universal', 'backend', 'frontend', 'devops', 'database',
		'data-engineering', 'security', 'qa', 'architecture', 'management'
	];
	const MODELS = ['sonnet', 'opus', 'haiku'];

	// Populate fields when server returns analysis result
	$: if (form?.success) {
		agentName = form.name ?? '';
		agentDescription = form.description ?? '';
		agentModel = form.model ?? 'sonnet';
		agentDomain = form.domain ?? 'universal';
		agentTools = form.tools ? [...(form.tools as string[])] : ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'];
		agentSkills = form.skills ? [...(form.skills as string[])] : [];
		agentBody = form.body ?? '';
		analysisMode = form.mode as typeof analysisMode ?? null;
		analyzed = true;
	}

	// Live markdown preview
	$: frontmatter = buildFrontmatter(agentName, agentDescription, agentModel, agentDomain, agentTools, agentSkills);
	$: preview = frontmatter + '\n' + agentBody;

	function buildFrontmatter(
		name: string,
		desc: string,
		model: string,
		domain: string,
		tools: string[],
		skills: string[]
	): string {
		const toolLines = tools.map((t) => `  - ${t}`).join('\n');
		const skillsBlock =
			skills.length > 0 ? `\nskills:\n${skills.map((s) => `  - ${s}`).join('\n')}` : '';
		return `---\nname: ${name}\ndescription: ${desc}\nmodel: ${model}\ndomain: ${domain}\ntools:\n${toolLines}${skillsBlock}\n---`;
	}

	function toggleTool(tool: string) {
		if (agentTools.includes(tool)) {
			agentTools = agentTools.filter((t) => t !== tool);
		} else {
			agentTools = [...agentTools, tool];
		}
	}

	function addSkill() {
		const s = newSkill.trim();
		if (s && !agentSkills.includes(s)) {
			agentSkills = [...agentSkills, s];
		}
		newSkill = '';
	}

	function removeSkill(skill: string) {
		agentSkills = agentSkills.filter((s) => s !== skill);
	}

	const domainColor: Record<string, string> = {
		backend: 'text-orange-400',
		frontend: 'text-pink-400',
		'data-engineering': 'text-cyan-400',
		devops: 'text-amber-400',
		database: 'text-blue-400',
		management: 'text-zinc-400',
		security: 'text-red-400',
		qa: 'text-green-400',
		architecture: 'text-indigo-400',
		universal: 'text-zinc-500'
	};
</script>

<div class="p-8 max-w-5xl">
	<div class="mb-6">
		<a href="/agents" class="text-zinc-500 hover:text-zinc-300 text-sm mb-3 inline-block">← Agents</a>
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-bold text-zinc-50">New Agent</h1>
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
		<p class="text-zinc-500 text-sm mt-1">Describe your agent in natural language, then refine the generated spec.</p>
	</div>

	<!-- Natural language input section -->
	<div class="border border-zinc-800 rounded-lg p-5 mb-6 bg-zinc-900/30">
		<label for="nl-input" class="block text-sm font-medium text-zinc-300 mb-2">Describe your agent</label>
		<textarea
			id="nl-input"
			bind:value={nlInput}
			rows="4"
			placeholder="예: Kubernetes 배포 전문가. Helm 차트 작성, pod 디버깅 가능. opus 모델 사용.&#10;&#10;Or: A Go backend expert specializing in REST APIs and gRPC services."
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
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Agent Spec</h2>

				<!-- Name -->
				<div>
					<label for="agent-name" class="block text-xs text-zinc-500 mb-1">Name <span class="text-zinc-700">(kebab-case)</span></label>
					<input
						id="agent-name"
						type="text"
						bind:value={agentName}
						placeholder="my-agent-expert"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
					/>
				</div>

				<!-- Description -->
				<div>
					<label for="agent-description" class="block text-xs text-zinc-500 mb-1">Description</label>
					<input
						id="agent-description"
						type="text"
						bind:value={agentDescription}
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
					/>
				</div>

				<!-- Model -->
				<div>
					<p class="text-xs text-zinc-500 mb-1">Model</p>
					<div class="flex gap-2">
						{#each MODELS as m}
							<button
								onclick={() => (agentModel = m)}
								class="px-3 py-1 rounded text-xs font-semibold border transition-colors {agentModel === m
									? m === 'opus' ? 'bg-violet-800 text-violet-200 border-violet-500'
									: m === 'haiku' ? 'bg-sky-800 text-sky-200 border-sky-500'
									: 'bg-emerald-800 text-emerald-200 border-emerald-500'
									: 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
							>
								{m}
							</button>
						{/each}
					</div>
				</div>

				<!-- Domain -->
				<div>
					<label for="agent-domain" class="block text-xs text-zinc-500 mb-1">Domain</label>
					<select
						id="agent-domain"
						bind:value={agentDomain}
						class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 w-full"
					>
						{#each DOMAINS as d}
							<option value={d} class={domainColor[d] ?? ''}>{d}</option>
						{/each}
					</select>
				</div>

				<!-- Tools -->
				<div>
					<p class="text-xs text-zinc-500 mb-2">Tools</p>
					<div class="flex flex-wrap gap-2">
						{#each ALL_TOOLS as tool}
							<button
								onclick={() => toggleTool(tool)}
								class="px-2.5 py-1 rounded text-xs font-medium border transition-colors {agentTools.includes(tool)
									? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
									: 'border-zinc-700 text-zinc-600 hover:text-zinc-400'}"
							>
								{tool}
							</button>
						{/each}
					</div>
				</div>

				<!-- Skills -->
				<div>
					<p class="text-xs text-zinc-500 mb-2">Skills</p>
					{#if agentSkills.length > 0}
						<div class="flex flex-wrap gap-1.5 mb-2">
							{#each agentSkills as skill}
								<span class="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300">
									{skill}
									<button
										onclick={() => removeSkill(skill)}
										class="text-zinc-600 hover:text-zinc-400 leading-none ml-1"
									>×</button>
								</span>
							{/each}
						</div>
					{/if}
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={newSkill}
							list="skill-options"
							placeholder="skill name..."
							class="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500"
							onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
						/>
						<datalist id="skill-options">
							{#each data.skillNames as sn}
								<option value={sn}></option>
							{/each}
						</datalist>
						<button
							onclick={addSkill}
							class="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-300 hover:bg-zinc-700 transition-colors"
						>
							Add
						</button>
					</div>
				</div>

				<!-- Body -->
				<div>
					<label for="agent-body" class="block text-xs text-zinc-500 mb-1">Body <span class="text-zinc-700">(markdown)</span></label>
					<textarea
						id="agent-body"
						bind:value={agentBody}
						rows="12"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y font-mono"
					></textarea>
				</div>
			</div>

			<!-- Right: live preview -->
			<div>
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Preview</h2>
				<pre class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-300 font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">{preview}</pre>
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
				<input type="hidden" name="name" value={agentName} />
				<input type="hidden" name="content" value={preview} />

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving || !agentName.trim()}
						class="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
					>
						{#if saving}
							<span class="flex items-center gap-2">
								<span class="inline-block animate-spin">⟳</span>
								Saving...
							</span>
						{:else}
							Save Agent
						{/if}
					</button>
					<a
						href="/agents"
						class="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm rounded transition-colors"
					>
						Cancel
					</a>
				</div>
			</form>

		</div>
	{/if}
</div>
