<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let search = '';
	let selectedScopes: Set<string> = new Set();
	let forkOnly = false;
	let sortKey = 'name';
	let sortAsc = true;

	$: filtered = data.skills.filter((s) => {
		const matchScope = selectedScopes.size === 0 || selectedScopes.has(s.scope);
		const matchFork = !forkOnly || s.contextFork;
		const q = search.toLowerCase();
		const matchSearch =
			!q ||
			s.name.toLowerCase().includes(q) ||
			s.description.toLowerCase().includes(q);
		return matchScope && matchFork && matchSearch;
	});

	$: sorted = [...filtered].sort((a, b) => {
		const va = (a as unknown as Record<string, unknown>)[sortKey] ?? '';
		const vb = (b as unknown as Record<string, unknown>)[sortKey] ?? '';
		const cmp = String(va).localeCompare(String(vb));
		return sortAsc ? cmp : -cmp;
	});

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
	}

	function toggleScope(scope: string) {
		const next = new Set(selectedScopes);
		if (next.has(scope)) next.delete(scope);
		else next.add(scope);
		selectedScopes = next;
	}

	function clearAll() {
		search = '';
		selectedScopes = new Set();
		forkOnly = false;
	}

	$: hasFilters = search || selectedScopes.size > 0 || forkOnly;

	function sortIndicator(key: string): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}

	const scopeColor: Record<string, string> = {
		core: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
		harness: 'bg-amber-900/50 text-amber-300 border-amber-700',
		package: 'bg-sky-900/50 text-sky-300 border-sky-700'
	};

	const scopeActiveColor: Record<string, string> = {
		core: 'bg-emerald-800 text-emerald-200 border-emerald-500',
		harness: 'bg-amber-800 text-amber-200 border-amber-500',
		package: 'bg-sky-800 text-sky-200 border-sky-500'
	};
</script>

<div class="p-8">
	<div class="mb-6 flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Skills</h1>
			<p class="text-zinc-500 text-sm mt-1">
				{#if hasFilters}
					<span class="text-sky-400 font-medium">{filtered.length}</span> / {data.skills.length} skills
				{:else}
					{data.skills.length} skills total
				{/if}
			</p>
		</div>
		<a
			href="/skills/create"
			class="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded font-medium transition-colors"
		>
			+ New Skill
		</a>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			placeholder="Search skills..."
			bind:value={search}
			class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-72"
		/>
	</div>

	<!-- Scope filter -->
	<div class="mb-3">
		<div class="text-xs text-zinc-600 mb-2 uppercase tracking-wide font-medium">Scope</div>
		<div class="flex gap-2">
			{#each data.scopes as scope}
				<button
					onclick={() => toggleScope(scope)}
					class="px-3 py-1 rounded text-xs font-semibold border transition-colors {selectedScopes.has(scope)
						? (scopeActiveColor[scope] ?? 'bg-zinc-700 text-zinc-200 border-zinc-500')
						: 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
				>
					{scope}
				</button>
			{/each}
		</div>
	</div>

	<!-- context:fork toggle -->
	<div class="mb-5">
		<div class="text-xs text-zinc-600 mb-2 uppercase tracking-wide font-medium">Context</div>
		<button
			onclick={() => (forkOnly = !forkOnly)}
			class="px-3 py-1 rounded text-xs font-semibold border transition-colors {forkOnly
				? 'bg-violet-800 text-violet-200 border-violet-500'
				: 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
		>
			context:fork only
		</button>
	</div>

	{#if hasFilters}
		<div class="mb-4">
			<button
				onclick={clearAll}
				class="text-zinc-500 hover:text-zinc-300 text-xs px-2 py-1 border border-zinc-700 rounded transition-colors"
			>
				Clear filters
			</button>
		</div>
	{/if}

	<div class="border border-zinc-800 rounded-lg overflow-hidden">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-zinc-900 border-b border-zinc-800">
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'name' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('name')}
					>Name{sortIndicator('name')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'description' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('description')}
					>Description{sortIndicator('description')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'scope' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('scope')}
					>Scope{sortIndicator('scope')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'contextFork' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('contextFork')}
					>Context{sortIndicator('contextFork')}</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as skill, i}
					<tr class="border-t border-zinc-800 hover:bg-zinc-900/60 transition-colors {i % 2 === 1 ? 'bg-zinc-900/30' : ''}">
						<td class="px-4 py-3">
							<a href="/skills/{skill.name}" class="text-sky-400 hover:text-sky-300 font-medium">
								{skill.name}
							</a>
						</td>
						<td class="px-4 py-3 text-zinc-400 max-w-md" title={skill.description}><span class="line-clamp-2">{skill.description}</span></td>
						<td class="px-4 py-3">
							<span class="px-2 py-0.5 rounded text-xs font-medium border {scopeColor[skill.scope] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}">
								{skill.scope}
							</span>
						</td>
						<td class="px-4 py-3">
							{#if skill.contextFork}
								<span class="px-2 py-0.5 rounded text-xs font-medium bg-violet-900/40 text-violet-300 border border-violet-700">
									fork
								</span>
							{:else}
								<span class="text-zinc-700 text-xs">—</span>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-zinc-600">No skills found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
