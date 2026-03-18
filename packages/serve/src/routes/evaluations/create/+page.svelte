<script lang="ts">
	import type { PageData, ActionData } from './$types';

	export let data: PageData;
	export let form: ActionData;

	let score = 3;
	let verdict = 'pass';
	let sessionIdMode: 'manual' | 'select' = data.sessions.length > 0 ? 'select' : 'manual';

	const verdictOptions = [
		{ value: 'pass', label: 'Pass', color: 'emerald' },
		{ value: 'fail', label: 'Fail', color: 'red' },
		{ value: 'needs_refinement', label: 'Needs Refinement', color: 'amber' }
	] as const;

	const scoreLabels: Record<number, string> = {
		1: 'Poor',
		2: 'Below Average',
		3: 'Average',
		4: 'Good',
		5: 'Excellent'
	};

	function scoreButtonClass(s: number, selected: number): string {
		const isSelected = s === selected;
		if (!isSelected) {
			return 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300';
		}
		if (s >= 5) return 'border-emerald-600 bg-emerald-900/60 text-emerald-300';
		if (s >= 4) return 'border-green-600 bg-green-900/60 text-green-300';
		if (s >= 3) return 'border-amber-600 bg-amber-900/60 text-amber-300';
		if (s >= 2) return 'border-orange-600 bg-orange-900/60 text-orange-300';
		return 'border-red-600 bg-red-900/60 text-red-300';
	}

	function verdictClass(value: string, selected: string): string {
		if (value !== selected) {
			return 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300';
		}
		if (value === 'pass') return 'border-emerald-600 bg-emerald-900/60 text-emerald-300';
		if (value === 'fail') return 'border-red-600 bg-red-900/60 text-red-300';
		return 'border-amber-600 bg-amber-900/60 text-amber-300';
	}

	function truncateSession(id: string): string {
		return id.length > 20 ? id.slice(0, 8) + '…' + id.slice(-6) : id;
	}
</script>

<div class="p-8">
	<div class="mb-6">
		<a href="/evaluations" class="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
			← Evaluations
		</a>
		<h1 class="mt-3 text-2xl font-bold text-zinc-50">New Evaluation</h1>
	</div>

	{#if form?.error}
		<div class="mb-4 rounded border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	<form method="POST" class="max-w-xl space-y-6">
		<!-- Session ID -->
		<div>
			<label for="sessionId" class="mb-2 block text-sm font-medium text-zinc-300">
				Session ID <span class="text-red-400">*</span>
			</label>

			{#if data.sessions.length > 0}
				<div class="mb-2 flex gap-2 text-xs">
					<button
						type="button"
						onclick={() => (sessionIdMode = 'select')}
						class="rounded px-2 py-0.5 transition-colors {sessionIdMode === 'select'
							? 'bg-zinc-700 text-zinc-200'
							: 'text-zinc-500 hover:text-zinc-300'}"
					>
						Select recent
					</button>
					<button
						type="button"
						onclick={() => (sessionIdMode = 'manual')}
						class="rounded px-2 py-0.5 transition-colors {sessionIdMode === 'manual'
							? 'bg-zinc-700 text-zinc-200'
							: 'text-zinc-500 hover:text-zinc-300'}"
					>
						Enter manually
					</button>
				</div>
			{/if}

			{#if sessionIdMode === 'select' && data.sessions.length > 0}
				<select
					id="sessionId"
					name="sessionId"
					required
					class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:border-zinc-500 focus:outline-none"
				>
					<option value="">— Select a session —</option>
					{#each data.sessions as session}
						<option value={session.sessionId}>
							{truncateSession(session.sessionId)}
							({session.agentCount} invocations,
							{session.evaluationCount} eval{session.evaluationCount !== 1 ? 's' : ''})
						</option>
					{/each}
				</select>
			{:else}
				<input
					id="sessionId"
					type="text"
					name="sessionId"
					placeholder="e.g. abc12345-..."
					required
					class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
				/>
			{/if}
		</div>

		<!-- Turn ID (optional) -->
		<div>
			<label for="turnId" class="mb-2 block text-sm font-medium text-zinc-300">
				Turn ID <span class="text-zinc-600">(optional)</span>
			</label>
			<input
				id="turnId"
				type="text"
				name="turnId"
				placeholder="Leave blank to evaluate the full session"
				class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
			/>
		</div>

		<!-- Score -->
		<div>
			<div class="mb-2 text-sm font-medium text-zinc-300">Score</div>
			<div class="flex items-center gap-2">
				{#each [1, 2, 3, 4, 5] as s}
					<button
						type="button"
						onclick={() => (score = s)}
						class="flex h-10 w-10 items-center justify-center rounded border text-sm font-bold transition-colors {scoreButtonClass(
							s,
							score
						)}"
					>
						{s}
					</button>
				{/each}
				<span class="ml-2 text-sm text-zinc-500">
					{scoreLabels[score] ?? ''}
				</span>
			</div>
			<input type="hidden" name="score" value={score} />
		</div>

		<!-- Verdict -->
		<div>
			<div class="mb-2 text-sm font-medium text-zinc-300">Verdict</div>
			<div class="flex flex-wrap gap-2">
				{#each verdictOptions as opt}
					<button
						type="button"
						onclick={() => (verdict = opt.value)}
						class="rounded border px-4 py-2 text-sm font-medium transition-colors {verdictClass(
							opt.value,
							verdict
						)}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
			<input type="hidden" name="verdict" value={verdict} />
		</div>

		<!-- Tags -->
		<div>
			<label for="tags" class="mb-2 block text-sm font-medium text-zinc-300">
				Tags <span class="text-zinc-600">(comma-separated)</span>
			</label>
			<input
				id="tags"
				type="text"
				name="tags"
				placeholder="e.g. routing, context-handling, tool-use"
				class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
			/>
		</div>

		<!-- Comment -->
		<div>
			<label for="comment" class="mb-2 block text-sm font-medium text-zinc-300">Comment</label>
			<textarea
				id="comment"
				name="comment"
				rows="4"
				placeholder="Describe what worked well, what failed, or what needs improvement..."
				class="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none resize-none"
			></textarea>
		</div>

		<!-- Actions -->
		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				class="rounded border border-emerald-700 bg-emerald-800/60 px-5 py-2 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-800"
			>
				Save Evaluation
			</button>
			<a
				href="/evaluations"
				class="rounded border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200"
			>
				Cancel
			</a>
		</div>
	</form>
</div>
