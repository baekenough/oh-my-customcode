<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let search = '';
	let selectedDomains: Set<string> = new Set();
	let selectedModels: Set<string> = new Set();
	let sortKey = 'name';
	let sortAsc = true;

	$: filtered = data.agents.filter((a) => {
		const matchDomain = selectedDomains.size === 0 || selectedDomains.has(a.domain);
		const matchModel = selectedModels.size === 0 || selectedModels.has(a.model);
		const q = search.toLowerCase();
		const matchSearch =
			!q ||
			a.name.toLowerCase().includes(q) ||
			a.description.toLowerCase().includes(q);
		return matchDomain && matchModel && matchSearch;
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

	function toggleDomain(domain: string) {
		const next = new Set(selectedDomains);
		if (next.has(domain)) next.delete(domain);
		else next.add(domain);
		selectedDomains = next;
	}

	function toggleModel(model: string) {
		const next = new Set(selectedModels);
		if (next.has(model)) next.delete(model);
		else next.add(model);
		selectedModels = next;
	}

	function clearAll() {
		search = '';
		selectedDomains = new Set();
		selectedModels = new Set();
	}

	$: hasFilters = search || selectedDomains.size > 0 || selectedModels.size > 0;

	function sortIndicator(key: string): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}

	const modelColor: Record<string, string> = {
		sonnet: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
		opus: 'bg-violet-900/50 text-violet-300 border-violet-700',
		haiku: 'bg-sky-900/50 text-sky-300 border-sky-700'
	};

	const modelActiveColor: Record<string, string> = {
		sonnet: 'bg-emerald-800 text-emerald-200 border-emerald-500',
		opus: 'bg-violet-800 text-violet-200 border-violet-500',
		haiku: 'bg-sky-800 text-sky-200 border-sky-500'
	};

	const domainColors: Record<string, string> = {
		backend: 'bg-orange-900/40 text-orange-300',
		frontend: 'bg-pink-900/40 text-pink-300',
		'data-engineering': 'bg-cyan-900/40 text-cyan-300',
		devops: 'bg-amber-900/40 text-amber-300',
		database: 'bg-blue-900/40 text-blue-300',
		management: 'bg-zinc-700 text-zinc-300',
		security: 'bg-red-900/40 text-red-300',
		qa: 'bg-green-900/40 text-green-300',
		architecture: 'bg-indigo-900/40 text-indigo-300',
		universal: 'bg-zinc-700 text-zinc-400'
	};
</script>

<div class="p-8">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Agents</h1>
			<p class="text-zinc-500 text-sm mt-1">
				{#if hasFilters}
					<span class="text-emerald-400 font-medium">{filtered.length}</span> / {data.agents.length} agents
				{:else}
					{data.agents.length} agents total
				{/if}
			</p>
		</div>
		<a
			href="/agents/create"
			class="flex items-center gap-2 px-3 py-2 rounded bg-emerald-800/60 border border-emerald-700 text-emerald-300 text-sm hover:bg-emerald-800 hover:border-emerald-500 transition-colors font-medium"
		>
			<span class="text-base leading-none">+</span> New Agent
		</a>
	</div>

	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			placeholder="Search by name or description..."
			bind:value={search}
			class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-72"
		/>
	</div>

	<!-- Domain filter -->
	<div class="mb-3">
		<div class="text-xs text-zinc-600 mb-2 uppercase tracking-wide font-medium">Domain</div>
		<div class="flex flex-wrap gap-2">
			{#each data.domains as domain}
				<button
					onclick={() => toggleDomain(domain)}
					class="px-2.5 py-1 rounded text-xs font-medium border transition-colors {selectedDomains.has(domain)
						? (domainColors[domain] ?? 'bg-zinc-700 text-zinc-300') + ' border-zinc-500'
						: 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'}"
				>
					{domain}
				</button>
			{/each}
		</div>
	</div>

	<!-- Model filter -->
	<div class="mb-5">
		<div class="text-xs text-zinc-600 mb-2 uppercase tracking-wide font-medium">Model</div>
		<div class="flex gap-2">
			{#each ['opus', 'sonnet', 'haiku'] as model}
				<button
					onclick={() => toggleModel(model)}
					class="px-3 py-1 rounded text-xs font-semibold border transition-colors {selectedModels.has(model)
						? (modelActiveColor[model] ?? 'bg-zinc-700 text-zinc-200 border-zinc-500')
						: 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
				>
					{model}
				</button>
			{/each}
		</div>
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

	<!-- Table -->
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
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'model' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('model')}
					>Model{sortIndicator('model')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'domain' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('domain')}
					>Domain{sortIndicator('domain')}</th>
					<th class="px-4 py-3 text-left text-zinc-400 font-medium">Skills</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as agent, i}
					<tr class="border-t border-zinc-800 hover:bg-zinc-900/60 transition-colors {i % 2 === 1 ? 'bg-zinc-900/30' : ''}">
						<td class="px-4 py-3">
							<a href="/agents/{agent.name}" class="text-emerald-400 hover:text-emerald-300 font-medium">
								{agent.name}
							</a>
						</td>
						<td class="px-4 py-3 text-zinc-400 max-w-xs" title={agent.description}><span class="line-clamp-2">{agent.description}</span></td>
						<td class="px-4 py-3">
							<span class="px-2 py-0.5 rounded text-xs font-medium border {modelColor[agent.model] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700'}">
								{agent.model}
							</span>
						</td>
						<td class="px-4 py-3 text-zinc-500 text-xs">{agent.domain || '—'}</td>
						<td class="px-4 py-3 text-zinc-500 text-xs">{agent.skills.length > 0 ? agent.skills.length : '—'}</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="px-4 py-8 text-center text-zinc-600">No agents found</td>
					</tr>
				{/each}

			</tbody>
		</table>
	</div>
</div>
