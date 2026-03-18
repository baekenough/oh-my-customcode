<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let filterPriority = '';
	let search = '';
	let sortKey = 'id';
	let sortAsc = true;

	$: filtered = data.rules.filter((r) => {
		const matchPriority = !filterPriority || r.priority === filterPriority;
		const matchSearch =
			!search ||
			r.name.toLowerCase().includes(search.toLowerCase()) ||
			r.id.toLowerCase().includes(search.toLowerCase()) ||
			r.description.toLowerCase().includes(search.toLowerCase());
		return matchPriority && matchSearch;
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

	function sortIndicator(key: string): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}

	const priorityBadge: Record<string, string> = {
		MUST: 'bg-red-900/50 text-red-300 border border-red-800',
		SHOULD: 'bg-yellow-900/50 text-yellow-300 border border-yellow-800',
		MAY: 'bg-green-900/50 text-green-300 border border-green-800'
	};

	const priorityText: Record<string, string> = {
		MUST: 'text-red-400',
		SHOULD: 'text-yellow-400',
		MAY: 'text-green-400'
	};
</script>

<div class="p-8">
	<div class="mb-6">
		<h1 class="text-2xl font-bold text-zinc-50">Rules</h1>
		<p class="text-zinc-500 text-sm mt-1">
			{#if filterPriority || search}
				<span class="text-yellow-400 font-medium">{filtered.length}</span> / {data.rules.length} rules
			{:else}
				{data.rules.length} rules total
			{/if}
		</p>
	</div>

	<!-- Filters -->
	<div class="flex gap-3 mb-5">
		<input
			type="text"
			placeholder="Search rules..."
			bind:value={search}
			class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-56"
		/>
		<div class="flex gap-2">
			{#each ['MUST', 'SHOULD', 'MAY'] as p}
				<button
					onclick={() => { filterPriority = filterPriority === p ? '' : p; }}
					class="px-3 py-1.5 rounded text-xs font-semibold border transition-colors {filterPriority === p ? priorityBadge[p] : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}"
				>
					{p}
				</button>
			{/each}
		</div>
		{#if filterPriority || search}
			<button
				onclick={() => { filterPriority = ''; search = ''; }}
				class="text-zinc-500 hover:text-zinc-300 text-sm px-2"
			>
				Clear
			</button>
		{/if}
	</div>

	<div class="border border-zinc-800 rounded-lg overflow-hidden">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-zinc-900 border-b border-zinc-800">
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium w-20 cursor-pointer select-none hover:text-zinc-200 {sortKey === 'id' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('id')}
					>ID{sortIndicator('id')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium w-24 cursor-pointer select-none hover:text-zinc-200 {sortKey === 'priority' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('priority')}
					>Priority{sortIndicator('priority')}</th>
					<th
						class="px-4 py-3 text-left text-zinc-400 font-medium cursor-pointer select-none hover:text-zinc-200 {sortKey === 'name' ? 'text-zinc-200 font-bold' : ''}"
						onclick={() => toggleSort('name')}
					>Name{sortIndicator('name')}</th>
					<th class="px-4 py-3 text-left text-zinc-400 font-medium">Description</th>
				</tr>
			</thead>
			<tbody>
				{#each sorted as rule, i}
					<tr class="border-t border-zinc-800 hover:bg-zinc-900/60 transition-colors {i % 2 === 1 ? 'bg-zinc-900/30' : ''}">
						<td class="px-4 py-3 font-mono text-zinc-500">{rule.id || '—'}</td>
						<td class="px-4 py-3">
							<span class="px-2 py-0.5 rounded text-xs font-bold {priorityBadge[rule.priority] ?? 'bg-zinc-800 text-zinc-400'}">
								{rule.priority}
							</span>
						</td>
						<td class="px-4 py-3">
							<a href="/rules/{rule.name}" class="{priorityText[rule.priority] ?? 'text-zinc-300'} hover:opacity-80 font-medium">
								{rule.name}
							</a>
						</td>
						<td class="px-4 py-3 text-zinc-500 max-w-md" title={rule.description}><span class="line-clamp-2">{rule.description}</span></td>
					</tr>
				{:else}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-zinc-600">No rules found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
