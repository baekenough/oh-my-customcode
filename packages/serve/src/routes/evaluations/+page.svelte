<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let search = '';
	let selectedVerdict = '';

	$: filtered = data.evaluations.filter((e) => {
		const matchVerdict = !selectedVerdict || e.verdict === selectedVerdict;
		const q = search.toLowerCase();
		const matchSearch =
			!q ||
			e.sessionId.toLowerCase().includes(q) ||
			e.comment.toLowerCase().includes(q) ||
			e.tags.some((t) => t.toLowerCase().includes(q));
		return matchVerdict && matchSearch;
	});

	function clearFilters() {
		search = '';
		selectedVerdict = '';
	}

	$: hasFilters = search || selectedVerdict;

	function scoreColor(score: number): string {
		if (score >= 5) return 'text-emerald-400';
		if (score >= 4) return 'text-green-400';
		if (score >= 3) return 'text-amber-400';
		if (score >= 2) return 'text-orange-400';
		return 'text-red-400';
	}

	function scoreBg(score: number): string {
		if (score >= 5) return 'bg-emerald-900/50 border-emerald-700';
		if (score >= 4) return 'bg-green-900/50 border-green-700';
		if (score >= 3) return 'bg-amber-900/50 border-amber-700';
		if (score >= 2) return 'bg-orange-900/50 border-orange-700';
		return 'bg-red-900/50 border-red-700';
	}

	const verdictColor: Record<string, string> = {
		pass: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
		fail: 'bg-red-900/50 text-red-300 border-red-700',
		needs_refinement: 'bg-amber-900/50 text-amber-300 border-amber-700'
	};

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function truncateSession(id: string): string {
		return id.length > 16 ? id.slice(0, 8) + '…' + id.slice(-4) : id;
	}

	function avgScoreColor(avg: number | null): string {
		if (avg === null) return 'text-zinc-500';
		if (avg >= 4.5) return 'text-emerald-400';
		if (avg >= 3.5) return 'text-green-400';
		if (avg >= 2.5) return 'text-amber-400';
		return 'text-red-400';
	}
</script>

<div class="p-8">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Evaluations</h1>
			<p class="mt-1 text-sm text-zinc-500">
				{#if hasFilters}
					<span class="font-medium text-emerald-400">{filtered.length}</span> / {data.evaluations
						.length} evaluations
				{:else}
					{data.evaluations.length} evaluations total
				{/if}
			</p>
		</div>
		<a
			href="/evaluations/create"
			class="flex items-center gap-2 rounded border border-emerald-700 bg-emerald-800/60 px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-800"
		>
			<span class="text-base leading-none">+</span> New Evaluation
		</a>
	</div>

	<!-- Session summaries -->
	{#if data.sessions.length > 0}
		<div class="mb-8">
			<div class="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
				Recent Sessions
			</div>
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{#each data.sessions.slice(0, 8) as session}
					<div class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
						<div class="mb-2 flex items-start justify-between gap-2">
							<span
								class="truncate font-mono text-xs text-zinc-400"
								title={session.sessionId}
							>
								{truncateSession(session.sessionId)}
							</span>
							{#if session.avgScore !== null}
								<span
									class="shrink-0 text-sm font-bold {avgScoreColor(session.avgScore)}"
								>
									{session.avgScore.toFixed(1)}
								</span>
							{/if}
						</div>
						<div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
							<span>{session.agentCount} invocations</span>
							<span
								class={session.evaluationCount > 0 ? 'text-zinc-400' : ''}
							>
								{session.evaluationCount} eval{session.evaluationCount !== 1 ? 's' : ''}
							</span>
						</div>
						<div class="mt-2 text-xs text-zinc-700">
							{formatDate(session.startedAt)}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Filters -->
	<div class="mb-4 flex flex-wrap items-center gap-3">
		<input
			type="text"
			placeholder="Search by session, comment, tags..."
			bind:value={search}
			class="w-72 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
		/>

		<div class="flex gap-2">
			{#each ['pass', 'fail', 'needs_refinement'] as v}
				<button
					onclick={() => (selectedVerdict = selectedVerdict === v ? '' : v)}
					class="rounded border px-2.5 py-1 text-xs font-medium transition-colors {selectedVerdict === v
						? (verdictColor[v] ?? 'bg-zinc-700 text-zinc-200 border-zinc-500')
						: 'border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300'}"
				>
					{v === 'needs_refinement' ? 'needs refinement' : v}
				</button>
			{/each}
		</div>

		{#if hasFilters}
			<button
				onclick={clearFilters}
				class="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- Evaluation table -->
	{#if filtered.length === 0}
		<div class="rounded-lg border border-zinc-800 py-16 text-center text-zinc-600">
			{#if data.evaluations.length === 0}
				<p class="text-base">No evaluations yet.</p>
				<p class="mt-2 text-sm">
					<a
						href="/evaluations/create"
						class="text-emerald-500 hover:text-emerald-400"
					>Create your first evaluation →</a
					>
				</p>
			{:else}
				No evaluations match the current filters.
			{/if}
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-zinc-800">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-zinc-800 bg-zinc-900">
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Score</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Verdict</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Session</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Tags</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Comment</th>
						<th class="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as ev, i}
						<tr
							class="border-t border-zinc-800 transition-colors hover:bg-zinc-900/60 {i % 2 === 1
								? 'bg-zinc-900/30'
								: ''}"
						>
							<!-- Score -->
							<td class="px-4 py-3">
								<span
									class="inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold {scoreBg(ev.score)} {scoreColor(ev.score)}"
								>
									{ev.score}
								</span>
							</td>

							<!-- Verdict -->
							<td class="px-4 py-3">
								<span
									class="rounded border px-2 py-0.5 text-xs font-medium {verdictColor[ev.verdict] ??
										'bg-zinc-800 text-zinc-400 border-zinc-700'}"
								>
									{ev.verdict === 'needs_refinement' ? 'needs refinement' : ev.verdict}
								</span>
							</td>

							<!-- Session ID -->
							<td class="px-4 py-3">
								<span class="font-mono text-xs text-zinc-400" title={ev.sessionId}>
									{truncateSession(ev.sessionId)}
								</span>
								{#if ev.turnId}
									<div class="font-mono text-xs text-zinc-600" title={ev.turnId}>
										turn: {truncateSession(ev.turnId)}
									</div>
								{/if}
							</td>

							<!-- Tags -->
							<td class="px-4 py-3">
								{#if ev.tags.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each ev.tags as tag}
											<span
												class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400"
											>
												{tag}
											</span>
										{/each}
									</div>
								{:else}
									<span class="text-zinc-700">—</span>
								{/if}
							</td>

							<!-- Comment -->
							<td class="max-w-xs px-4 py-3 text-zinc-400">
								{#if ev.comment}
									<span class="line-clamp-2 text-xs">{ev.comment}</span>
								{:else}
									<span class="text-zinc-700">—</span>
								{/if}
							</td>

							<!-- Date -->
							<td class="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
								{formatDate(ev.evaluatedAt)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
