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
	let guideName = '';
	let guideBody = '';
	let analyzed = false;
	let analysisMode: 'claude' | 'keyword' | 'keyword-fallback' | null = null;

	// Populate fields when server returns analysis
	$: if (form?.success) {
		guideName = form.name ?? '';
		guideBody = form.body ?? '';
		analysisMode = form.mode as typeof analysisMode ?? null;
		analyzed = true;
	}

	// Live preview — guides are pure markdown (no frontmatter)
	$: preview = guideBody;
</script>

<div class="p-8 max-w-5xl">
	<div class="mb-6">
		<a href="/guides" class="text-zinc-500 hover:text-zinc-300 text-sm mb-3 inline-block">← Guides</a>
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-bold text-zinc-50">New Guide</h1>
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
		<p class="text-zinc-500 text-sm mt-1">Describe your guide in natural language, then refine the generated document.</p>
	</div>

	<!-- Natural language input section -->
	<div class="border border-zinc-800 rounded-lg p-5 mb-6 bg-zinc-900/30">
		<label for="nl-input" class="block text-sm font-medium text-zinc-300 mb-2">Describe your guide</label>
		<textarea
			id="nl-input"
			bind:value={nlInput}
			rows="4"
			placeholder="예: React hooks best practices — useState, useEffect, custom hooks 패턴&#10;&#10;Or: Kubernetes deployment guide covering pod management and scaling strategies."
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
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Guide Content</h2>

				<!-- Name -->
				<div>
					<label for="guide-name" class="block text-xs text-zinc-500 mb-1">
						Name <span class="text-zinc-700">(kebab-case directory name)</span>
					</label>
					<input
						id="guide-name"
						type="text"
						bind:value={guideName}
						placeholder="react-hooks"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono"
					/>
					{#if data.guideNames.includes(guideName)}
						<p class="text-amber-400 text-xs mt-1">A guide with this name already exists.</p>
					{/if}
				</div>

				<!-- Body -->
				<div>
					<label for="guide-body" class="block text-xs text-zinc-500 mb-1">
						Body <span class="text-zinc-700">(pure markdown — no frontmatter)</span>
					</label>
					<textarea
						id="guide-body"
						bind:value={guideBody}
						rows="20"
						class="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 resize-y font-mono"
					></textarea>
				</div>
			</div>

			<!-- Right: live preview -->
			<div>
				<h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Preview</h2>
				<pre class="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-300 font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">{preview}</pre>
				<p class="text-zinc-600 text-xs mt-2">Saved to: <code class="text-zinc-500">guides/{guideName || '...'}/README.md</code></p>
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
				<input type="hidden" name="name" value={guideName} />
				<input type="hidden" name="body" value={guideBody} />

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving || !guideName.trim() || !guideBody.trim()}
						class="px-5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
					>
						{saving ? 'Saving...' : 'Save Guide'}
					</button>
					<a
						href="/guides"
						class="px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm rounded transition-colors"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	{/if}
</div>
