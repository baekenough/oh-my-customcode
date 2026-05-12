<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	let search = '';
	let sortAsc = true;

	$: filtered = data.guides.filter(
		(g) => !search || g.name.toLowerCase().includes(search.toLowerCase())
	);

	$: sorted = [...filtered].sort((a, b) => {
		const cmp = a.name.localeCompare(b.name);
		return sortAsc ? cmp : -cmp;
	});

	function toggleSort() {
		sortAsc = !sortAsc;
	}
</script>

<div class="p-8">
	<div class="mb-6 flex items-start justify-between">
		<div>
			<h1 class="text-2xl font-bold text-zinc-50">Guides</h1>
			<p class="text-zinc-500 text-sm mt-1">{data.guides.length} guides total</p>
		</div>
		<a
			href="/guides/create"
			class="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm rounded font-medium transition-colors"
		>
			<span class="text-base leading-none">+</span> New Guide
		</a>
	</div>

	<div class="mb-5 flex items-center gap-3">
		<input
			type="text"
			placeholder="Search guides..."
			bind:value={search}
			class="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 w-56"
		/>
		<button
			onclick={toggleSort}
			class="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors select-none"
		>
			Name {sortAsc ? '▲' : '▼'}
		</button>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
		{#each sorted as guide}
			<a
				href="/guides/{guide.name}"
				class="border border-zinc-800 rounded-lg px-5 py-4 hover:bg-zinc-900 hover:border-zinc-700 transition-colors"
			>
				<div class="text-violet-400 font-medium">{guide.name}</div>
				<div class="text-zinc-600 text-xs mt-1">guides/{guide.name}/README.md</div>
			</a>
		{:else}
			<div class="col-span-3 text-center text-zinc-600 py-8">No guides found</div>
		{/each}
	</div>
</div>
